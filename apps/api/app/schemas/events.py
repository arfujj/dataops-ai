from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SupportedEvent = Literal[
    "pipeline.started",
    "pipeline.succeeded",
    "pipeline.failed",
    "job.started",
    "job.succeeded",
    "job.failed",
    "schema.changed",
    "quality.failed",
    "quality.recovered",
    "deployment.created",
    "dataset.updated",
    "connector.error",
]


class TelemetryEventEnvelope(BaseModel):
    event_id: UUID = Field(default_factory=uuid4)
    organization_id: UUID | None = None
    environment: str = Field(min_length=1, max_length=80)
    source: str = Field(min_length=1, max_length=80)
    event_type: SupportedEvent
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    entity_type: str = Field(min_length=1, max_length=40)
    entity_id: str = Field(min_length=1, max_length=255)
    severity: Literal["info", "low", "medium", "high", "critical"] = "info"
    payload: dict = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")

    @field_validator("occurred_at")
    @classmethod
    def normalize_timestamp(cls, value: datetime) -> datetime:
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)

    @field_validator("payload")
    @classmethod
    def bound_payload(cls, value: dict) -> dict:
        import json

        if len(json.dumps(value, default=str).encode()) > 32_000:
            raise ValueError("Event payload must be at most 32 KB")
        return value

    @model_validator(mode="after")
    def validate_event_entity(self):
        if self.event_type.startswith("pipeline.") and self.entity_type != "pipeline":
            raise ValueError("pipeline events must use entity_type='pipeline'")
        if self.event_type.startswith("schema.") and self.entity_type != "dataset":
            raise ValueError("schema events must use entity_type='dataset'")
        return self


class SchemaIngestRequest(BaseModel):
    dataset_name: str = Field(min_length=1, max_length=255)
    asset_type: str = Field(default="TABLE", max_length=32)
    environment: str = Field(default="production", max_length=80)
    columns: list[dict] = Field(min_length=1, max_length=500)


class QualityCheckCreate(BaseModel):
    dataset_id: UUID
    name: str = Field(min_length=1, max_length=160)
    check_type: Literal[
        "row_count", "freshness", "null_rate", "uniqueness", "numeric_range", "accepted_values"
    ]
    configuration: dict = Field(default_factory=dict)

    @field_validator("configuration")
    @classmethod
    def validate_configuration_size(cls, value: dict) -> dict:
        import json

        if len(json.dumps(value, default=str).encode()) > 8_000:
            raise ValueError("Quality check configuration must be at most 8 KB")
        return value


class RemediationActionInput(BaseModel):
    action_type: Literal["VALIDATION", "CODE_CHANGE", "REBUILD", "BACKFILL"]
    description: str = Field(min_length=5, max_length=500)


class RemediationCreate(BaseModel):
    incident_id: UUID
    summary: str = Field(min_length=5, max_length=1200)
    actions: list[RemediationActionInput] = Field(min_length=1, max_length=8)


class DbtImportRequest(BaseModel):
    manifest: dict

    @field_validator("manifest")
    @classmethod
    def validate_manifest_size(cls, value: dict) -> dict:
        import json

        if len(json.dumps(value, default=str).encode()) > 10_000_000:
            raise ValueError("dbt manifest must be at most 10 MB")
        if not isinstance(value.get("nodes", {}), dict) or not isinstance(
            value.get("sources", {}), dict
        ):
            raise ValueError("dbt manifest nodes and sources must be objects")
        if len(value.get("nodes", {})) + len(value.get("sources", {})) > 5_000:
            raise ValueError("dbt manifest cannot contain more than 5,000 assets")
        return value
