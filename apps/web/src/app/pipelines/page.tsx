"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { DataTable } from "@/components/data-table";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { Badge, Button, Drawer, EmptyState, ErrorNotice, FilterChip, Panel, SearchInput, Skeleton, StatusBadge } from "@/components/ui";
import { useApi, useRefreshSignal } from "@/lib/hooks";
import { formatDate, formatDuration, formatDurationBetween, formatRelative, humanize, runStateTone } from "@/lib/format";
import type { Pipeline, PipelineRun } from "@/lib/types";

export default function PipelinesPage() {
  const pipelines = useApi<Pipeline[]>("/pipelines");
  const [selected, setSelected] = useState<Pipeline | null>(null);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  useEffect(() => {
    if (selected && !pipelines.data?.some(item => item.id === selected.id)) setSelected(null);
  }, [pipelines.data, selected]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setRunsLoading(true);
    setRunsError("");
    api<PipelineRun[]>(`/pipelines/${selected.id}/runs`)
      .then(result => {
        if (active) setRuns(result);
      })
      .catch((cause: unknown) => {
        if (active) setRunsError(cause instanceof Error ? cause.message : "Unable to load run history");
      })
      .finally(() => {
        if (active) setRunsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  useRefreshSignal(() => {
    pipelines.reload();
    if (selected) setSelected({ ...selected });
  }, [selected, pipelines.reload]);

  const list = pipelines.data ?? [];
  const statuses = useMemo(() => Array.from(new Set(list.map(item => item.status.toUpperCase()))).sort(), [list]);

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return list.filter(pipeline => {
      if (statusFilter && pipeline.status.toUpperCase() !== statusFilter) return false;
      if (tokens.length && !tokens.every(token => `${pipeline.name} ${pipeline.orchestrator}`.toLowerCase().includes(token))) return false;
      return true;
    });
  }, [list, query, statusFilter]);

  const counts = useMemo(() => ({
    total: list.length,
    failed: list.filter(item => item.status.toUpperCase() === "FAILED").length,
    running: list.filter(item => item.status.toUpperCase() === "RUNNING").length,
    healthy: list.filter(item => ["SUCCEEDED", "SUCCESS", "HEALTHY", "IDLE"].includes(item.status.toUpperCase())).length,
  }), [list]);

  const successRate = counts.total ? Math.round((counts.healthy / counts.total) * 100) : null;

  return (
    <AppShell title="Pipelines" eyebrow="Monitor">
      <PageHeading
        eyebrow={`Orchestration · ${counts.total} pipelines`}
        title="Pipeline operations"
        description="Airflow and dbt-style runs ingested through the normalized event envelope."
        actions={<Button variant="secondary" icon="refresh" onClick={pipelines.reload}>Refresh fleet</Button>}
      />

      {pipelines.error && <div className="mb-4"><ErrorNotice message={pipelines.error} onRetry={pipelines.reload} /></div>}

      <section className="grid-4">
        <div className="stat">
          <div className="stat-top"><span className="stat-label">Fleet size</span><span className="stat-icon"><Icon name="pipelines" size={16} /></span></div>
          <p className="stat-value">{pipelines.loading ? <Skeleton width={40} height={30} /> : counts.total}</p>
          <div className="stat-foot"><span className="stat-note">Registered orchestrator pipelines</span></div>
        </div>
        <div className="stat" data-tone={counts.failed ? "danger" : "success"}>
          <div className="stat-top"><span className="stat-label">Failing</span><span className="stat-icon"><Icon name="alertTriangle" size={16} /></span></div>
          <p className="stat-value">{pipelines.loading ? <Skeleton width={40} height={30} /> : counts.failed}</p>
          <div className="stat-foot"><span className="stat-note">{counts.failed ? "Require triage in the incident queue" : "No failed pipeline states"}</span></div>
        </div>
        <div className="stat" data-tone="accent">
          <div className="stat-top"><span className="stat-label">Running now</span><span className="stat-icon"><Icon name="activity" size={16} /></span></div>
          <p className="stat-value">{pipelines.loading ? <Skeleton width={40} height={30} /> : counts.running}</p>
          <div className="stat-foot"><span className="stat-note">In-flight runs reported by adapters</span></div>
        </div>
        <div className="stat" data-tone={successRate !== null && successRate < 80 ? "warning" : "success"}>
          <div className="stat-top"><span className="stat-label">Fleet health</span><span className="stat-icon"><Icon name="gauge" size={16} /></span></div>
          <p className="stat-value">{pipelines.loading || successRate === null ? "—" : successRate}<span className="stat-unit">{successRate !== null ? "%" : ""}</span></p>
          <div className="stat-foot">
            <span className="stat-note">{counts.healthy} healthy state{counts.healthy === 1 ? "" : "s"}</span>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-inset)]">
              <div className="h-full rounded-full bg-[var(--success)]" style={{ width: `${successRate ?? 0}%` }} />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4">
        <Panel flush>
          <div className="table-toolbar">
            <SearchInput value={query} onChange={setQuery} placeholder="Search pipelines or adapters…" className="w-full sm:w-[260px]" aria-label="Search pipelines" />
            <FilterChip active={!statusFilter} onClick={() => setStatusFilter("")}>All</FilterChip>
            {statuses.map(status => (
              <FilterChip key={status} active={statusFilter === status} onClick={() => setStatusFilter(statusFilter === status ? "" : status)} count={list.filter(item => item.status.toUpperCase() === status).length}>
                {humanize(status)}
              </FilterChip>
            ))}
            <span className="toolbar-spacer" />
            <span className="text-xs text-[var(--text-faint)]">{filtered.length} shown</span>
          </div>
          <div className="px-4 py-3">
            <DataTable
              rows={filtered}
              loading={pipelines.loading}
              empty={list.length ? "No pipelines match these filters" : "No pipeline events received"}
              emptyCopy={list.length ? "Try clearing the search or status filter." : "Pipeline lifecycle events register orchestrators automatically."}
              caption="Pipeline inventory"
              getRowKey={row => row.id}
              onRowClick={row => { setSelected(row); setExpandedRun(null); }}
              columns={[
                {
                  key: "name",
                  label: "Pipeline",
                  render: (row: Pipeline) => (
                    <div className="flex items-center gap-3">
                      <span className="run-status-dot" data-state={runStateTone(row.status)} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--text)]">{row.name}</p>
                        <p className="mt-0.5 text-[10px] text-[var(--text-faint)]">{humanize(row.orchestrator)} adapter</p>
                      </div>
                    </div>
                  ),
                },
                { key: "orchestrator", label: "Adapter", render: row => <Badge outline size="sm">{humanize(row.orchestrator)}</Badge>, width: "140px" },
                { key: "status", label: "State", render: row => <StatusBadge value={row.status} size="sm" />, width: "130px" },
                {
                  key: "last_run_at",
                  label: "Last run",
                  render: row => (
                    <span className="text-xs text-[var(--text-muted)]">{row.last_run_at ? formatRelative(row.last_run_at) : "Never"}</span>
                  ),
                  width: "130px",
                },
                {
                  key: "inspect",
                  label: "",
                  width: "90px",
                  render: row => (
                    <Button variant="ghost" size="sm" iconRight="chevronRight" onClick={event => { event.stopPropagation(); setSelected(row); setExpandedRun(null); }}>
                      Runs
                    </Button>
                  ),
                  sortable: false,
                },
              ]}
            />
          </div>
        </Panel>
      </div>

      <Drawer
        open={!!selected}
        onClose={() => { setSelected(null); setRuns([]); }}
        title={selected?.name ?? "Pipeline"}
        note={selected ? `${humanize(selected.orchestrator)} adapter · ${runs.length} recent run(s)` : undefined}
        footer={
          selected && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[var(--text-faint)]">Run logs are capped by the API</span>
              <Button variant="secondary" size="sm" icon="refresh" onClick={() => selected && setSelected({ ...selected })}>Reload runs</Button>
            </div>
          )
        }
      >
        {!selected ? null : (
          <div className="section-stack">
            <div className="grid grid-cols-2 gap-3">
              <div className="surface-subtle p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-faint)]">Current state</p>
                <div className="mt-2"><StatusBadge value={selected.status} size="sm" /></div>
              </div>
              <div className="surface-subtle p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-faint)]">Last run</p>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">{selected.last_run_at ? formatRelative(selected.last_run_at) : "Never"}</p>
              </div>
            </div>

            {runsError && <ErrorNotice message={runsError} />}

            {runsLoading ? (
              <div className="grid gap-3"><Skeleton height={68} /><Skeleton height={68} /><Skeleton height={68} /></div>
            ) : !runs.length ? (
              <EmptyState icon="play" title="No runs recorded" copy="Run telemetry will appear here after the orchestrator emits pipeline events." />
            ) : (
              <div className="grid gap-2.5">
                {runs.map(run => {
                  const tone = runStateTone(run.status);
                  const durationMs = run.finished_at ? new Date(run.finished_at).valueOf() - new Date(run.started_at).valueOf() : null;
                  const open = expandedRun === run.id;
                  return (
                    <div className="card" key={run.id}>
                      <button
                        className="flex w-full items-center gap-3 p-3 text-left"
                        onClick={() => setExpandedRun(open ? null : run.id)}
                        aria-expanded={open}
                      >
                        <span className="run-status-dot" data-state={tone} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-xs text-[var(--text-secondary)]">{run.run_id}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-faint)]">
                            <span>{formatDate(run.started_at)}</span>
                            <span>·</span>
                            <span>{formatDuration(durationMs)}</span>
                          </span>
                        </span>
                        <StatusBadge value={run.status} size="sm" />
                        <Icon name={open ? "chevronDown" : "chevronRight"} size={14} className="text-[var(--text-faint)]" />
                      </button>
                      {open && (
                        <div className="border-t border-[var(--border-soft)] p-3">
                          {run.error_message && (
                            <div className="notice notice-error mb-3">
                              <Icon name="alertCircle" size={14} />
                              <p className="font-mono text-[11px]">{run.error_message}</p>
                            </div>
                          )}
                          {run.logs ? (
                            <pre className="log-viewer">{run.logs}</pre>
                          ) : (
                            <p className="text-xs text-[var(--text-faint)]">No log output captured for this run.</p>
                          )}
                          <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--text-faint)]">
                            <span>Started {formatDate(run.started_at)}</span>
                            <span>{run.finished_at ? `Finished ${formatDate(run.finished_at)} · ${formatDurationBetween(run.started_at, run.finished_at)}` : "Still running"}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </AppShell>
  );
}
