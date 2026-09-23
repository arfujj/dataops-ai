"""Kafka ingestion and durable retry loop for the telemetry outbox."""

import json
import logging
import threading
import time
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.events.publisher import TOPIC, publish_event, to_event_message
from app.models.domain import TelemetryEvent
from app.schemas.events import TelemetryEventEnvelope
from app.services.events import process_event

logger = logging.getLogger("dataops.events.worker")
OUTBOX_BATCH_SIZE = 100
RETRY_INTERVAL_SECONDS = 15


def publish_pending_events_once(db: Session) -> int:
    pending = list(
        db.scalars(
            select(TelemetryEvent)
            .where(TelemetryEvent.published_at.is_(None))
            .order_by(TelemetryEvent.created_at)
            .limit(OUTBOX_BATCH_SIZE)
        )
    )
    published_count = 0
    for event in pending:
        published, error = publish_event(to_event_message(event), event.organization_id)
        if published:
            event.published_at = datetime.now(UTC)
            event.publish_error = ""
            published_count += 1
        else:
            event.publish_error = error[:500]
            db.commit()
            break
    db.commit()
    return published_count


def _outbox_loop() -> None:
    while True:
        try:
            with SessionLocal() as db:
                sent = publish_pending_events_once(db)
                if sent:
                    logger.info("published pending telemetry events", extra={"count": sent})
        except Exception:
            logger.exception("outbox publisher iteration failed")
        time.sleep(RETRY_INTERVAL_SECONDS)


def _new_consumer():
    from kafka import KafkaConsumer

    return KafkaConsumer(
        TOPIC,
        bootstrap_servers=settings.kafka_bootstrap_servers.split(","),
        group_id="dataops-ai-telemetry-v1",
        enable_auto_commit=False,
        auto_offset_reset="earliest",
        request_timeout_ms=5000,
        api_version_auto_timeout_ms=3000,
        value_deserializer=lambda raw: json.loads(raw.decode("utf-8")),
    )


def _handle_message(message: dict) -> None:
    envelope = TelemetryEventEnvelope.model_validate(message)
    if envelope.organization_id is None:
        raise ValueError("Kafka telemetry message requires organization_id")
    organization_id: UUID = envelope.organization_id
    with SessionLocal.begin() as db:
        event, _, _ = process_event(db, organization_id, envelope)
        # The broker is the source for this message; never enqueue it for republishing.
        if event.published_at is None:
            event.published_at = datetime.now(UTC)
        event.publish_error = ""


def _consume_loop() -> None:
    consumer = None
    while True:
        if consumer is None:
            try:
                consumer = _new_consumer()
                logger.info("connected telemetry Kafka consumer")
            except Exception:
                logger.exception("telemetry consumer could not connect; retrying")
                time.sleep(RETRY_INTERVAL_SECONDS)
                continue
        try:
            records = consumer.poll(timeout_ms=1500, max_records=50)
            for partition, messages in records.items():
                for message in messages:
                    try:
                        _handle_message(message.value)
                    except Exception:
                        logger.exception(
                            "telemetry event processing failed; offset will be retried",
                            extra={"topic": message.topic, "offset": message.offset},
                        )
                        consumer.seek(partition, message.offset)
                        break
                    consumer.commit()
        except Exception:
            logger.exception("telemetry consumer disconnected; reconnecting")
            try:
                consumer.close()
            except Exception:
                logger.exception("telemetry consumer close failed")
            consumer = None
            time.sleep(RETRY_INTERVAL_SECONDS)


def main() -> None:
    logging.basicConfig(level=settings.log_level.upper())
    threading.Thread(target=_outbox_loop, name="telemetry-outbox", daemon=True).start()
    _consume_loop()


if __name__ == "__main__":
    main()
