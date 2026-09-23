import json
import logging
from datetime import UTC
from functools import lru_cache
from uuid import UUID

from app.core.config import settings

logger = logging.getLogger("dataops.events.publisher")
TOPIC = "dataops.telemetry.v1"


@lru_cache(maxsize=1)
def _producer():
    from kafka import KafkaProducer

    return KafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers.split(","),
        acks="all",
        retries=0,
        request_timeout_ms=2000,
        api_version_auto_timeout_ms=1500,
        max_block_ms=1500,
        value_serializer=lambda value: json.dumps(value, default=str).encode("utf-8"),
    )


def publish_event(event: dict, organization_id: UUID) -> tuple[bool, str]:
    try:
        future = _producer().send(
            TOPIC,
            key=str(organization_id).encode("ascii"),
            value=event,
        )
        future.get(timeout=2.0)
        return True, ""
    except Exception as error:  # The committed event remains available when Redpanda is down.
        message = f"{type(error).__name__}: {error}"[:500]
        logger.warning(
            "telemetry publish failed; event remains persisted for the retry worker",
            extra={
                "organization_id": str(organization_id),
                "event_id": event.get("event_id"),
                "publish_error": message,
            },
        )
        _producer.cache_clear()
        return False, message


def to_event_message(event) -> dict:
    return {
        "event_id": str(event.event_id),
        "organization_id": str(event.organization_id),
        "environment": event.environment,
        "source": event.source,
        "event_type": event.event_type,
        "occurred_at": event.occurred_at.astimezone(UTC).isoformat(),
        "entity_type": event.entity_type,
        "entity_id": event.entity_id,
        "severity": event.severity,
        "payload": event.payload,
    }
