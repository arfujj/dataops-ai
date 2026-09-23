from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import (
    Incident,
    IncidentEvidence,
    PipelineRun,
    SchemaChange,
    TelemetryEvent,
)
from app.services.lineage import traverse_lineage


def get_or_create_incident(
    db: Session,
    organization_id: UUID,
    environment: str,
    title: str,
    description: str,
    category: str,
    severity: str,
    trigger_type: str,
    entity_ref: str,
    opened_at: datetime,
) -> tuple[Incident, bool]:
    recent_cutoff = opened_at - timedelta(hours=24)
    existing = db.scalar(
        select(Incident)
        .where(
            Incident.organization_id == organization_id,
            Incident.environment == environment,
            Incident.category == category,
            Incident.entity_ref == entity_ref,
            Incident.status.in_(["OPEN", "INVESTIGATING", "ROOT_CAUSE_IDENTIFIED"]),
            Incident.opened_at >= recent_cutoff,
        )
        .order_by(Incident.opened_at.desc())
        .limit(1)
    )
    if existing is not None:
        return existing, False
    incident = Incident(
        organization_id=organization_id,
        environment=environment,
        title=title[:255],
        description=description[:8000],
        category=category,
        severity=severity.upper(),
        status="OPEN",
        trigger_type=trigger_type,
        entity_ref=entity_ref[:255],
        opened_at=opened_at,
    )
    db.add(incident)
    db.flush()
    return incident, True


def collect_event_evidence(
    db: Session,
    organization_id: UUID,
    incident: Incident,
    trigger_event: TelemetryEvent,
    dataset_id: UUID | None = None,
) -> None:
    existing_ref = db.scalar(
        select(IncidentEvidence.id).where(
            IncidentEvidence.organization_id == organization_id,
            IncidentEvidence.incident_id == incident.id,
            IncidentEvidence.reference_id == str(trigger_event.id),
        )
    )
    if existing_ref is None:
        db.add(
            IncidentEvidence(
                organization_id=organization_id,
                incident_id=incident.id,
                evidence_type="TELEMETRY_EVENT",
                reference_id=str(trigger_event.id),
                summary=(
                    f"{trigger_event.source} reported {trigger_event.event_type} "
                    f"for {trigger_event.entity_id}"
                ),
                relevance=100,
                details={
                    "event_id": str(trigger_event.event_id),
                    "event_type": trigger_event.event_type,
                    "source": trigger_event.source,
                    "occurred_at": trigger_event.occurred_at.isoformat(),
                    "payload": trigger_event.payload,
                },
            )
        )

    window_start = trigger_event.occurred_at - timedelta(hours=2)
    nearby = list(
        db.scalars(
            select(TelemetryEvent)
            .where(
                TelemetryEvent.organization_id == organization_id,
                TelemetryEvent.environment == incident.environment,
                TelemetryEvent.occurred_at.between(window_start, trigger_event.occurred_at),
                TelemetryEvent.id != trigger_event.id,
            )
            .order_by(TelemetryEvent.occurred_at.desc())
            .limit(25)
        )
    )
    evidence_count = 0
    for item in nearby:
        if db.scalar(
            select(IncidentEvidence.id).where(
                IncidentEvidence.organization_id == organization_id,
                IncidentEvidence.incident_id == incident.id,
                IncidentEvidence.reference_id == str(item.id),
            )
        ):
            continue
        relevance = 90 if item.event_type in {"schema.changed", "quality.failed"} else 70
        db.add(
            IncidentEvidence(
                organization_id=organization_id,
                incident_id=incident.id,
                evidence_type="TELEMETRY_EVENT",
                reference_id=str(item.id),
                summary=f"{item.source} reported {item.event_type} for {item.entity_id}",
                relevance=relevance,
                details={
                    "event_id": str(item.event_id),
                    "event_type": item.event_type,
                    "payload": item.payload,
                },
            )
        )
        evidence_count += 1
        if evidence_count >= 12:
            break

    if dataset_id is not None:
        schema_changes = list(
            db.scalars(
                select(SchemaChange)
                .where(
                    SchemaChange.organization_id == organization_id,
                    SchemaChange.dataset_id == dataset_id,
                    SchemaChange.created_at >= trigger_event.occurred_at - timedelta(minutes=5),
                )
                .order_by(SchemaChange.created_at.desc())
                .limit(25)
            )
        )
        for change in schema_changes:
            if db.scalar(
                select(IncidentEvidence.id).where(
                    IncidentEvidence.organization_id == organization_id,
                    IncidentEvidence.incident_id == incident.id,
                    IncidentEvidence.evidence_type == "SCHEMA_CHANGE",
                    IncidentEvidence.reference_id == str(change.id),
                )
            ):
                continue
            db.add(
                IncidentEvidence(
                    organization_id=organization_id,
                    incident_id=incident.id,
                    evidence_type="SCHEMA_CHANGE",
                    reference_id=str(change.id),
                    summary=(
                        f"{change.classification} change: {change.change_type} "
                        f"on {change.column_name}"
                    ),
                    relevance=98,
                    details={
                        "dataset_id": str(change.dataset_id),
                        "change_type": change.change_type,
                        "classification": change.classification,
                        "column_name": change.column_name,
                        "previous_name": change.previous_name,
                        "previous_type": change.previous_type,
                        "current_type": change.current_type,
                    },
                )
            )
        downstream = traverse_lineage(db, organization_id, dataset_id, "downstream")
        for asset in downstream:
            if db.scalar(
                select(IncidentEvidence.id).where(
                    IncidentEvidence.organization_id == organization_id,
                    IncidentEvidence.incident_id == incident.id,
                    IncidentEvidence.evidence_type == "LINEAGE_IMPACT",
                    IncidentEvidence.reference_id == str(asset["dataset_id"]),
                )
            ):
                continue
            db.add(
                IncidentEvidence(
                    organization_id=organization_id,
                    incident_id=incident.id,
                    evidence_type="LINEAGE_IMPACT",
                    reference_id=str(asset["dataset_id"]),
                    summary=f"{asset['name']} is downstream at depth {asset['depth']}",
                    relevance=max(25, 70 - asset["depth"] * 5),
                    details=asset,
                )
            )


