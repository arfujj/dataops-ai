"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { humanize } from "@/lib/format";
import type { DatasetListResponse, IncidentListResponse, Incident, Dataset } from "@/lib/types";
import { Icon, type IconName } from "@/components/icons";
import { Kbd } from "@/components/ui";

type Command = {
  id: string;
  title: string;
  subtitle?: string;
  group: string;
  icon: IconName;
  shortcut?: string;
  run: () => void;
};

const NAV_COMMANDS: Array<{ href: string; title: string; icon: IconName; subtitle: string }> = [
  { href: "/dashboard", title: "Overview", icon: "overview", subtitle: "Reliability overview" },
  { href: "/incidents", title: "Incidents", icon: "incidents", subtitle: "Response queue" },
  { href: "/pipelines", title: "Pipelines", icon: "pipelines", subtitle: "Orchestration runs" },
  { href: "/quality", title: "Data quality", icon: "quality", subtitle: "Checks and anomalies" },
  { href: "/datasets", title: "Datasets", icon: "datasets", subtitle: "Catalog and schemas" },
  { href: "/lineage", title: "Lineage", icon: "lineage", subtitle: "Dependency explorer" },
  { href: "/connectors", title: "Connectors", icon: "connectors", subtitle: "Sources and integrations" },
  { href: "/settings", title: "Workspace settings", icon: "settings", subtitle: "Access, members, audit" },
];

export function CommandPalette({
  open,
  onClose,
  onToggleTheme,
  themeLabel,
  onSignOut,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  onToggleTheme: () => void;
  themeLabel: string;
  onSignOut: () => void;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || loaded) return;
    let active = true;
    void Promise.all([
      api<IncidentListResponse>("/incidents?limit=50").catch(() => null),
      api<DatasetListResponse>("/datasets?limit=200").catch(() => null),
    ]).then(([incidentResult, datasetResult]) => {
      if (!active) return;
      if (incidentResult) setIncidents(incidentResult.items);
      if (datasetResult) setDatasets(datasetResult.items);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [open, loaded]);

  const commands = useMemo<Command[]>(() => {
    const goto = (href: string) => () => {
      router.push(href);
      onClose();
    };
    const base: Command[] = NAV_COMMANDS.map(item => ({
      id: `nav:${item.href}`,
      title: item.title,
      subtitle: item.subtitle,
      group: "Navigate",
      icon: item.icon,
      shortcut: item.href === "/dashboard" ? "G D" : undefined,
      run: goto(item.href),
    }));

    const actions: Command[] = [
      { id: "action:theme", title: themeLabel, subtitle: "Appearance preference", group: "Actions", icon: "sun", run: () => { onToggleTheme(); onClose(); } },
      { id: "action:refresh", title: "Refresh current view", subtitle: "Reload data from the control plane", group: "Actions", icon: "refresh", run: () => { onRefresh?.(); onClose(); } },
      { id: "action:new-incident", title: "Emit demo incident", subtitle: "Command-line helper: make demo-incident", group: "Actions", icon: "rocket", run: onClose },
      { id: "action:signout", title: "Sign out", subtitle: "End this session", group: "Actions", icon: "logout", run: () => { onSignOut(); onClose(); } },
    ];

    const incidentCommands: Command[] = incidents.map(incident => ({
      id: `incident:${incident.id}`,
      title: incident.title,
      subtitle: `${humanize(incident.severity)} · ${humanize(incident.status)} · ${incident.entity_ref}`,
      group: "Incidents",
      icon: "incidents",
      run: goto(`/incidents/${incident.id}`),
    }));

    const datasetCommands: Command[] = datasets.map(dataset => ({
      id: `dataset:${dataset.id}`,
      title: dataset.fully_qualified_name,
      subtitle: humanize(dataset.asset_type),
      group: "Datasets",
      icon: "datasets",
      run: goto(`/datasets?focus=${dataset.id}`),
    }));

    return [...base, ...actions, ...incidentCommands, ...datasetCommands];
  }, [datasets, incidents, onClose, onRefresh, onSignOut, onToggleTheme, router, themeLabel]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return commands.filter(command => ["Navigate", "Actions"].includes(command.group));
    const tokens = trimmed.split(/\s+/);
    return commands
      .filter(command => {
        const haystack = `${command.title} ${command.subtitle ?? ""} ${command.group}`.toLowerCase();
        return tokens.every(token => haystack.includes(token));
      })
      .slice(0, 24);
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(index => Math.min(index, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  const groups = useMemo(() => {
    const map = new Map<string, Command[]>();
    for (const command of filtered) {
      const existing = map.get(command.group) ?? [];
      existing.push(command);
      map.set(command.group, existing);
    }
    return Array.from(map.entries());
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex(index => (index + 1) % Math.max(filtered.length, 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(index => (index - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1));
      }
      if (event.key === "Enter") {
        event.preventDefault();
        filtered[activeIndex]?.run();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, activeIndex, onClose]);

  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    element?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  let runningIndex = -1;

  return (
    <div
      className="command-overlay"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="command-panel" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="command-input-row">
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            className="command-input"
            placeholder="Search incidents, datasets, and actions…"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            aria-label="Search commands"
            autoComplete="off"
            spellCheck={false}
          />
          <Kbd>ESC</Kbd>
        </div>
        <div className="command-list" ref={listRef} role="listbox" aria-label="Command results">
          {!filtered.length && (
            <div className="command-empty">
              <p className="m-0">No matches for “{query}”.</p>
              <p className="mt-1 text-xs text-[var(--text-faint)]">Try a dataset name, incident title, or action.</p>
            </div>
          )}
          {groups.map(([group, items]) => (
            <div key={group}>
              <div className="command-group-label">{group}</div>
              {items.map(command => {
                runningIndex += 1;
                const index = runningIndex;
                return (
                  <button
                    key={command.id}
                    role="option"
                    aria-selected={activeIndex === index}
                    data-index={index}
                    data-active={activeIndex === index}
                    className="command-item"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => command.run()}
                  >
                    <Icon name={command.icon} size={16} />
                    <span className="command-item-copy">
                      <span className="command-item-title block">{command.title}</span>
                      {command.subtitle && <span className="command-item-meta block">{command.subtitle}</span>}
                    </span>
                    {command.shortcut && <Kbd>{command.shortcut}</Kbd>}
                    {activeIndex === index && <Icon name="arrowRight" size={14} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="command-footer">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span><Kbd>↵</Kbd> open</span>
          <span><Kbd>⌘</Kbd><Kbd>K</Kbd> toggle</span>
          {!loaded && <span className="ml-auto"><Icon name="refresh" size={11} className="animate-spin" /> indexing workspace</span>}
        </div>
      </div>
    </div>
  );
}
