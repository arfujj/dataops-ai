from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents.investigator import investigate_incident
from app.api.deps import TenantContext, get_tenant, require_roles
from app.db.session import get_db
from app.events.publisher import publish_event, to_event_message
from app.models.domain import (
    AgentRun,
    AgentToolCall,
    AuditLog,
    Connector,
    DataQualityCheck,
    DataQualityResult,
    Dataset,
    DatasetColumn,
    Incident,
    IncidentEvidence,
    Pipeline,
    PipelineRun,
    RemediationAction,
    RemediationPlan,
    SchemaChange,
    SchemaVersion,
)
from app.policies.remediation import evaluate_remediation_policy
from app.schemas.events import (
    DbtImportRequest,
    QualityCheckCreate,
    RemediationCreate,
    SchemaIngestRequest,
    TelemetryEventEnvelope,
)
from app.services.dbt import import_manifest
from app.services.events import process_event
from app.services.incidents import build_incident_context
from app.services.lineage import traverse_lineage
from app.services.quality import run_quality_check

router = APIRouter(tags=["data platform"])


@router.post("/dbt/import", status_code=status.HTTP_200_OK)
def import_dbt_manifest(
    payload: DbtImportRequest,
    tenant: TenantContext = Depends(require_roles("admin", "engineer")),
    db: Session = Depends(get_db),
) -> dict:
    try:
        result = import_manifest(db, tenant.organization_id, payload.manifest)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    db.commit()
    return result


def _incident_dict(incident: Incident) -> dict:
    return {
        "id": incident.id,
        "title": incident.title,
        "description": incident.description,
        "category": incident.category,
        "severity": incident.severity,
        "status": incident.status,
        "environment": incident.environment,
        "entity_ref": incident.entity_ref,
        "opened_at": incident.opened_at,
        "updated_at": incident.updated_at,
    }


@router.post("/events", status_code=status.HTTP_202_ACCEPTED)
def ingest_event(
    envelope: TelemetryEventEnvelope,
    tenant: TenantContext = Depends(require_roles("admin", "engineer")),
    db: Session = Depends(get_db),
) -> dict:
    try:
        event, incident, duplicate = process_event(db, tenant.organization_id, envelope)
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if duplicate:
        return {"event_id": str(event.event_id), "accepted": True, "duplicate": True}
    db.commit()

    published, publish_error = publish_event(to_event_message(event), tenant.organization_id)
    event.published_at = datetime.now(UTC) if published else None
    event.publish_error = "" if published else publish_error
    db.commit()
    return {
        "event_id": str(event.event_id),
        "accepted": True,
        "published": published,
        "incident_id": str(incident.id) if incident else None,
    }


@router.post("/schemas/ingest", status_code=status.HTTP_202_ACCEPTED)
def ingest_schema(
    request: SchemaIngestRequest,
    tenant: TenantContext = Depends(require_roles("admin", "engineer")),
    db: Session = Depends(get_db),
) -> dict:
    envelope = TelemetryEventEnvelope(
        event_id=uuid4(),
        organization_id=tenant.organization_id,
        environment=request.environment,
        source="schema-api",
        event_type="schema.changed",
        entity_type="dataset",
        entity_id=request.dataset_name,
        severity="high",
        payload={
            "dataset_name": request.dataset_name,
            "asset_type": request.asset_type,
            "columns": request.columns,
        },
    )
    return ingest_event(envelope, tenant, db)


