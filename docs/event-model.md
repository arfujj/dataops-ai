# Event model

`POST /api/v1/events` accepts a normalized envelope with `event_id`, `organization_id`, `environment`, `source`, `event_type`, `occurred_at`, `entity_type`, `entity_id`, `severity`, and a payload capped at 32 KB. The authenticated organization is authoritative; a mismatched supplied organization returns 403. Supported types include pipeline/job lifecycle events, `schema.changed`, `quality.failed`, `quality.recovered`, `deployment.created`, `dataset.updated`, and `connector.error`.

The API stores the raw event and synchronously applies normalized state so incident pages are immediately useful. It commits before publishing to Kafka. If publish fails, `published_at` stays null and the persistent outbox worker retries. The event worker also consumes messages produced by external adapters and commits Kafka offsets only after the database work succeeds. Processing is idempotent by organization and event ID.

Pipeline failures update pipeline and run status, retain bounded logs, and open or correlate an incident. Schema events write schema versions and deterministic changes; a breaking change can trigger an incident. Quality and connector events create incidents or add evidence to a related upstream incident. `dataset.updated` refreshes catalog metadata. Deployment events create deployment records.

The current transport uses one versioned topic, `dataops.telemetry.v1`, and keys messages by organization. For production, broker ACLs, retention, retry/dead-letter policy, replay procedures, and schema compatibility governance still need deployment-specific configuration.