def build_incident_context(db: Session, organization_id: UUID, incident_id: UUID) -> dict:
    incident = db.scalar(
        select(Incident).where(
            Incident.id == incident_id,
            Incident.organization_id == organization_id,
        )
    )
    if incident is None:
        raise LookupError("Incident not found")
    evidence = list(
        db.scalars(
            select(IncidentEvidence)
            .where(
                IncidentEvidence.organization_id == organization_id,
                IncidentEvidence.incident_id == incident.id,
            )
            .order_by(IncidentEvidence.relevance.desc(), IncidentEvidence.captured_at.desc())
            .limit(100)
        )
    )
    event_ids: list[UUID] = []
    for item in evidence:
        if item.evidence_type != "TELEMETRY_EVENT":
            continue
        try:
            event_ids.append(UUID(item.reference_id))
        except ValueError:
            continue
    events = (
        list(
            db.scalars(
                select(TelemetryEvent)
                .where(
                    TelemetryEvent.organization_id == organization_id,
                    TelemetryEvent.id.in_(event_ids),
                )
                .order_by(TelemetryEvent.occurred_at.desc())
            )
        )
        if event_ids
        else []
    )
    failed_runs = list(
        db.scalars(
            select(PipelineRun)
            .where(
                PipelineRun.organization_id == organization_id,
                PipelineRun.external_run_id.in_(
                    [str(event.payload.get("run_id", "")) for event in events]
                ),
            )
            .order_by(PipelineRun.started_at.desc())
            .limit(20)
        )
    )
    schema_changes = list(
        db.scalars(
            select(SchemaChange)
            .where(
                SchemaChange.organization_id == organization_id,
                SchemaChange.created_at >= incident.opened_at - timedelta(hours=2),
                SchemaChange.created_at <= incident.opened_at + timedelta(minutes=5),
            )
            .order_by(SchemaChange.created_at.desc())
            .limit(25)
        )
    )
    impacts = [item.details for item in evidence if item.evidence_type == "LINEAGE_IMPACT"]
    return {
        "incident": {
            "id": str(incident.id),
            "title": incident.title,
            "description": incident.description,
            "category": incident.category,
            "severity": incident.severity,
            "status": incident.status,
            "environment": incident.environment,
            "opened_at": incident.opened_at.isoformat(),
            "entity_ref": incident.entity_ref,
        },
        "failed_runs": [
            {
                "id": str(run.id),
                "pipeline_id": str(run.pipeline_id),
                "run_id": run.external_run_id,
                "status": run.status,
                "started_at": run.started_at.isoformat(),
                "error_message": run.error_message[:2000],
                "logs": run.logs[:4000],
            }
            for run in failed_runs
        ],
        "schema_changes": [
            {
                "id": str(change.id),
                "dataset_id": str(change.dataset_id),
                "change_type": change.change_type,
                "classification": change.classification,
                "column_name": change.column_name,
                "previous_name": change.previous_name,
                "previous_type": change.previous_type,
                "current_type": change.current_type,
            }
            for change in schema_changes
        ],
        "quality_anomalies": [
            {"summary": item.summary, "details": item.details}
            for item in evidence
            if item.evidence_type == "QUALITY_RESULT"
        ],
        "recent_deployments": [
            {"summary": item.summary, "details": item.details}
            for item in evidence
            if item.evidence_type == "DEPLOYMENT"
        ],
        "upstream_assets": [
            {"summary": item.summary, "details": item.details}
            for item in evidence
            if item.evidence_type == "UPSTREAM_ASSET"
        ],
        "downstream_assets": impacts,
        "logs": [run.logs[:4000] for run in failed_runs if run.logs],
        "evidence": [
            {
                "id": str(item.id),
                "type": item.evidence_type,
                "summary": item.summary,
                "relevance": item.relevance,
                "details": item.details,
                "captured_at": item.captured_at.isoformat(),
            }
            for item in evidence
        ],
        "historical_similar_incidents": [],
    }
