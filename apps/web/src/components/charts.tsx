"use client";

import { useId, useMemo, useState } from "react";
import { classNames } from "@/lib/format";

type Point = { label: string; value: number };

function buildPath(values: number[], width: number, height: number, pad = 2): { line: string; area: string } {
  if (!values.length) return { line: "", area: "" };
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const points = values.map((value, index) => ({
    x: pad + index * stepX,
    y: pad + (height - pad * 2) * (1 - (value - min) / span),
  }));

  let line = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const midX = (previous.x + current.x) / 2;
    line += ` C ${midX} ${previous.y}, ${midX} ${current.y}, ${current.x} ${current.y}`;
  }
  const area = `${line} L ${points[points.length - 1].x} ${height - pad} L ${points[0].x} ${height - pad} Z`;
  return { line, area };
}

export function Sparkline({
  values,
  width = 120,
  height = 32,
  color = "var(--accent)",
  fill = true,
  className = "",
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  className?: string;
}) {
  const gradientId = useId();
  const safeValues = values.length ? values : [0, 0];
  const { line, area } = useMemo(() => buildPath(safeValues, width, height, 3), [safeValues, width, height]);

  return (
    <svg className={classNames("sparkline", className)} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-hidden="true">
      {fill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.5" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="sparkline-area" d={area} fill={`url(#${gradientId})`} />
        </>
      )}
      <path className="sparkline-path" d={line} stroke={color} strokeWidth={1.6} />
    </svg>
  );
}

export function AreaChart({
  data,
  height = 200,
  color = "var(--accent)",
  yTicks = 4,
  valueFormatter = (value: number) => String(value),
  className = "",
}: {
  data: Point[];
  height?: number;
  color?: string;
  yTicks?: number;
  valueFormatter?: (value: number) => string;
  className?: string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<{ x: number; y: number; point: Point } | null>(null);
  const width = 640;
  const padLeft = 40;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 26;

  const values = data.map(point => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;
  const stepX = data.length > 1 ? innerWidth / (data.length - 1) : 0;

  const coordinates = data.map((point, index) => ({
    x: padLeft + index * stepX,
    y: padTop + innerHeight * (1 - (point.value - min) / span),
    point,
  }));

  let line = "";
  if (coordinates.length) {
    line = `M ${coordinates[0].x} ${coordinates[0].y}`;
    for (let index = 1; index < coordinates.length; index += 1) {
      const previous = coordinates[index - 1];
      const current = coordinates[index];
      const midX = (previous.x + current.x) / 2;
      line += ` C ${midX} ${previous.y}, ${midX} ${current.y}, ${current.x} ${current.y}`;
    }
  }
  const area = coordinates.length ? `${line} L ${coordinates[coordinates.length - 1].x} ${padTop + innerHeight} L ${coordinates[0].x} ${padTop + innerHeight} Z` : "";

  const tickValues = Array.from({ length: yTicks + 1 }, (_, index) => min + (span * index) / yTicks);
  const formattedTicks = tickValues.map(tick => valueFormatter(Math.round(tick)));

  return (
    <div className={classNames("relative", className)}>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend chart" preserveAspectRatio="none" style={{ height }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="chart-grid">
          {tickValues.map((tick, index) => {
            const y = padTop + innerHeight * (1 - (tick - min) / span);
            return <line key={index} x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="var(--border-soft)" />;
          })}
        </g>
        {tickValues.map((tick, index) => {
          const y = padTop + innerHeight * (1 - (tick - min) / span);
          const label = formattedTicks[index];
          if (label === formattedTicks[index - 1]) return null;
          return (
            <text key={index} className="chart-axis" x={padLeft - 8} y={y + 3} textAnchor="end">
              {label}
            </text>
          );
        })}
        {area && <path d={area} fill={`url(#${gradientId})`} />}
        {line && <path className="chart-line" d={line} stroke={color} strokeWidth={2} />}
        {coordinates.map((coordinate, index) => (
          <g key={index}>
            <rect
              x={coordinate.x - stepX / 2}
              y={0}
              width={Math.max(stepX, 20)}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHover(coordinate)}
              onMouseLeave={() => setHover(null)}
            />
            {hover?.point.label === coordinate.point.label && (
              <circle className="chart-dot" cx={coordinate.x} cy={coordinate.y} r={4} fill={color} />
            )}
          </g>
        ))}
        {data.map((point, index) => {
          const x = padLeft + index * stepX;
          const showEvery = Math.ceil(data.length / 6);
          if (index % showEvery !== 0 && index !== data.length - 1) return null;
          return (
            <text key={index} className="chart-axis" x={x} y={height - 8} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}>
              {point.label}
            </text>
          );
        })}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] shadow-[var(--shadow-md)]"
          style={{ left: `${(hover.x / width) * 100}%`, top: 0 }}
        >
          <span className="font-mono text-[var(--text-faint)]">{hover.point.label}</span> · {valueFormatter(hover.point.value)}
        </div>
      )}
    </div>
  );
}

