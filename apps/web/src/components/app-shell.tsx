"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { useApi, useHotkeys, useTheme } from "@/lib/hooks";
import { DEV_AUTO_LOGIN } from "@/lib/api";
import { classNames, formatRelative, humanize } from "@/lib/format";
import type { DashboardSummary, Organization } from "@/lib/types";
import { Icon, type IconName } from "@/components/icons";
import { Avatar, Badge, Button, Kbd, Menu } from "@/components/ui";
import { CommandPalette } from "@/components/command-palette";

export const REFRESH_EVENT = "dataops:refresh";

type NavItem = { href: string; label: string; icon: IconName; badge?: (summary: DashboardSummary | null) => number | null };

const sections: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Monitor",
    items: [
      { href: "/dashboard", label: "Overview", icon: "overview" },
      { href: "/incidents", label: "Incidents", icon: "incidents", badge: summary => summary?.open_incidents ?? null },
      { href: "/pipelines", label: "Pipelines", icon: "pipelines", badge: summary => summary?.failed_pipelines ?? null },
      { href: "/quality", label: "Data quality", icon: "quality" },
    ],
  },
  {
    label: "Understand",
    items: [
      { href: "/datasets", label: "Datasets", icon: "datasets" },
      { href: "/lineage", label: "Lineage", icon: "lineage" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/connectors", label: "Connectors", icon: "connectors" },
      { href: "/settings", label: "Workspace settings", icon: "settings" },
    ],
  },
];

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32"><path d="M7 9.5h7.5v7.2H7zM17.5 15.3H25v7.2h-7.5z"/><path d="M14.5 13.1h3a3 3 0 0 1 3 3M14.5 13.1h1a3 3 0 0 1 3 3v2.2"/></svg>
    </span>
  );
}

