"use client";

import { useMemo, useState } from "react";
import { AppShell, PageHeading } from "@/components/app-shell";
import { Icon, type IconName } from "@/components/icons";
import { Avatar, Badge, CopyButton, EmptyState, ErrorNotice, Panel, SearchInput, Skeleton, Toggle } from "@/components/ui";
import { useApi, useTheme, type ThemePreference } from "@/lib/hooks";
import { formatDate, formatRelative, humanize, truncateId } from "@/lib/format";
import type { AuditEntry, Member, Organization } from "@/lib/types";

type SectionKey = "general" | "members" | "audit" | "appearance" | "about";

const sections: Array<{ key: SectionKey; label: string; icon: IconName }> = [
  { key: "general", label: "General", icon: "building" },
  { key: "members", label: "Members", icon: "users" },
  { key: "audit", label: "Audit log", icon: "history" },
  { key: "appearance", label: "Appearance", icon: "sun" },
  { key: "about", label: "About & security", icon: "shield" },
];

const roleMatrix = [
  { role: "Admin", abilities: "Full workspace control, including remediation approval." },
  { role: "Engineer", abilities: "Investigate incidents, run checks, propose and validate remediation." },
  { role: "Analyst", abilities: "Read-only access to incidents, catalog, lineage, and quality." },
  { role: "Viewer", abilities: "Read-only access to workspace surfaces." },
];

