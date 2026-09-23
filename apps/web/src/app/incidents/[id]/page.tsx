"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { useApi, useMutation, useRefreshSignal } from "@/lib/hooks";
import { display, formatDateTime, formatDuration, formatRelative, humanize, truncateId } from "@/lib/format";
import type { AgentResult, AuditEntry, Evidence, IncidentContext, Organization, RemediationPlan, ToolCall } from "@/lib/types";
import {
  Badge,
  Button,
  ConfirmDialog,
  CopyButton,
  ConfidenceRing,
  EmptyState,
  ErrorNotice,
  Notice,
  Panel,
  Skeleton,
  StatusBadge,
  Tabs,
  useToast,
} from "@/components/ui";

type TabKey = "overview" | "evidence" | "impact" | "activity";

const evidenceTone = (type: string): "danger" | "warning" | "accent" | "success" | "neutral" => {
  const token = type.toLowerCase();
  if (/(pipeline|run|failure|error)/.test(token)) return "danger";
  if (/(schema|drift|deploy)/.test(token)) return "warning";
  if (/(quality|anomaly|freshness)/.test(token)) return "accent";
  if (/(connector|recovery|success)/.test(token)) return "success";
  return "neutral";
};

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const context = useApi<IncidentContext>(id ? `/incidents/${id}` : null);
  const organization = useApi<Organization>("/organizations/current");
  const audit = useApi<AuditEntry[]>("/audit?limit=100");
  const [tab, setTab] = useState<TabKey>("overview");
  const [confirmApprove, setConfirmApprove] = useState<RemediationPlan | null>(null);
  const { run, pending } = useMutation();
  const toast = useToast();

  const reloadAll = useCallback(() => {
    context.reload();
    audit.reload();
  }, [context, audit]);

  useRefreshSignal(reloadAll, [reloadAll]);

  const data = context.data;
  const incident = data?.incident;
  const latestRun = data?.agent_runs?.[0];
  const result = (latestRun?.result ?? null) as AgentResult | null;
  const plans = data?.remediation_plans ?? [];
  const role = organization.data?.role ?? "viewer";
  const isAdmin = role === "admin";

  const relevantAudit = useMemo(() => {
    const planIds = new Set(plans.map(plan => plan.id));
    return (audit.data ?? []).filter(row => row.target_id === id || planIds.has(row.target_id) || row.details?.incident_id === id);
  }, [audit.data, id, plans]);

  async function act(key: string, path: string, successMessage: string) {
    const outcome = await run(key, () => api(path, { method: "POST" }));
    if (outcome.ok) {
      toast.push({ tone: "success", title: successMessage });
      reloadAll();
    } else {
      toast.push({ tone: "error", title: "Action failed", message: outcome.error });
    }
  }

  const recommendValidate = plans.some(plan => plan.status === "PROPOSED");
  const recommendApprove = plans.some(plan => plan.status === "VALIDATED");

  if (context.error && !data) {
    return (
      <AppShell title="Incident detail" eyebrow="Monitor">
        <ErrorNotice message={context.error} onRetry={context.reload} />
        <div className="mt-4"><Link href="/incidents" className="text-link"><Icon name="chevronLeft" size={13} /> Back to incident queue</Link></div>
      </AppShell>
    );
  }

  return (
    <AppShell title={incident?.title ?? "Incident detail"} eyebrow="Monitor">
      {!data || !incident ? (
        <div className="section-stack">
          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]"><span className="spinner" /> Loading incident evidence and impact…</div>
          <Skeleton width="42%" height={28} />
          <Skeleton height={88} className="!rounded-[var(--radius-lg)]" />
          <div className="split-wide">
            <Skeleton height={280} className="!rounded-[var(--radius-lg)]" />
            <Skeleton height={280} className="!rounded-[var(--radius-lg)]" />
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 text-xs text-[var(--text-faint)]">
            <Link href="/incidents" className="text-link"><Icon name="chevronLeft" size={13} /> Incident queue</Link>
            <span>/</span>
            <span className="font-mono">{truncateId(incident.id)}</span>
          </div>

          <PageHeading
            eyebrow={`${incident.severity} priority · ${humanize(incident.status)}`}
            title={incident.title}
            description={incident.description}
            actions={
              <>
                <Button variant="secondary" icon="refresh" onClick={reloadAll} aria-label="Refresh incident">Refresh</Button>
                <Button
                  variant="primary"
                  icon={latestRun ? "refresh" : "cpu"}
                  loading={pending === "investigate"}
                  onClick={() => void act("investigate", `/incidents/${id}/investigate`, "Investigation completed")}
                >
                  {latestRun ? "Re-run investigation" : "Investigate with AI"}
                </Button>
              </>
            }
          />

          <section className="incident-meta-strip" aria-label="Incident metadata">
            <div className="incident-meta-cell"><small>Severity</small><strong><StatusBadge value={incident.severity} size="sm" /></strong></div>
            <div className="incident-meta-cell"><small>Status</small><strong><StatusBadge value={incident.status} size="sm" /></strong></div>
            <div className="incident-meta-cell"><small>Environment</small><strong>{incident.environment}</strong></div>
            <div className="incident-meta-cell"><small>Category</small><strong>{humanize(incident.category)}</strong></div>
            <div className="incident-meta-cell"><small>Primary asset</small><strong className="mono">{incident.entity_ref}</strong></div>
            <div className="incident-meta-cell"><small>Opened</small><strong>{formatRelative(incident.opened_at)}</strong></div>
            <div className="incident-meta-cell">
              <small>Incident ID</small>
              <strong className="mono flex items-center gap-1">
                {truncateId(incident.id)}
                <CopyButton value={incident.id} label="Copy incident ID" />
              </strong>
            </div>
          </section>

          <div className="mt-4">
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { value: "overview", label: "Investigation", icon: "cpu" },
                { value: "evidence", label: "Evidence", icon: "list", count: data.evidence.length },
                { value: "impact", label: "Impact", icon: "lineage", count: data.downstream_assets.length },
                { value: "activity", label: "Activity & audit", icon: "history" },
              ]}
            />
          </div>

          <div className="mt-4">
            {tab === "overview" && (
              <div className="split-wide">
                <div className="section-stack">
                  <Panel
                    title="AI investigation"
                    icon="cpu"
                    note={latestRun
                      ? `${latestRun.mode.toUpperCase() === "OPENAI" ? "OpenAI Responses API" : "Deterministic demo mode"}${latestRun.model ? ` · ${latestRun.model}` : ""} · ${formatDateTime(latestRun.started_at)}`
                      : "Run a bounded, read-only investigation to explain likely cause and blast radius"}
                    action={latestRun?.status ? <StatusBadge value={latestRun.status} size="sm" /> : undefined}
                  >
                    {result ? (
                      <div>
                        <div className="verdict">
                          <div className="verdict-top">
                            <div className="min-w-0">
                              <p className="verdict-label">Root cause · {humanize(display(result.root_cause_category))}</p>
                              <p className="verdict-title">{display(result.root_cause)}</p>
                            </div>
                            <ConfidenceRing value={Math.round(Number(result.confidence ?? 0) * 100)} size={64} />
                          </div>
                          <p className="verdict-copy">{display(result.explanation)}</p>
                          <div className="verdict-grid">
                            <div>
                              <p className="verdict-section-title">Affected assets</p>
                              {Array.isArray(result.affected_assets) && result.affected_assets.length ? (
                                <div className="grid gap-1.5">
                                  {(result.affected_assets as unknown[]).map(asset => (
                                    <span key={String(asset)} className="verdict-asset">
                                      <Icon name="datasets" size={12} /> {String(asset)}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-[var(--text-faint)]">No affected assets cited.</p>
                              )}
                            </div>
                            <div>
                              <p className="verdict-section-title">Recommended next steps</p>
                              {Array.isArray(result.recommendations) && result.recommendations.length ? (
                                <ol className="verdict-steps">
                                  {(result.recommendations as unknown[]).map((step, index) => (
                                    <li key={index} className="verdict-step">
                                      <span className="verdict-step-index">{index + 1}</span>
                                      <span>{String(step)}</span>
                                    </li>
                                  ))}
                                </ol>
                              ) : (
                                <p className="text-xs text-[var(--text-faint)]">No recommendations returned.</p>
                              )}
                            </div>
                          </div>
                          <div className="verdict-foot">
                            <span className="inline-flex items-center gap-1.5"><Icon name="link" size={12} /> {Array.isArray(result.citations) ? result.citations.length : 0} cited evidence item(s)</span>
                            <span className="inline-flex items-center gap-1.5"><Icon name="shield" size={12} /> Risk: {humanize(display(result.risk_level))}</span>
                            <span className="inline-flex items-center gap-1.5"><Icon name="lock" size={12} /> Read-only tools · policy enforced</span>
                          </div>
                        </div>
                        {(result.recommendations as unknown[] | undefined)?.length ? (
                          <div className="mt-4">
                            <Notice tone="info" icon="info">
                              <p>Model output is advisory. Validation and approval stay server-side and are fully audited.</p>
                            </Notice>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <EmptyState
                        icon="wand"
                        title="No investigation has been run"
                        copy="The investigator receives a bounded incident context and can only call allowlisted, read-only tools."
                        actions={<Button variant="primary" icon="cpu" loading={pending === "investigate"} onClick={() => void act("investigate", `/incidents/${id}/investigate`, "Investigation completed")}>Run investigation</Button>}
                      />
                    )}
                  </Panel>

                  <Panel title="Correlated evidence" icon="list" note={`${data.evidence.length} signal${data.evidence.length === 1 ? "" : "s"} ordered by relevance`} action={<Button variant="ghost" size="sm" onClick={() => setTab("evidence")}>Open timeline</Button>}>
                    {data.evidence.length ? (
                      <div className="timeline">
                        {data.evidence.slice(0, 4).map((item, index) => (
                          <EvidenceRow key={item.id} evidence={item} last={index === Math.min(data.evidence.length, 4) - 1} />
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon="inbox" title="No evidence captured" copy="Signals are attached automatically as telemetry correlates to this incident." />
                    )}
                  </Panel>
                </div>

                <div className="section-stack">
                  <Panel title="Remediation controls" icon="shield" note="Validation is a dry run; approval records intent and never executes production changes">
                    {!plans.length ? (
                      <EmptyState icon="wand" title="No response plan yet" copy="Run an investigation to generate a proposed remediation plan." />
                    ) : (
                      <div className="grid gap-3">
                        {plans.map(plan => (
                          <RemediationCard
                            key={plan.id}
                            plan={plan}
                            isAdmin={isAdmin}
                            pending={pending}
                            onValidate={() => void act("validate", `/remediations/${plan.id}/validate`, "Plan passed safe validation")}
                            onApprove={() => setConfirmApprove(plan)}
                          />
                        ))}
                      </div>
                    )}
                  </Panel>

                  <Panel title="Lineage impact" icon="lineage" note={`${data.downstream_assets.length} downstream asset${data.downstream_assets.length === 1 ? "" : "s"} in the blast radius`} action={<Link href="/lineage" className="text-link">Explorer <Icon name="arrowRight" size={13} /></Link>}>
                    {data.downstream_assets.length ? (
                      <div className="grid gap-2">
                        {data.downstream_assets.slice(0, 5).map(asset => (
                          <div key={asset.dataset_id} className="surface-subtle p-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate font-mono text-xs text-[var(--text-secondary)]">{asset.name}</span>
                              <Badge outline size="sm">{humanize(asset.asset_type)}</Badge>
                            </div>
                            <p className="mt-1.5 text-[10px] text-[var(--text-faint)]">Depth {asset.depth} · {asset.path.join(" → ")}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--text-faint)]">No downstream assets were captured for this incident.</p>
                    )}
                  </Panel>
                </div>
              </div>
            )}

            {tab === "evidence" && (
              <div className="split-wide">
                <Panel title="Evidence timeline" icon="clock" note="Ordered by relevance, then capture time. Expand any row to inspect the raw payload.">
                  {data.evidence.length ? (
                    <div className="timeline">
                      {data.evidence.map((item, index) => (
                        <EvidenceRow key={item.id} evidence={item} last={index === data.evidence.length - 1} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon="inbox" title="No evidence captured" />
                  )}
                </Panel>
                <div className="section-stack">
                  <Panel title="Evidence composition" icon="pieChart" note="Signals grouped by source">
                    <div className="grid gap-2.5">
                      {Object.entries(data.evidence.reduce<Record<string, number>>((accumulator, item) => {
                        accumulator[item.type] = (accumulator[item.type] ?? 0) + 1;
                        return accumulator;
                      }, {})).map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="feed-dot !h-6 !w-6" data-tone={evidenceTone(type)}><Icon name="pulse" size={12} /></span>
                            <span className="text-[var(--text-secondary)]">{humanize(type)}</span>
                          </div>
                          <span className="font-mono text-[var(--text-muted)]">{count}</span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                  <Panel title="Signal quality" icon="target" note="Relevance scoring">
                    <div className="grid gap-2">
                      {data.evidence.slice(0, 6).map(item => (
                        <div key={item.id} className="flex items-center gap-3">
                          <span className="w-28 shrink-0 truncate font-mono text-[10px] text-[var(--text-faint)]">{truncateId(item.id)}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-inset)]">
                            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, Math.max(0, item.relevance))}%` }} />
                          </div>
                          <span className="w-8 text-right font-mono text-[10px] text-[var(--text-muted)]">{item.relevance}</span>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              </div>
            )}

            {tab === "impact" && (
              <div className="section-stack">
                <div className="split-even">
                  <Panel title="Schema changes" icon="layers" note={`${data.schema_changes.length} correlated schema signal(s)`}>
                    {data.schema_changes.length ? (
                      <div className="grid gap-2">
                        {data.schema_changes.map((change, index) => (
                          <RecordCard key={index} record={change} icon="layers" />
                        ))}
                      </div>
                    ) : <EmptyState icon="layers" title="No schema changes correlated" />}
                  </Panel>
                  <Panel title="Failed runs" icon="pipelines" note={`${data.failed_runs.length} run failure(s)`}>
                    {data.failed_runs.length ? (
                      <div className="grid gap-2">
                        {data.failed_runs.map((run, index) => (
                          <RecordCard key={index} record={run} icon="pipelines" />
                        ))}
                      </div>
                    ) : <EmptyState icon="pipelines" title="No failed runs correlated" />}
                  </Panel>
                  <Panel title="Quality anomalies" icon="quality" note={`${data.quality_anomalies.length} anomaly signal(s)`}>
                    {data.quality_anomalies.length ? (
                      <div className="grid gap-2">
                        {data.quality_anomalies.map((anomaly, index) => (
                          <RecordCard key={index} record={anomaly} icon="quality" />
                        ))}
                      </div>
                    ) : <EmptyState icon="quality" title="No quality anomalies correlated" />}
                  </Panel>
                  <Panel title="Downstream assets" icon="lineage" note={`${data.downstream_assets.length} impacted asset(s)`}>
                    {data.downstream_assets.length ? (
                      <div className="grid gap-2">
                        {data.downstream_assets.map(asset => (
                          <div key={asset.dataset_id} className="surface-subtle p-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate font-mono text-xs text-[var(--text-secondary)]">{asset.name}</span>
                              <Badge outline size="sm">{humanize(asset.asset_type)}</Badge>
                            </div>
                            <p className="mt-1.5 text-[10px] text-[var(--text-faint)]">Depth {asset.depth} · {asset.path.join(" → ")}</p>
                          </div>
                        ))}
                      </div>
                    ) : <EmptyState icon="lineage" title="No downstream impact captured" />}
                  </Panel>
                </div>

                {((data.recent_deployments?.length ?? 0) > 0 || (data.historical_similar_incidents?.length ?? 0) > 0 || (data.logs?.length ?? 0) > 0) && (
                  <div className="split-even">
                    {(data.recent_deployments?.length ?? 0) > 0 && (
                      <Panel title="Recent deployments" icon="rocket" note="Deployments captured around the incident window">
                        <div className="grid gap-2">
                          {data.recent_deployments?.map((deployment, index) => (
                            <RecordCard key={index} record={deployment} icon="rocket" />
                          ))}
                        </div>
                      </Panel>
                    )}
                    {(data.historical_similar_incidents?.length ?? 0) > 0 && (
                      <Panel title="Related history" icon="history" note="Past incidents surfaced by the investigator context">
                        <div className="grid gap-2">
                          {data.historical_similar_incidents?.map((incident, index) => (
                            <RecordCard key={index} record={incident} icon="incidents" />
                          ))}
                        </div>
                      </Panel>
                    )}
                    {(data.logs?.length ?? 0) > 0 && (
                      <Panel title="Correlated logs" icon="terminal" note="Bounded log excerpts attached to the incident context">
                        <div className="grid gap-2">
                          {data.logs?.map((entry, index) => (
                            <pre key={index} className="log-viewer !max-h-40">{JSON.stringify(entry, null, 2)}</pre>
                          ))}
                        </div>
                      </Panel>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === "activity" && (
              <div className="split-wide">
                <div className="section-stack">
                  <Panel title="Agent runs" icon="cpu" note="Every bounded investigation invoked for this incident">
                    {data.agent_runs.length ? (
                      <div className="grid gap-2">
                        {data.agent_runs.map(run => (
                          <div key={run.id} className="surface-subtle flex flex-wrap items-center justify-between gap-3 p-3">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[var(--text-secondary)]">{run.mode.toUpperCase() === "OPENAI" ? "OpenAI investigation" : "Deterministic investigation"}</p>
                              <p className="mt-1 font-mono text-[10px] text-[var(--text-faint)]">{run.model || "no model"} · {formatDateTime(run.started_at)} · {formatDuration(run.finished_at ? new Date(run.finished_at).valueOf() - new Date(run.started_at).valueOf() : null)}</p>
                            </div>
                            <StatusBadge value={run.status} size="sm" />
                          </div>
                        ))}
                      </div>
                    ) : <EmptyState icon="cpu" title="No agent runs yet" />}
                  </Panel>
                  <Panel title="Tool calls" icon="terminal" note="Allowlisted read-only tools with full argument and result capture">
                    {data.tool_calls.length ? (
                      <div className="grid gap-2">
                        {data.tool_calls.map(call => <ToolCallRow key={call.id} call={call} />)}
                      </div>
                    ) : <EmptyState icon="terminal" title="No tool calls recorded" />}
                  </Panel>
                </div>
                <Panel title="Audit history" icon="history" note="Incident, investigation, and remediation events">
                  {relevantAudit.length ? (
                    <div className="grid gap-0">
                      {relevantAudit.map(row => (
                        <div key={row.id} className="feed-item">
                          <span className="feed-rail">
                            <span className="feed-dot" data-tone={row.action.includes("approved") ? "success" : row.action.includes("proposed") ? "accent" : "neutral"}>
                              <Icon name={row.action.includes("approved") ? "check" : row.action.includes("proposed") ? "wand" : "circleDot"} size={13} />
                            </span>
                          </span>
                          <div className="feed-copy">
                            <p className="feed-title"><strong>{humanize(row.action.replaceAll(".", " "))}</strong></p>
                            <div className="feed-meta">
                              <span className="font-mono">{row.target_type} / {truncateId(row.target_id)}</span>
                              <span>{formatRelative(row.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <EmptyState icon="history" title="No audit records yet" />}
                </Panel>
              </div>
            )}
          </div>

          <ConfirmDialog
            open={!!confirmApprove}
            onClose={() => setConfirmApprove(null)}
            loading={pending === "approve"}
            title="Approve remediation plan"
            note={
              <>
                Approving records organizational intent and writes a permanent audit entry. <strong>No SQL, shell command, or production change is executed.</strong> Execution remains a human, out-of-band step.
              </>
            }
            confirmLabel="Approve proposal"
            onConfirm={() => {
              if (!confirmApprove) return;
              void act("approve", `/remediations/${confirmApprove.id}/approve`, "Remediation plan approved");
              setConfirmApprove(null);
            }}
          />

          {recommendValidate && (
            <div className="mt-4">
              <Notice tone="info" icon="info" action={<Button variant="secondary" size="sm" onClick={() => setTab("overview")}>Review plan</Button>}>
                <p>A proposed remediation plan is waiting for safe validation (dry run).</p>
              </Notice>
            </div>
          )}
          {recommendApprove && isAdmin && (
            <div className="mt-4">
              <Notice tone="success" icon="checkCircle" action={<Button variant="primary" size="sm" onClick={() => setTab("overview")}>Review plan</Button>}>
                <p>A validated plan is ready for admin approval.</p>
              </Notice>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

function EvidenceRow({ evidence, last }: { evidence: Evidence; last: boolean }) {
  return (
    <div className="timeline-item">
      <span className="timeline-rail">
        <span className="timeline-marker" data-tone={evidenceTone(evidence.type)}>
          <Icon name="pulse" size={13} />
        </span>
        {!last && <span className="timeline-connector" />}
      </span>
      <div className="timeline-body">
        <p className="timeline-title">{evidence.summary}</p>
        <div className="timeline-meta">
          <Badge outline size="sm">{humanize(evidence.type)}</Badge>
          <span>relevance {evidence.relevance}</span>
          <span>·</span>
          <span>{formatDateTime(evidence.captured_at)}</span>
        </div>
        {evidence.details && Object.keys(evidence.details).length > 0 && (
          <details className="timeline-payload">
            <summary>Inspect event payload</summary>
            <pre>{JSON.stringify(evidence.details, null, 2)}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

function RemediationCard({
  plan,
  isAdmin,
  pending,
  onValidate,
  onApprove,
}: {
  plan: RemediationPlan;
  isAdmin: boolean;
  pending: string;
  onValidate: () => void;
  onApprove: () => void;
}) {
  const status = plan.status.toUpperCase();
  const stepIndex = status === "PROPOSED" ? 1 : status === "VALIDATED" ? 2 : status === "APPROVED" ? 4 : status === "BLOCKED" ? 1 : 0;
  const steps = [
    { label: "Plan proposed", note: "Generated from investigation evidence" },
    { label: "Safe validation", note: "Policy check and dry run only" },
    { label: "Human approval", note: "Admin intent recorded, nothing executes" },
  ];

  return (
    <div className="remediation-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-secondary)]">{plan.summary}</p>
          <p className="mt-1 font-mono text-[10px] text-[var(--text-faint)]">plan {truncateId(plan.id)}</p>
        </div>
        <StatusBadge value={plan.status} size="sm" />
      </div>

      <ol className="step-list mt-3">
        {steps.map((step, index) => (
          <li key={step.label} className="step-item" data-state={index + 1 < stepIndex ? "done" : index + 1 === stepIndex ? "active" : undefined}>
            <span className="step-marker">{index + 1 < stepIndex ? <Icon name="check" size={11} /> : index + 1}</span>
            <span className="step-copy">
              <span className="step-title">{step.label}</span>
              <span className="step-note">{step.note}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-3 border-t border-[var(--border-soft)] pt-3">
        <p className="verdict-section-title">Planned actions</p>
        <ol className="grid gap-1.5">
          {plan.actions.map((action, index) => (
            <li key={index} className="flex gap-2 text-xs leading-5 text-[var(--text-muted)]">
              <span className="font-mono text-[var(--text-faint)]">{String(index + 1).padStart(2, "0")}</span>
              {action}
            </li>
          ))}
        </ol>
      </div>

      {status === "PROPOSED" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" icon="shield" loading={pending === "validate"} onClick={onValidate}>Run safe validation</Button>
        </div>
      )}
      {status === "VALIDATED" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <Button variant="warningSoft" icon="check" loading={pending === "approve"} onClick={onApprove}>Approve proposal</Button>
          ) : (
            <Badge tone="warning" dot>Admin approval required</Badge>
          )}
        </div>
      )}
      {status === "BLOCKED" && (
        <div className="mt-3">
          <Notice tone="error" icon="xCircle"><p>Policy blocked this plan. Review the action list and generate a new proposal.</p></Notice>
        </div>
      )}
      {status === "APPROVED" && (
        <div className="mt-3">
          <Notice tone="success" icon="checkCircle"><p>Approved {plan.approved_at ? formatRelative(plan.approved_at) : "recently"}. No external state was changed.</p></Notice>
        </div>
      )}
    </div>
  );
}

function ToolCallRow({ call }: { call: ToolCall }) {
  return (
    <details className="tool-call">
      <summary>
        <span className="tool-call-name">
          <Icon name="terminal" size={13} />
          {call.tool_name}
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[var(--text-faint)]">{formatDuration(call.duration_ms)}</span>
          <Badge tone={call.succeeded ? "success" : "danger"} dot size="sm">{call.succeeded ? "ok" : "failed"}</Badge>
        </span>
      </summary>
      <div className="tool-call-body">
        <p className="text-[10px] text-[var(--text-faint)]">{formatDateTime(call.created_at)}</p>
        <pre>{JSON.stringify({ arguments: call.arguments, result: call.result }, null, 2)}</pre>
      </div>
    </details>
  );
}

function RecordCard({ record, icon }: { record: Record<string, unknown>; icon: Parameters<typeof Icon>[0]["name"] }) {
  const title = String(record.summary ?? record.name ?? record.dataset_name ?? record.column_name ?? record.run_id ?? "Signal");
  const entries = Object.entries(record).filter(([key, value]) => !["summary", "name"].includes(key) && value !== null && value !== undefined && value !== "");
  return (
    <div className="surface-subtle p-3">
      <div className="flex items-start gap-2.5">
        <span className="feed-dot !h-6 !w-6 shrink-0"><Icon name={icon} size={12} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-[var(--text-secondary)]">{title}</p>
          <div className="mt-2 grid gap-1">
            {entries.slice(0, 5).map(([key, value]) => (
              <div key={key} className="flex items-baseline justify-between gap-3 text-[10px]">
                <span className="shrink-0 text-[var(--text-faint)]">{humanize(key)}</span>
                <span className="truncate font-mono text-[var(--text-muted)]">{display(value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
