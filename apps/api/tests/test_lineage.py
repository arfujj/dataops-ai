from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.domain import Dataset, LineageEdge
from app.models.identity import Organization
from app.services.lineage import traverse_lineage


def test_lineage_traversal_is_recursive_cycle_safe_and_tenant_scoped():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        organization = Organization(name="Tenant A", slug="tenant-a")
        other = Organization(name="Tenant B", slug="tenant-b")
        db.add_all([organization, other])
        db.flush()
        raw = Dataset(
            organization_id=organization.id,
            name="raw",
            fully_qualified_name="raw.orders",
            asset_type="TABLE",
        )
        staging = Dataset(
            organization_id=organization.id,
            name="staging",
            fully_qualified_name="stg.orders",
            asset_type="MODEL",
        )
        mart = Dataset(
            organization_id=organization.id,
            name="mart",
            fully_qualified_name="mart.revenue",
            asset_type="MODEL",
        )
        foreign = Dataset(
            organization_id=other.id,
            name="foreign",
            fully_qualified_name="secret.dataset",
            asset_type="TABLE",
        )
        db.add_all([raw, staging, mart, foreign])
        db.flush()
        db.add_all(
            [
                LineageEdge(
                    organization_id=organization.id,
                    source_dataset_id=raw.id,
                    target_dataset_id=staging.id,
                    edge_type="TABLE_DEPENDENCY",
                ),
                LineageEdge(
                    organization_id=organization.id,
                    source_dataset_id=staging.id,
                    target_dataset_id=mart.id,
                    edge_type="MODEL_DEPENDENCY",
                ),
                LineageEdge(
                    organization_id=organization.id,
                    source_dataset_id=mart.id,
                    target_dataset_id=raw.id,
                    edge_type="MODEL_DEPENDENCY",
                ),
                LineageEdge(
                    organization_id=other.id,
                    source_dataset_id=foreign.id,
                    target_dataset_id=foreign.id,
                    edge_type="TABLE_DEPENDENCY",
                ),
            ]
        )
        db.flush()

        downstream = traverse_lineage(db, organization.id, raw.id, "downstream")
        assert [item["name"] for item in downstream] == ["stg.orders", "mart.revenue"]
        assert downstream[1]["path"] == ["raw.orders", "stg.orders", "mart.revenue"]
        upstream = traverse_lineage(db, organization.id, mart.id, "upstream")
        assert {item["name"] for item in upstream} == {"stg.orders", "raw.orders"}
    Base.metadata.drop_all(engine)
    engine.dispose()
