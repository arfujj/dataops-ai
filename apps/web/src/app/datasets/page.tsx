"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { DataTable } from "@/components/data-table";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { Badge, Button, EmptyState, ErrorNotice, FilterChip, Panel, SearchInput, Skeleton } from "@/components/ui";
import { useApi, useRefreshSignal } from "@/lib/hooks";
import { formatDate, formatRelative, humanize } from "@/lib/format";
import type { Dataset, DatasetDetail, DatasetListResponse, Lineage } from "@/lib/types";

export default function DatasetsPage() {
  const datasets = useApi<DatasetListResponse>("/datasets?limit=200");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<DatasetDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [lineage, setLineage] = useState<{ upstream: number; downstream: number } | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus");
    if (focus) setSelectedId(focus);
  }, []);

  useEffect(() => {
    if (selectedId || !datasets.data?.items.length) return;
    if (new URLSearchParams(window.location.search).get("focus")) return;
    setSelectedId(datasets.data.items[0].id);
  }, [datasets.data, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setDetailLoading(true);
    setError("");
    setLineage(null);
    void Promise.all([
      api<DatasetDetail>(`/datasets/${selectedId}`),
      api<Lineage>(`/lineage/${selectedId}/upstream`).catch(() => null),
      api<Lineage>(`/lineage/${selectedId}/downstream`).catch(() => null),
    ])
      .then(([result, upstream, downstream]) => {
        if (!active) return;
        setDetail(result);
        setLineage({ upstream: upstream?.count ?? 0, downstream: downstream?.count ?? 0 });
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load dataset details");
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => { active = false; };
  }, [selectedId]);

  useRefreshSignal(() => datasets.reload(), [datasets.reload]);

  const list = datasets.data?.items ?? [];
  const types = useMemo(() => Array.from(new Set(list.map(item => item.asset_type))).sort(), [list]);

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return list.filter(dataset => {
      if (typeFilter && dataset.asset_type !== typeFilter) return false;
      if (tokens.length && !tokens.every(token => `${dataset.fully_qualified_name} ${dataset.description} ${dataset.tags?.join(" ")}`.toLowerCase().includes(token))) return false;
      return true;
    });
  }, [list, query, typeFilter]);

  const selectedSummary = list.find(dataset => dataset.id === selectedId) ?? null;
  const staleCount = list.filter(dataset => dataset.last_seen_at && Date.now() - new Date(dataset.last_seen_at).valueOf() > 7 * 86_400_000).length;

  return (
    <AppShell title="Datasets" eyebrow="Understand">
      <PageHeading
        eyebrow={`Catalog · ${list.length} assets`}
        title="Dataset catalog"
        description="Tenant-scoped assets with schema versions, descriptions, and tags."
        actions={<Button variant="secondary" icon="refresh" onClick={datasets.reload}>Refresh</Button>}
      />

      {datasets.error && <div className="mb-4"><ErrorNotice message={datasets.error} onRetry={datasets.reload} /></div>}

      <div className="catalog-layout">
        <Panel flush className="min-w-0">
          <div className="table-toolbar">
            <SearchInput value={query} onChange={setQuery} placeholder="Search assets, tags, descriptions…" className="w-full sm:w-[260px]" aria-label="Search datasets" />
            <FilterChip active={!typeFilter} onClick={() => setTypeFilter("")}>All types</FilterChip>
            {types.map(type => (
              <FilterChip key={type} active={typeFilter === type} onClick={() => setTypeFilter(typeFilter === type ? "" : type)} count={list.filter(item => item.asset_type === type).length}>
                {humanize(type)}
              </FilterChip>
            ))}
            <span className="toolbar-spacer" />
            {staleCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--warning-text)]">
                <Icon name="clock" size={13} /> {staleCount} stale
              </span>
            )}
          </div>
          <div className="px-4 py-3">
            <DataTable
              rows={filtered}
              loading={datasets.loading}
              empty={list.length ? "No assets match these filters" : "No datasets registered"}
              emptyCopy={list.length ? "Try a different search term or asset type." : "Import a dbt manifest from Connectors to populate the catalog."}
              caption="Tracked data assets"
              getRowKey={row => row.id}
              onRowClick={row => setSelectedId(row.id)}
              columns={[
                {
                  key: "fully_qualified_name",
                  label: "Dataset",
                  render: (row: Dataset) => (
                    <div className="min-w-[200px]">
                      <span className={`row-link mono ${row.id === selectedId ? "!text-[var(--accent-text)]" : ""}`}>{row.fully_qualified_name}</span>
                      {(row.tags?.length ?? 0) > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {row.tags.slice(0, 3).map(tag => <span key={tag} className="tag">{tag}</span>)}
                        </div>
                      )}
                    </div>
                  ),
                },
                { key: "asset_type", label: "Type", render: row => <Badge outline size="sm">{humanize(row.asset_type)}</Badge>, width: "110px" },
                { key: "description", label: "Description", render: row => <span className="line-clamp-1 text-xs text-[var(--text-muted)]">{row.description || "—"}</span> },
                { key: "last_seen_at", label: "Last seen", render: row => <span className="whitespace-nowrap text-xs text-[var(--text-muted)]">{row.last_seen_at ? formatRelative(row.last_seen_at) : "Never"}</span>, width: "120px" },
              ]}
            />
          </div>
        </Panel>

        <div className="section-stack">
          {error && <ErrorNotice message={error} />}

          {!selectedId ? (
            <Panel title="Asset inspector" icon="datasets" note="Select an asset from the catalog">
              <EmptyState icon="datasets" title="Nothing selected" copy="Choose a dataset to inspect its schema, versions, and lineage footprint." />
            </Panel>
          ) : detailLoading && !detail ? (
            <Panel title="Asset inspector" icon="datasets" note="Loading schema and lineage…">
              <div className="grid gap-3"><Skeleton height={20} /><Skeleton height={120} /><Skeleton height={80} /></div>
            </Panel>
          ) : detail ? (
            <>
              <Panel
                title={<span className="mono">{detail.fully_qualified_name}</span>}
                icon="datasets"
                note={selectedSummary?.description || detail.description || "No description provided."}
                action={<Badge outline size="sm">{humanize(detail.asset_type)}</Badge>}
              >
                <div className="grid gap-3">
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="Columns" value={String(detail.columns.length)} />
                    <Metric label="Upstream" value={String(lineage?.upstream ?? "—")} />
                    <Metric label="Downstream" value={String(lineage?.downstream ?? "—")} />
                  </div>
                  {(detail.tags?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {detail.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/lineage?focus=${detail.id}`} className="btn btn-secondary btn-sm">
                      <Icon name="lineage" size={13} /> Open in lineage
                    </Link>
                    <Link href={`/quality?dataset=${detail.id}`} className="btn btn-ghost btn-sm">
                      <Icon name="quality" size={13} /> Quality checks
                    </Link>
                  </div>
                </div>
              </Panel>

              <Panel title="Schema" icon="list" note={`${detail.columns.length} column${detail.columns.length === 1 ? "" : "s"} · current definition`} flush>
                <div className="table-wrap">
                  <table className="table table-compact schema-table" style={{ minWidth: 0 }}>
                    <thead>
                      <tr><th scope="col">Column</th><th scope="col">Type</th><th scope="col" className="col-right">Nullable</th></tr>
                    </thead>
                    <tbody>
                      {detail.columns.map(column => (
                        <tr key={column.name}>
                          <td className="cell-mono cell-strong">{column.name}</td>
                          <td className="cell-mono">{column.type}</td>
                          <td className="col-right">
                            {column.nullable ? <span className="text-[var(--text-faint)]">Yes</span> : <span className="badge badge-neutral badge-sm">Required</span>}
                          </td>
                        </tr>
                      ))}
                      {!detail.columns.length && (
                        <tr><td colSpan={3}><p className="py-4 text-center text-xs text-[var(--text-faint)]">No column metadata recorded.</p></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="Schema history" icon="history" note={`${detail.schema_versions.length} recent version(s)`}>
                {detail.schema_versions.length ? (
                  <div>
                    {detail.schema_versions.map(version => (
                      <div className="version-item" key={version.version}>
                        <span className="flex items-center gap-2.5">
                          <span className="version-tag">v{version.version}</span>
                          <span className="text-xs text-[var(--text-muted)]">{Array.isArray(version.columns) ? `${version.columns.length} column(s) captured` : "snapshot captured"}</span>
                        </span>
                        <span className="text-[10px] text-[var(--text-faint)]">{formatDate(version.created_at)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-faint)]">No recorded schema versions for this asset.</p>
                )}
              </Panel>
            </>
          ) : (
            <Panel title="Asset inspector" icon="datasets" note="The asset could not be loaded">
              <EmptyState icon="alertCircle" title="Dataset unavailable" copy="The asset may have been removed or you may not have access." />
            </Panel>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-subtle p-3 text-center">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-faint)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[var(--text)]">{value}</p>
    </div>
  );
}