export default function SettingsPage() {
  const organization = useApi<Organization>("/organizations/current");
  const members = useApi<Member[]>("/organizations/current/members");
  const audit = useApi<AuditEntry[]>("/audit?limit=100");
  const [section, setSection] = useState<SectionKey>("general");
  const [auditQuery, setAuditQuery] = useState("");
  const [compactAudit, setCompactAudit] = useState(false);
  const { preference, setPreference } = useTheme();

  const org = organization.data;
  const audits = audit.data ?? [];

  const filteredAudit = useMemo(() => {
    const tokens = auditQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return audits;
    return audits.filter(entry => {
      const haystack = `${entry.action} ${entry.target_type} ${entry.target_id} ${JSON.stringify(entry.details ?? {})}`.toLowerCase();
      return tokens.every(token => haystack.includes(token));
    });
  }, [audits, auditQuery]);

  const firstError = organization.error || members.error || audit.error;

  return (
    <AppShell title="Workspace settings" eyebrow="Manage">
      <PageHeading
        eyebrow="Organization · access · audit"
        title="Workspace settings"
        description="Review organization context, member access, appearance, and recent auditable activity."
      />

      {firstError && <div className="mb-4"><ErrorNotice message={firstError} onRetry={() => { organization.reload(); members.reload(); audit.reload(); }} /></div>}

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map(item => (
            <button key={item.key} data-active={section === item.key} className="settings-nav-item" onClick={() => setSection(item.key)}>
              <Icon name={item.icon} size={15} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="settings-section">
          {section === "general" && (
            <>
              <Panel title="Organization" icon="building" note="Tenant scope is derived from the signed membership token" action={<CopyButton value={org?.id ?? ""} label="Copy organization ID" />}>
                {organization.loading ? (
                  <div className="grid gap-3"><Skeleton height={16} /><Skeleton height={16} /><Skeleton height={16} /></div>
                ) : (
                  <dl className="definition-list">
                    <div className="definition-row"><dt>Name</dt><dd>{org?.name ?? "—"}</dd></div>
                    <div className="definition-row"><dt>Slug</dt><dd className="mono">{org?.slug ?? "—"}</dd></div>
                    <div className="definition-row"><dt>Organization ID</dt><dd className="mono">{org?.id ? truncateId(org.id, 12) : "—"}</dd></div>
                    <div className="definition-row"><dt>Your role</dt><dd><Badge tone="info" size="sm">{humanize(org?.role)}</Badge></dd></div>
                    <div className="definition-row"><dt>Signed in as</dt><dd>{org?.full_name} · {org?.email}</dd></div>
                    <div className="definition-row"><dt>Created</dt><dd>{formatDate(org?.created_at)}</dd></div>
                  </dl>
                )}
                <div className="mt-4">
                  <div className="notice notice-warning">
                    <Icon name="lock" size={15} />
                    <p>Organization settings edits are not exposed. Membership authorization and tenant scoping are enforced server-side on every request.</p>
                  </div>
                </div>
              </Panel>

              <Panel title="Environment" icon="server" note="Runtime context this workspace is connected to">
                <div className="grid gap-3 sm:grid-cols-3">
                  <EnvironmentCard label="API endpoint" value={process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"} icon="wifi" />
                  <EnvironmentCard label="Event pipeline" value="Kafka / Redpanda outbox" icon="zap" />
                  <EnvironmentCard label="Store of record" value="PostgreSQL" icon="database" />
                </div>
              </Panel>
            </>
          )}

          {section === "members" && (
            <>
              <Panel title="Organization members" icon="users" note={`${members.data?.length ?? 0} active member(s)`}>
                {members.loading ? (
                  <div className="grid gap-3"><Skeleton height={40} /><Skeleton height={40} /><Skeleton height={40} /></div>
                ) : members.data?.length ? (
                  <div>
                    {members.data.map(member => (
                      <div className="member-row" key={member.email}>
                        <Avatar name={member.full_name || member.email} size="md" />
                        <div className="member-copy">
                          <strong>{member.full_name || member.email}</strong>
                          <small>{member.email}</small>
                        </div>
                        <Badge tone={member.role === "admin" ? "info" : member.role === "engineer" ? "accent" : "neutral"} dot size="sm">{humanize(member.role)}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon="users" title="No members found" copy="Membership records are created through the identity layer." />
                )}
              </Panel>

              <Panel title="Role capabilities" icon="key" note="What each workspace role can do">
                <div className="grid gap-2.5">
                  {roleMatrix.map(item => (
                    <div key={item.role} className="flex gap-3">
                      <Badge tone={item.role === "Admin" ? "info" : item.role === "Engineer" ? "accent" : "neutral"} size="sm" className="mt-0.5 shrink-0">{item.role}</Badge>
                      <p className="m-0 text-xs leading-5 text-[var(--text-muted)]">{item.abilities}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          )}

          {section === "audit" && (
            <Panel
              flush
              title="Audit log"
              icon="history"
              note={`${filteredAudit.length} of ${audits.length} records shown · latest 100 actions`}
              action={<CopyButton value={JSON.stringify(filteredAudit, null, 2)} label="Copy audit log" />}
            >
              <div className="table-toolbar">
                <SearchInput value={auditQuery} onChange={setAuditQuery} placeholder="Search action, target, details…" className="w-full sm:w-[300px]" aria-label="Search audit log" />
                <span className="toolbar-spacer" />
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span className="switch" data-checked={compactAudit} onClick={() => setCompactAudit(value => !value)} />
                  Compact
                </label>
              </div>
              <div className="px-4 py-3">
                {audit.loading ? (
                  <div className="grid gap-3"><Skeleton height={32} /><Skeleton height={32} /><Skeleton height={32} /></div>
                ) : !filteredAudit.length ? (
                  <EmptyState icon="history" title={audits.length ? "No audit entries match" : "No audit activity recorded"} copy={audits.length ? "Try a different search term." : "Investigation and remediation actions will be recorded here."} />
                ) : (
                  <div>
                    {filteredAudit.map(entry => (
                      <div className="audit-row" key={entry.id} style={compactAudit ? { paddingTop: 6, paddingBottom: 6 } : undefined}>
                        <span className="audit-action truncate">{humanize(entry.action.replaceAll(".", " "))}</span>
                        <span className="audit-target truncate">{entry.target_type} / {truncateId(entry.target_id)}</span>
                        <span className="audit-details" title={JSON.stringify(entry.details)}>{JSON.stringify(entry.details)}</span>
                        <span className="audit-time" title={formatDate(entry.created_at)}>{formatRelative(entry.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
          )}

          {section === "appearance" && (
            <>
              <Panel title="Theme" icon="sun" note="Applies immediately and persists on this device">
                <div className="grid gap-3 sm:grid-cols-3">
                  {([
                    { value: "light", label: "Light", icon: "sun", description: "Bright surfaces for daylight workspaces." },
                    { value: "dark", label: "Dark", icon: "moon", description: "Reduced glare for on-call and NOC environments." },
                    { value: "system", label: "System", icon: "monitor", description: "Follow the operating system preference." },
                  ] as Array<{ value: ThemePreference; label: string; icon: IconName; description: string }>).map(option => (
                    <button
                      key={option.value}
                      onClick={() => setPreference(option.value)}
                      data-active={preference === option.value}
                      className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--border-strong)] data-[active=true]:border-[var(--accent)] data-[active=true]:bg-[var(--accent-soft)]"
                    >
                      <span className="flex items-center justify-between">
                        <Icon name={option.icon} size={17} />
                        {preference === option.value && <Icon name="checkCircle" size={15} className="text-[var(--accent)]" />}
                      </span>
                      <span className="mt-3 block text-sm font-semibold text-[var(--text-secondary)]">{option.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{option.description}</span>
                    </button>
                  ))}
                </div>
              </Panel>

              <Panel title="Accessibility" icon="user" note="Interface behavior preferences">
                <div className="grid gap-4">
                  <Toggle checked={true} onChange={() => undefined} label="Respect reduced motion" description="Animations collapse automatically when your operating system requests reduced motion. This is always enforced." />
                  <Toggle checked={false} onChange={() => undefined} label="High-contrast mode" description="Planned: pushes semantic tokens toward WCAG AAA contrast ratios." />
                </div>
              </Panel>
            </>
          )}

          {section === "about" && (
            <>
              <Panel title="About this build" icon="info" note="DataOps Reliability Cloud">
                <dl className="definition-list">
                  <div className="definition-row"><dt>Product</dt><dd>DataOps Reliability Cloud</dd></div>
                  <div className="definition-row"><dt>Interface</dt><dd className="mono">web v0.2.0</dd></div>
                  <div className="definition-row"><dt>API</dt><dd className="mono">{process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}</dd></div>
                  <div className="definition-row"><dt>Investigation modes</dt><dd>Deterministic demo mode · OpenAI Responses API (bounded tools)</dd></div>
                  <div className="definition-row"><dt>Remediation</dt><dd>Dry-run policy validation; approval records intent only</dd></div>
                </dl>
              </Panel>

              <Panel title="Security posture" icon="shield" note="Guarantees enforced by the control plane">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { title: "Tenant isolation", copy: "Every authenticated request validates active membership and derives organization scope from the signed token." },
                    { title: "Bounded agent tools", copy: "The investigator can only call allowlisted, read-only tools. SQL is limited to a single aggregate SELECT." },
                    { title: "Audited actions", copy: "Investigations, validations, and approvals write immutable audit records with actor and target context." },
                    { title: "No automatic execution", copy: "Remediation never executes SQL, shell commands, or production changes from the control plane." },
                  ].map(item => (
                    <div className="surface-subtle p-4" key={item.title}>
                      <p className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                        <Icon name="checkCircle" size={14} className="text-[var(--success)]" /> {item.title}
                      </p>
                      <p className="mt-1.5 text-xs leading-5 text-[var(--text-muted)]">{item.copy}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function EnvironmentCard({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <div className="surface-subtle p-3">
      <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--text-faint)]">
        <Icon name={icon} size={12} /> {label}
      </span>
      <p className="mono mt-2 truncate text-xs text-[var(--text-secondary)]" title={value}>{value}</p>
    </div>
  );
}
