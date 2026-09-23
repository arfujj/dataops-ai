"use client";

import Link from "next/link";
import { ReactNode, useMemo, useState } from "react";
import { display, formatDateTime } from "@/lib/format";
import { Icon } from "@/components/icons";
import { EmptyState, StatusBadge, TableSkeleton } from "@/components/ui";

export type Column<T> = {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  mono?: boolean;
  badge?: boolean;
  date?: boolean;
  width?: string;
  sortable?: boolean;
};

type SortState = { key: string; direction: "asc" | "desc" } | null;

function defaultValue<T>(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

export function DataTable<T extends Record<string, unknown>>({
  rows,
  columns,
  empty = "No records",
  emptyCopy,
  loading = false,
  caption,
  initialSort,
  getRowKey,
  onRowClick,
  compact = false,
}: {
  rows: T[];
  columns: Column<T>[];
  empty?: string;
  emptyCopy?: ReactNode;
  loading?: boolean;
  caption?: string;
  initialSort?: SortState;
  getRowKey?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  compact?: boolean;
}) {
  const [sort, setSort] = useState<SortState>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find(item => item.key === sort.key);
    if (!column) return rows;
    const getValue = (row: T) => {
      if (column.sortValue) return column.sortValue(row);
      const value = defaultValue(row, column.key);
      return typeof value === "string" || typeof value === "number" ? value : null;
    };
    return [...rows].sort((left, right) => {
      const a = getValue(left);
      const b = getValue(right);
      if (a === b) return 0;
      if (a === null || a === undefined) return 1;
      if (b === null || b === undefined) return -1;
      const comparison = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [rows, columns, sort]);

  if (loading && !rows.length) return <TableSkeleton />;

  if (!rows.length) {
    return <EmptyState icon="inbox" title={empty} copy={emptyCopy ?? "Try adjusting the filters or check back after new events arrive."} />;
  }

  function toggleSort(column: Column<T>) {
    const sortable = column.sortable ?? true;
    if (!sortable) return;
    setSort(current => {
      if (current?.key !== column.key) return { key: column.key, direction: "asc" };
      if (current.direction === "asc") return { key: column.key, direction: "desc" };
      return null;
    });
  }

  return (
    <div className="table-wrap">
      <table className={`table${compact ? " table-compact" : ""}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map(column => {
              const sortable = column.sortable ?? true;
              const active = sort?.key === column.key;
              const alignClass = column.align === "right" ? "col-right" : column.align === "center" ? "col-center" : "";
              return (
                <th key={column.key} scope="col" className={`${alignClass}${sortable ? " sortable" : ""}`} style={column.width ? { width: column.width } : undefined} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
                  {sortable ? (
                    <button type="button" className="th-button" data-active={active} onClick={() => toggleSort(column)}>
                      {column.label}
                      <Icon name={active ? (sort.direction === "asc" ? "sortAsc" : "sortDesc") : "chevronDown"} size={12} />
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr
              key={getRowKey ? getRowKey(row, index) : String(row.id ?? index)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: "pointer" } : undefined}
            >
              {columns.map(column => {
                const value = defaultValue(row, column.key);
                const text = typeof value === "string" ? value : null;
                let content: ReactNode;
                if (column.render) content = column.render(row);
                else if (column.badge) content = <StatusBadge value={text} />;
                else if (column.date) content = formatDateTime(text);
                else content = display(value);
                const classes = [column.mono && "cell-mono", column.align === "right" && "col-right", column.align === "center" && "col-center"].filter(Boolean).join(" ");
                return (
                  <td key={column.key} className={classes || undefined}>
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecordLink({ href, children, mono = false }: { href: string; children: ReactNode; mono?: boolean }) {
  return (
    <Link href={href} className={`row-link${mono ? " mono" : ""}`}>
      {children}
    </Link>
  );
}