@router.get("/dashboard/summary")
def dashboard_summary(
    tenant: TenantContext = Depends(get_tenant), db: Session = Depends(get_db)
) -> dict:
    org = tenant.organization_id
    open_incidents = (
        db.scalar(
            select(func.count())
            .select_from(Incident)
            .where(
                Incident.organization_id == org,
                Incident.status.not_in(["RESOLVED", "CLOSED"]),
            )
        )
        or 0
    )
    failed_pipelines = (
        db.scalar(
            select(func.count())
            .select_from(Pipeline)
            .where(Pipeline.organization_id == org, Pipeline.status == "FAILED")
        )
        or 0
    )
    running_pipelines = (
        db.scalar(
            select(func.count())
            .select_from(Pipeline)
            .where(Pipeline.organization_id == org, Pipeline.status == "RUNNING")
        )
        or 0
    )
    dataset_count = (
        db.scalar(select(func.count()).select_from(Dataset).where(Dataset.organization_id == org))
        or 0
    )
    today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    quality_total = (
        db.scalar(
            select(func.count())
            .select_from(DataQualityResult)
            .where(
                DataQualityResult.organization_id == org,
                DataQualityResult.executed_at >= today,
            )
        )
        or 0
    )
    quality_passed = (
        db.scalar(
            select(func.count())
            .select_from(DataQualityResult)
            .where(
                DataQualityResult.organization_id == org,
                DataQualityResult.executed_at >= today,
                DataQualityResult.passed.is_(True),
            )
        )
        or 0
    )
    recent_incidents = list(
        db.scalars(
            select(Incident)
            .where(Incident.organization_id == org)
            .order_by(Incident.opened_at.desc())
            .limit(5)
        )
    )
    recent_schema_changes = list(
        db.execute(
            select(SchemaChange, Dataset)
            .join(Dataset, Dataset.id == SchemaChange.dataset_id)
            .where(SchemaChange.organization_id == org)
            .order_by(SchemaChange.created_at.desc())
            .limit(6)
        )
    )
    return {
        "open_incidents": open_incidents,
        "running_pipelines": running_pipelines,
        "failed_pipelines": failed_pipelines,
        "dataset_count": dataset_count,
        "quality_pass_rate": round(quality_passed * 100 / quality_total, 1)
        if quality_total
        else None,
        "recent_incidents": [_incident_dict(item) for item in recent_incidents],
        "recent_schema_changes": [
            {
                "id": change.id,
                "dataset_id": dataset.id,
                "dataset_name": dataset.fully_qualified_name,
                "change_type": change.change_type,
                "classification": change.classification,
                "column_name": change.column_name,
                "previous_type": change.previous_type,
                "current_type": change.current_type,
                "created_at": change.created_at,
            }
            for change, dataset in recent_schema_changes
        ],
    }


