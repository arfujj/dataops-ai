"use client";

import { DragEvent, useRef, useState } from "react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { Icon, type IconName } from "@/components/icons";
import { api } from "@/lib/api";
import { Badge, Button, CopyButton, ErrorNotice, Notice, Panel, Skeleton, StatusBadge, useToast } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { humanize } from "@/lib/format";
import type { Connector } from "@/lib/types";

const glyphMap: Record<string, { icon: IconName; tone: string }> = {
  postgresql: { icon: "database", tone: "var(--chart-1)" },
  webhook: { icon: "zap", tone: "var(--chart-3)" },
  dbt_manifest: { icon: "fileText", tone: "var(--chart-4)" },
  airflow: { icon: "workflow", tone: "var(--chart-2)" },
  dagster: { icon: "layers", tone: "var(--chart-5)" },
  snowflake: { icon: "globe", tone: "var(--chart-1)" },
  bigquery: { icon: "database", tone: "var(--chart-5)" },
};

const descriptions: Record<string, string> = {
  postgresql: "Demo PostgreSQL metadata and quality source for the control plane.",
  webhook: "Normalized event ingestion through the authenticated /api/v1/events endpoint.",
  dbt_manifest: "Manifest import with assets, columns, tags, descriptions, and lineage edges.",
  airflow: "Pipeline lifecycle events posted through the generic webhook adapter.",
  dagster: "Asset materialization events posted through the generic webhook adapter.",
};

