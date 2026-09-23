"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { MiniBars } from "@/components/charts";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import {
  Badge,
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  Input,
  Modal,
  Notice,
  Panel,
  SearchInput,
  Select,
  Skeleton,
  StatusBadge,
  Toggle,
  useToast,
} from "@/components/ui";
import { useApi, useMutation, useRefreshSignal } from "@/lib/hooks";
import { display, formatDateTime, formatRelative, humanize } from "@/lib/format";
import type { DatasetDetail, DatasetListResponse, QualityCheck, QualityResult } from "@/lib/types";

const checkTypes = [
  { value: "freshness", label: "Freshness", description: "Assert the newest record is younger than a threshold." },
  { value: "row_count", label: "Row count", description: "Assert record volume stays inside a range." },
  { value: "null_rate", label: "Null rate", description: "Assert a column stays below a null fraction." },
  { value: "uniqueness", label: "Uniqueness", description: "Assert a column has no duplicates beyond tolerance." },
  { value: "numeric_range", label: "Numeric range", description: "Assert numeric values stay within bounds." },
  { value: "accepted_values", label: "Accepted values", description: "Assert a column only contains known values." },
] as const;

type CheckType = (typeof checkTypes)[number]["value"];

export default function QualityPage() {
  const checks = useApi<QualityCheck[]>("/quality/checks");
  const datasets = useApi<DatasetListResponse>("/datasets?limit=200");
  const [histories, setHistories] = useState<Record<string, QualityResult[]>>({});
  const [historyLoading, setHistoryLoading] = useState<string>("");
  const [expanded, setExpanded] = useState<string>("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const { run, pending } = useMutation();
  const toast = useToast();

  useRefreshSignal(() => { checks.reload(); datasets.reload(); }, [checks.reload, datasets.reload]);

  const list = checks.data ?? [];
  const datasetList = datasets.data?.items ?? [];
  const datasetName = (id: string) => datasetList.find(dataset => dataset.id === id)?.fully_qualified_name ?? id;

  useEffect(() => {
    if (!list.length) return;
    let active = true;
    void Promise.all(
      list.slice(0, 8).map(check =>
        api<QualityResult[]>(`/quality/checks/${check.id}/history?limit=12`)
          .then(rows => [check.id, rows] as const)
          .catch(() => null),
      ),
    ).then(results => {
      if (!active) return;
      const next: Record<string, QualityResult[]> = {};
      for (const entry of results) if (entry) next[entry[0]] = entry[1];
      setHistories(current => ({ ...current, ...next }));
    });
    return () => { active = false; };
  }, [list]);

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return list.filter(check => {
      if (typeFilter && check.check_type !== typeFilter) return false;
      if (tokens.length && !tokens.every(token => `${check.name} ${check.check_type} ${datasetName(check.dataset_id)}`.toLowerCase().includes(token))) return false;
      return true;
    });
  }, [list, query, typeFilter, datasetList]);

  const stats = useMemo(() => {
    const failing = Object.values(histories).filter(rows => rows[0] && !rows[0].passed).length;
    const anomalies = Object.values(histories).filter(rows => rows.some(row => row.anomaly)).length;
    return { total: list.length, active: list.filter(check => check.is_active).length, failing, anomalies };
  }, [list, histories]);

  async function runCheck(check: QualityCheck) {
    const outcome = await run(check.id, () => api<QualityResult>(`/quality/checks/${check.id}/run`, { method: "POST" }));
    if (!outcome.ok) {
      toast.push({ tone: "error", title: "Check failed to run", message: outcome.error });
      return;
    }
    toast.push({
      tone: outcome.data.passed ? "success" : "error",
      title: `${check.name}: ${outcome.data.passed ? "passed" : "failed"}${outcome.data.anomaly ? " · anomaly detected" : ""}`,
    });
    const history = await api<QualityResult[]>(`/quality/checks/${check.id}/history?limit=20`).catch(() => []);
    setHistories(current => ({ ...current, [check.id]: history }));
    setExpanded(check.id);
    checks.reload();
  }

  async function loadHistory(check: QualityCheck) {
    setHistoryLoading(check.id);
    try {
      const history = await api<QualityResult[]>(`/quality/checks/${check.id}/history?limit=25`);
      setHistories(current => ({ ...current, [check.id]: history }));
      setExpanded(current => (current === check.id ? "" : check.id));
    } catch (cause) {
      toast.push({ tone: "error", title: "Unable to load history", message: cause instanceof Error ? cause.message : undefined });
    } finally {
      setHistoryLoading("");
    }
  }

  return (
    <AppShell title="Data quality" eyebrow="Monitor">
      <PageHeading
        eyebrow="Deterministic checks · anomaly history"
        title="Data quality"
        description="Run threshold checks, review historical results, and surface failures before they spread downstream."
        actions={
          <>
            <Button variant="secondary" icon="refresh" onClick={() => { checks.reload(); }}>Refresh</Button>
            <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)} disabled={!datasetList.length}>New check</Button>
          </>
        }
      />

      {checks.error && <div className="mb-4"><ErrorNotice message={checks.error} onRetry={checks.reload} /></div>}

      <section className="grid-4">
        <div className="stat">
          <div className="stat-top"><span className="stat-label">Configured checks</span><span className="stat-icon"><Icon name="quality" size={16} /></span></div>
          <p className="stat-value">{checks.loading ? <Skeleton width={40} height={30} /> : stats.total}</p>
          <div className="stat-foot"><span className="stat-note">Across {datasetList.length} tracked assets</span></div>
        </div>
        <div className="stat" data-tone="success">
          <div className="stat-top"><span className="stat-label">Active</span><span className="stat-icon"><Icon name="checkCircle" size={16} /></span></div>
          <p className="stat-value">{checks.loading ? <Skeleton width={40} height={30} /> : stats.active}</p>
          <div className="stat-foot"><span className="stat-note">Paused checks are skipped by the runner</span></div>
        </div>
        <div className="stat" data-tone={stats.failing ? "danger" : "success"}>
          <div className="stat-top"><span className="stat-label">Latest failures</span><span className="stat-icon"><Icon name="xCircle" size={16} /></span></div>
          <p className="stat-value">{checks.loading ? <Skeleton width={40} height={30} /> : stats.failing}</p>
          <div className="stat-foot"><span className="stat-note">{stats.failing ? "Failing results open incidents automatically" : "Every tracked check is passing"}</span></div>
        </div>
        <div className="stat" data-tone={stats.anomalies ? "warning" : "success"}>
          <div className="stat-top"><span className="stat-label">Anomalies detected</span><span className="stat-icon"><Icon name="activity" size={16} /></span></div>
          <p className="stat-value">{checks.loading ? <Skeleton width={40} height={30} /> : stats.anomalies}</p>
          <div className="stat-foot"><span className="stat-note">Z-score and percentage-change rules</span></div>
        </div>
      </section>

      <div className="mt-4">
        <Panel flush>
          <div className="table-toolbar">
            <SearchInput value={query} onChange={setQuery} placeholder="Search checks…" className="w-full sm:w-[240px]" aria-label="Search quality checks" />
            <select className="select select-sm w-[160px]" value={typeFilter} onChange={event => setTypeFilter(event.target.value)} aria-label="Filter by check type">
              <option value="">All check types</option>
              {checkTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
            <span className="toolbar-spacer" />
            <span className="text-xs text-[var(--text-faint)]">{filtered.length} of {list.length}</span>
          </div>

          <div className="grid gap-3 p-4">
            {checks.loading ? (
              <><Skeleton height={112} className="!rounded-[var(--radius-lg)]" /><Skeleton height={112} className="!rounded-[var(--radius-lg)]" /></>
            ) : !filtered.length ? (
              <EmptyState
                icon="quality"
                title={list.length ? "No checks match these filters" : "No quality checks configured"}
                copy={list.length ? "Try a different search term or check type." : "Create a check to establish a reliability baseline for your data."}
                actions={!list.length ? <Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)} disabled={!datasetList.length}>Create first check</Button> : undefined}
              />
            ) : (
              filtered.map(check => {
                const history = histories[check.id] ?? [];
                const latest = history[0];
                const open = expanded === check.id;
                return (
                  <article className="check-card" key={check.id}>
                    <div className="check-head">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="check-name">{check.name}</h3>
                          {latest && <StatusBadge value={latest.passed ? "PASSED" : "FAILED"} size="sm" />}
                          {latest?.anomaly && <Badge tone="warning" dot size="sm">Anomaly</Badge>}
                          {!check.is_active && <Badge tone="neutral" size="sm">Paused</Badge>}
                        </div>
                        <div className="check-sub">
                          <Icon name="datasets" size={11} />
                          <span className="truncate">{datasetName(check.dataset_id)}</span>
                          <span>·</span>
                          <span>{humanize(check.check_type)}</span>
                          {latest && <><span>·</span><span>last run {formatRelative(latest.executed_at)}</span></>}
                        </div>
                      </div>
                      <MiniBars results={history} />
                    </div>

                    <p className="check-config">{JSON.stringify(check.configuration)}</p>

                    <div className="check-actions">
                      <Button variant="primary" size="sm" icon="play" loading={pending === check.id} onClick={() => void runCheck(check)}>Run check</Button>
                      <Button variant="secondary" size="sm" icon="history" loading={historyLoading === check.id} onClick={() => void loadHistory(check)}>
                        {open ? "Hide history" : "View history"}
                      </Button>
                      <DatasetLink datasetId={check.dataset_id} />
                    </div>
                    {open && (
                      <div className="check-history">
                        {history.length ? (
                          history.map(result => (
                            <div className="check-history-row" key={result.id}>
                              <div className="check-history-values">
                                <StatusBadge value={result.passed ? "PASSED" : "FAILED"} size="sm" />
                                {result.anomaly && <Badge tone="warning" size="sm">Anomaly</Badge>}
                                <span>observed <b>{display(result.observed_value)}</b></span>
                                <span>expected <b>{display(result.expected_threshold)}</b></span>
                              </div>
                              <span className="text-[var(--text-faint)]">{formatDateTime(result.executed_at)}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-[var(--text-faint)]">No results recorded for this check yet.</p>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Check semantics" icon="bookOpen" note="Each check is evaluated deterministically against the control-plane sample records">
          <div className="grid gap-2.5">
            {checkTypes.map(type => (
              <div key={type.value} className="flex gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--surface-inset)] text-[var(--text-muted)]">
                  <Icon name="checkCircle" size={13} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">{type.label}</p>
                  <p className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">{type.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Anomaly detection" icon="activity" note="Applied on top of threshold evaluation using recent history">
          <div className="grid gap-3 text-xs leading-5 text-[var(--text-muted)]">
            <p className="m-0"><strong className="text-[var(--text-secondary)]">Z-score rule.</strong> Once at least five historical results exist, an observed value beyond the configured z-score threshold (default 3.0) is flagged as an anomaly — even when the threshold check passes.</p>
            <p className="m-0"><strong className="text-[var(--text-secondary)]">Percentage change.</strong> Set <code>anomaly_pct_change</code> to flag movements relative to the running mean.</p>
            <p className="m-0"><strong className="text-[var(--text-secondary)]">Incident routing.</strong> Failed checks and anomalies open correlated incidents automatically unless <code>incident_on_anomaly</code> is disabled.</p>
          </div>
        </Panel>
      </div>

      <CreateCheckModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        datasets={datasetList}
        onCreated={() => {
          checks.reload();
          toast.push({ tone: "success", title: "Quality check created" });
        }}
      />
    </AppShell>
  );
}

function DatasetLink({ datasetId }: { datasetId: string }) {
  return (
    <a className="btn btn-ghost btn-sm" href={`/datasets?focus=${datasetId}`}>
      <Icon name="externalLink" size={13} /> Asset
    </a>
  );
}

function CreateCheckModal({
  open,
  onClose,
  datasets,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  datasets: Array<{ id: string; fully_qualified_name: string }>;
  onCreated: () => void;
}) {
  const [datasetId, setDatasetId] = useState("");
  const [detail, setDetail] = useState<DatasetDetail | null>(null);
  const [name, setName] = useState("");
  const [checkType, setCheckType] = useState<CheckType>("freshness");
  const [column, setColumn] = useState("");
  const [maxAgeMinutes, setMaxAgeMinutes] = useState("60");
  const [minCount, setMinCount] = useState("0");
  const [maxCount, setMaxCount] = useState("");
  const [maxNullRate, setMaxNullRate] = useState("0");
  const [maxDuplicateRate, setMaxDuplicateRate] = useState("0");
  const [rangeMin, setRangeMin] = useState("");
  const [rangeMax, setRangeMax] = useState("");
  const [acceptedValues, setAcceptedValues] = useState("");
  const [zScore, setZScore] = useState("3");
  const [pctChange, setPctChange] = useState("");
  const [incidentOnAnomaly, setIncidentOnAnomaly] = useState(true);
  const { run, pending } = useMutation();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    if (!datasetId && datasets.length) setDatasetId(datasets[0].id);
  }, [open, datasets, datasetId]);

  useEffect(() => {
    if (!datasetId) return;
    let active = true;
    setDetail(null);
    void api<DatasetDetail>(`/datasets/${datasetId}`)
      .then(result => {
        if (active) setDetail(result);
      })
      .catch(() => {
        if (active) setDetail(null);
      });
    return () => { active = false; };
  }, [datasetId]);

  const needsColumn = ["null_rate", "uniqueness", "numeric_range", "accepted_values"].includes(checkType);
  const columns = detail?.columns ?? [];

  function buildConfiguration(): Record<string, unknown> {
    const base: Record<string, unknown> = { incident_on_anomaly: incidentOnAnomaly };
    if (zScore.trim()) base.z_score_threshold = Number(zScore);
    if (pctChange.trim()) base.anomaly_pct_change = Number(pctChange);
    if (checkType === "freshness") base.max_age_minutes = Number(maxAgeMinutes || 60);
    if (checkType === "row_count") {
      base.min = Number(minCount || 0);
      if (maxCount.trim()) base.max = Number(maxCount);
    }
    if (checkType === "null_rate") {
      base.column = column;
      base.max_null_rate = Number(maxNullRate || 0);
    }
    if (checkType === "uniqueness") {
      base.column = column;
      base.max_duplicate_rate = Number(maxDuplicateRate || 0);
    }
    if (checkType === "numeric_range") {
      base.column = column;
      if (rangeMin.trim()) base.min = Number(rangeMin);
      if (rangeMax.trim()) base.max = Number(rangeMax);
    }
    if (checkType === "accepted_values") {
      base.column = column;
      base.values = acceptedValues.split(",").map(value => value.trim()).filter(Boolean);
    }
    return base;
  }

  const configuration = buildConfiguration();
  const invalid = !datasetId || !name.trim() || (needsColumn && !column) || (checkType === "accepted_values" && !acceptedValues.trim());

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const outcome = await run("create", () =>
      api<QualityCheck>("/quality/checks", {
        method: "POST",
        body: JSON.stringify({ dataset_id: datasetId, name: name.trim(), check_type: checkType, configuration }),
      }),
    );
    if (!outcome.ok) {
      toast.push({ tone: "error", title: "Unable to create check", message: outcome.error });
      return;
    }
    onCreated();
    setName("");
    setColumn("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon="quality"
      title="Create quality check"
      note="Checks run deterministically against the workspace sample records and open incidents when they fail."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="plus" loading={pending === "create"} disabled={invalid} onClick={() => void submit()}>
            Create check
          </Button>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Dataset" htmlFor="check-dataset">
            <Select id="check-dataset" value={datasetId} onChange={event => setDatasetId(event.target.value)} required>
              {datasets.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.fully_qualified_name}</option>)}
            </Select>
          </Field>
          <Field label="Check name" htmlFor="check-name">
            <Input id="check-name" value={name} onChange={event => setName(event.target.value)} placeholder="Orders freshness" required />
          </Field>
        </div>

        <Field label="Check type" hint={checkTypes.find(type => type.value === checkType)?.description}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {checkTypes.map(type => (
              <button
                key={type.value}
                type="button"
                onClick={() => setCheckType(type.value)}
                data-active={checkType === type.value}
                className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition data-[active=true]:border-[var(--accent)] data-[active=true]:bg-[var(--accent-soft)]"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--text-secondary)]">{type.label}</span>
                  {checkType === type.value && <Icon name="checkCircle" size={14} className="text-[var(--accent)]" />}
                </span>
              </button>
            ))}
          </div>
        </Field>

        {needsColumn && (
          <Field
            label="Column"
            htmlFor="check-column"
            hint={columns.length ? `${columns.length} columns available on this asset` : "Column metadata is unavailable for this asset"}
          >
            <Select id="check-column" value={column} onChange={event => setColumn(event.target.value)} required>
              <option value="">Select a column…</option>
              {columns.map(item => <option key={item.name} value={item.name}>{item.name} · {item.type}</option>)}
            </Select>
          </Field>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {checkType === "freshness" && (
            <Field label="Max age (minutes)" htmlFor="check-age">
              <Input id="check-age" type="number" min="1" value={maxAgeMinutes} onChange={event => setMaxAgeMinutes(event.target.value)} />
            </Field>
          )}
          {checkType === "row_count" && (
            <>
              <Field label="Minimum rows" htmlFor="check-min-count">
                <Input id="check-min-count" type="number" min="0" value={minCount} onChange={event => setMinCount(event.target.value)} />
              </Field>
              <Field label="Maximum rows" htmlFor="check-max-count" optional>
                <Input id="check-max-count" type="number" min="0" value={maxCount} onChange={event => setMaxCount(event.target.value)} placeholder="No upper bound" />
              </Field>
            </>
          )}
          {checkType === "null_rate" && (
            <Field label="Max null rate (0–1)" htmlFor="check-null">
              <Input id="check-null" type="number" min="0" max="1" step="0.01" value={maxNullRate} onChange={event => setMaxNullRate(event.target.value)} />
            </Field>
          )}
          {checkType === "uniqueness" && (
            <Field label="Max duplicate rate (0–1)" htmlFor="check-dup">
              <Input id="check-dup" type="number" min="0" max="1" step="0.01" value={maxDuplicateRate} onChange={event => setMaxDuplicateRate(event.target.value)} />
            </Field>
          )}
          {checkType === "numeric_range" && (
            <>
              <Field label="Minimum value" htmlFor="check-range-min" optional>
                <Input id="check-range-min" type="number" value={rangeMin} onChange={event => setRangeMin(event.target.value)} />
              </Field>
              <Field label="Maximum value" htmlFor="check-range-max" optional>
                <Input id="check-range-max" type="number" value={rangeMax} onChange={event => setRangeMax(event.target.value)} />
              </Field>
            </>
          )}
          {checkType === "accepted_values" && (
            <Field label="Accepted values" htmlFor="check-values" hint="Comma-separated list" className="md:col-span-2">
              <Input id="check-values" value={acceptedValues} onChange={event => setAcceptedValues(event.target.value)} placeholder="paid, pending, refunded" />
            </Field>
          )}
        </div>

        <div className="surface-subtle p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-faint)]">Anomaly detection</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <Field label="Z-score threshold" htmlFor="check-zscore" hint="Flags results beyond N standard deviations (min 5 historical runs).">
              <Input id="check-zscore" type="number" min="0" step="0.1" value={zScore} onChange={event => setZScore(event.target.value)} />
            </Field>
            <Field label="Percentage change threshold" htmlFor="check-pct" optional hint="e.g. 0.25 flags a 25% move from the running mean.">
              <Input id="check-pct" type="number" min="0" step="0.01" value={pctChange} onChange={event => setPctChange(event.target.value)} placeholder="0.25" />
            </Field>
          </div>
          <div className="mt-4">
            <Toggle
              checked={incidentOnAnomaly}
              onChange={setIncidentOnAnomaly}
              label="Open incidents on anomaly"
              description="When disabled, anomalies are recorded without opening an incident."
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-faint)]">Configuration preview</p>
          <pre className="mono max-h-32 overflow-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-sunken)] p-3 text-[10px] leading-5 text-[var(--text-secondary)]">{JSON.stringify(configuration, null, 2)}</pre>
        </div>

        {invalid && name && (
          <Notice tone="warning" icon="info"><p>Complete the required fields to enable submission.</p></Notice>
        )}
      </form>
    </Modal>
  );
}
