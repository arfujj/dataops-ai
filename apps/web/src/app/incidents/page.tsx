"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { DataTable, RecordLink } from "@/components/data-table";
import { Icon } from "@/components/icons";
import { Badge, Button, ErrorNotice, FilterChip, Menu, Panel, SearchInput, SegmentedControl, StatusBadge } from "@/components/ui";
import { useApi, useRefreshSignal } from "@/lib/hooks";
import { formatRelative, humanize } from "@/lib/format";
import type { Incident, IncidentListResponse } from "@/lib/types";

type StatusView = "all" | "open" | "investigating" | "remediated" | "resolved";

const statusViews: Array<{ value: StatusView; label: string; statuses: string[] }> = [
  { value: "all", label: "All", statuses: [] },
  { value: "open", label: "Open", statuses: ["OPEN"] },
  { value: "investigating", label: "Investigating", statuses: ["INVESTIGATING", "ROOT_CAUSE_IDENTIFIED"] },
  { value: "remediated", label: "Remediation", statuses: ["REMEDIATION_PROPOSED"] },
  { value: "resolved", label: "Resolved", statuses: ["RESOLVED", "CLOSED"] },
];

const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const PAGE_SIZE = 12;

export default function IncidentsPage() {
  const { data, loading, error, reload } = useApi<IncidentListResponse>("/incidents?limit=100");
  const [statusView, setStatusView] = useState<StatusView>("all");
  const [severity, setSeverity] = useState<string>("");
  const [query, setQuery] = useState("");
  const [environment, setEnvironment] = useState("");
  const [since, setSince] = useState("");
  const [page, setPage] = useState(1);

  useRefreshSignal(reload, [reload]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialStatus = params.get("status");
    if (initialStatus && statusViews.some(view => view.value === initialStatus)) setStatusView(initialStatus as StatusView);
    const initialSeverity = params.get("severity");
    if (initialSeverity) setSeverity(initialSeverity.toUpperCase());
    const initialEnvironment = params.get("environment");
    if (initialEnvironment) setEnvironment(initialEnvironment);
  }, []);

  const incidents = data?.items ?? [];
  const total = data?.total ?? 0;

  const environments = useMemo(() => Array.from(new Set(incidents.map(item => item.environment).filter(Boolean))).sort(), [incidents]);

  const counts = useMemo(() => {
    const map = new Map<StatusView, number>();
    for (const view of statusViews) {
      map.set(view.value, view.statuses.length ? incidents.filter(item => view.statuses.includes(item.status.toUpperCase())).length : incidents.length);
    }
    return map;
  }, [incidents]);

  const filtered = useMemo(() => {
    const view = statusViews.find(item => item.value === statusView);
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return incidents.filter(incident => {
      if (view?.statuses.length && !view.statuses.includes(incident.status.toUpperCase())) return false;
      if (severity && incident.severity.toUpperCase() !== severity) return false;
      if (environment && incident.environment.toLowerCase() !== environment.toLowerCase()) return false;
      if (since && new Date(incident.opened_at).valueOf() < new Date(since).valueOf()) return false;
      if (tokens.length) {
        const haystack = `${incident.title} ${incident.entity_ref} ${incident.category} ${incident.environment} ${incident.description ?? ""}`.toLowerCase();
        if (!tokens.every(token => haystack.includes(token))) return false;
      }
      return true;
    });
  }, [incidents, statusView, severity, environment, since, query]);

  useEffect(() => {
    setPage(1);
  }, [statusView, severity, environment, since, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeFilterCount = [severity, environment, since].filter(Boolean).length + (statusView !== "all" ? 1 : 0) + (query ? 1 : 0);
  const criticalOpen = incidents.filter(item => item.severity.toUpperCase() === "CRITICAL" && !["RESOLVED", "CLOSED"].includes(item.status.toUpperCase())).length;

  function clearFilters() {
    setStatusView("all");
    setSeverity("");
    setEnvironment("");
    setSince("");
    setQuery("");
  }

  function exportCsv() {
    const header = ["id", "title", "severity", "status", "category", "environment", "entity_ref", "opened_at"];
    const rows = filtered.map(incident => header.map(key => `"${String((incident as unknown as Record<string, unknown>)[key] ?? "").replaceAll('"', '""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `incidents-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell title="Incidents" eyebrow="Monitor">
      <PageHeading
        eyebrow={`Response queue · ${total} total`}
        title="Incidents"
        description="Correlated pipeline, schema, quality, and connector failures across your environment."
        actions={
          <>
            <Button variant="secondary" icon="refresh" onClick={reload} aria-label="Refresh incidents">Refresh</Button>
            <Menu
              label="Export and views"
              items={[
                { type: "label", label: "Saved views" },
                { label: "All incidents", icon: "list", onSelect: () => { setStatusView("all"); setSeverity(""); } },
                { label: "Critical only", icon: "alertTriangle", onSelect: () => { setStatusView("open"); setSeverity("CRITICAL"); } },
                { label: "Awaiting investigation", icon: "search", onSelect: () => { setStatusView("open"); setSeverity(""); } },
                { label: "Recently resolved", icon: "checkCircle", onSelect: () => setStatusView("resolved") },
                { type: "separator" },
                { label: "Export filtered CSV", icon: "download", onSelect: exportCsv },
              ]}
              trigger={({ toggle }) => (
                <Button variant="secondary" icon="sliders" onClick={toggle}>Views</Button>
              )}
            />
          </>
        }
      />

      {error && <div className="mb-4"><ErrorNotice message={error} onRetry={reload} /></div>}

      {criticalOpen > 0 && (
        <div className="mb-4">
          <div className="notice notice-warning">
            <Icon name="alertTriangle" size={15} />
            <p className="flex-1"><strong>{criticalOpen} critical incident{criticalOpen === 1 ? "" : "s"}</strong> currently open. Escalate before downstream impact spreads.</p>
            <Button variant="warningSoft" size="sm" onClick={() => { setStatusView("open"); setSeverity("CRITICAL"); }}>Review critical</Button>
          </div>
        </div>
      )}

      <Panel flush className="overflow-hidden">
        <div className="table-toolbar">
          <SearchInput value={query} onChange={setQuery} placeholder="Search title, asset, category…" className="w-full sm:w-[280px]" aria-label="Search incidents" />
          <FilterChip active={!severity} onClick={() => setSeverity("")}>All severities</FilterChip>
          {severities.map(level => {
            const count = incidents.filter(item => item.severity.toUpperCase() === level).length;
            return (
              <FilterChip key={level} active={severity === level} onClick={() => setSeverity(severity === level ? "" : level)} count={count}>
                {humanize(level)}
              </FilterChip>
            );
          })}
          <span className="toolbar-spacer" />
          {environments.length > 1 && (
            <select className="select select-sm w-[150px]" value={environment} onChange={event => setEnvironment(event.target.value)} aria-label="Filter by environment">
              <option value="">All environments</option>
              {environments.map(item => <option key={item} value={item}>{humanize(item)}</option>)}
            </select>
          )}
          <input
            type="date"
            className="input input-sm w-[142px]"
            value={since}
            max={new Date().toISOString().slice(0, 10)}
            onChange={event => setSince(event.target.value)}
            aria-label="Opened since"
            title="Opened since"
          />
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" icon="filterX" onClick={clearFilters}>Clear</Button>
          )}
        </div>

        <div className="px-4 pt-3">
          <SegmentedControl
            value={statusView}
            onChange={setStatusView}
            options={statusViews.map(view => ({ value: view.value, label: view.label, count: counts.get(view.value) ?? 0 }))}
          />
        </div>

        <div className="px-4 py-3">
          <DataTable
            rows={pageItems}
            loading={loading}
            empty={activeFilterCount ? "No incidents match these filters" : "No incidents recorded"}
            emptyCopy={activeFilterCount ? "Clear one or more filters to widen the result set." : "Incidents are opened automatically when correlated telemetry crosses thresholds."}
            caption="Incident response queue"
            getRowKey={row => row.id}
            columns={[
              {
                key: "title",
                label: "Incident",
                render: (row: Incident) => (
                  <div className="min-w-[220px]">
                    <RecordLink href={`/incidents/${row.id}`}>{row.title}</RecordLink>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--text-faint)]">
                      <span className="font-mono">{row.entity_ref}</span>
                      <span>·</span>
                      <span>{humanize(row.category)}</span>
                    </div>
                  </div>
                ),
              },
              { key: "severity", label: "Severity", render: row => <StatusBadge value={row.severity} size="sm" />, width: "116px" },
              { key: "status", label: "Status", render: row => <StatusBadge value={row.status} size="sm" />, width: "156px" },
              { key: "environment", label: "Environment", render: row => <Badge outline size="sm">{row.environment}</Badge>, width: "128px" },
              { key: "opened_at", label: "Opened", render: row => <span className="whitespace-nowrap text-xs text-[var(--text-muted)]">{formatRelative(row.opened_at)}</span>, width: "120px" },
            ]}
          />
        </div>

        <div className="table-footer">
          <span>
            Showing <strong className="text-[var(--text-secondary)]">{pageItems.length}</strong> of <strong className="text-[var(--text-secondary)]">{filtered.length}</strong> matching · {total} total
          </span>
          <div className="pagination" role="navigation" aria-label="Pagination">
            <button onClick={() => setPage(1)} disabled={page === 1} aria-label="First page"><Icon name="chevronsLeft" size={13} /></button>
            <button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page === 1} aria-label="Previous page"><Icon name="chevronLeft" size={13} /></button>
            {Array.from({ length: pageCount }, (_, index) => index + 1)
              .filter(number => number === 1 || number === pageCount || Math.abs(number - page) <= 1)
              .map((number, index, list) => (
                <span key={number} className="flex items-center gap-1">
                  {index > 0 && number - list[index - 1] > 1 && <span className="px-0.5 text-[var(--text-faint)]">…</span>}
                  <button data-active={number === page} onClick={() => setPage(number)} aria-label={`Page ${number}`} aria-current={number === page ? "page" : undefined}>{number}</button>
                </span>
              ))}
            <button onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={page === pageCount} aria-label="Next page"><Icon name="chevronRight" size={13} /></button>
          </div>
        </div>
      </Panel>
    </AppShell>
  );
}
