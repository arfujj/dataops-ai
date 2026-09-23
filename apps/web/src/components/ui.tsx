"use client";

import {
  createContext,
  FormEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { classNames, initials, statusTone, type Tone } from "@/lib/format";
import { Icon, type IconName } from "@/components/icons";

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle" | "danger" | "dangerSoft" | "warningSoft";
type ButtonSize = "sm" | "md" | "lg" | "icon" | "iconSm";

const buttonVariantClass: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  subtle: "btn-subtle",
  danger: "btn-danger",
  dangerSoft: "btn-danger-soft",
  warningSoft: "btn-warning-soft",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  className = "",
  children,
  type = "button",
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  children?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const iconSize = size === "lg" ? 16 : 14;
  return (
    <button
      type={type}
      className={classNames(
        "btn",
        buttonVariantClass[variant],
        size === "sm" && "btn-sm",
        size === "lg" && "btn-lg",
        size === "icon" && "btn-icon",
        size === "iconSm" && "btn-icon btn-sm",
        loading && "btn-loading",
        className,
      )}
      aria-busy={loading || undefined}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {icon && !loading && <Icon name={icon} size={iconSize} />}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Badge & severity                                                           */
/* -------------------------------------------------------------------------- */

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  outline = false,
  size = "md",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  outline?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={classNames(
        "badge",
        dot && "badge-dot",
        outline ? "badge-outline" : `badge-${tone}`,
        size === "sm" && "badge-sm",
        size === "lg" && "badge-lg",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ value, size = "md" }: { value?: string | null; size?: "sm" | "md" | "lg" }) {
  if (!value) return <span className="text-muted">—</span>;
  return (
    <Badge tone={statusTone(value)} dot size={size}>
      {value.replaceAll("_", " ")}
    </Badge>
  );
}

export function SeverityMark({ value }: { value?: string | null }) {
  const tone = (value ?? "").toLowerCase();
  const level = ["critical", "high", "medium", "low"].includes(tone) ? tone : "low";
  return <span className={`severity severity-${level}`}>{value ?? "—"}</span>;
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

export function Card({ children, className = "", interactive = false }: { children: ReactNode; className?: string; interactive?: boolean }) {
  return <section className={classNames("card", interactive && "card-interactive", className)}>{children}</section>;
}

export function CardHeader({ title, note, action, icon, className = "" }: { title: ReactNode; note?: ReactNode; action?: ReactNode; icon?: IconName; className?: string }) {
  return (
    <header className={classNames("card-header", className)}>
      <div className="card-header-copy">
        <h2 className="card-title">
          {icon && <Icon name={icon} size={15} className="text-muted" />}
          {title}
        </h2>
        {note && <p className="card-note">{note}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={classNames("card-body", className)}>{children}</div>;
}

export function Panel({
  title,
  note,
  action,
  icon,
  children,
  flush = false,
  className = "",
}: {
  title?: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      {title && <CardHeader title={title} note={note} action={action} icon={icon} />}
      <div className={flush ? "card-body card-body-flush" : "card-body"}>{children}</div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                    */
/* -------------------------------------------------------------------------- */

export function Tooltip({ label, children, side = "top" }: { label: ReactNode; children: ReactNode; side?: "top" | "bottom" }) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);

  function show() {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({
      top: side === "top" ? rect.top - 8 : rect.bottom + 8,
      left: rect.left + rect.width / 2,
    });
  }

  return (
    <>
      <span ref={anchorRef} className="inline-flex" onMouseEnter={show} onMouseLeave={() => setCoords(null)} onFocus={show} onBlur={() => setCoords(null)}>
        {children}
      </span>
      {coords &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            className="tooltip -translate-x-1/2"
            style={{ top: coords.top, left: coords.left, transform: `translate(-50%, ${side === "top" ? "-100%" : "0"})` }}
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Form fields                                                                */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  optional,
  htmlFor,
  children,
  className = "",
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  const labelContent = (
    <>
      {label}
      {optional && <span className="optional">optional</span>}
    </>
  );
  return (
    <div className={classNames("field", className)}>
      {label && (htmlFor ? <label className="field-label" htmlFor={htmlFor}>{labelContent}</label> : <span className="field-label">{labelContent}</span>)}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function Input({ className = "", ...rest }: React.ComponentPropsWithRef<"input">) {
  return <input className={classNames("input", className)} {...rest} />;
}

export function Select({ className = "", children, ...rest }: React.ComponentPropsWithRef<"select">) {
  return (
    <select className={classNames("select", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...rest }: React.ComponentPropsWithRef<"textarea">) {
  return <textarea className={classNames("textarea", className)} {...rest} />;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={classNames("search-input", className)}>
      <Icon name="search" size={15} />
      <input className="input" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={ariaLabel ?? placeholder} type="search" />
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (next: boolean) => void; label: string; description?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-start gap-3 text-left">
      <span className="switch mt-0.5" data-checked={checked} />
      <span>
        <span className="block text-sm font-medium text-[var(--text-secondary)]">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-[var(--text-faint)]">{description}</span>}
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs & segmented                                                           */
/* -------------------------------------------------------------------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: Array<{ value: T; label: string; count?: number; icon?: IconName }>;
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={classNames("tabs", className)}>
      {tabs.map(tab => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={value === tab.value}
          className="tab"
          onClick={() => onChange(tab.value)}
        >
          {tab.icon && <Icon name={tab.icon} size={14} />}
          {tab.label}
          {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: Array<{ value: T; label: string; icon?: IconName; count?: number }>;
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" className={classNames("segmented", className)}>
      {options.map(option => (
        <button
          key={option.value}
          role="radio"
          aria-checked={value === option.value}
          data-active={value === option.value}
          className="segmented-item"
          onClick={() => onChange(option.value)}
        >
          {option.icon && <Icon name={option.icon} size={13} />}
          {option.label}
          {option.count !== undefined && <span className="tabular-nums opacity-70">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
  count,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button type="button" data-active={active} onClick={onClick} className="filter-chip">
      {children}
      {count !== undefined && <span className="filter-chip-count">{count}</span>}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Menu                                                                       */
/* -------------------------------------------------------------------------- */

export function Menu({
  trigger,
  items,
  align = "end",
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: Array<
    | { type: "separator" }
    | { type?: "item"; label: string; icon?: IconName; onSelect: () => void; danger?: boolean; meta?: string }
    | { type: "label"; label: string }
  >;
  align?: "start" | "end";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const anchorRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; right: number } | null>(null);

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({ top: rect.bottom + 6, left: rect.left, right: window.innerWidth - rect.right });
  }, [open]);

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <div ref={anchorRef} className="inline-flex">
        {trigger({ open, toggle: () => setOpen(current => !current) })}
      </div>
      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            className="menu"
            style={{ top: position.top, ...(align === "end" ? { right: position.right } : { left: position.left }) }}
          >
            {items.map((item, index) => {
              if (item.type === "separator") return <div key={index} className="menu-separator" role="separator" />;
              if (item.type === "label") return <div key={index} className="menu-label">{item.label}</div>;
              return (
                <button
                  key={index}
                  role="menuitem"
                  className={classNames("menu-item", item.danger && "menu-item-danger")}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                >
                  {item.icon && <Icon name={item.icon} size={15} />}
                  <span className="truncate">{item.label}</span>
                  {item.meta && <span className="menu-meta">{item.meta}</span>}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal & Drawer                                                             */
/* -------------------------------------------------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  note,
  children,
  footer,
  footerNote,
  size = "md",
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  note?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  footerNote?: ReactNode;
  size?: "md" | "lg";
  icon?: IconName;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="overlay"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={classNames("modal", size === "lg" && "modal-wide")}>
        <header className="modal-header">
          <div className="flex items-start gap-3">
            {icon && (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] text-[var(--accent-text)]">
                <Icon name={icon} size={17} />
              </span>
            )}
            <div>
              <h2 id={titleId} className="modal-title">{title}</h2>
              {note && <p className="modal-note">{note}</p>}
            </div>
          </div>
          <Button variant="ghost" size="iconSm" icon="close" onClick={onClose} aria-label="Close dialog" />
        </header>
        <div className="modal-body">{children}</div>
        {(footer || footerNote) && (
          <footer className="modal-footer">
            {footerNote && <p className="mr-auto text-xs text-[var(--text-faint)]">{footerNote}</p>}
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  note,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside role="dialog" aria-modal="true" className="drawer">
        <header className="drawer-header">
          <div className="min-w-0">
            <div className="text-md font-semibold tracking-[-0.015em] text-[var(--text)]">{title}</div>
            {note && <p className="mt-1 text-xs text-[var(--text-muted)]">{note}</p>}
          </div>
          <Button variant="ghost" size="iconSm" icon="close" onClick={onClose} aria-label="Close panel" />
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-footer">{footer}</footer>}
      </aside>
    </>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

type Toast = { id: number; title: string; message?: string; tone: "success" | "error" | "info" };
type ToastContextValue = { push: (toast: Omit<Toast, "id">) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const counter = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = ++counter.current;
      setToasts(current => [...current.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.tone === "error" ? 7000 : 4500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);
  const iconFor: Record<Toast["tone"], IconName> = { success: "checkCircle", error: "alertCircle", info: "info" };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div className="toast-viewport" aria-live="polite" aria-atomic="false">
            {toasts.map(toast => (
              <div key={toast.id} role="status" className={`toast toast-${toast.tone}`}>
                <span className="toast-icon"><Icon name={iconFor[toast.tone]} size={15} /></span>
                <div className="toast-body">
                  <p className="toast-title">{toast.title}</p>
                  {toast.message && <p className="toast-message">{toast.message}</p>}
                </div>
                <button className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

export function Skeleton({ width, height = 12, className = "", style }: { width?: number | string; height?: number | string; className?: string; style?: React.CSSProperties }) {
  return <span className={classNames("skeleton", className)} style={{ width, height, display: "block", ...style }} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="table-skeleton" aria-busy="true" aria-label="Loading records">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} height={30} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  copy,
  actions,
}: {
  icon?: IconName;
  title: string;
  copy?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} size={20} /></span>
      <p className="empty-title">{title}</p>
      {copy && <p className="empty-copy">{copy}</p>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}

export function Notice({
  tone = "info",
  icon,
  children,
  action,
}: {
  tone?: "info" | "success" | "warning" | "error";
  icon?: IconName;
  children: ReactNode;
  action?: ReactNode;
}) {
  const defaultIcon: Record<string, IconName> = { info: "info", success: "checkCircle", warning: "alertTriangle", error: "alertCircle" };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`notice notice-${tone}`}>
      <Icon name={icon ?? defaultIcon[tone]} size={15} />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Notice tone="error" action={onRetry ? <Button variant="ghost" size="sm" icon="refresh" onClick={onRetry}>Retry</Button> : undefined}>
      {message}
    </Notice>
  );
}

export function ProgressBar({ value, tone = "accent", size = "md", label }: { value: number; tone?: Tone; size?: "sm" | "md"; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = tone === "accent" ? "var(--accent)" : tone === "danger" ? "var(--danger)" : tone === "success" ? "var(--success)" : tone === "warning" ? "var(--warning)" : "var(--text-muted)";
  return (
    <div
      className={classNames("progress", size === "sm" && "progress-sm")}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="progress-bar" style={{ width: `${clamped}%`, background: color }} />
    </div>
  );
}

export function ConfidenceRing({ value, size = 62, label = "confidence" }: { value: number; size?: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const tone = clamped >= 75 ? "var(--success)" : clamped >= 45 ? "var(--warning)" : "var(--danger)";
  return (
    <div className="flex flex-col items-center gap-1" aria-label={`${Math.round(clamped)}% ${label}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="var(--text)" fontSize={size * 0.26} fontWeight="660" fontFamily="var(--font-sans)">
          {Math.round(clamped)}%
        </text>
      </svg>
      <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">{label}</span>
    </div>
  );
}

export function Avatar({ name, size = "md", square = false }: { name?: string | null; size?: "sm" | "md" | "lg"; square?: boolean }) {
  return (
    <span className={classNames("avatar", `avatar-${size}`, square && "avatar-square")} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="iconSm"
      icon={copied ? "check" : "copy"}
      aria-label={copied ? "Copied" : label}
      title={label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Confirm dialog                                                             */
/* -------------------------------------------------------------------------- */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  note,
  confirmLabel = "Confirm",
  tone = "primary",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  note: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={tone === "danger" ? "alertTriangle" : "info"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-[var(--text-secondary)]">{note}</p>
    </Modal>
  );
}

export function useFormSubmit(handler: () => Promise<void>) {
  return async (event: FormEvent) => {
    event.preventDefault();
    await handler();
  };
}