@router.get("/incidents")
def list_incidents(
    severity: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    environment: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant),
    db: Session = Depends(get_db),
) -> dict:
    query = select(Incident).where(Incident.organization_id == tenant.organization_id)
    if severity:
        query = query.where(Incident.severity == severity.upper())
    if status_filter:
        query = query.where(Incident.status == status_filter.upper())
    if environment:
        query = query.where(Incident.environment == environment)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = list(db.scalars(query.order_by(Incident.opened_at.desc()).limit(limit).offset(offset)))
    return {
        "items": [_incident_dict(item) for item in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/incidents/{incident_id}")
def get_incident(
    incident_id: UUID,
    tenant: TenantContext = Depends(get_tenant),
    db: Session = Depends(get_db),
) -> dict:
    try:
        context = build_incident_context(db, tenant.organization_id, incident_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail="Incident not found") from error
    runs = list(
        db.scalars(
            select(AgentRun)
            .where(
                AgentRun.organization_id == tenant.organization_id,
                AgentRun.incident_id == incident_id,
            )
            .order_by(AgentRun.started_at.desc())
            .limit(10)
        )
    )
    run_ids = [run.id for run in runs]
    calls = (
        list(
            db.scalars(
                select(AgentToolCall)
                .where(
                    AgentToolCall.organization_id == tenant.organization_id,
                    AgentToolCall.agent_run_id.in_(run_ids),
                )
                .order_by(AgentToolCall.created_at.asc())
            )
        )
        if run_ids
        else []
    )
    plans = list(
        db.scalars(
            select(RemediationPlan)
            .where(
                RemediationPlan.organization_id == tenant.organization_id,
                RemediationPlan.incident_id == incident_id,
            )
            .order_by(RemediationPlan.created_at.desc())
            .limit(10)
        )
    )
    context["agent_runs"] = [
        {
            "id": run.id,
            "status": run.status,
            "mode": run.mode,
            "model": run.model,
            "result": run.result,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
        }
        for run in runs
    ]
    context["tool_calls"] = [
        {
            "id": call.id,
            "agent_run_id": call.agent_run_id,
            "tool_name": call.tool_name,
            "arguments": call.arguments,
            "result": call.result,
            "succeeded": call.succeeded,
            "duration_ms": call.duration_ms,
            "created_at": call.created_at,
        }
        for call in calls
    ]
    context["remediation_plans"] = [
        {
            "id": plan.id,
            "status": plan.status,
            "summary": plan.summary,
            "actions": plan.actions,
            "approved_by_user_id": plan.approved_by_user_id,
            "approved_at": plan.approved_at,
        }
        for plan in plans
    ]
    return context


@router.post("/incidents/{incident_id}/investigate")
def investigate(
    incident_id: UUID,
    tenant: TenantContext = Depends(require_roles("admin", "engineer")),
    db: Session = Depends(get_db),
) -> dict:
    try:
        return investigate_incident(db, tenant, incident_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail="Incident not found") from error
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.get("/incidents/{incident_id}/evidence")
def get_incident_evidence(
    incident_id: UUID,
    tenant: TenantContext = Depends(get_tenant),
    db: Session = Depends(get_db),
) -> list[dict]:
    if (
        db.scalar(
            select(Incident.id).where(
                Incident.organization_id == tenant.organization_id, Incident.id == incident_id
            )
        )
        is None
    ):
        raise HTTPException(status_code=404, detail="Incident not found")
    evidence = list(
        db.scalars(
            select(IncidentEvidence)
            .where(
                IncidentEvidence.organization_id == tenant.organization_id,
                IncidentEvidence.incident_id == incident_id,
            )
            .order_by(IncidentEvidence.relevance.desc(), IncidentEvidence.captured_at.desc())
        )
    )
    return [
        {
            "id": row.id,
            "type": row.evidence_type,
            "summary": row.summary,
            "relevance": row.relevance,
            "details": row.details,
            "captured_at": row.captured_at,
        }
        for row in evidence
    ]


@router.get("/datasets")
def list_datasets(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    tenant: TenantContext = Depends(get_tenant),
    db: Session = Depends(get_db),
) -> dict:
    query = select(Dataset).where(Dataset.organization_id == tenant.organization_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    datasets = list(
        db.scalars(query.order_by(Dataset.fully_qualified_name).limit(limit).offset(offset))
    )
    return {
        "items": [
            {
                "id": row.id,
                "name": row.name,
                "fully_qualified_name": row.fully_qualified_name,
                "asset_type": row.asset_type,
                "description": row.description,
                "tags": row.tags,
                "last_seen_at": row.last_seen_at,
            }
            for row in datasets
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/datasets/{dataset_id}")
def get_dataset(
    dataset_id: UUID,
    tenant: TenantContext = Depends(get_tenant),
    db: Session = Depends(get_db),
) -> dict:
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.organization_id == tenant.organization_id, Dataset.id == dataset_id
        )
    )
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    columns = list(
        db.scalars(
            select(DatasetColumn)
            .where(
                DatasetColumn.organization_id == tenant.organization_id,
                DatasetColumn.dataset_id == dataset_id,
            )
            .order_by(DatasetColumn.ordinal)
        )
    )
    versions = list(
        db.scalars(
            select(SchemaVersion)
            .where(
                SchemaVersion.organization_id == tenant.organization_id,
                SchemaVersion.dataset_id == dataset_id,
            )
            .order_by(SchemaVersion.version.desc())
            .limit(10)
        )
    )
    return {
        "id": dataset.id,
        "fully_qualified_name": dataset.fully_qualified_name,
        "asset_type": dataset.asset_type,
        "description": dataset.description,
        "tags": dataset.tags,
        "columns": [
            {"name": c.name, "type": c.data_type, "nullable": c.nullable, "ordinal": c.ordinal}
            for c in columns
        ],
        "schema_versions": [
            {"version": v.version, "columns": v.columns, "created_at": v.created_at}
            for v in versions
        ],
    }


def _lineage_response(
    direction: str,
    dataset_id: UUID,
    max_depth: int,
    tenant: TenantContext,
    db: Session,
) -> dict:
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.organization_id == tenant.organization_id, Dataset.id == dataset_id
        )
    )
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    results = traverse_lineage(
        db, tenant.organization_id, dataset_id, direction, max_depth=max_depth
    )
    return {
        "dataset_id": dataset_id,
        "dataset_name": dataset.fully_qualified_name,
        "direction": direction,
        "assets": results,
        "count": len(results),
    }


@router.get("/lineage/{dataset_id}/upstream")
def lineage_upstream(
    dataset_id: UUID,
    max_depth: int = Query(default=10, ge=1, le=10),
    tenant: TenantContext = Depends(get_tenant),
    db: Session = Depends(get_db),
) -> dict:
    return _lineage_response("upstream", dataset_id, max_depth, tenant, db)


@router.get("/lineage/{dataset_id}/downstream")
def lineage_downstream(
    dataset_id: UUID,
    max_depth: int = Query(default=10, ge=1, le=10),
    tenant: TenantContext = Depends(get_tenant),
    db: Session = Depends(get_db),
) -> dict:
    return _lineage_response("downstream", dataset_id, max_depth, tenant, db)


@router.get("/lineage/{dataset_id}/impact")
def lineage_impact(
    dataset_id: UUID,
    max_depth: int = Query(default=10, ge=1, le=10),
    tenant: TenantContext = Depends(get_tenant),
    db: Session = Depends(get_db),
) -> dict:
    return _lineage_response("downstream", dataset_id, max_depth, tenant, db)


@router.get("/pipelines")
def list_pipelines(
    tenant: TenantContext = Depends(get_tenant), db: Session = Depends(get_db)
) -> list[dict]:
    pipelines = list(
        db.scalars(
            select(Pipeline)
            .where(Pipeline.organization_id == tenant.organization_id)
            .order_by(Pipeline.name)
        )
    )
    return [
        {
            "id": p.id,
            "name": p.name,
            "orchestrator": p.orchestrator,
            "status": p.status,
            "last_run_at": p.last_run_at,
        }
        for p in pipelines
    ]


@router.get("/pipelines/{pipeline_id}/runs")
def list_pipeline_runs(
    pipeline_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    tenant: TenantContext = Depends(get_tenant),
    db: Session = Depends(get_db),
) -> list[dict]:
    if (
        db.scalar(
            select(Pipeline.id).where(
                Pipeline.id == pipeline_id, Pipeline.organization_id == tenant.organization_id
            )
        )
        is None
    ):
        raise HTTPException(status_code=404, detail="Pipeline not found")
    runs = list(
        db.scalars(
            select(PipelineRun)
            .where(
                PipelineRun.pipeline_id == pipeline_id,
                PipelineRun.organization_id == tenant.organization_id,
            )
            .order_by(PipelineRun.started_at.desc())
            .limit(limit)
        )
    )
    return [
        {
            "id": run.id,
            "run_id": run.external_run_id,
            "status": run.status,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "error_message": run.error_message,
            "logs": run.logs,
        }
        for run in runs
    ]


@router.get("/pipelines/{pipeline_id}")
def get_pipeline(
    pipeline_id: UUID,
    tenant: TenantContext = Depends(get_tenant),
    db: Session = Depends(get_db),
) -> dict:
    pipeline = db.scalar(
        select(Pipeline).where(
            Pipeline.id == pipeline_id, Pipeline.organization_id == tenant.organization_id
        )
    )
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return {
        "id": pipeline.id,
        "name": pipeline.name,
        "orchestrator": pipeline.orchestrator,
        "status": pipeline.status,
        "last_run_at": pipeline.last_run_at,
    }


def _quality_check_dict(check: DataQualityCheck) -> dict:
    return {
        "id": check.id,
        "dataset_id": check.dataset_id,
        "name": check.name,
        "check_type": check.check_type,
        "configuration": check.configuration,
        "is_active": check.is_active,
        "created_at": check.created_at,
    }


def _quality_result_dict(result: DataQualityResult) -> dict:
    return {
        "id": result.id,
        "check_id": result.check_id,
        "observed_value": result.observed_value,
        "expected_threshold": result.expected_threshold,
        "passed": result.passed,
        "anomaly": result.anomaly,
        "executed_at": result.executed_at,
    }


@router.get("/quality/checks")
def list_quality_checks(
    tenant: TenantContext = Depends(get_tenant), db: Session = Depends(get_db)
) -> list[dict]:
    checks = list(
        db.scalars(
            select(DataQualityCheck)
            .where(DataQualityCheck.organization_id == tenant.organization_id)
            .order_by(DataQualityCheck.name)
        )
    )
    return [_quality_check_dict(check) for check in checks]


@router.post("/quality/checks", status_code=status.HTTP_201_CREATED)
def create_quality_check(
    payload: QualityCheckCreate,
    tenant: TenantContext = Depends(require_roles("admin", "engineer")),
    db: Session = Depends(get_db),
) -> dict:
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.organization_id == tenant.organization_id,
            Dataset.id == payload.dataset_id,
        )
    )
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    check = DataQualityCheck(
        organization_id=tenant.organization_id,
        dataset_id=dataset.id,
        name=payload.name,
        check_type=payload.check_type,
        configuration=payload.configuration,
    )
    db.add(check)
    db.commit()
    db.refresh(check)
    return _quality_check_dict(check)