export function AppShell({ children, title, eyebrow = "Data reliability" }: { children: ReactNode; title: string; eyebrow?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const { preference, setPreference } = useTheme();

  const organization = useApi<Organization>("/organizations/current");
  const summary = useApi<DashboardSummary>("/dashboard/summary", { pollMs: 60000 });
  const [authFailed, setAuthFailed] = useState(false);

  const signOut = useCallback(() => {
    sessionStorage.removeItem("dataops_token");
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    if (organization.error && organization.data === null && /unauthorized|credentials|token|401/i.test(organization.error)) {
      setAuthFailed(true);
      const timer = window.setTimeout(signOut, 1200);
      return () => window.clearTimeout(timer);
    }
  }, [organization.error, organization.data, signOut]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const triggerRefresh = useCallback(() => {
    window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
  }, []);

  useHotkeys([
    { keys: "cmd+k", handler: () => setCommandOpen(open => !open), allowInInput: true },
    { keys: "/", handler: () => setCommandOpen(true) },
    { keys: "g d", handler: () => router.push("/dashboard") },
    { keys: "g i", handler: () => router.push("/incidents") },
    { keys: "g p", handler: () => router.push("/pipelines") },
    { keys: "g q", handler: () => router.push("/quality") },
    { keys: "g s", handler: () => router.push("/datasets") },
    { keys: "g l", handler: () => router.push("/lineage") },
    { keys: "g c", handler: () => router.push("/connectors") },
  ]);

  const org = organization.data;
  const loading = organization.loading;

  if (loading) {
    return (
      <main className="loading-screen">
        <span className="brand-mark" style={{ width: 44, height: 44, borderRadius: 13 }}>
          <svg viewBox="0 0 32 32" style={{ width: 26, height: 26 }}><path d="M7 9.5h7.5v7.2H7zM17.5 15.3H25v7.2h-7.5z"/><path d="M14.5 13.1h3a3 3 0 0 1 3 3M14.5 13.1h1a3 3 0 0 1 3 3v2.2"/></svg>
        </span>
        <p className="text-xs font-medium text-[var(--text-muted)]">Preparing your workspace…</p>
        <div className="mt-2 grid w-[240px] gap-2">
          <span className="skeleton" style={{ height: 10 }} />
          <span className="skeleton" style={{ height: 10, width: "70%" }} />
        </div>
      </main>
    );
  }

  if (authFailed && !org) {
    return (
      <main className="loading-screen">
        <Icon name="lock" size={26} className="text-[var(--text-faint)]" />
        <p className="text-sm font-medium text-[var(--text-secondary)]">Your session expired</p>
        <p className="text-xs text-[var(--text-muted)]">Redirecting to sign-in…</p>
      </main>
    );
  }

  const themeLabel = preference === "system" ? "Switch to light theme" : preference === "light" ? "Switch to dark theme" : "Match system theme";

  return (
      <div className="shell">
        {mobileNavOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
        <aside className={classNames("sidebar", mobileNavOpen && "is-open")} aria-label="Primary navigation">
          <Link href="/dashboard" className="sidebar-brand">
            <BrandMark />
            <span className="brand-copy"><strong>DataOps</strong><small>RELIABILITY CLOUD</small></span>
          </Link>

          <Link href="/settings" className="sidebar-tenant">
            <span className="tenant-mark">{org?.name?.slice(0, 1).toUpperCase() ?? "A"}</span>
            <span className="tenant-copy">
              <strong>{org?.name ?? "Workspace"}</strong>
              <small>{org?.role ? `${org.role.replaceAll("_", " ")} workspace` : "Production"}</small>
            </span>
            <Icon name="chevronRight" size={14} className="text-[#5d6e88]" />
          </Link>

          <nav className="sidebar-nav">
            {sections.map(section => (
              <div className="nav-group" key={section.label}>
                <p className="nav-group-label">{section.label}</p>
                {section.items.map(item => {
                  const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
                  const badge = item.badge?.(summary.data ?? null) ?? null;
                  return (
                    <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className="nav-link">
                      <Icon name={item.icon} size={16} />
                      <span className="nav-link-label">{item.label}</span>
                      {badge !== null && badge > 0 && <span className={classNames("nav-link-count", item.href === "/incidents" && "nav-link-count-danger")}>{badge}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="sidebar-bottom">
            <div className="sidebar-status">
              <span className={classNames("pulse-dot", organization.error && "!bg-[var(--danger)]")} />
              <span><strong>Control plane</strong> · {organization.error ? "reconnecting" : "connected"}</span>
              {DEV_AUTO_LOGIN && <Badge tone="warning" size="sm" className="ml-auto">DEV</Badge>}
            </div>
            <Menu
              label="Account menu"
              items={[
                { type: "label", label: org?.email ?? org?.full_name ?? "Signed in" },
                { label: "Workspace settings", icon: "settings", onSelect: () => router.push("/settings") },
                { label: "Appearance: " + humanize(preference), icon: preference === "dark" ? "moon" : preference === "light" ? "sun" : "monitor", onSelect: () => setPreference(preference === "dark" ? "light" : preference === "light" ? "system" : "dark") },
                { type: "separator" },
                { label: "Sign out", icon: "logout", danger: true, onSelect: signOut },
              ]}
              trigger={({ toggle }) => (
                <button className="sidebar-user w-full" onClick={toggle} aria-label="Open account menu">
                  <Avatar name={org?.full_name} size="sm" />
                  <span className="user-copy">
                    <strong>{org?.full_name ?? "Workspace user"}</strong>
                    <small>{org?.role ?? "member"}</small>
                  </span>
                  <Icon name="more" size={15} className="text-[#5d6e88]" />
                </button>
              )}
            />
          </div>
        </aside>

        <div className="shell-main">
          <header className="topbar">
            <button className="mobile-menu-button topbar-icon-button" aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(value => !value)}>
              <Icon name={mobileNavOpen ? "close" : "menu"} size={17} />
            </button>
            <nav className="topbar-breadcrumb" aria-label="Breadcrumb">
              <span className="topbar-breadcrumb-root">Workspace</span>
              <span className="topbar-breadcrumb-sep">/</span>
              <span className="topbar-breadcrumb-root">{eyebrow}</span>
              <span className="topbar-breadcrumb-sep">/</span>
              <span className="topbar-breadcrumb-current">{title}</span>
            </nav>
            <div className="topbar-actions">
              <button className="command-trigger" onClick={() => setCommandOpen(true)} aria-label="Open command palette">
                <Icon name="search" size={14} />
                <span>Search or jump to…</span>
                <Kbd>⌘K</Kbd>
              </button>
              <Menu
                label="Notifications"
                items={
                  summary.data?.recent_incidents?.length
                    ? [
                        { type: "label", label: "Recent signals" },
                        ...summary.data.recent_incidents.slice(0, 5).map(incident => ({
                          label: incident.title,
                          icon: "incidents" as IconName,
                          meta: formatRelative(incident.opened_at),
                          onSelect: () => router.push(`/incidents/${incident.id}`),
                        })),
                        { type: "separator" as const },
                        { label: "View all incidents", icon: "arrowRight" as IconName, onSelect: () => router.push("/incidents") },
                      ]
                    : [{ type: "label", label: "All clear" }, { label: "No active signals", icon: "checkCircle" as IconName, onSelect: triggerRefresh }]
                }
                trigger={({ toggle }) => (
                  <button className="topbar-icon-button" onClick={toggle} aria-label="Notifications">
                    <Icon name="bell" size={17} />
                    {(summary.data?.open_incidents ?? 0) > 0 && <span className="notification-dot" />}
                  </button>
                )}
              />
              <button className="topbar-icon-button" onClick={() => setPreference(preference === "dark" ? "light" : "dark")} aria-label={themeLabel} title={themeLabel}>
                <Icon name={preference === "dark" ? "sun" : "moon"} size={16} />
              </button>
              <Menu
                label="Account menu"
                items={[
                  { type: "label", label: org?.email ?? "Account" },
                  { label: "Workspace settings", icon: "settings", onSelect: () => router.push("/settings") },
                  { label: "Sign out", icon: "logout", danger: true, onSelect: signOut },
                ]}
                trigger={({ toggle }) => (
                  <button className="rounded-full" onClick={toggle} aria-label="Open account menu">
                    <Avatar name={org?.full_name} size="md" />
                  </button>
                )}
              />
            </div>
          </header>

          <main id="main-content" className="app-content">
            {children}
            <footer className="shell-footer">
              <span>DataOps Reliability Cloud · workspace scoped</span>
              <span className="shell-footer-links">
                <span>{org?.slug ?? "secure session"}</span>
                <span className="flex items-center gap-1.5"><Kbd>⌘</Kbd><Kbd>K</Kbd> command palette</span>
              </span>
            </footer>
          </main>
        </div>

        <CommandPalette
          open={commandOpen}
          onClose={() => setCommandOpen(false)}
          onSignOut={signOut}
          onRefresh={triggerRefresh}
          onToggleTheme={() => setPreference(preference === "dark" ? "light" : "dark")}
          themeLabel={themeLabel}
        />
      </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="page-heading-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </div>
  );
}

export function PageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="notice notice-error">
      <Icon name="alertCircle" size={15} />
      <p className="flex-1">{message}</p>
      {onRetry && <Button variant="ghost" size="sm" icon="refresh" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export { Badge, Avatar, Button, StatusBadge } from "@/components/ui";
export { Icon } from "@/components/icons";
export type { IconName } from "@/components/icons";
