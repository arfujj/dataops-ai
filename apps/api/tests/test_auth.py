from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.domain import Dataset, LineageEdge
from app.models.identity import Membership, Organization, User


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(bind=engine, expire_on_commit=False)
    with testing_session.begin() as db:
        org = Organization(id=uuid4(), name="Test Org", slug="test-org")
        user = User(
            id=uuid4(),
            email="admin@example.com",
            full_name="Test Admin",
            password_hash=hash_password("valid-password"),
        )
        db.add_all([org, user])
        db.flush()
        db.add(Membership(organization_id=org.id, user_id=user.id, role="admin"))

    def override_get_db():
        with testing_session() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client, testing_session
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


def test_login_and_current_organization_are_scoped_to_membership(client):
    client, _ = client
    result = client.post(
        "/api/v1/auth/login", json={"email": "admin@example.com", "password": "valid-password"}
    )
    assert result.status_code == 200
    token = result.json()["access_token"]
    organization = client.get(
        "/api/v1/organizations/current", headers={"Authorization": f"Bearer {token}"}
    )
    assert organization.status_code == 200
    assert organization.json()["slug"] == "test-org"
    assert organization.json()["role"] == "admin"


def test_invalid_credentials_and_missing_tenant_token_are_rejected(client):
    client, _ = client
    invalid = client.post(
        "/api/v1/auth/login", json={"email": "admin@example.com", "password": "wrong"}
    )
    assert invalid.status_code == 401
    missing = client.get("/api/v1/organizations/current")
    assert missing.status_code == 401


def test_membership_revocation_invalidates_existing_token(client):
    client, testing_session = client
    result = client.post(
        "/api/v1/auth/login", json={"email": "admin@example.com", "password": "valid-password"}
    )
    token = result.json()["access_token"]
    assert (
        client.get(
            "/api/v1/organizations/current", headers={"Authorization": f"Bearer {token}"}
        ).status_code
        == 200
    )
    with testing_session.begin() as db:
        membership = db.query(Membership).one()
        membership.is_active = False
    assert (
        client.get(
            "/api/v1/organizations/current", headers={"Authorization": f"Bearer {token}"}
        ).status_code
        == 401
    )


def test_signed_token_cannot_select_an_unjoined_organization(client):
    client, testing_session = client
    with testing_session.begin() as db:
        user = db.query(User).one()
        other_org = Organization(id=uuid4(), name="Other Org", slug="other-org")
        db.add(other_org)
        db.flush()
        forged_scope = create_access_token(user.id, other_org.id)
    response = client.get(
        "/api/v1/organizations/current", headers={"Authorization": f"Bearer {forged_scope}"}
    )
    assert response.status_code == 401


