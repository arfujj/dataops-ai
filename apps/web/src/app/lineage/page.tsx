"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { Icon } from "@/components/icons";
import { api } from "@/lib/api";
import { Badge, Button, EmptyState, ErrorNotice, Panel, SegmentedControl, Skeleton } from "@/components/ui";
import { useApi, useRefreshSignal } from "@/lib/hooks";
import { humanize } from "@/lib/format";
import type { DatasetListResponse, Lineage, LineageAsset } from "@/lib/types";

const NODE_WIDTH = 236;
const NODE_HEIGHT = 68;
const COLUMN_GAP = 76;
const ROW_GAP = 14;
const MAX_PER_COLUMN = 7;

type PlacedNode = {
  key: string;
  name: string;
  assetType: string;
  depth: number;
  column: number;
  x: number;
  y: number;
  isFocus: boolean;
  path: string[];
  hiddenCount?: number;
};

type Edge = { id: string; x1: number; y1: number; x2: number; y2: number };

export default function LineagePage() {
  const datasets = useApi<DatasetListResponse>("/datasets?limit=200");
  const [selectedId, setSelectedId] = useState("");
  const [upstream, setUpstream] = useState<LineageAsset[]>([]);
  const [downstream, setDownstream] = useState<LineageAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [depth, setDepth] = useState<"2" | "4" | "10">("4");
  const [zoom, setZoom] = useState(1);
  const [inspected, setInspected] = useState<PlacedNode | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus");
    if (focus) setSelectedId(focus);
  }, []);

  useEffect(() => {
    if (!selectedId && datasets.data?.items.length) setSelectedId(datasets.data.items[0].id);
  }, [datasets.data, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setLoading(true);
    setError("");
    setUpstream([]);
    setDownstream([]);
    void Promise.all([
      api<Lineage>(`/lineage/${selectedId}/upstream?max_depth=${depth}`),
      api<Lineage>(`/lineage/${selectedId}/downstream?max_depth=${depth}`),
    ])
      .then(([up, down]) => {
        if (!active) return;
        setUpstream(up.assets);
        setDownstream(down.assets);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load lineage");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [selectedId, depth]);

  useRefreshSignal(() => datasets.reload(), [datasets.reload]);

  const datasetList = datasets.data?.items ?? [];
  const focusDataset = datasetList.find(dataset => dataset.id === selectedId);

  const layout = useMemo(() => {
    if (!focusDataset) return { nodes: [] as PlacedNode[], edges: [] as Edge[], width: 0, height: 0 };

    const maxUp = Math.max(0, ...upstream.map(asset => asset.depth));
    const maxDown = Math.max(0, ...downstream.map(asset => asset.depth));
    const focusColumn = maxUp;

    const nodeKeys = new Map<string, string>();
    const nodes: PlacedNode[] = [];
    const columns: PlacedNode[][] = Array.from({ length: maxUp + 1 + maxDown }, () => []);
    const seenKeys = new Set<string>([focusDataset.id]);

    function place(asset: LineageAsset, column: number, isFocus = false) {
      const key = asset.dataset_id;
      if (!isFocus && seenKeys.has(key)) return;
      if (columns[column] === undefined) return;
      seenKeys.add(key);
      nodeKeys.set(asset.name, key);
      columns[column].push({
        key,
        name: asset.name,
        assetType: asset.asset_type,
        depth: asset.depth,
        column,
        x: 0,
        y: 0,
        isFocus,
        path: asset.path,
      });
    }

    for (const asset of upstream) place(asset, focusColumn - asset.depth);
    columns[focusColumn].push({
      key: focusDataset.id,
      name: focusDataset.fully_qualified_name,
      assetType: focusDataset.asset_type,
      depth: 0,
      column: focusColumn,
      x: 0,
      y: 0,
      isFocus: true,
      path: [focusDataset.fully_qualified_name],
    });
    for (const asset of downstream) place(asset, focusColumn + asset.depth);

    const maxRows = Math.max(...columns.map(column => Math.min(column.length, MAX_PER_COLUMN)), 1);
    const totalHeight = maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP + 48;

    columns.forEach((columnNodes, columnIndex) => {
      const visible = columnNodes.slice(0, MAX_PER_COLUMN);
      const startY = (totalHeight - (visible.length * NODE_HEIGHT + (visible.length - 1) * ROW_GAP)) / 2;
      visible.forEach((node, rowIndex) => {
        node.x = columnIndex * (NODE_WIDTH + COLUMN_GAP);
        node.y = startY + rowIndex * (NODE_HEIGHT + ROW_GAP);
        nodes.push(node);
      });
      if (columnNodes.length > MAX_PER_COLUMN) {
        const last = visible[visible.length - 1];
        nodes.push({
          key: `overflow-${columnIndex}`,
          name: `+${columnNodes.length - MAX_PER_COLUMN} more asset(s)`,
          assetType: "overflow",
          depth: 0,
          column: columnIndex,
          x: last.x,
          y: last.y + NODE_HEIGHT + ROW_GAP,
          isFocus: false,
          path: [],
        });
      }
    });

    const byKey = new Map(nodes.map(node => [node.key, node]));
    const edges: Edge[] = [];
    const pushEdge = (parentName: string, childName: string, direction: "up" | "down") => {
      const parentKey = childName === focusDataset.fully_qualified_name ? focusDataset.id : nodeKeys.get(parentName);
      const childKey = childName === focusDataset.fully_qualified_name ? focusDataset.id : nodeKeys.get(childName);
      const parent = parentKey ? byKey.get(parentKey) : undefined;
      const child = childKey ? byKey.get(childKey) : undefined;
      if (!parent || !child) return;
      const edge: Edge = direction === "down"
        ? { id: `${parent.key}->${child.key}`, x1: parent.x + NODE_WIDTH, y1: parent.y + NODE_HEIGHT / 2, x2: child.x, y2: child.y + NODE_HEIGHT / 2 }
        : { id: `${child.key}->${parent.key}`, x1: parent.x, y1: parent.y + NODE_HEIGHT / 2, x2: child.x + NODE_WIDTH, y2: child.y + NODE_HEIGHT / 2 };
      if (edges.some(existing => existing.id === edge.id)) return;
      edges.push(edge);
    };

    for (const asset of upstream) {
      if (asset.path.length >= 2) pushEdge(asset.path[asset.path.length - 2], asset.name, "up");
    }
    for (const asset of downstream) {
      if (asset.path.length >= 2) pushEdge(asset.path[asset.path.length - 2], asset.name, "down");
    }

    const width = (maxUp + 1 + maxDown) * NODE_WIDTH + (maxUp + maxDown) * COLUMN_GAP;
    return { nodes, edges, width, height: totalHeight };
  }, [focusDataset, upstream, downstream]);

  function focusOn(id: string) {
    setSelectedId(id);
    setInspected(null);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout.nodes.length) return;
    const fit = Math.min(1, Math.max(0.6, (canvas.clientWidth - 72) / Math.max(layout.width, 1)));
    const rounded = Math.round(fit * 10) / 10;
    if (rounded < 1) setZoom(rounded);
    const focusNode = layout.nodes.find(node => node.isFocus);
    if (!focusNode) return;
    const scaledX = focusNode.x * rounded;
    const scaledY = focusNode.y * rounded;
    canvas.scrollTo({
      left: Math.max(0, scaledX + (NODE_WIDTH * rounded) / 2 - canvas.clientWidth / 2),
      top: Math.max(0, scaledY + (NODE_HEIGHT * rounded) / 2 - canvas.clientHeight / 2),
      behavior: "smooth",
    });
  }, [selectedId, layout.width]);

  return (
    <AppShell title="Lineage" eyebrow="Understand">
      <PageHeading
        eyebrow="Dependency map · max depth 10"
        title="Lineage explorer"
        description="Trace upstream dependencies and understand downstream impact across your data assets."
        actions={
          <>
            <SegmentedControl
              value={depth}
              onChange={setDepth}
              options={[
                { value: "2", label: "Depth 2" },
                { value: "4", label: "Depth 4" },
                { value: "10", label: "Depth 10" },
              ]}
            />
            <select className="select w-[240px]" value={selectedId} onChange={event => focusOn(event.target.value)} aria-label="Focus dataset">
              {datasetList.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.fully_qualified_name}</option>)}
            </select>
          </>
        }
      />

      {error && <div className="mb-4"><ErrorNotice message={error} /></div>}

      <section className="grid-4">
        <div className="stat">
          <div className="stat-top"><span className="stat-label">Upstream</span><span className="stat-icon"><Icon name="gitBranch" size={16} /></span></div>
          <p className="stat-value">{loading ? <Skeleton width={40} height={30} /> : upstream.length}</p>
          <div className="stat-foot"><span className="stat-note">Direct and transitive sources</span></div>
        </div>
        <div className="stat">
          <div className="stat-top"><span className="stat-label">Downstream</span><span className="stat-icon"><Icon name="lineage" size={16} /></span></div>
          <p className="stat-value">{loading ? <Skeleton width={40} height={30} /> : downstream.length}</p>
          <div className="stat-foot"><span className="stat-note">Assets in the blast radius</span></div>
        </div>
        <div className="stat">
          <div className="stat-top"><span className="stat-label">Max depth seen</span><span className="stat-icon"><Icon name="layers" size={16} /></span></div>
          <p className="stat-value">{loading ? <Skeleton width={40} height={30} /> : Math.max(0, ...upstream.map(asset => asset.depth), ...downstream.map(asset => asset.depth))}</p>
          <div className="stat-foot"><span className="stat-note">Server traversal cap: depth 10 · 500 nodes</span></div>
        </div>
        <div className="stat">
          <div className="stat-top"><span className="stat-label">Asset type</span><span className="stat-icon"><Icon name="box" size={16} /></span></div>
          <p className="stat-value !text-lg">{focusDataset ? humanize(focusDataset.asset_type) : "—"}</p>
          <div className="stat-foot"><span className="stat-note">{focusDataset?.fully_qualified_name ?? "Select an asset"}</span></div>
        </div>
      </section>

      <div className="mt-4">
        <Panel
          flush
          title={focusDataset?.fully_qualified_name ?? "Lineage graph"}
          icon="lineage"
          note={loading ? "Loading graph…" : `${upstream.length} upstream · ${downstream.length} downstream · traversal tree rendered`}
          action={
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="iconSm" onClick={() => setZoom(value => Math.max(0.6, Number((value - 0.1).toFixed(1))))} aria-label="Zoom out">−</Button>
              <Button variant="ghost" size="iconSm" onClick={() => setZoom(1)} aria-label="Reset zoom" title="Reset zoom">{Math.round(zoom * 100)}%</Button>
              <Button variant="ghost" size="iconSm" onClick={() => setZoom(value => Math.min(1.4, Number((value + 0.1).toFixed(1))))} aria-label="Zoom in">+</Button>
            </div>
          }
        >
          {loading ? (
            <div className="grid gap-4 p-5"><Skeleton height={54} /><Skeleton height={54} /><Skeleton height={54} /></div>
          ) : !focusDataset ? (
            <EmptyState icon="datasets" title="No assets available" copy="Connect a metadata source or import a dbt manifest to explore lineage." />
          ) : !upstream.length && !downstream.length ? (
            <EmptyState
              icon="lineage"
              title="No dependencies recorded"
              copy="This asset is currently isolated. Lineage edges appear after dbt imports or schema events connect assets."
              actions={<Link href="/connectors" className="btn btn-secondary btn-sm"><Icon name="upload" size={13} /> Import dbt manifest</Link>}
            />
          ) : (
            <div className="relative">
              <div ref={canvasRef} className="lineage-canvas" style={{ maxHeight: 520 }}>
                <div
                  style={{
                    position: "relative",
                    width: layout.width || 600,
                    height: layout.height || 300,
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                    transition: "transform 180ms var(--ease-out)",
                    margin: 24,
                  }}
                >
                  <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true">
                    {layout.edges.map(edge => {
                      const direction = edge.x2 > edge.x1 ? 1 : -1;
                      const curve = Math.max(28, Math.abs(edge.x2 - edge.x1) * 0.42);
                      const path = edge.x2 > edge.x1
                        ? `M ${edge.x1} ${edge.y1} C ${edge.x1 + curve} ${edge.y1}, ${edge.x2 - curve} ${edge.y2}, ${edge.x2} ${edge.y2}`
                        : `M ${edge.x1} ${edge.y1} C ${edge.x1 - curve} ${edge.y1}, ${edge.x2 + curve} ${edge.y2}, ${edge.x2} ${edge.y2}`;
                      return (
                        <path
                          key={edge.id}
                          d={path}
                          fill="none"
                          stroke="var(--border-strong)"
                          strokeWidth={1.4}
                          markerEnd={direction > 0 ? "url(#arrow-right)" : "url(#arrow-left)"}
                        />
                      );
                    })}
                    <defs>
                      <marker id="arrow-right" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-faint)" />
                      </marker>
                      <marker id="arrow-left" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-faint)" />
                      </marker>
                    </defs>
                  </svg>

                  {layout.nodes.map(node => {
                    if (node.assetType === "overflow") {
                      return (
                        <div key={node.key} style={{ position: "absolute", left: node.x, top: node.y, width: NODE_WIDTH }} className="text-center text-[10px] text-[var(--text-faint)]">
                          {node.name}
                        </div>
                      );
                    }
                    const active = inspected?.key === node.key;
                    return (
                      <button
                        key={node.key}
                        onClick={() => (node.isFocus ? setInspected(node) : focusOn(node.key))}
                        onMouseEnter={() => setInspected(node)}
                        className="lineage-node"
                        data-focus={node.isFocus || active}
                        style={{ position: "absolute", left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT, display: "flex", flexDirection: "column", justifyContent: "center" }}
                        title={`Focus ${node.name}`}
                      >
                        <span className="lineage-node-name truncate">{node.name}</span>
                        <span className="lineage-node-meta">
                          <Badge outline size="sm">{humanize(node.assetType)}</Badge>
                          <span className="lineage-node-depth">{node.isFocus ? "focus" : `depth ${node.depth}`}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-soft)] px-4 py-3">
                <div className="flex flex-wrap items-center gap-4 text-[10px] text-[var(--text-faint)]">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-[var(--accent)]" /> Focus asset</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] border border-[var(--border-strong)] bg-[var(--surface)]" /> Dependency</span>
                  <span className="inline-flex items-center gap-1.5"><Icon name="arrowRight" size={11} /> Direction of data flow</span>
                </div>
                <span className="text-[10px] text-[var(--text-faint)]">Click any node to re-focus the graph · Up to {MAX_PER_COLUMN} nodes per layer shown</span>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="Inspector" icon="target" note={inspected ? "Hover or select a node to inspect its traversal path" : "Hover a node to inspect its traversal path"}>
          {inspected ? (
            <div className="grid gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mono truncate text-sm font-medium text-[var(--text)]">{inspected.name}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-faint)]">{humanize(inspected.assetType)} · {inspected.isFocus ? "focus asset" : `depth ${inspected.depth}`}</p>
                </div>
                {!inspected.isFocus && <Button variant="secondary" size="sm" onClick={() => focusOn(inspected.key)}>Focus</Button>}
              </div>
              {inspected.path.length > 1 && (
                <div className="surface-subtle p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-faint)]">Traversal path</p>
                  <p className="mono mt-2 text-[10px] leading-6 text-[var(--text-muted)]">
                    {inspected.path.map((step, index) => (
                      <span key={`${step}-${index}`}>
                        {index > 0 && <span className="px-1 text-[var(--text-faint)]">→</span>}
                        <span className={step === inspected.name ? "text-[var(--accent-text)]" : undefined}>{step}</span>
                      </span>
                    ))}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Link href={`/datasets?focus=${inspected.key}`} className="btn btn-ghost btn-sm"><Icon name="datasets" size={13} /> Open in catalog</Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-2 text-xs leading-5 text-[var(--text-muted)]">
              <p className="m-0">The explorer renders the server-side breadth-first traversal as a layered dependency tree. Hovering a node reveals how the traversal reached it.</p>
              <p className="m-0">Depth is capped at 10 and each traversal returns at most 500 nodes. Cycles are skipped automatically, so upstream and downstream views stay safe even with circular dbt references.</p>
            </div>
          )}
        </Panel>

        <Panel title="Traversal contract" icon="shield" note="Server-side graph protections">
          <div className="grid gap-2.5">
            {[
              { label: "Tenant-scoped directed edges", note: "Lineage never crosses organization boundaries." },
              { label: "Cycle-safe breadth-first traversal", note: "Visited-set prevents circular references." },
              { label: "Maximum depth 10", note: "Requested depth is clamped server-side." },
              { label: "Maximum 500 result nodes", note: "Response size is bounded for UI stability." },
            ].map(item => (
              <div key={item.label} className="flex gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--success-soft)] text-[var(--success)]">
                  <Icon name="check" size={13} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">{item.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.note}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
