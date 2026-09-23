"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API, DEV_AUTO_LOGIN, ensureDevSession } from "@/lib/api";
import { Icon } from "@/components/icons";
import { Button, Field, Input, Notice } from "@/components/ui";

const DEFAULT_SLUG = process.env.NEXT_PUBLIC_ORGANIZATION_SLUG ?? "acme-analytics";
const DEV_EMAIL = process.env.NEXT_PUBLIC_DEV_EMAIL ?? "admin@example.com";
const DEV_PASSWORD = process.env.NEXT_PUBLIC_DEV_PASSWORD ?? "change-me-now";

function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size, borderRadius: size / 3.4 }} aria-hidden="true">
      <svg viewBox="0 0 32 32" style={{ width: size * 0.62, height: size * 0.62 }}>
        <path d="M7 9.5h7.5v7.2H7zM17.5 15.3H25v7.2h-7.5z" />
        <path d="M14.5 13.1h3a3 3 0 0 1 3 3M14.5 13.1h1a3 3 0 0 1 3 3v2.2" />
      </svg>
    </span>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState(DEV_AUTO_LOGIN ? DEV_EMAIL : "");
  const [password, setPassword] = useState(DEV_AUTO_LOGIN ? DEV_PASSWORD : "");
  const [slug, setSlug] = useState(DEFAULT_SLUG);
  const [showPassword, setShowPassword] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (sessionStorage.getItem("dataops_token")) {
      router.replace("/dashboard");
      return;
    }
    if (!DEV_AUTO_LOGIN) {
      emailRef.current?.focus();
      return;
    }
    void ensureDevSession().then(token => {
      if (token) router.replace("/dashboard");
    });
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, organization_slug: slug.trim() || null }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail ?? "We couldn’t sign you in. Check your details and try again.");
      }
      const data = (await response.json()) as { access_token: string };
      sessionStorage.setItem("dataops_token", data.access_token);
      router.replace("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn’t connect to the workspace. Try again in a moment.");
    } finally {
      setPending(false);
    }
  }

  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState?.("CapsLock") ?? false);
  }

  return (
    <main className="auth-screen">
      <section className="auth-story" aria-label="DataOps product overview">
        <div className="auth-brand">
          <BrandMark size={36} />
          <span className="auth-brand-copy"><strong>DataOps</strong><small>RELIABILITY CLOUD</small></span>
        </div>

        <div className="auth-story-body">
          <p className="auth-eyebrow"><i /> DATA RELIABILITY PLATFORM</p>
          <h1>Find the signal.<br /><span>Contain the impact.</span></h1>
          <p className="auth-story-copy">
            A shared operating view for the health of your data, the systems that move it, and the teams that keep it trusted.
          </p>
          <div className="auth-features">
            <div className="auth-feature">
              <span className="auth-feature-icon">01</span>
              <span className="auth-feature-copy"><strong>Correlate incidents</strong><small>Bring pipeline, schema, and quality signals into one timeline.</small></span>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">02</span>
              <span className="auth-feature-copy"><strong>Trace data impact</strong><small>See downstream assets before the blast radius grows.</small></span>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">03</span>
              <span className="auth-feature-copy"><strong>Investigate with context</strong><small>Keep evidence, tool calls, and actions fully auditable.</small></span>
            </div>
          </div>
        </div>

        <div className="auth-preview" aria-hidden="true">
          <div className="auth-preview-bar">
            <span className="auth-preview-live"><i /> LIVE SIGNAL</span>
            <span>RAW.ORDERS</span>
          </div>
          <div className="auth-preview-body">
            <div className="auth-preview-row">
              <div className="auth-preview-asset">
                <small>customer_id</small>
                <strong>Column type changed</strong>
              </div>
              <span className="auth-preview-severity">BREAKING</span>
            </div>
            <div className="auth-preview-diff">
              <span>BIGINT</span><b>→</b><span>VARCHAR</span><span style={{ marginLeft: "auto" }}>confidence 0.92</span>
            </div>
            <div className="auth-preview-flow">
              <small style={{ color: "#7f92af", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.12em" }}>BLAST RADIUS</small>
              <div className="auth-preview-flow-track">
                <span className="auth-preview-flow-node" data-state="alert"><i /><span>raw.orders</span></span>
                <span className="auth-preview-flow-line" />
                <span className="auth-preview-flow-node" data-state="alert"><i /><span>staging.stg_orders</span></span>
                <span className="auth-preview-flow-line" />
                <span className="auth-preview-flow-node" data-state="ok"><i /><span>analytics.daily_revenue</span></span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-story-footer"><span>DATAOPS AI</span><span>WORKSPACE ACCESS</span></div>
      </section>

      <section className="auth-form-side">
        <div className="auth-mobile-brand">
          <BrandMark />
          <span className="auth-brand-copy"><strong>DataOps</strong><small>RELIABILITY CLOUD</small></span>
        </div>

        <div className="auth-card">
          <div className="auth-heading">
            <span className="auth-kicker">WELCOME BACK</span>
            <h2>Sign in to your workspace</h2>
            <p>Use your organization account to continue.</p>
          </div>

          <form className="auth-form" onSubmit={submit} noValidate>
            {DEV_AUTO_LOGIN && (
              <Notice tone="warning" icon="terminal">
                <p><strong>Development auto-login is enabled.</strong> Seeded credentials are pre-filled and signing in skips manual entry. Never enable <code>NEXT_PUBLIC_DEV_AUTO_LOGIN</code> outside local development.</p>
              </Notice>
            )}
            <Field label="Work email" htmlFor="email">
              <Input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@company.com"
                aria-invalid={!!error}
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              hint={capsLock ? undefined : "Case-sensitive"}
              error={capsLock ? "Caps Lock is on." : undefined}
            >
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  onKeyUp={trackCapsLock}
                  onKeyDown={trackCapsLock}
                  placeholder="Enter your password"
                  aria-invalid={!!error}
                  className="pr-11"
                />
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-[var(--radius-sm)] text-[var(--text-faint)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-secondary)]"
                  onClick={() => setShowPassword(value => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <Icon name={showPassword ? "eyeOff" : "eye"} size={15} />
                </button>
              </div>
            </Field>

            <div>
              <button type="button" className="text-link" onClick={() => setShowWorkspace(value => !value)} aria-expanded={showWorkspace}>
                <Icon name={showWorkspace ? "chevronDown" : "chevronRight"} size={13} />
                Sign-in options
              </button>
              {showWorkspace && (
                <div className="mt-3">
                  <Field label="Workspace slug" hint="Required only when your account belongs to multiple workspaces.">
                    <Input value={slug} onChange={event => setSlug(event.target.value)} placeholder="acme-analytics" spellCheck={false} />
                  </Field>
                </div>
              )}
            </div>

            {error && (
              <Notice tone="error" icon="alertCircle">
                <p>{error}</p>
              </Notice>
            )}

            <Button type="submit" variant="primary" size="lg" className="auth-submit" loading={pending} disabled={pending || !email || !password}>
              {pending ? "Signing in…" : <>Continue <Icon name="arrowRight" size={15} /></>}
            </Button>
          </form>

          <div className="auth-note">
            <Icon name="shield" size={13} />
            <span>Workspace access is managed by your organization administrator. Sessions are scoped to your tenant.</span>
          </div>
        </div>

        <footer className="auth-footer">
          <span>DataOps Reliability Cloud</span>
          <span>Secure workspace sign-in</span>
        </footer>
      </section>
    </main>
  );
}
