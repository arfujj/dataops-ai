from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.domain import (
    Connector,
    DataQualityCheck,
    Dataset,
    DataSource,
    DemoRecord,
    LineageEdge,
    Pipeline,
    PipelineRun,
)
from app.models.identity import Environment, Membership, Organization, User
from app.services.quality import run_quality_check
from app.services.schemas import ingest_schema_definition


def seed() -> None:
    with SessionLocal.begin() as db:
        organization = db.scalar(select(Organization).where(Organization.slug == "acme-analytics"))
        if organization is None:
            organization = Organization(name="Acme Analytics", slug="acme-analytics")
            db.add(organization)
            db.flush()

        user = db.scalar(select(User).where(User.email == settings.seed_admin_email.lower()))
        if user is None:
            user = User(
                email=settings.seed_admin_email.lower(),
                full_name="Acme Admin",
                password_hash=hash_password(settings.seed_admin_password),
            )
            db.add(user)
            db.flush()
        membership = db.scalar(
            select(Membership).where(
                Membership.organization_id == organization.id, Membership.user_id == user.id
            )
        )
        if membership is None:
            db.add(Membership(organization_id=organization.id, user_id=user.id, role="admin"))
        for name, slug in (("Production", "production"), ("Development", "development")):
            if (
                db.scalar(
                    select(Environment).where(
                        Environment.organization_id == organization.id, Environment.slug == slug
                    )
                )
                is None
            ):
                db.add(Environment(organization_id=organization.id, name=name, slug=slug))

        connector_specs = [
            ("Production PostgreSQL", "postgresql", {"host": "postgres", "database": "dataops"}),
            ("Generic webhook", "webhook", {"endpoint": "/api/v1/events"}),
            ("dbt manifest", "dbt_manifest", {"manifest_import": "enabled"}),
        ]
        connectors: dict[str, Connector] = {}
        for name, connector_type, config in connector_specs:
            connector = db.scalar(
                select(Connector).where(
                    Connector.organization_id == organization.id,
                    Connector.connector_type == connector_type,
                )
            )
            if connector is None:
                connector = Connector(
                    organization_id=organization.id,
                    name=name,
                    connector_type=connector_type,
                    state="WORKING",
                    config=config,
                )
                db.add(connector)
                db.flush()
            connectors[connector_type] = connector

        source = db.scalar(
            select(DataSource).where(
                DataSource.organization_id == organization.id,
                DataSource.slug == "demo-postgres",
            )
        )
        if source is None:
            source = DataSource(
                organization_id=organization.id,
                connector_id=connectors["postgresql"].id,
                name="Acme warehouse",
                slug="demo-postgres",
                source_type="postgresql",
                is_demo=True,
            )
            db.add(source)
            db.flush()

        schema_specs = {
            "raw.customers": (
                "TABLE",
                [
                    {"name": "customer_id", "type": "BIGINT", "nullable": False},
                    {"name": "email", "type": "TEXT", "nullable": True},
                    {"name": "created_at", "type": "TIMESTAMPTZ", "nullable": False},
                ],
            ),
            "raw.orders": (
                "TABLE",
                [
                    {"name": "order_id", "type": "BIGINT", "nullable": False},
                    {"name": "customer_id", "type": "BIGINT", "nullable": False},
                    {"name": "amount", "type": "DOUBLE", "nullable": False},
                    {"name": "status", "type": "TEXT", "nullable": False},
                    {"name": "created_at", "type": "TIMESTAMP", "nullable": False},
                ],
            ),
            "staging.stg_customers": (
                "MODEL",
                [{"name": "customer_id", "type": "BIGINT"}, {"name": "email", "type": "TEXT"}],
            ),
            "staging.stg_orders": (
                "MODEL",
                [
                    {"name": "order_id", "type": "BIGINT"},
                    {"name": "customer_id", "type": "BIGINT"},
                    {"name": "amount", "type": "DOUBLE"},
                ],
            ),
            "analytics.fact_orders": (
                "MODEL",
                [
                    {"name": "order_id", "type": "BIGINT"},
                    {"name": "customer_id", "type": "BIGINT"},
                    {"name": "revenue", "type": "DOUBLE"},
                ],
            ),
            "analytics.daily_revenue": (
                "MODEL",
                [{"name": "day", "type": "DATE"}, {"name": "revenue", "type": "DOUBLE"}],
            ),
            "analytics.customer_ltv": (
                "MODEL",
                [
                    {"name": "customer_id", "type": "BIGINT"},
                    {"name": "lifetime_value", "type": "DOUBLE"},
                ],
            ),
        }
        datasets: dict[str, Dataset] = {}
        for dataset_name, (asset_type, columns) in schema_specs.items():
            existing = db.scalar(
                select(Dataset).where(
                    Dataset.organization_id == organization.id,
                    Dataset.fully_qualified_name == dataset_name,
                )
            )
            if existing is None:
                existing, _, _ = ingest_schema_definition(
                    db,
                    organization.id,
                    dataset_name,
                    columns,
                    asset_type,
                    source.id if dataset_name.startswith("raw.") else None,
                )
            datasets[dataset_name] = existing

        lineage_specs = [
            ("raw.customers", "staging.stg_customers", "TABLE_DEPENDENCY"),
            ("raw.orders", "staging.stg_orders", "TABLE_DEPENDENCY"),
            ("staging.stg_customers", "analytics.fact_orders", "MODEL_DEPENDENCY"),
            ("staging.stg_orders", "analytics.fact_orders", "MODEL_DEPENDENCY"),
            ("analytics.fact_orders", "analytics.daily_revenue", "MODEL_DEPENDENCY"),
            ("analytics.fact_orders", "analytics.customer_ltv", "MODEL_DEPENDENCY"),
        ]
        for source_name, target_name, edge_type in lineage_specs:
            existing_edge = db.scalar(
                select(LineageEdge).where(
                    LineageEdge.organization_id == organization.id,
                    LineageEdge.source_dataset_id == datasets[source_name].id,
                    LineageEdge.target_dataset_id == datasets[target_name].id,
                    LineageEdge.edge_type == edge_type,
                )
            )
            if existing_edge is None:
                db.add(
                    LineageEdge(
                        organization_id=organization.id,
                        source_dataset_id=datasets[source_name].id,
                        target_dataset_id=datasets[target_name].id,
                        edge_type=edge_type,
                    )
                )

        now = datetime.now(UTC)
        pipeline_specs = (
            ("ingest_orders", "airflow"),
            ("transform_orders", "dbt"),
            ("build_revenue_marts", "dbt"),
        )
        for name, orchestrator in pipeline_specs:
            pipeline = db.scalar(
                select(Pipeline).where(
                    Pipeline.organization_id == organization.id, Pipeline.name == name
                )
            )
            if pipeline is None:
                pipeline = Pipeline(
                    organization_id=organization.id,
                    name=name,
                    orchestrator=orchestrator,
                    status="HEALTHY",
                    last_run_at=now - timedelta(minutes=8),
                )
                db.add(pipeline)
                db.flush()
                db.add(
                    PipelineRun(
                        organization_id=organization.id,
                        pipeline_id=pipeline.id,
                        external_run_id=f"seed-{name}-run",
                        status="SUCCEEDED",
                        started_at=now - timedelta(minutes=9),
                        finished_at=now - timedelta(minutes=8),
                    )
                )

        existing_demo_record = db.scalar(
            select(DemoRecord.id).where(DemoRecord.organization_id == organization.id).limit(1)
        )
        if existing_demo_record is None:
            db.add_all(
                [
                    DemoRecord(
                        organization_id=organization.id,
                        dataset_id=datasets["raw.orders"].id,
                        values={
                            "order_id": index + 1001,
                            "customer_id": 500 + index,
                            "amount": 25.0 + index,
                            "status": ("paid", "pending", "refunded")[index % 3],
                        },
                        ingested_at=now - timedelta(minutes=index % 45),
                    )
                    for index in range(30)
                ]
            )

        quality_specs = [
            ("orders row count", "row_count", {"min": 10}),
            ("orders freshness", "freshness", {"max_age_minutes": 1440}),
            ("orders customer IDs", "null_rate", {"column": "customer_id", "max_null_rate": 0.01}),
            ("orders ID uniqueness", "uniqueness", {"column": "order_id", "max_duplicate_rate": 0}),
        ]
        checks: list[DataQualityCheck] = []
        for name, check_type, config in quality_specs:
            check = db.scalar(
                select(DataQualityCheck).where(
                    DataQualityCheck.organization_id == organization.id,
                    DataQualityCheck.name == name,
                )
            )
            if check is None:
                check = DataQualityCheck(
                    organization_id=organization.id,
                    dataset_id=datasets["raw.orders"].id,
                    name=name,
                    check_type=check_type,
                    configuration=config,
                )
                db.add(check)
                db.flush()
            checks.append(check)

        for check in checks:
            run_quality_check(db, organization.id, check)
    print(f"Seeded Acme Analytics; admin login: {settings.seed_admin_email}")


if __name__ == "__main__":
    seed()
