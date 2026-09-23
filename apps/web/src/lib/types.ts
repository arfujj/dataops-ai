export type Incident = {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  environment: string;
  entity_ref: string;
  opened_at: string;
  updated_at?: string;
};

export type SchemaChange = {
  id: string;
  dataset_id: string;
  dataset_name: string;
  change_type: string;
  classification: string;
  column_name: string;
  previous_type: string;
  current_type: string;
  created_at: string;
};

export type DashboardSummary = {
  open_incidents: number;
  running_pipelines: number;
  failed_pipelines: number;
  dataset_count: number;
  quality_pass_rate: number | null;
  recent_incidents: Incident[];
  recent_schema_changes: SchemaChange[];
};

export type Dataset = {
  id: string;
  name: string;
  fully_qualified_name: string;
  asset_type: string;
  description: string;
  tags: string[];
  last_seen_at: string | null;
};

export type DatasetColumn = { name: string; type: string; nullable: boolean; ordinal: number };
export type SchemaVersion = { version: number; columns: unknown[]; created_at: string };
export type DatasetDetail = Dataset & { columns: DatasetColumn[]; schema_versions: SchemaVersion[] };

export type Pipeline = {
  id: string;
  name: string;
  orchestrator: string;
  status: string;
  last_run_at: string | null;
};

export type PipelineRun = {
  id: string;
  run_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  error_message: string;
  logs: string;
};

export type QualityCheck = {
  id: string;
  dataset_id: string;
  name: string;
  check_type: string;
  configuration: Record<string, unknown>;
  is_active: boolean;
  created_at?: string;
};

export type QualityResult = {
  id: string;
  check_id?: string;
  observed_value: unknown;
  expected_threshold: unknown;
  passed: boolean;
  anomaly: boolean;
  executed_at: string;
};

export type Connector = {
  id: string;
  name: string;
  type: string;
  state: string;
  config: Record<string, unknown>;
};

export type LineageAsset = {
  dataset_id: string;
  name: string;
  asset_type: string;
  depth: number;
  path: string[];
};

export type Lineage = {
  dataset_id: string;
  dataset_name: string;
  direction: "upstream" | "downstream";
  assets: LineageAsset[];
  count: number;
};

export type Evidence = {
  id: string;
  type: string;
  summary: string;
  relevance: number;
  details: Record<string, unknown>;
  captured_at: string;
};

export type ToolCall = {
  id: string;
  agent_run_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  succeeded: boolean;
  duration_ms: number;
  created_at: string;
};

export type AgentRun = {
  id: string;
  mode: string;
  model: string;
  status: string;
  result: Record<string, unknown> | null;
  started_at: string;
  finished_at?: string | null;
};

export type RemediationPlan = {
  id: string;
  status: string;
  summary: string;
  actions: string[];
  approved_by_user_id?: string | null;
  approved_at?: string | null;
};

export type IncidentContext = {
  incident: Incident;
  evidence: Evidence[];
  schema_changes: Record<string, unknown>[];
  failed_runs: Record<string, unknown>[];
  quality_anomalies: Record<string, unknown>[];
  downstream_assets: LineageAsset[];
  upstream_assets: Record<string, unknown>[];
  recent_deployments?: Record<string, unknown>[];
  historical_similar_incidents?: Record<string, unknown>[];
  logs?: Record<string, unknown>[];
  agent_runs: AgentRun[];
  tool_calls: ToolCall[];
  remediation_plans: RemediationPlan[];
};

export type Organization = {
  id?: string;
  name: string;
  slug: string;
  role: string;
  full_name: string;
  email?: string;
  created_at?: string;
};

export type Member = { email: string; full_name: string; role: string };

export type AuditEntry = {
  id: string;
  actor_user_id?: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type IncidentListResponse = { items: Incident[]; total: number; limit: number; offset: number };
export type DatasetListResponse = { items: Dataset[]; total: number; limit: number; offset: number };

export type AgentResult = {
  root_cause?: unknown;
  root_cause_category?: unknown;
  confidence?: unknown;
  explanation?: unknown;
  affected_assets?: unknown;
  recommendations?: unknown;
  citations?: unknown;
  risk_level?: unknown;
  [key: string]: unknown;
};
