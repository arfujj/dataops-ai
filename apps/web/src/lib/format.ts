export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function formatDate(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function formatRelative(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return "—";
  const deltaSeconds = Math.round((date.valueOf() - Date.now()) / 1000);
  const abs = Math.abs(deltaSeconds);
  if (abs < 45) return "just now";
  if (abs < 90) return relative.format(Math.round(deltaSeconds / 60), "minute");
  if (abs < 3600) return relative.format(Math.round(deltaSeconds / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(deltaSeconds / 3600), "hour");
  if (abs < 604800) return relative.format(Math.round(deltaSeconds / 86400), "day");
  if (abs < 2592000) return relative.format(Math.round(deltaSeconds / 604800), "week");
  return formatDate(date.toISOString());
}

export function formatDuration(ms?: number | null): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m ${remainder}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatDurationBetween(start?: string | null, end?: string | null): string {
  const from = parseDate(start);
  const to = parseDate(end);
  if (!from || !to) return "—";
  return formatDuration(to.valueOf() - from.valueOf());
}

export function formatNumber(value?: number | null, options?: Intl.NumberFormatOptions): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(undefined, options).format(value);
}

export function formatCompact(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (Math.abs(value) < 1000) return String(value);
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value?: number | null, fractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(fractionDigits)}%`;
}

export function humanize(value?: string | null): string {
  if (!value) return "—";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase());
}

export function initials(value?: string | null): string {
  if (!value) return "?";
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map(part => part.slice(0, 1).toUpperCase()).join("") || "?";
}

export function truncateId(value?: string | null, length = 8): string {
  if (!value) return "—";
  return value.length > length ? value.slice(0, length) : value;
}

export function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export function statusTone(value?: string | null): Tone {
  const token = (value ?? "").toLowerCase().replace(/[_-]+/g, " ");
  if (!token) return "neutral";
  if (/(critical|failed|failure|breaking|error|rejected|unhealthy|blocked|outage|breach|down)/.test(token)) return "danger";
  if (/(high|warning|investigating|anomaly|anomalous|pending|queued|proposed|degraded|stale|delayed|partial)/.test(token)) return "warning";
  if (/(healthy|passed|pass|connected|validated|succeeded|success|resolved|closed|complete|completed|active|running|approved|live|working|ok)/.test(token)) return "success";
  if (/(medium|info|root cause|production|admin|engineer|viewer|analyst)/.test(token)) return "info";
  return "neutral";
}

export function runStateTone(value?: string | null): "success" | "failed" | "running" | "neutral" {
  const token = (value ?? "").toLowerCase();
  if (/(success|passed|complete|succeeded|healthy|working)/.test(token)) return "success";
  if (/(fail|error|reject|cancel|blocked)/.test(token)) return "failed";
  if (/(run|progress|queue|pending|starting)/.test(token)) return "running";
  return "neutral";
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