export function BarChart({
  data,
  height = 180,
  color = "var(--accent)",
  valueFormatter = (value: number) => String(value),
}: {
  data: Point[];
  height?: number;
  color?: string;
  valueFormatter?: (value: number) => string;
}) {
  const width = 640;
  const padLeft = 40;
  const padBottom = 24;
  const padTop = 10;
  const innerWidth = width - padLeft - 12;
  const innerHeight = height - padTop - padBottom;
  const max = Math.max(...data.map(point => point.value), 1);
  const slot = innerWidth / Math.max(data.length, 1);
  const barWidth = Math.max(6, Math.min(slot - 8, 40));

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bar chart" style={{ height }}>
      <line x1={padLeft} x2={width - 12} y1={padTop + innerHeight} y2={padTop + innerHeight} stroke="var(--border)" />
      {[0, 0.5, 1].map(ratio => {
        const y = padTop + innerHeight * (1 - ratio);
        return (
          <g key={ratio}>
            <line className="chart-grid" x1={padLeft} x2={width - 12} y1={y} y2={y} stroke="var(--border-soft)" />
            <text className="chart-axis" x={padLeft - 8} y={y + 3} textAnchor="end">{valueFormatter(Math.round(max * ratio))}</text>
          </g>
        );
      })}
      {data.map((point, index) => {
        const barHeight = (point.value / max) * innerHeight;
        const x = padLeft + index * slot + (slot - barWidth) / 2;
        const y = padTop + innerHeight - barHeight;
        return (
          <g key={index}>
            <rect className="chart-bar" x={x} y={y} width={barWidth} height={Math.max(barHeight, 2)} rx={3} fill={color} />
            <text className="chart-axis" x={x + barWidth / 2} y={height - 7} textAnchor="middle">{point.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function DonutChart({
  data,
  size = 128,
  thickness = 14,
  centerLabel,
  centerValue,
}: {
  data: Array<{ label: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution chart">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-inset)" strokeWidth={thickness} />
        {data.map(item => {
          const fraction = item.value / total;
          const dash = fraction * circumference;
          const segment = (
            <circle
              key={item.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += dash;
          return segment;
        })}
        {(centerValue || centerLabel) && (
          <>
            <text x="50%" y="46%" textAnchor="middle" dominantBaseline="central" fill="var(--text)" fontSize={size * 0.19} fontWeight="680" fontFamily="var(--font-sans)">
              {centerValue}
            </text>
            <text x="50%" y="62%" textAnchor="middle" dominantBaseline="central" fill="var(--text-secondary)" fontSize={size * 0.09} fontWeight="600" letterSpacing="0.06em" fontFamily="var(--font-sans)">
              {centerLabel?.toUpperCase()}
            </text>
          </>
        )}
      </svg>
      <div className="grid gap-2">
        {data.map(item => (
          <div key={item.label} className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="legend-swatch" style={{ background: item.color }} />
            <span className="min-w-[72px]">{item.label}</span>
            <span className="font-mono text-[var(--text-secondary)]">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MiniBars({ results }: { results: Array<{ passed: boolean; anomaly: boolean }> }) {
  if (!results.length) return <span className="text-xs text-[var(--text-faint)]">No runs yet</span>;
  const max = Math.max(results.length, 1);
  return (
    <div className="mini-bars" aria-label={`${results.length} recent runs`}>
      {results
        .slice()
        .reverse()
        .map((result, index) => (
          <span
            key={index}
            className="mini-bar"
            data-state={!result.passed ? "fail" : result.anomaly ? "anomaly" : "pass"}
            style={{ height: `${Math.max(20, 100 - (index / max) * 60)}%` }}
            title={!result.passed ? "Failed" : result.anomaly ? "Anomaly" : "Passed"}
          />
        ))}
    </div>
  );
}

export function Gauge({ value, label, size = 150 }: { value: number; label: string; size?: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - 18) / 2;
  const circumference = Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const tone = clamped >= 99 ? "var(--success)" : clamped >= 95 ? "var(--warning)" : clamped > 0 ? "var(--danger)" : "var(--text-faint)";

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`} role="img" aria-label={`${label}: ${clamped}%`}>
        <path
          d={`M 9 ${size / 2 + 4} A ${radius} ${radius} 0 0 1 ${size - 9} ${size / 2 + 4}`}
          fill="none"
          stroke="var(--surface-inset)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <path
          d={`M 9 ${size / 2 + 4} A ${radius} ${radius} 0 0 1 ${size - 9} ${size / 2 + 4}`}
          fill="none"
          stroke={tone}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 320ms var(--ease-out)" }}
        />
        <text x="50%" y={size / 2 - 6} textAnchor="middle" fill="var(--text)" fontSize={size * 0.17} fontWeight="680" fontFamily="var(--font-sans)">
          {clamped.toFixed(clamped % 1 === 0 ? 0 : 1)}%
        </text>
      </svg>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">{label}</span>
    </div>
  );
}