def test_viewer_can_read_but_cannot_ingest_schema(client):
    client, testing_session = client
    with testing_session.begin() as db:
        organization = db.query(Organization).filter_by(slug="test-org").one()
        viewer = User(
            id=uuid4(),
            email="viewer@example.com",
            full_name="Test Viewer",
            password_hash=hash_password("viewer-password"),
        )
        db.add(viewer)
        db.flush()
        db.add(Membership(organization_id=organization.id, user_id=viewer.id, role="viewer"))
    login = client.post(
        "/api/v1/auth/login", json={"email": "viewer@example.com", "password": "viewer-password"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/v1/incidents", headers=headers).status_code == 200
    schema = client.post(
        "/api/v1/schemas/ingest",
        headers=headers,
        json={"dataset_name": "raw.blocked", "columns": [{"name": "id", "type": "BIGINT"}]},
    )
    assert schema.status_code == 403


def test_schema_event_creates_incident_evidence_and_downstream_impact(client, monkeypatch):
    from app.api.v1 import domain
    from app.core.config import settings

    client, testing_session = client
    monkeypatch.setattr(domain, "publish_event", lambda *_args, **_kwargs: (True, ""))
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "openai_model", "")
    login = client.post(
        "/api/v1/auth/login", json={"email": "admin@example.com", "password": "valid-password"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    with testing_session.begin() as db:
        organization = db.query(Organization).filter_by(slug="test-org").one()
        root = Dataset(
            organization_id=organization.id,
            name="raw_events",
            fully_qualified_name="raw.events",
            asset_type="TABLE",
        )
        downstream = Dataset(
            organization_id=organization.id,
            name="stg_events",
            fully_qualified_name="stg.events",
            asset_type="MODEL",
        )
        mart = Dataset(
            organization_id=organization.id,
            name="daily_events",
            fully_qualified_name="mart.daily_events",
            asset_type="MODEL",
        )
        db.add_all([root, downstream, mart])
        db.flush()
        db.add_all(
            [
                LineageEdge(
                    organization_id=organization.id,
                    source_dataset_id=root.id,
                    target_dataset_id=downstream.id,
                    edge_type="TABLE_DEPENDENCY",
                ),
                LineageEdge(
                    organization_id=organization.id,
                    source_dataset_id=downstream.id,
                    target_dataset_id=mart.id,
                    edge_type="MODEL_DEPENDENCY",
                ),
            ]
        )
        root_id = root.id

    baseline = client.post(
        "/api/v1/schemas/ingest",
        headers=headers,
        json={
            "dataset_name": "raw.events",
            "columns": [
                {"name": "event_id", "type": "BIGINT", "nullable": False},
                {"name": "account_id", "type": "BIGINT", "nullable": True},
            ],
        },
    )
    assert baseline.status_code == 202
    changed = client.post(
        "/api/v1/schemas/ingest",
        headers=headers,
        json={
            "dataset_name": "raw.events",
            "columns": [
                {"name": "event_id", "type": "BIGINT", "nullable": False},
                {"name": "account_id", "type": "VARCHAR", "nullable": True},
            ],
        },
    )
    assert changed.status_code == 202
    incident_id = changed.json()["incident_id"]
    assert incident_id

    impact = client.get(f"/api/v1/lineage/{root_id}/impact", headers=headers)
    assert impact.status_code == 200
    assert [asset["name"] for asset in impact.json()["assets"]] == [
        "stg.events",
        "mart.daily_events",
    ]
    context = client.get(f"/api/v1/incidents/{incident_id}", headers=headers)
    assert context.status_code == 200
    assert context.json()["schema_changes"][0]["classification"] == "BREAKING"
    assert [asset["name"] for asset in context.json()["downstream_assets"]] == [
        "stg.events",
        "mart.daily_events",
    ]
    investigation = client.post(f"/api/v1/incidents/{incident_id}/investigate", headers=headers)
    assert investigation.status_code == 200
    assert investigation.json()["agent_run"]["mode"] == "DEMO"
    assert investigation.json()["investigation"]["root_cause_category"] == "schema_drift"
    assert len(investigation.json()["tool_calls"]) >= 2
    refreshed_context = client.get(f"/api/v1/incidents/{incident_id}", headers=headers)
    assert len(refreshed_context.json()["agent_runs"]) == 1
    assert len(refreshed_context.json()["tool_calls"]) >= 2
    remediation = client.post(
        "/api/v1/remediations",
        headers=headers,
        json={
            "incident_id": incident_id,
            "summary": "Validate the safe staging change",
            "actions": [
                {
                    "action_type": "CODE_CHANGE",
                    "description": "Review and update the staging cast.",
                },
                {"action_type": "VALIDATION", "description": "Run model tests in development."},
            ],
        },
    )
    assert remediation.status_code == 201
    plan_id = remediation.json()["id"]
    validated = client.post(f"/api/v1/remediations/{plan_id}/validate", headers=headers)
    assert validated.status_code == 200
    assert validated.json()["status"] == "VALIDATED"
    assert all(
        action["validation_result"]["external_state_changed"] is False
        for action in validated.json()["actions"]
    )
    approved = client.post(f"/api/v1/remediations/{plan_id}/approve", headers=headers)
    assert approved.status_code == 200
    assert approved.json()["status"] == "APPROVED"


def test_pipeline_and_downstream_freshness_events_enrich_schema_incident(client, monkeypatch):
    from app.api.v1 import domain

    client, testing_session = client
    monkeypatch.setattr(domain, "publish_event", lambda *_args, **_kwargs: (True, ""))
    login = client.post(
        "/api/v1/auth/login", json={"email": "admin@example.com", "password": "valid-password"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    with testing_session.begin() as db:
        organization = db.query(Organization).filter_by(slug="test-org").one()
        source = Dataset(
            organization_id=organization.id,
            name="orders",
            fully_qualified_name="raw.orders",
            asset_type="TABLE",
        )
        staging = Dataset(
            organization_id=organization.id,
            name="stg_orders",
            fully_qualified_name="staging.stg_orders",
            asset_type="MODEL",
        )
        revenue = Dataset(
            organization_id=organization.id,
            name="daily_revenue",
            fully_qualified_name="analytics.daily_revenue",
            asset_type="MODEL",
        )
        db.add_all([source, staging, revenue])
        db.flush()
        db.add_all(
            [
                LineageEdge(
                    organization_id=organization.id,
                    source_dataset_id=source.id,
                    target_dataset_id=staging.id,
                    edge_type="TABLE_DEPENDENCY",
                ),
                LineageEdge(
                    organization_id=organization.id,
                    source_dataset_id=staging.id,
                    target_dataset_id=revenue.id,
                    edge_type="MODEL_DEPENDENCY",
                ),
            ]
        )
        source_id = source.id

    for columns in (
        [
            {"name": "order_id", "type": "BIGINT", "nullable": False},
            {"name": "customer_id", "type": "BIGINT", "nullable": False},
        ],
        [
            {"name": "order_id", "type": "BIGINT", "nullable": False},
            {"name": "customer_id", "type": "VARCHAR", "nullable": False},
        ],
    ):
        schema = client.post(
            "/api/v1/schemas/ingest",
            headers=headers,
            json={"dataset_name": "raw.orders", "columns": columns},
        )
        assert schema.status_code == 202
    incident_id = schema.json()["incident_id"]

    pipeline = client.post(
        "/api/v1/events",
        headers=headers,
        json={
            "environment": "production",
            "source": "airflow",
            "event_type": "pipeline.failed",
            "entity_type": "pipeline",
            "entity_id": "transform_orders",
            "severity": "high",
            "payload": {
                "run_id": "test-failed-orders",
                "dataset_name": "raw.orders",
                "error": "customer_id cast failed",
                "logs": "invalid input syntax for BIGINT",
            },
        },
    )
    freshness = client.post(
        "/api/v1/events",
        headers=headers,
        json={
            "environment": "production",
            "source": "quality-monitor",
            "event_type": "quality.failed",
            "entity_type": "dataset",
            "entity_id": "analytics.daily_revenue",
            "severity": "high",
            "payload": {
                "dataset_name": "analytics.daily_revenue",
                "message": "Daily revenue exceeded its freshness threshold.",
            },
        },
    )
    assert pipeline.status_code == 202
    assert pipeline.json()["incident_id"] == incident_id
    assert freshness.status_code == 202
    assert freshness.json()["incident_id"] == incident_id
    impact = client.get(f"/api/v1/lineage/{source_id}/impact", headers=headers)
    assert [row["name"] for row in impact.json()["assets"]] == [
        "staging.stg_orders",
        "analytics.daily_revenue",
    ]
    evidence = client.get(f"/api/v1/incidents/{incident_id}/evidence", headers=headers)
    assert len([row for row in evidence.json() if row["type"] == "TELEMETRY_EVENT"]) == 4


def test_dbt_manifest_import_is_tenant_scoped_and_idempotent(client):
    import json
    from pathlib import Path

    from app.models.domain import Dataset

    client, testing_session = client
    login = client.post(
        "/api/v1/auth/login", json={"email": "admin@example.com", "password": "valid-password"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    manifest = json.loads((Path(__file__).parent / "fixtures" / "dbt_manifest.json").read_text())

    first = client.post("/api/v1/dbt/import", headers=headers, json={"manifest": manifest})
    assert first.status_code == 200, first.text
    assert first.json() == {
        "created_assets": 2,
        "updated_assets": 0,
        "lineage_edges_added": 1,
        "assets_processed": 2,
    }
    second = client.post("/api/v1/dbt/import", headers=headers, json={"manifest": manifest})
    assert second.status_code == 200, second.text
    assert second.json()["created_assets"] == 0
    assert second.json()["updated_assets"] == 2
    assert second.json()["lineage_edges_added"] == 0

    with testing_session() as db:
        assets = (
            db.query(Dataset)
            .filter(Dataset.organization_id == db.query(Organization.id).scalar())
            .all()
        )
        imported = {row.fully_qualified_name: row for row in assets}
        assert "warehouse.public.raw.orders" in imported
        assert "warehouse.staging.stg_orders" in imported
        assert imported["warehouse.staging.stg_orders"].description == "Cleaned order records"
        assert imported["warehouse.staging.stg_orders"].tags == ["daily", "core"]


def test_dbt_import_rejects_viewer_and_oversized_asset_count(client):
    client, testing_session = client
    with testing_session.begin() as db:
        organization = db.query(Organization).filter_by(slug="test-org").one()
        viewer = User(
            id=uuid4(),
            email="dbt-viewer@example.com",
            full_name="Read Only",
            password_hash=hash_password("viewer-password"),
        )
        db.add(viewer)
        db.flush()
        db.add(Membership(organization_id=organization.id, user_id=viewer.id, role="viewer"))
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "dbt-viewer@example.com", "password": "viewer-password"},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    denied = client.post(
        "/api/v1/dbt/import", headers=headers, json={"manifest": {"nodes": {}, "sources": {}}}
    )
    assert denied.status_code == 403

    admin = client.post(
        "/api/v1/auth/login", json={"email": "admin@example.com", "password": "valid-password"}
    )
    admin_headers = {"Authorization": f"Bearer {admin.json()['access_token']}"}
    too_many = client.post(
        "/api/v1/dbt/import",
        headers=admin_headers,
        json={"manifest": {"nodes": {str(index): {} for index in range(5001)}, "sources": {}}},
    )
    assert too_many.status_code == 422
