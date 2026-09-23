# Database schema

Alembic owns PostgreSQL schema changes. Tenant-owned records carry `organization_id`; tenant API queries scope by the authenticated membership. UUID primary keys and UTC-aware timestamps are used throughout. Foreign keys and tenant lookup columns are indexed; unique constraints make membership, dataset names, pipeline names, run IDs, schema versions, and lineage edges stable under retries.

Identity tables:

* `organizations`, `users`, `memberships`, and `environments` define workspace and role scope.

Data platform tables:

* `connectors`, `data_sources`, `datasets`, and `dataset_columns` represent source and asset metadata.
* `schema_versions` store normalized columns; `schema_changes` store deterministic comparisons.
* `lineage_edges` store directed, typed dependencies.
* `pipelines`, `pipeline_runs`, `jobs`, and `job_runs` retain orchestration state and bounded logs.
* `data_quality_checks` and `data_quality_results` store configuration, observations, pass/fail, and anomaly flags.
* `telemetry_events` store raw normalized events and outbox publication state; `deployments` store release metadata.

Incident response tables:

* `incidents` identify state, severity, environment, category, and entity.
* `incident_evidence` contains individually ranked evidence and concrete references.
* `agent_runs` and `agent_tool_calls` record investigation inputs, outputs, and tool audit.
* `remediation_plans` and `remediation_actions` record proposal, validation, approval, and policy results.
* `audit_logs` record user actions; `demo_records` provide bounded sample rows for safe aggregate tools.

`apps/api/app/models/domain.py` contains domain mappings. `apps/api/migrations/versions/` contains the authoritative ordered migrations.
