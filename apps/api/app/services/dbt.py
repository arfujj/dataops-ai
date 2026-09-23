from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.domain import Dataset, LineageEdge
from app.services.schemas import ingest_schema_definition


def _asset_name(unique_id: str, node: dict, resource_type: str) -> str:
    alias = node.get("alias") or node.get("name") or unique_id.rsplit(".", 1)[-1]
    schema = node.get("schema")
    database = node.get("database")
    if resource_type == "source":
        source_name = node.get("source_name")
        if source_name:
            alias = f"{source_name}.{alias}"
    parts = [str(part).strip() for part in (database, schema, alias) if part]
    return ".".join(parts)


def _columns(node: dict) -> list[dict]:
    result = []
    for name, column in (node.get("columns") or {}).items():
        result.append(
            {
                "name": column.get("name") or name,
                "type": column.get("data_type") or column.get("type") or "UNKNOWN",
                "nullable": column.get("nullable", True),
                "description": column.get("description", ""),
            }
        )
    return result


def import_manifest(db: Session, organization_id: UUID, manifest: dict) -> dict:
    assets: dict[str, tuple[dict, str]] = {}
    for unique_id, node in (manifest.get("nodes") or {}).items():
        if node.get("resource_type") in {"model", "seed", "snapshot"}:
            assets[unique_id] = (node, "MODEL")
    for unique_id, node in (manifest.get("sources") or {}).items():
        assets[unique_id] = (node, "SOURCE")
    if len(assets) > 5_000:
        raise ValueError("dbt manifest cannot contain more than 5,000 supported assets")

    by_unique_id: dict[str, Dataset] = {}
    created_assets = 0
    updated_assets = 0
    for unique_id, (node, asset_type) in assets.items():
        name = _asset_name(unique_id, node, asset_type.lower())
        dataset = db.scalar(
            select(Dataset).where(
                Dataset.organization_id == organization_id,
                Dataset.fully_qualified_name == name,
            )
        )
        existed = dataset is not None
        columns = _columns(node)
        if columns:
            dataset, _, _ = ingest_schema_definition(
                db,
                organization_id,
                name,
                columns,
                asset_type,
            )
        elif dataset is None:
            dataset = Dataset(
                organization_id=organization_id,
                name=name.rsplit(".", 1)[-1],
                fully_qualified_name=name,
                asset_type=asset_type,
            )
            db.add(dataset)
            db.flush()
        dataset.description = str(node.get("description") or "")[:4000]
        dataset.tags = list(node.get("tags") or [])[:100]
        by_unique_id[unique_id] = dataset
        if existed:
            updated_assets += 1
        else:
            created_assets += 1

    created_edges = 0
    for unique_id, (node, _asset_type) in assets.items():
        target = by_unique_id[unique_id]
        dependencies = (node.get("depends_on") or {}).get("nodes", [])
        if len(dependencies) > 20_000:
            raise ValueError("dbt manifest dependency count exceeds 20,000")
        for dependency_id in dependencies:
            source = by_unique_id.get(dependency_id)
            if source is None:
                continue
            edge_type = "TABLE_DEPENDENCY" if source.asset_type == "SOURCE" else "MODEL_DEPENDENCY"
            existing = db.scalar(
                select(LineageEdge.id).where(
                    LineageEdge.organization_id == organization_id,
                    LineageEdge.source_dataset_id == source.id,
                    LineageEdge.target_dataset_id == target.id,
                    LineageEdge.edge_type == edge_type,
                )
            )
            if existing is None:
                db.add(
                    LineageEdge(
                        organization_id=organization_id,
                        source_dataset_id=source.id,
                        target_dataset_id=target.id,
                        edge_type=edge_type,
                    )
                )
                created_edges += 1
    return {
        "created_assets": created_assets,
        "updated_assets": updated_assets,
        "lineage_edges_added": created_edges,
        "assets_processed": len(assets),
    }
