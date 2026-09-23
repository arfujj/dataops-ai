from datetime import UTC, datetime, timedelta
from uuid import uuid4

from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.events.publisher import publish_event, to_event_message
from app.models.domain import TelemetryEvent
from app.schemas.events import TelemetryEventEnvelope
from app.services.events import process_event


def emit(envelope: TelemetryEventEnvelope) -> str | None:
    with SessionLocal() as db:
        event, incident, duplicate = process_event(db, _organization_id(db), envelope)
        db.commit()
        if not duplicate:
            published, error = publish_event(to_event_message(event), event.organization_id)
            event.published_at = datetime.now(UTC) if published else None
            event.publish_error = "" if published else error
            db.commit()
        return str(incident.id) if incident else None


def _organization_id(db):
    from app.models.identity import Organization

    organization = db.scalar(select(Organization).where(Organization.slug == "acme-analytics"))
    if organization is None:
        raise RuntimeError("Acme Analytics is not seeded; run `make migrate && make seed` first")
    return organization.id


def run_demo() -> None:
    organization_id = None
    with SessionLocal() as db:
        from app.models.identity import Organization

        organization = db.scalar(select(Organization).where(Organization.slug == "acme-analytics"))
        organization_id = organization.id if organization else None
    if organization_id is None:
        raise RuntimeError("Acme Analytics is not seeded; run `make migrate && make seed` first")

    now = datetime.now(UTC)
    schema_event = TelemetryEventEnvelope(
        event_id=uuid4(),
        organization_id=organization_id,
        environment="production",
        source="postgresql",
        event_type="schema.changed",
        occurred_at=now,
        entity_type="dataset",
        entity_id="raw.orders",
        severity="high",
        payload={
            "dataset_name": "raw.orders",
            "asset_type": "TABLE",
            "columns": [
                {"name": "order_id", "type": "BIGINT", "nullable": False},
                {"name": "customer_id", "type": "VARCHAR", "nullable": False},
                {"name": "amount", "type": "DOUBLE", "nullable": False},
                {"name": "status", "type": "TEXT", "nullable": False},
                {"name": "created_at", "type": "TIMESTAMP", "nullable": False},
            ],
        },
    )
    incident_id = emit(schema_event)

    pipeline_event = TelemetryEventEnvelope(
        event_id=uuid4(),
        organization_id=organization_id,
        environment="production",
        source="airflow",
        event_type="pipeline.failed",
        occurred_at=now + timedelta(seconds=2),
        entity_type="pipeline",
        entity_id="transform_orders",
        severity="high",
        payload={
            "run_id": f"demo-{uuid4()}",
            "dataset_name": "raw.orders",
            "error": "Invalid input syntax for BIGINT: 'cus_8f3a2d' while building "
            "staging.stg_orders",
            "logs": "cast customer_id as BIGINT failed in staging.stg_orders\n"
            "transform_orders run aborted",
        },
    )
    incident_id = emit(pipeline_event) or incident_id

    quality_event = TelemetryEventEnvelope(
        event_id=uuid4(),
        organization_id=organization_id,
        environment="production",
        source="quality-monitor",
        event_type="quality.failed",
        occurred_at=now + timedelta(seconds=4),
        entity_type="dataset",
        entity_id="analytics.daily_revenue",
        severity="high",
        payload={
            "dataset_name": "analytics.daily_revenue",
            "title": "Freshness check failed: analytics.daily_revenue",
            "message": "analytics.daily_revenue is stale because its upstream "
            "transform did not complete.",
            "observed_age_minutes": 148,
            "max_age_minutes": 60,
        },
    )
    incident_id = emit(quality_event) or incident_id

    with SessionLocal() as db:
        stored = db.scalar(
            select(TelemetryEvent).where(TelemetryEvent.event_id == pipeline_event.event_id)
        )
        published = bool(stored and stored.published_at)
    print(
        "Published demo schema.changed, pipeline.failed, and quality.failed telemetry "
        f"(Kafka published: {published})."
    )
    print(f"Incident: {incident_id}")
    print(
        "Impact path: raw.orders → staging.stg_orders → analytics.fact_orders → "
        "analytics.daily_revenue"
    )
    print(f"OPENAI_MODEL configured: {bool(settings.openai_model)}")


if __name__ == "__main__":
    run_demo()
