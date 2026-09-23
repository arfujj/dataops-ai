from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.events import worker
from app.models.domain import TelemetryEvent
from app.models.identity import Organization


def test_outbox_publisher_marks_events_only_after_success(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    organization_id = uuid4()
    event_id = uuid4()
    with Session(engine, expire_on_commit=False) as db:
        db.add(Organization(id=organization_id, name="Outbox Test", slug="outbox-test"))
        db.flush()
        event = TelemetryEvent(
            organization_id=organization_id,
            event_id=event_id,
            environment="test",
            source="pytest",
            event_type="dataset.updated",
            occurred_at=datetime.now(UTC),
            entity_type="dataset",
            entity_id="raw.events",
            severity="info",
            payload={},
        )
        db.add(event)
        db.commit()

        monkeypatch.setattr(worker, "publish_event", lambda *_args, **_kwargs: (False, "offline"))
        assert worker.publish_pending_events_once(db) == 0
        assert event.published_at is None
        assert event.publish_error == "offline"

        monkeypatch.setattr(worker, "publish_event", lambda *_args, **_kwargs: (True, ""))
        assert worker.publish_pending_events_once(db) == 1
        assert event.published_at is not None
        assert event.publish_error == ""
    Base.metadata.drop_all(engine)
    engine.dispose()
