from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.domain import Dataset, DatasetColumn, SchemaChange, SchemaVersion
from app.services.schema_diff import compare_schemas, normalize_columns


def ingest_schema_definition(
    db: Session,
    organization_id: UUID,
    dataset_name: str,
    columns: list[dict],
    asset_type: str = "TABLE",
    data_source_id: UUID | None = None,
) -> tuple[Dataset, SchemaVersion, list[SchemaChange]]:
    normalized_name = dataset_name.strip()
    if not normalized_name or len(normalized_name) > 255:
        raise ValueError("dataset_name must be non-empty and at most 255 characters")
    normalized_columns = normalize_columns(columns)
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.organization_id == organization_id,
            Dataset.fully_qualified_name == normalized_name,
        )
    )
    if dataset is None:
        dataset = Dataset(
            organization_id=organization_id,
            data_source_id=data_source_id,
            name=normalized_name.rsplit(".", 1)[-1],
            fully_qualified_name=normalized_name,
            asset_type=asset_type.upper(),
        )
        db.add(dataset)
        db.flush()
    else:
        dataset.asset_type = asset_type.upper()
        if data_source_id is not None:
            dataset.data_source_id = data_source_id
    dataset.last_seen_at = datetime.now(UTC)

    previous = db.scalar(
        select(SchemaVersion)
        .where(
            SchemaVersion.organization_id == organization_id,
            SchemaVersion.dataset_id == dataset.id,
        )
        .order_by(SchemaVersion.version.desc())
        .limit(1)
    )
    previous_columns = previous.columns if previous else []
    if previous_columns == normalized_columns:
        return dataset, previous, []

    version = SchemaVersion(
        organization_id=organization_id,
        dataset_id=dataset.id,
        version=(previous.version + 1) if previous else 1,
        columns=normalized_columns,
    )
    db.add(version)
    db.flush()
    changes: list[SchemaChange] = []
    if previous is not None:
        for change in compare_schemas(previous_columns, normalized_columns):
            record = SchemaChange(
                organization_id=organization_id,
                dataset_id=dataset.id,
                schema_version_id=version.id,
                change_type=change["change_type"],
                classification=change["classification"],
                column_name=change["column_name"],
                previous_name=change["previous_name"],
                previous_type=change["previous_type"],
                current_type=change["current_type"],
                details={},
            )
            db.add(record)
            changes.append(record)
    db.execute(delete(DatasetColumn).where(DatasetColumn.dataset_id == dataset.id))
    db.add_all(
        [
            DatasetColumn(
                organization_id=organization_id,
                dataset_id=dataset.id,
                name=column["name"],
                data_type=column["type"],
                nullable=column["nullable"],
                ordinal=index,
            )
            for index, column in enumerate(normalized_columns)
        ]
    )
    db.flush()
    return dataset, version, changes