@router.post("/quality/checks/{check_id}/run")
def execute_quality_check(
    check_id: UUID,
    tenant: TenantContext = Depends(require_roles("admin", "engineer")),
    db: Session = Depends(get_db),
) -> dict:
    check = db.scalar(
        select(DataQualityCheck).where(
            DataQualityCheck.organization_id == tenant.organization_id,
            DataQualityCheck.id == check_id,
            DataQualityCheck.is_active.is_(True),
        )
    )
    if check is None:
        raise HTTPException(status_code=404, detail="Quality check not found")
    try:
        result = run_quality_check(db, tenant.organization_id, check)
    except (LookupError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    db.commit()
    db.refresh(result)
    return _quality_result_dict(result)


@router.get("/quality/checks/{check_id}/history")
def quality_history(
    check_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    tenant: TenantContext = Depends(get_tenant),
    db: Session = Depends(get_db),
) -> list[dict]:
    if (
        db.scalar(
            select(DataQualityCheck.id).where(
                DataQualityCheck.organization_id == tenant.organization_id,
                DataQualityCheck.id == check_id,
            )
        )
        is None
    ):
        raise HTTPException(status_code=404, detail="Quality check not found")
    results = list(
        db.scalars(
            select(DataQualityResult)
            .where(
                DataQualityResult.organization_id == tenant.organization_id,
                DataQualityResult.check_id == check_id,
            )
            .order_by(DataQualityResult.executed_at.desc())
            .limit(limit)
        )
    )
    return [_quality_result_dict(result) for result in results]


@router.get("/connectors")
def list_connectors(
    tenant: TenantContext = Depends(get_tenant), db: Session = Depends(get_db)
) -> list[dict]:
    connectors = list(
        db.scalars(
            select(Connector)
            .where(Connector.organization_id == tenant.organization_id)
            .order_by(Connector.name)
        )
    )
    return [
        {
            "id": connector.id,
            "name": connector.name,
            "type": connector.connector_type,
            "state": connector.state,
            "config": connector.config,
        }
        for connector in connectors
    ]


@router.get("/audit")
def list_audit_log(
    limit: int = Query(default=50, ge=1, le=100),
    tenant: TenantContext = Depends(get_tenant),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = list(
        db.scalars(
            select(AuditLog)
            .where(AuditLog.organization_id == tenant.organization_id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
    )
    return [
        {
            "id": row.id,
            "actor_user_id": row.actor_user_id,
            "action": row.action,
            "target_type": row.target_type,
            "target_id": row.target_id,
            "details": row.details,
            "created_at": row.created_at,
        }
        for row in rows
    ]


def _remediation_dict(plan: RemediationPlan, actions: list[RemediationAction]) -> dict:
    return {
        "id": plan.id,
        "incident_id": plan.incident_id,
        "status": plan.status,
        "summary": plan.summary,
        "actions": [
            {
                "id": action.id,
                "action_type": action.action_type,
                "description": action.description,
                "status": action.status,
                "validation_result": action.validation_result,
            }
            for action in actions
        ],
        "created_by_user_id": plan.created_by_user_id,
        "approved_by_user_id": plan.approved_by_user_id,
        "approved_at": plan.approved_at,
        "created_at": plan.created_at,
    }


@router.post("/remediations", status_code=status.HTTP_201_CREATED)
def create_remediation(
    payload: RemediationCreate,
    tenant: TenantContext = Depends(require_roles("admin", "engineer")),
    db: Session = Depends(get_db),
) -> dict:
    incident = db.scalar(
        select(Incident).where(
            Incident.organization_id == tenant.organization_id,
            Incident.id == payload.incident_id,
        )
    )
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    plan = RemediationPlan(
        organization_id=tenant.organization_id,
        incident_id=incident.id,
        created_by_user_id=tenant.user.id,
        status="PROPOSED",
        summary=payload.summary,
        actions=[action.description for action in payload.actions],
    )
    db.add(plan)
    db.flush()
    actions = [
        RemediationAction(
            organization_id=tenant.organization_id,
            plan_id=plan.id,
            action_type=action.action_type,
            description=action.description,
            status="PROPOSED",
        )
        for action in payload.actions
    ]
    db.add_all(actions)
    db.add(
        AuditLog(
            organization_id=tenant.organization_id,
            actor_user_id=tenant.user.id,
            action="remediation.proposed",
            target_type="remediation_plan",
            target_id=str(plan.id),
            details={"incident_id": str(incident.id), "action_count": len(actions)},
        )
    )
    db.commit()
    db.refresh(plan)
    return _remediation_dict(plan, actions)


@router.post("/remediations/{plan_id}/validate")
def validate_remediation(
    plan_id: UUID,
    tenant: TenantContext = Depends(require_roles("admin", "engineer")),
    db: Session = Depends(get_db),
) -> dict:
    plan = db.scalar(
        select(RemediationPlan).where(
            RemediationPlan.organization_id == tenant.organization_id,
            RemediationPlan.id == plan_id,
        )
    )
    if plan is None:
        raise HTTPException(status_code=404, detail="Remediation plan not found")
    if plan.status not in {"PROPOSED", "VALIDATED"}:
        raise HTTPException(
            status_code=409,
            detail=f"Plan in {plan.status.lower()} state cannot be validated",
        )
    actions = list(
        db.scalars(
            select(RemediationAction).where(
                RemediationAction.organization_id == tenant.organization_id,
                RemediationAction.plan_id == plan.id,
            )
        )
    )
    evaluation = evaluate_remediation_policy(actions)
    if not evaluation["allowed"]:
        plan.status = "BLOCKED"
        for action in actions:
            action.status = "BLOCKED"
            action.validation_result = {"policy": evaluation}
    else:
        plan.status = "VALIDATED"
        for action in actions:
            action.status = "VALIDATED"
            action.validation_result = {
                "policy": evaluation,
                "dry_run": True,
                "external_state_changed": False,
                "validated_at": datetime.now(UTC).isoformat(),
            }
    db.add(
        AuditLog(
            organization_id=tenant.organization_id,
            actor_user_id=tenant.user.id,
            action="remediation.validated",
            target_type="remediation_plan",
            target_id=str(plan.id),
            details=evaluation,
        )
    )
    db.commit()
    if not evaluation["allowed"]:
        raise HTTPException(status_code=409, detail=evaluation["reason"])
    return _remediation_dict(plan, actions)


@router.post("/remediations/{plan_id}/approve")
def approve_remediation(
    plan_id: UUID,
    tenant: TenantContext = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict:
    plan = db.scalar(
        select(RemediationPlan).where(
            RemediationPlan.organization_id == tenant.organization_id,
            RemediationPlan.id == plan_id,
        )
    )
    if plan is None:
        raise HTTPException(status_code=404, detail="Remediation plan not found")
    if plan.status != "VALIDATED":
        raise HTTPException(
            status_code=409, detail="Plan must pass safe validation before approval"
        )
    actions = list(
        db.scalars(
            select(RemediationAction).where(
                RemediationAction.organization_id == tenant.organization_id,
                RemediationAction.plan_id == plan.id,
            )
        )
    )
    evaluation = evaluate_remediation_policy(actions)
    if not evaluation["allowed"]:
        raise HTTPException(status_code=409, detail=evaluation["reason"])
    plan.status = "APPROVED"
    plan.approved_by_user_id = tenant.user.id
    plan.approved_at = datetime.now(UTC)
    db.add(
        AuditLog(
            organization_id=tenant.organization_id,
            actor_user_id=tenant.user.id,
            action="remediation.approved",
            target_type="remediation_plan",
            target_id=str(plan.id),
            details={"execution_performed": False},
        )
    )
    db.commit()
    db.refresh(plan)
    return _remediation_dict(plan, actions)
