import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    Dataset,
    Deployment,
    Incident,
    Pipeline,
    PipelineRun,
    TelemetryEvent,
)
from app.schemas.events import TelemetryEventEnvelope
from app.services.incidents import collect_event_evidence, get_or_create_incident
from app.services.lineage import traverse_lineage
from app.services.schemas import ingest_schema_definition

logger = logging.getLogger("dataops.events")


def _parse_payload_time(value: object, fallback: datetime) -> datetime:
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)
        except ValueError:
            return fallback
    return fallback


def _ensure_pipeline(db: Session, organization_id: UUID, name: str, source: str) -> Pipeline:
    pipeline = db.scalar(
        select(Pipeline).where(Pipeline.organization_id == organization_id, Pipeline.name == name)
    )
    if pipeline is None:
        pipeline = Pipeline(organization_id=organization_id, name=name, orchestrator=source)
        db.add(pipeline)
        db.flush()
    return pipeline


def process_event(
    db: Session,
    organization_id: UUID,
    envelope: TelemetryEventEnvelope,
) -> tuple[TelemetryEvent, Incident | None, bool]:
    if envelope.organization_id and envelope.organization_id != organization_id:
        raise PermissionError("organization_id does not match authenticated organization")
    existing = db.scalar(
        select(TelemetryEvent).where(
            TelemetryEvent.organization_id == organization_id,
            TelemetryEvent.event_id == envelope.event_id,
        )
    )
    if existing is not None:
        return existing, None, True

    event = TelemetryEvent(
        organization_id=organization_id,
        event_id=envelope.event_id,
        environment=envelope.environment,
        source=envelope.source,
        event_type=envelope.event_type,
        occurred_at=envelope.occurred_at,
        entity_type=envelope.entity_type,
        entity_id=envelope.entity_id,
        severity=envelope.severity,
        payload=envelope.payload,
    )
    db.add(event)
    db.flush()
    incident = None
    dataset_id: UUID | None = None
    event_type = envelope.event_type

    if event_type.startswith("pipeline."):
        pipeline = _ensure_pipeline(db, organization_id, envelope.entity_id, envelope.source)
        pipeline.last_run_at = envelope.occurred_at
        status_by_event = {
            "pipeline.started": "RUNNING",
            "pipeline.succeeded": "HEALTHY",
            "pipeline.failed": "FAILED",
        }
        pipeline.status = status_by_event[event_type]
        run_id = str(envelope.payload.get("run_id") or envelope.event_id)
        run = db.scalar(
            select(PipelineRun).where(
                PipelineRun.organization_id == organization_id,
                PipelineRun.external_run_id == run_id,
            )
        )
        if run is None:
            run = PipelineRun(
                organization_id=organization_id,
                pipeline_id=pipeline.id,
                external_run_id=run_id,
                status=status_by_event[event_type],
                started_at=_parse_payload_time(
                    envelope.payload.get("started_at"), envelope.occurred_at
                ),
            )
            db.add(run)
        run.status = status_by_event[event_type]
        if event_type != "pipeline.started":
            run.finished_at = envelope.occurred_at
        run.error_message = str(envelope.payload.get("error", ""))[:2000]
        run.logs = str(envelope.payload.get("logs", ""))[:8000]
        if event_type == "pipeline.failed":
            severity = envelope.severity if envelope.severity in {"high", "critical"} else "high"
            related_name = str(envelope.payload.get("dataset_name", ""))
            if related_name:
                dataset = db.scalar(
                    select(Dataset).where(
                        Dataset.organization_id == organization_id,
                        Dataset.fully_qualified_name == related_name,
                    )
                )
                if dataset is not None:
                    dataset_id = dataset.id
                    incident = db.scalar(
                        select(Incident)
                        .where(
                            Incident.organization_id == organization_id,
                            Incident.environment == envelope.environment,
                            Incident.category == "SCHEMA_DRIFT",
                            Incident.entity_ref == related_name,
                            Incident.status.in_(["OPEN", "INVESTIGATING", "ROOT_CAUSE_IDENTIFIED"]),
                        )
                        .order_by(Incident.opened_at.desc())
                        .limit(1)
                    )
            if incident is None:
                incident, _ = get_or_create_incident(
                    db,
                    organization_id,
                    envelope.environment,
                    f"Pipeline failed: {envelope.entity_id}",
                    run.error_message or f"Pipeline {envelope.entity_id} reported a failed run.",
                    "PIPELINE_FAILURE",
                    severity,
                    event_type,
                    envelope.entity_id,
                    envelope.occurred_at,
                )

    elif event_type == "schema.changed":
        dataset_name = str(envelope.payload.get("dataset_name") or envelope.entity_id)
        columns = envelope.payload.get("columns")
        if not isinstance(columns, list):
            raise ValueError("schema.changed events require payload.columns")
        dataset, _, changes = ingest_schema_definition(
            db,
            organization_id,
            dataset_name,
            columns,
            str(envelope.payload.get("asset_type", "TABLE")),
        )
        dataset_id = dataset.id
        breaking = [change for change in changes if change.classification == "BREAKING"]
        if breaking:
            summary = ", ".join(
                f"{change.column_name}: {change.previous_type or '∅'} "
                f"→ {change.current_type or '∅'}"
                for change in breaking[:5]
            )
            incident, _ = get_or_create_incident(
                db,
                organization_id,
                envelope.environment,
                f"Breaking schema change: {dataset.fully_qualified_name}",
                f"Breaking schema change detected for {dataset.fully_qualified_name}: {summary}",
                "SCHEMA_DRIFT",
                "high",
                event_type,
                dataset.fully_qualified_name,
                envelope.occurred_at,
            )

    elif event_type == "dataset.updated":
        dataset = db.scalar(
            select(Dataset).where(
                Dataset.organization_id == organization_id,
                Dataset.fully_qualified_name == envelope.entity_id,
            )
        )
        if dataset is None:
            dataset = Dataset(
                organization_id=organization_id,
                name=envelope.entity_id.rsplit(".", 1)[-1],
                fully_qualified_name=envelope.entity_id,
                asset_type=str(envelope.payload.get("asset_type", "TABLE")).upper(),
                description=str(envelope.payload.get("description", ""))[:4000],
                tags=envelope.payload.get("tags", [])[:100],
                last_seen_at=envelope.occurred_at,
            )
            db.add(dataset)

    elif event_type == "deployment.created":
        db.add(
            Deployment(
                organization_id=organization_id,
                environment=envelope.environment,
                service=str(envelope.payload.get("service", envelope.source))[:120],
                version=str(envelope.payload.get("version", ""))[:120],
                summary=str(envelope.payload.get("summary", ""))[:2000],
                deployed_at=envelope.occurred_at,
            )
        )

    elif event_type in {"quality.failed", "connector.error"}:
        category = "QUALITY_FAILURE" if event_type == "quality.failed" else "CONNECTOR_FAILURE"
        related_name = str(envelope.payload.get("dataset_name") or envelope.entity_id)
        if event_type == "quality.failed":
            quality_dataset = db.scalar(
                select(Dataset).where(
                    Dataset.organization_id == organization_id,
                    Dataset.fully_qualified_name == related_name,
                )
            )
            if quality_dataset is not None:
                dataset_id = quality_dataset.id
                upstream = traverse_lineage(
                    db, organization_id, quality_dataset.id, "upstream", max_depth=10
                )
                related_names = {quality_dataset.fully_qualified_name}
                related_names.update(asset["name"] for asset in upstream)
                incident = db.scalar(
                    select(Incident)
                    .where(
                        Incident.organization_id == organization_id,
                        Incident.environment == envelope.environment,
                        Incident.category.in_(["SCHEMA_DRIFT", "PIPELINE_FAILURE"]),
                        Incident.entity_ref.in_(related_names),
                        Incident.status.in_(["OPEN", "INVESTIGATING", "ROOT_CAUSE_IDENTIFIED"]),
                        Incident.opened_at >= envelope.occurred_at - timedelta(hours=24),
                    )
                    .order_by(Incident.opened_at.desc())
                    .limit(1)
                )
        title = str(
            envelope.payload.get("title")
            or f"{event_type.replace('.', ' ').title()}: {envelope.entity_id}"
        )
        if incident is None:
            incident, _ = get_or_create_incident(
                db,
                organization_id,
                envelope.environment,
                title,
                str(envelope.payload.get("message", ""))[:4000],
                category,
                envelope.severity if envelope.severity != "info" else "high",
                event_type,
                envelope.entity_id,
                envelope.occurred_at,
            )

    if incident is not None:
        collect_event_evidence(db, organization_id, incident, event, dataset_id)

    event.processed_at = datetime.now(UTC)
    return event, incident, False
