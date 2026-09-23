from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.identity import TimestampMixin


class Connector(Base, TimestampMixin):
    __tablename__ = "connectors"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    connector_type: Mapped[str] = mapped_column(String(40))
    state: Mapped[str] = mapped_column(String(24), default="CONNECTED")
    config: Mapped[dict] = mapped_column(JSON, default=dict)


class DataSource(Base, TimestampMixin):
    __tablename__ = "data_sources"
    __table_args__ = (UniqueConstraint("organization_id", "slug", name="uq_data_sources_org_slug"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    connector_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("connectors.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(80))
    source_type: Mapped[str] = mapped_column(String(40))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))


class Dataset(Base, TimestampMixin):
    __tablename__ = "datasets"
    __table_args__ = (
        UniqueConstraint("organization_id", "fully_qualified_name", name="uq_datasets_org_fqn"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    data_source_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(160))
    fully_qualified_name: Mapped[str] = mapped_column(String(255))
    asset_type: Mapped[str] = mapped_column(String(32), default="TABLE")
    description: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DatasetColumn(Base):
    __tablename__ = "dataset_columns"
    __table_args__ = (
        UniqueConstraint("dataset_id", "name", name="uq_dataset_columns_dataset_name"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    dataset_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    data_type: Mapped[str] = mapped_column(String(80))
    nullable: Mapped[bool] = mapped_column(Boolean, default=True)
    ordinal: Mapped[int] = mapped_column(Integer, default=0)
    description: Mapped[str] = mapped_column(Text, default="")


class Pipeline(Base, TimestampMixin):
    __tablename__ = "pipelines"
    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_pipelines_org_name"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    orchestrator: Mapped[str] = mapped_column(String(32), default="webhook")
    status: Mapped[str] = mapped_column(String(24), default="HEALTHY")
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "external_run_id", name="uq_pipeline_runs_org_external_id"
        ),
        Index("ix_pipeline_runs_org_started", "organization_id", "started_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    pipeline_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("pipelines.id", ondelete="CASCADE"), index=True
    )
    external_run_id: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(24))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str] = mapped_column(Text, default="")
    logs: Mapped[str] = mapped_column(Text, default="")


class Job(Base, TimestampMixin):
    __tablename__ = "jobs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    pipeline_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("pipelines.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    external_id: Mapped[str] = mapped_column(String(160), default="")


class JobRun(Base):
    __tablename__ = "job_runs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    job_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(24))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    logs: Mapped[str] = mapped_column(Text, default="")


class SchemaVersion(Base):
    __tablename__ = "schema_versions"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "dataset_id", "version", name="uq_schema_versions_dataset_version"
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    dataset_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    columns: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SchemaChange(Base):
    __tablename__ = "schema_changes"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    dataset_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE"), index=True
    )
    schema_version_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("schema_versions.id", ondelete="CASCADE"), index=True
    )
    change_type: Mapped[str] = mapped_column(String(32))
    classification: Mapped[str] = mapped_column(String(32))
    column_name: Mapped[str] = mapped_column(String(160))
    previous_name: Mapped[str] = mapped_column(String(160), default="")
    previous_type: Mapped[str] = mapped_column(String(80), default="")
    current_type: Mapped[str] = mapped_column(String(80), default="")
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LineageEdge(Base):
    __tablename__ = "lineage_edges"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "source_dataset_id",
            "target_dataset_id",
            "edge_type",
            name="uq_lineage_edge",
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    source_dataset_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE"), index=True
    )
    target_dataset_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE"), index=True
    )
    edge_type: Mapped[str] = mapped_column(String(40), default="TABLE_DEPENDENCY")
    metadata_json: Mapped[dict] = mapped_column("metadata", JSON, default=dict)


class Deployment(Base):
    __tablename__ = "deployments"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    environment: Mapped[str] = mapped_column(String(80), default="production")
    service: Mapped[str] = mapped_column(String(120), default="dbt")
    version: Mapped[str] = mapped_column(String(120), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    deployed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Incident(Base, TimestampMixin):
    __tablename__ = "incidents"
    __table_args__ = (
        Index("ix_incidents_org_status_severity", "organization_id", "status", "severity"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    environment: Mapped[str] = mapped_column(String(80), default="production")
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(40))
    severity: Mapped[str] = mapped_column(String(24))
    status: Mapped[str] = mapped_column(String(40), default="OPEN")
    trigger_type: Mapped[str] = mapped_column(String(40))
    entity_ref: Mapped[str] = mapped_column(String(255), default="")
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class IncidentEvidence(Base):
    __tablename__ = "incident_evidence"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    incident_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"), index=True
    )
    evidence_type: Mapped[str] = mapped_column(String(40))
    reference_id: Mapped[str] = mapped_column(String(80), default="")
    summary: Mapped[str] = mapped_column(Text)
    relevance: Mapped[int] = mapped_column(Integer, default=50)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class DataQualityCheck(Base, TimestampMixin):
    __tablename__ = "data_quality_checks"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    dataset_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    check_type: Mapped[str] = mapped_column(String(32))
    configuration: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))


class DataQualityResult(Base):
    __tablename__ = "data_quality_results"
    __table_args__ = (
        Index("ix_quality_results_org_check_time", "organization_id", "check_id", "executed_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    check_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("data_quality_checks.id", ondelete="CASCADE"), index=True
    )
    observed_value: Mapped[dict] = mapped_column(JSON, default=dict)
    expected_threshold: Mapped[dict] = mapped_column(JSON, default=dict)
    passed: Mapped[bool] = mapped_column(Boolean)
    anomaly: Mapped[bool] = mapped_column(Boolean, default=False)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class DemoRecord(Base):
    __tablename__ = "demo_records"
    __table_args__ = (
        Index("ix_demo_records_org_dataset_time", "organization_id", "dataset_id", "ingested_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    dataset_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("datasets.id", ondelete="CASCADE"), index=True
    )
    values: Mapped[dict] = mapped_column(JSON, default=dict)
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class TelemetryEvent(Base):
    __tablename__ = "telemetry_events"
    __table_args__ = (
        UniqueConstraint("organization_id", "event_id", name="uq_telemetry_org_event_id"),
        Index("ix_telemetry_org_occurred", "organization_id", "occurred_at"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True))
    environment: Mapped[str] = mapped_column(String(80))
    source: Mapped[str] = mapped_column(String(80))
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(255))
    severity: Mapped[str] = mapped_column(String(24), default="info")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    publish_error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    actor_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(String(100))
    target_type: Mapped[str] = mapped_column(String(60))
    target_id: Mapped[str] = mapped_column(String(80), default="")
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    incident_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(24))
    mode: Mapped[str] = mapped_column(String(24))
    model: Mapped[str] = mapped_column(String(120), default="")
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AgentToolCall(Base):
    __tablename__ = "agent_tool_calls"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    agent_run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True
    )
    tool_name: Mapped[str] = mapped_column(String(80))
    arguments: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    succeeded: Mapped[bool] = mapped_column(Boolean)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RemediationPlan(Base, TimestampMixin):
    __tablename__ = "remediation_plans"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    incident_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"), index=True
    )
    created_by_user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT")
    )
    approved_by_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), default="PROPOSED")
    summary: Mapped[str] = mapped_column(Text, default="")
    actions: Mapped[list] = mapped_column(JSON, default=list)


class RemediationAction(Base):
    __tablename__ = "remediation_actions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    plan_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("remediation_plans.id", ondelete="CASCADE"), index=True
    )
    action_type: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="PROPOSED")
    validation_result: Mapped[dict] = mapped_column(JSON, default=dict)
