# Agent safety model

The investigator is a bounded evidence analyst, not a production operator. It receives a compact incident context and can call an allowlisted set of tenant-scoped read tools. Tool arguments, bounded results, success/failure, duration, and `AgentRun` association are stored. The maximum tool-call count comes from `AGENT_MAX_TOOL_CALLS` and is capped by the agent.

The SQL tool does not pass raw model text to an unrestricted database session. A deterministic validator allows only one aggregate `SELECT COUNT(*)`, `MIN(ingested_at)`, or `MAX(ingested_at)` from the demo records table, with an optional dataset ID. The application builds the corresponding SQLAlchemy query and applies organization scope. It rejects comments, statement chaining, DDL, writes, and all other query forms.

Model output is parsed through a Pydantic schema. Asset names and evidence citations are allowlisted against the captured context; unsafe recommendations are removed. If the model is not configured, deterministic demo mode returns the same typed result contract.

Remediation plans are proposals. Safe validation records a dry-run policy result and does not change external state. Approval requires an Admin and a validated plan, is written to audit, and still does not execute actions. There is no shell tool, arbitrary SQL tool, self-approval path, or autonomous production mutation level.

Production hardening still needs deployment-managed secrets, a dedicated read-only warehouse identity for any external connector, rate limiting, broker ACLs, and a human execution service with independent authorization and rollout controls.
