"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { DataTable, RecordLink } from "@/components/data-table";
import { AreaChart, DonutChart, Gauge, MiniBars, Sparkline } from "@/components/charts";
import { Icon } from "@/components/icons";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorNotice, Panel, SegmentedControl, Skeleton, StatusBadge } from "@/components/ui";
import { useApi, useRefreshSignal } from "@/lib/hooks";
import { classNames, formatRelative, humanize } from "@/lib/format";
import { api } from "@/lib/api";
import type {
  AuditEntry,
  Connector,
  DashboardSummary,
  DatasetListResponse,
  IncidentListResponse,
  Pipeline,
  QualityCheck,
  QualityResult,
} from "@/lib/types";

type Range = "24h" | "7d" | "30d";

const rangeMs: Record<Range, number> = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 };

export default function DashboardPage() {
  const [range, setRange] = useState<Range>("7d");
  const summary = useApi<DashboardSummary>("/dashboard/summary");
  const incidents = useApi<IncidentListResponse>("/incidents?limit=100");
  const pipelines = useApi<Pipeline[]>("/pipelines");
  const checks = useApi<QualityCheck[]>("/quality/checks");
  const connectors = useApi<Connector[]>("/connectors");
  const datasets = useApi<DatasetListResponse>("/datasets?limit=200");
  const audit = useApi<AuditEntry[]>("/audit?limit=12");

  const [historySample, setHistorySample] = useState<Record<string, QualityResult[]>>({});

  useEffect(() => {
    const targets = (checks.data ?? []).slice(0, 5);
    if (!targets.length) return;
    let active = true;
    void Promise.all(
      targets.map(check =>
        api<QualityResult[]>(`/quality/checks/${check.id}/history?limit=12`)
          .then(rows => [check.id, rows] as const)
          .catch(() => null),
      ),
    ).then(results => {
      if (!active) return;
      const next: Record<string, QualityResult[]> = {};
      for (const entry of results) if (entry) next[entry[0]] = entry[1];
      setHistorySample(next);
    });
    return () => {
      active = false;
    };
  }, [checks.data]);

  useRefreshSignal(() => {
    summary.reload();
    incidents.reload();
    pipelines.reload();
    checks.reload();
    connectors.reload();
    datasets.reload();
    audit.reload();
  });

  const allIncidents = incidents.data?.items ?? [];
  const pipelineList = pipelines.data ?? [];
  const datasetList = datasets.data?.items ?? [];
  const checkList = checks.data ?? [];

  const since = Date.now() - rangeMs[range];
  const inRange = (value?: string | null) => (value ? new Date(value).valueOf() >= since : false);

  const scopedIncidents = useMemo(() => allIncidents.filter(item => inRange(item.opened_at)), [allIncidents, range]);
  const openIncidents = allIncidents.filter(item => !["RESOLVED", "CLOSED"].includes(item.status));
  const criticalCount = openIncidents.filter(item => item.severity.toUpperCase() === "CRITICAL").length;
  const highCount = openIncidents.filter(item => item.severity.toUpperCase() === "HIGH").length;

  const failedPipelines = pipelineList.filter(item => item.status.toUpperCase() === "FAILED");
  const runningPipelines = pipelineList.filter(item => item.status.toUpperCase() === "RUNNING");
  const healthyPipelines = pipelineList.filter(item => ["SUCCEEDED", "SUCCESS", "HEALTHY", "IDLE"].includes(item.status.toUpperCase()));

  const passRate = summary.data?.quality_pass_rate ?? null;
  const activeConnectors = connectors.data?.filter(item => ["CONNECTED", "ACTIVE", "HEALTHY", "WORKING"].includes(item.state.toUpperCase())).length ?? 0;

  const attentionIncident = openIncidents.slice().sort((left, right) => {
    const weight: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (weight[left.severity.toUpperCase()] ?? 4) - (weight[right.severity.toUpperCase()] ?? 4);
  })[0];

  const severitySeries = useMemo(() => {
    const buckets = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>;
    for (const incident of scopedIncidents) buckets[incident.severity.toUpperCase()] = (buckets[incident.severity.toUpperCase()] ?? 0) + 1;
    return buckets;
  }, [scopedIncidents]);

  const incidentTrend = useMemo(() => {
    const days = range === "24h" ? 12 : range === "7d" ? 7 : 14;
    const step = rangeMs[range] / days;
    const points = Array.from({ length: days }, (_, index) => {
      const start = Date.now() - step * (days - index);
      const end = start + step;
      const label = new Date(end).toLocaleDateString(undefined, range === "24h" ? { hour: "numeric" } : { month: "short", day: "numeric" });
      const value = allIncidents.filter(item => {
        const opened = new Date(item.opened_at).valueOf();
        return opened >= start && opened < end;
      }).length;
      return { label, value };
    });
    return points;
  }, [allIncidents, range]);

  const datasetTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const dataset of datasetList) counts.set(dataset.asset_type, (counts.get(dataset.asset_type) ?? 0) + 1);
    return Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  }, [datasetList]);

  const staleAssets = datasetList.filter(dataset => dataset.last_seen_at && Date.now() - new Date(dataset.last_seen_at).valueOf() > 7 * 86_400_000);

  const recentSchemaChanges = summary.data?.recent_schema_changes ?? [];
  const recentAudit = audit.data ?? [];
  const loadingCore = summary.loading || incidents.loading || pipelines.loading;

  const firstError = summary.error || incidents.error || pipelines.error;

  return (
    <AppShell title="Overview" eyebrow="Monitor">
      <PageHeading
        eyebrow="Workspace overview"
        title="Reliability overview"
        description="Incident response, pipeline activity, data quality, and downstream impact for this workspace."
        actions={
          <>
            <SegmentedControl
              value={range}
              onChange={setRange}
              options={[
                { value: "24h", label: "24h" },
                { value: "7d", label: "7 days" },
                { value: "30d", label: "30 days" },
              ]}
            />
            <Button variant="secondary" icon="refresh" onClick={() => { summary.reload(); incidents.reload(); pipelines.reload(); }} aria-label="Refresh dashboard">
              Refresh
            </Button>
            <Link href="/incidents" className="btn btn-primary">
              Incident queue <Icon name="arrowRight" size={14} />
            </Link>
          </>
        }
      />

      {firstError && <div className="mb-4"><ErrorNotice message={firstError} onRetry={() => { summary.reload(); incidents.reload(); pipelines.reload(); }} /></div>}

      <section className="grid-4" aria-label="Key reliability metrics">
        <Link href="/incidents" className="stat" data-tone={openIncidents.length ? "danger" : "success"}>
          <div className="stat-top">
            <span className="stat-label">Active incidents</span>
            <span className="stat-icon"><Icon name="incidents" size={16} /></span>
          </div>
          <p className="stat-value">{loadingCore ? <Skeleton width={44} height={30} /> : openIncidents.length}</p>
          <div className="stat-foot">
            {loadingCore ? <Skeleton width={140} height={10} /> : openIncidents.length ? (
              <span className="flex flex-wrap items-center gap-1.5">
                {criticalCount > 0 && <Badge tone="danger" dot size="sm">{criticalCount} critical</Badge>}
                {highCount > 0 && <Badge tone="warning" dot size="sm">{highCount} high</Badge>}
                {criticalCount + highCount === 0 && <Badge tone="info" dot size="sm">{openIncidents.length} tracked</Badge>}
              </span>
            ) : (
              <span className="stat-delta stat-delta-good"><Icon name="check" size={13} /> All clear</span>
            )}
          </div>
        </Link>

        <Link href="/pipelines" className="stat" data-tone={failedPipelines.length ? "warning" : "success"}>
          <div className="stat-top">
            <span className="stat-label">Pipeline fleet</span>
            <span className="stat-icon"><Icon name="pipelines" size={16} /></span>
          </div>
          <p className="stat-value">
            {pipelines.loading ? <Skeleton width={44} height={30} /> : pipelineList.length}
            <span className="stat-unit">pipelines</span>
          </p>
          <div className="stat-foot">
            {pipelines.loading ? <Skeleton width={140} height={10} /> : (
              <span className="flex flex-wrap items-center gap-1.5">
                {failedPipelines.length > 0 && <Badge tone="danger" dot size="sm">{failedPipelines.length} failed</Badge>}
                {runningPipelines.length > 0 && <Badge tone="accent" dot size="sm">{runningPipelines.length} running</Badge>}
                {healthyPipelines.length > 0 && <Badge tone="success" dot size="sm">{healthyPipelines.length} healthy</Badge>}
                {!pipelineList.length && <span className="stat-note">No pipeline events yet</span>}
              </span>
            )}
          </div>
        </Link>

        <Link href="/quality" className="stat" data-tone={passRate !== null && passRate < 95 ? "warning" : "accent"}>
          <div className="stat-top">
            <span className="stat-label">Quality pass rate</span>
            <span className="stat-icon"><Icon name="quality" size={16} /></span>
          </div>
          <p className="stat-value">
            {summary.loading ? <Skeleton width={70} height={30} /> : passRate === null ? "—" : passRate}
            {passRate !== null && <span className="stat-unit">%</span>}
          </p>
          <div className="stat-foot">
            <span className="stat-note">{passRate === null ? "Run checks to establish a baseline" : "Checks executed today"}</span>
            {passRate !== null && <Sparkline values={[passRate - 8, passRate - 3, passRate - 5, passRate - 1, passRate]} width={72} height={24} color={passRate < 95 ? "var(--warning)" : "var(--success)"} />}
          </div>
        </Link>

        <Link href="/datasets" className="stat" data-tone="accent">
          <div className="stat-top">
            <span className="stat-label">Tracked data assets</span>
            <span className="stat-icon"><Icon name="datasets" size={16} /></span>
          </div>
          <p className="stat-value">{datasets.loading ? <Skeleton width={44} height={30} /> : datasetList.length}</p>
          <div className="stat-foot">
            {datasets.loading ? <Skeleton width={140} height={10} /> : (
              <span className="stat-note">{datasetTypeCounts.slice(0, 3).map(([type, count]) => `${count} ${humanize(type).toLowerCase()}`).join(" · ") || "Catalog empty"}</span>
            )}
          </div>
        </Link>
      </section>

      <div className="mt-4">
        {loadingCore ? (
          <Skeleton height={96} className="!rounded-[var(--radius-lg)]" />
        ) : (
          <Link
            href={attentionIncident ? `/incidents/${attentionIncident.id}` : "/incidents"}
            className="signal-card"
            data-tone={attentionIncident ? "danger" : "success"}
          >
            <div className="signal-content">
              <div className="signal-eyebrow">
                <Icon name={attentionIncident ? "alertTriangle" : "checkCircle"} size={14} />
                {attentionIncident ? "Action recommended" : "Workspace steady"}
              </div>
              <h2 className="signal-title">
                {attentionIncident?.title ?? (failedPipelines.length ? "Pipeline failures need review" : "No active incidents need attention")}
              </h2>
              <div className="signal-meta">
                {attentionIncident ? (
                  <>
                    <StatusBadge value={attentionIncident.severity} size="sm" />
                    <StatusBadge value={attentionIncident.status} size="sm" />
                    <span className="signal-asset">{attentionIncident.entity_ref}</span>
                    <span>opened {formatRelative(attentionIncident.opened_at)}</span>
                  </>
                ) : (
                  <span>{pipelineList.length} pipelines monitored · {datasetList.length} assets tracked · {activeConnectors} connectors live</span>
                )}
              </div>
            </div>
            <span className="signal-action"><Icon name="arrowRight" size={16} /></span>
          </Link>
        )}
      </div>

      <div className="split-wide mt-4">
        <div className="section-stack">
        <Panel
          title="Incident queue"
          icon="incidents"
          note={`${scopedIncidents.length} incident${scopedIncidents.length === 1 ? "" : "s"} opened in the selected window`}
          action={<Link href="/incidents" className="text-link">View all <Icon name="arrowRight" size={13} /></Link>}
          flush
        >
          <DataTable
            rows={scopedIncidents.slice(0, 6)}
            loading={incidents.loading}
            empty="No incidents in this window"
            emptyCopy="Adjust the time range or check back after new telemetry arrives."
            caption="Recent incidents"
            getRowKey={row => row.id}
            columns={[
              { key: "title", label: "Incident", render: row => <RecordLink href={`/incidents/${row.id}`}>{row.title}</RecordLink> },
              { key: "severity", label: "Severity", badge: true, width: "108px" },
              { key: "status", label: "Status", badge: true, width: "128px" },
              { key: "entity_ref", label: "Asset", mono: true },
              { key: "opened_at", label: "Opened", date: true, width: "132px" },
            ]}
          />
        </Panel>

        <Panel
          title="Schema change watch"
          icon="layers"
          note="Latest column and type changes, with breaking changes flagged"
          action={<Link href="/datasets" className="text-link">Catalog <Icon name="arrowRight" size={13} /></Link>}
        >
          {summary.loading ? (
            <div className="grid gap-3"><Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} /></div>
          ) : recentSchemaChanges.length ? (
            <div>
              {recentSchemaChanges.map(change => (
                <div className="schema-change" key={change.id}>
                  <div className="min-w-0">
                    <p className="schema-change-name truncate">{change.dataset_name}.{change.column_name}</p>
                    <p className="schema-change-types">
                      <span>{change.previous_type || "∅"}</span>
                      <Icon name="arrowRight" size={11} />
                      <b>{change.current_type || "∅"}</b>
                    </p>
                    <p className="schema-change-time">{humanize(change.change_type)} · {formatRelative(change.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={change.classification.toLowerCase().includes("breaking") ? "danger" : "neutral"} size="sm">{change.classification}</Badge>
                    <Link href={`/datasets?focus=${change.dataset_id}`} className="text-link text-[11px]">Inspect</Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="layers" title="No schema changes yet" copy="New schema history will appear here as events arrive." />
          )}
        </Panel>
        </div>

        <div className="section-stack">
          <Panel title="Incident volume" icon="activity" note="Incidents opened over the selected window">
            {incidents.loading ? <Skeleton height={160} /> : <AreaChart data={incidentTrend} height={168} color="var(--chart-1)" valueFormatter={value => String(value)} />}
          </Panel>

          <div className="split-even !gap-4">
            <Panel title="Severity mix" icon="pieChart" note="Scoped to window">
              {incidents.loading ? <Skeleton height={128} /> : scopedIncidents.length ? (
                <DonutChart
                  size={116}
                  centerValue={String(scopedIncidents.length)}
                  centerLabel="open"
                  data={[
                    { label: "Critical", value: severitySeries.CRITICAL, color: "var(--chart-6)" },
                    { label: "High", value: severitySeries.HIGH, color: "var(--chart-3)" },
                    { label: "Medium", value: severitySeries.MEDIUM, color: "var(--chart-1)" },
                    { label: "Low", value: severitySeries.LOW, color: "var(--chart-5)" },
                  ].filter(item => item.value > 0)}
                />
              ) : (
                <EmptyState icon="checkCircle" title="No incidents" copy="Nothing opened in this window." />
              )}
            </Panel>

            <Panel title="Quality watch" icon="quality" note="Checks executed today">
              {checks.loading ? <Skeleton height={128} /> : passRate === null ? (
                <EmptyState icon="gauge" title="No results yet" copy="Run a quality check to populate this view." />
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Gauge value={Math.min(passRate, 100)} label="pass rate" size={140} />
                  <div className="flex w-full items-center justify-between text-xs text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-1.5"><Icon name="checkCircle" size={13} className="text-[var(--success)]" /> {checkList.length} checks configured</span>
                    <Link href="/quality" className="text-link">Manage</Link>
                  </div>
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>

      <div className="split-wide mt-4">
        <div className="section-stack">
          <Panel title="Fleet status" icon="server" note="Pipeline states across orchestrators">
            {pipelines.loading ? (
              <div className="grid gap-3"><Skeleton height={32} /><Skeleton height={32} /><Skeleton height={32} /></div>
            ) : pipelineList.length ? (
              <div className="grid gap-2.5">
                {pipelineList.slice(0, 6).map(pipeline => {
                  const state = pipeline.status.toUpperCase();
                  const tone = state === "FAILED" ? "failed" : state === "RUNNING" ? "running" : "success";
                  return (
                    <div className="run-row" key={pipeline.id}>
                      <span className="run-status-dot" data-state={tone} />
                      <div className="run-main">
                        <p className="truncate text-sm font-medium text-[var(--text-secondary)]">{pipeline.name}</p>
                        <div className="run-meta">
                          <span>{pipeline.orchestrator}</span>
                          <span>·</span>
                          <span>{pipeline.last_run_at ? `last run ${formatRelative(pipeline.last_run_at)}` : "no runs recorded"}</span>
                        </div>
                      </div>
                      <StatusBadge value={pipeline.status} size="sm" />
                    </div>
                  );
                })}
                {pipelineList.length > 6 && (
                  <Link href="/pipelines" className="text-link justify-center pt-1">View all {pipelineList.length} pipelines <Icon name="arrowRight" size={13} /></Link>
                )}
              </div>
            ) : (
              <EmptyState icon="pipelines" title="No pipelines registered" copy="Pipeline lifecycle events will register orchestrators here." />
            )}
          </Panel>

          <Panel title="Workspace activity" icon="history" note="Recent auditable events">
            <div className="grid gap-0">
              {audit.loading ? (
                <div className="grid gap-3"><Skeleton height={36} /><Skeleton height={36} /><Skeleton height={36} /></div>
              ) : recentAudit.length ? (
                recentAudit.slice(0, 6).map(entry => (
                  <div className="feed-item" key={entry.id}>
                    <span className="feed-rail">
                      <span
                        className="feed-dot"
                        data-tone={entry.action.includes("approved") ? "success" : entry.action.includes("validated") ? "accent" : entry.action.includes("blocked") ? "danger" : "neutral"}
                      >
                        <Icon name={entry.action.includes("approved") ? "check" : entry.action.includes("validated") ? "shield" : entry.action.includes("agent") ? "cpu" : "circleDot"} size={13} />
                      </span>
                    </span>
                    <div className="feed-copy">
                      <p className="feed-title"><strong>{humanize(entry.action.replaceAll(".", " "))}</strong> on {entry.target_type.replaceAll("_", " ")}</p>
                      <div className="feed-meta">
                        <span>{formatRelative(entry.created_at)}</span>
                        <span className="font-mono">{entry.target_id.slice(0, 8)}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState icon="history" title="No activity yet" copy="Investigation and remediation actions will be recorded here." />
              )}
            </div>
          </Panel>
        </div>

        <div className="section-stack">
          <Panel title="Asset inventory" icon="datasets" note="Tracked assets by type">
            {datasets.loading ? <Skeleton height={96} /> : datasetTypeCounts.length ? (
              <div className="grid gap-2.5">
                {datasetTypeCounts.map(([type, count]) => (
                  <div key={type} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs font-medium text-[var(--text-muted)]">{humanize(type)}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-inset)]">
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(count / datasetList.length) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right font-mono text-xs text-[var(--text-secondary)]">{count}</span>
                  </div>
                ))}
                {staleAssets.length > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--warning-text)]">
                    <Icon name="clock" size={13} /> {staleAssets.length} asset{staleAssets.length === 1 ? "" : "s"} not seen in 7+ days
                  </p>
                )}
              </div>
            ) : (
              <EmptyState icon="datasets" title="Catalog empty" copy="Import a dbt manifest from Connectors to populate assets." />
            )}
          </Panel>

          <Panel title="Recent check runs" icon="pulse" note="Latest result per configured check">
            {checks.loading ? <Skeleton height={96} /> : checkList.length ? (
              <div className="grid gap-2.5">
                {checkList.slice(0, 5).map(check => (
                  <div key={check.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[var(--text-secondary)]">{check.name}</p>
                      <p className="truncate font-mono text-[10px] text-[var(--text-faint)]">{check.check_type} · {check.is_active ? "active" : "paused"}</p>
                    </div>
                    <MiniBars results={historySample[check.id] ?? []} />
                  </div>
                ))}
                <Link href="/quality" className="text-link justify-center pt-1">Open quality workspace <Icon name="arrowRight" size={13} /></Link>
              </div>
            ) : (
              <EmptyState icon="pulse" title="No checks configured" copy="Create a quality check to start tracking anomalies." />
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader
            title="Workspace posture"
            icon="shield"
            note="A deterministic summary of the signals currently in view"
            action={<Link href="/settings" className="text-link">Workspace settings <Icon name="arrowRight" size={13} /></Link>}
          />
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <PostureItem
                tone={criticalCount ? "danger" : "success"}
                icon={criticalCount ? "alertTriangle" : "checkCircle"}
                label="Critical exposure"
                value={criticalCount ? `${criticalCount} critical incident${criticalCount === 1 ? "" : "s"}` : "No critical incidents"}
                note={criticalCount ? "Escalate to on-call before downstream impact spreads." : "Severity-1 queue is clear."}
              />
              <PostureItem
                tone={failedPipelines.length ? "warning" : "success"}
                icon="pipelines"
                label="Pipeline reliability"
                value={failedPipelines.length ? `${failedPipelines.length} failing` : "All pipelines healthy"}
                note={failedPipelines[0] ? `${failedPipelines[0].name} last failed ${failedPipelines[0].last_run_at ? formatRelative(failedPipelines[0].last_run_at) : "recently"}.` : "No failed runs recorded in this window."}
              />
              <PostureItem
                tone={passRate !== null && passRate < 95 ? "warning" : "success"}
                icon="quality"
                label="Quality coverage"
                value={passRate === null ? "Baseline pending" : `${passRate}% passing today`}
                note={checkList.length ? `${checkList.filter(check => check.is_active).length} active checks across ${datasetList.length} assets.` : "No quality checks configured yet."}
              />
              <PostureItem
                tone={activeConnectors ? "accent" : "neutral"}
                icon="connectors"
                label="Ingestion"
                value={`${activeConnectors} of ${connectors.data?.length ?? 0} connectors live`}
                note={connectors.error ? "Connector health could not be loaded." : "Telemetry flows through the normalized event envelope."}
              />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-2 text-center text-[11px] text-[var(--text-faint)] sm:flex sm:items-center sm:justify-between sm:text-left">
        <span>
          Last refreshed {summary.data ? "moments ago" : "—"}
          {summary.data && <span className="ml-2 font-mono">{summary.data.recent_incidents.length} recent incidents cached</span>}
        </span>
        <span className="flex items-center justify-center gap-1.5">
          <Icon name="keyboard" size={12} /> Press <span className="kbd">G</span><span className="kbd">D</span> to jump here, <span className="kbd">⌘K</span> for commands
        </span>
      </div>
    </AppShell>
  );
}

function PostureItem({
  tone,
  icon,
  label,
  value,
  note,
}: {
  tone: "success" | "warning" | "danger" | "accent" | "neutral";
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: string;
  note: string;
}) {
  const toneClass = tone === "success" ? "text-[var(--success)] bg-[var(--success-soft)]" : tone === "warning" ? "text-[var(--warning)] bg-[var(--warning-soft)]" : tone === "danger" ? "text-[var(--danger)] bg-[var(--danger-soft)]" : tone === "accent" ? "text-[var(--accent)] bg-[var(--accent-soft)]" : "text-[var(--text-muted)] bg-[var(--surface-inset)]";
  return (
    <div className="flex gap-3">
      <span className={classNames("grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)]", toneClass)}>
        <Icon name={icon} size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-faint)]">{label}</p>
        <p className="mt-1 text-sm font-semibold text-[var(--text)]">{value}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{note}</p>
      </div>
    </div>
  );
}