export default function ConnectorsPage() {
  const connectors = useApi<Connector[]>("/connectors");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [lastImport, setLastImport] = useState<{ created_assets: number; updated_assets: number; lineage_edges_added: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const list = connectors.data ?? [];
  const live = list.filter(connector => ["CONNECTED", "ACTIVE", "HEALTHY", "WORKING"].includes(connector.state.toUpperCase()));

  async function importManifest(file: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setLastImport(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("That file is not valid JSON. Select a dbt manifest.json.");
      }
      const result = await api<{ created_assets: number; updated_assets: number; lineage_edges_added: number }>("/dbt/import", {
        method: "POST",
        body: JSON.stringify({ manifest: parsed }),
      });
      setLastImport(result);
      toast.push({
        tone: "success",
        title: "dbt import complete",
        message: `${result.created_assets} created · ${result.updated_assets} updated · ${result.lineage_edges_added} lineage edges`,
      });
      connectors.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to import manifest");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void importManifest(file);
  }

  const sampleEnvelope = `{
  "event_id": "0f6a5c1e-...",
  "organization_id": "<your-org-uuid>",
  "environment": "production",
  "source": "airflow",
  "event_type": "pipeline.failed",
  "entity_type": "pipeline",
  "entity_id": "transform_orders",
  "severity": "high",
  "occurred_at": "${new Date().toISOString()}",
  "payload": { "run_id": "manual__2026-01-01", "error": "cast failed" }
}`;

  return (
    <AppShell title="Connectors" eyebrow="Manage">
      <PageHeading
        eyebrow="Sources · ingestion adapters"
        title="Connectors"
        description="Manage metadata sources and event integrations for this workspace."
        actions={<Button variant="secondary" icon="refresh" onClick={connectors.reload}>Refresh</Button>}
      />

      {connectors.error && <div className="mb-4"><ErrorNotice message={connectors.error} onRetry={connectors.reload} /></div>}
      {error && <div className="mb-4"><ErrorNotice message={error} /></div>}

      <section className="grid-4">
        <div className="stat">
          <div className="stat-top"><span className="stat-label">Configured</span><span className="stat-icon"><Icon name="connectors" size={16} /></span></div>
          <p className="stat-value">{connectors.loading ? <Skeleton width={40} height={30} /> : list.length}</p>
          <div className="stat-foot"><span className="stat-note">Adapters scoped to this workspace</span></div>
        </div>
        <div className="stat" data-tone="success">
          <div className="stat-top"><span className="stat-label">Live</span><span className="stat-icon"><Icon name="wifi" size={16} /></span></div>
          <p className="stat-value">{connectors.loading ? <Skeleton width={40} height={30} /> : live.length}</p>
          <div className="stat-foot"><span className="stat-note">{live.length ? "Receiving telemetry normally" : "No connectors reporting yet"}</span></div>
        </div>
        <div className="stat" data-tone="accent">
          <div className="stat-top"><span className="stat-label">Event endpoint</span><span className="stat-icon"><Icon name="zap" size={16} /></span></div>
          <p className="stat-value !text-base mono">/api/v1/events</p>
          <div className="stat-foot"><span className="stat-note">JWT-authenticated, tenant-scoped, idempotent by event_id</span></div>
        </div>
        <div className="stat">
          <div className="stat-top"><span className="stat-label">Import format</span><span className="stat-icon"><Icon name="fileText" size={16} /></span></div>
          <p className="stat-value !text-base mono">manifest.json</p>
          <div className="stat-foot"><span className="stat-note">Validated for file size and asset count</span></div>
        </div>
      </section>

      <div className="mt-4">
        <div className="connector-grid">
          {connectors.loading ? (
            <><Skeleton height={180} className="!rounded-[var(--radius-lg)]" /><Skeleton height={180} className="!rounded-[var(--radius-lg)]" /><Skeleton height={180} className="!rounded-[var(--radius-lg)]" /></>
          ) : list.length ? (
            list.map(connector => {
              const glyph = glyphMap[connector.type] ?? { icon: "connectors" as IconName, tone: "var(--text-muted)" };
              const state = connector.state.toUpperCase();
              const tone = /CONNECTED|ACTIVE|HEALTHY|WORKING/.test(state) ? "success" : /ERROR|FAILED|DISCONNECTED/.test(state) ? "danger" : "neutral";
              return (
                <article className="connector-card" key={connector.id}>
                  <div className="connector-top">
                    <span className="connector-glyph" style={{ color: glyph.tone }}>
                      <Icon name={glyph.icon} size={19} />
                    </span>
                    <StatusBadge value={connector.state} size="sm" />
                  </div>
                  <h3 className="connector-name">{connector.name}</h3>
                  <p className="connector-type">{humanize(connector.type)}</p>
                  <p className="connector-copy">{descriptions[connector.type] ?? "Configured for this workspace."}</p>
                  {connector.config && Object.keys(connector.config).length > 0 && (
                    <div className="mt-3 grid gap-1">
                      {Object.entries(connector.config).slice(0, 3).map(([key, value]) => (
                        <div key={key} className="flex items-baseline justify-between gap-3 text-[10px]">
                          <span className="text-[var(--text-faint)]">{humanize(key)}</span>
                          <span className="mono truncate text-[var(--text-muted)]">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="connector-foot">
                    <Badge tone={tone} dot size="sm">{tone === "success" ? "operational" : tone === "danger" ? "attention" : "registered"}</Badge>
                    <span className="text-[10px] text-[var(--text-faint)]">{connector.type === "webhook" ? "Event ingestion" : connector.type === "dbt_manifest" ? "Manifest import" : "Metadata source"}</span>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="col-span-full">
              <Panel title="No connectors configured" icon="connectors" note="Connectors register automatically during seeding and manifest imports">
                <p className="text-xs text-[var(--text-muted)]">Run <code className="mono">make seed</code> to load the sample workspace, or import a dbt manifest below.</p>
              </Panel>
            </div>
          )}

          {[{ name: "Snowflake", type: "Snowflake" }, { name: "BigQuery", type: "BigQuery" }].map(item => (
            <article className="connector-card" data-state="coming-soon" key={item.name}>
              <div className="connector-top">
                <span className="connector-glyph"><Icon name={glyphMap[item.type.toLowerCase()]?.icon ?? "globe"} size={19} /></span>
                <Badge outline size="sm">Coming soon</Badge>
              </div>
              <h3 className="connector-name">{item.name}</h3>
              <p className="connector-type">Warehouse connector</p>
              <p className="connector-copy">Warehouse-native metadata and quality collection is on the roadmap.</p>
              <div className="connector-foot">
                <span className="text-[10px] text-[var(--text-faint)]">Not yet configurable</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Import dbt manifest" icon="upload" note="Models, sources, metadata, tags, and lineage edges">
          <p className="text-xs leading-5 text-[var(--text-muted)]">
            Select a dbt <code className="mono">manifest.json</code>. The API validates the file size and asset count, then scopes the import to your authenticated organization.
          </p>
          <div
            className="dropzone mt-4"
            data-dragging={dragging}
            onDragOver={event => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-[var(--surface)] text-[var(--text-muted)] shadow-[var(--shadow-xs)]">
              <Icon name="upload" size={17} />
            </span>
            <strong>{busy ? "Importing manifest…" : "Drop manifest.json here"}</strong>
            <span>or choose a file from your machine</span>
            <Button variant="secondary" size="sm" className="mt-1" loading={busy} onClick={() => inputRef.current?.click()}>
              Choose file
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              disabled={busy}
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importManifest(file);
              }}
            />
          </div>
          {lastImport && (
            <div className="mt-3">
              <Notice tone="success" icon="checkCircle">
                <p>Import complete: <strong>{lastImport.created_assets}</strong> created, <strong>{lastImport.updated_assets}</strong> updated, <strong>{lastImport.lineage_edges_added}</strong> lineage edges added.</p>
              </Notice>
            </div>
          )}
        </Panel>

        <Panel title="Event integrations" icon="zap" note="Airflow, Dagster, and generic webhooks post normalized lifecycle events">
          <p className="text-xs leading-5 text-[var(--text-muted)]">
            Send <code className="mono">pipeline.started</code>, <code className="mono">pipeline.succeeded</code>, or <code className="mono">pipeline.failed</code> envelopes to the authenticated event endpoint. Generic webhooks use the same schema validation and tenant checks.
          </p>
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-faint)]">Example envelope</span>
              <CopyButton value={sampleEnvelope} label="Copy envelope" />
            </div>
            <pre className="mono max-h-64 overflow-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-sunken)] p-3 text-[10px] leading-5 text-[var(--text-secondary)]">{sampleEnvelope}</pre>
          </div>
          <div className="mt-3 grid gap-2">
            {[
              "Events are idempotent by event_id — replays are safe.",
              "Organization scope must match the signed membership token.",
              "Persist-then-publish: telemetry commits even if Kafka is unavailable.",
            ].map(line => (
              <p key={line} className="m-0 flex items-start gap-2 text-xs text-[var(--text-muted)]">
                <Icon name="check" size={13} className="mt-0.5 shrink-0 text-[var(--success)]" /> {line}
              </p>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
