# Local incident demonstration

Start and seed the stack:

```bash
cp .env.example .env
make up
make migrate
make seed
```

Sign in at `http://localhost:3100/login` with `admin@example.com` / `change-me-now`, then visit the API-backed dashboard. Seeded assets include `raw.customers`, `raw.orders`, `staging.stg_customers`, `staging.stg_orders`, `analytics.fact_orders`, `analytics.daily_revenue`, and `analytics.customer_ltv`, connected by lineage. Seeded orchestration includes `ingest_orders`, `transform_orders`, and `build_revenue_marts`, along with healthy sample history and quality checks.

Trigger the failure scenario:

```bash
make demo-incident
```

The runner changes `raw.orders.customer_id` from `BIGINT` to `VARCHAR`, emits a failed `transform_orders` event naming the `staging.stg_orders` cast, and emits a freshness failure for `analytics.daily_revenue`. The incident engine retains event evidence, correlates the pipeline and freshness events to the schema incident through lineage, and records downstream impact. The outbox worker retries Kafka publishing when needed.

Open **Incidents**, choose the new incident, and inspect its evidence and affected assets. Click **Investigate with AI** to run either the configured OpenAI model or deterministic local demo mode. The detail view shows root cause, confidence, affected assets, recommendations, audited tool calls, and a proposed remediation plan. **Run safe validation** records a dry run; an Admin can then **Approve proposal**, which records approval without executing the proposal.

Additional UI routes include datasets and schemas, pipeline run logs, quality checks and history, lineage impact, connectors/dbt manifest import, and settings/audit. Use `python -m app.benchmarks.run --mode baseline` to execute the 10-case offline benchmark smoke run.
