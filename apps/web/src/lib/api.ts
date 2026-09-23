export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Development-only convenience: when no session exists, sign in automatically
 * with the seeded workspace credentials. Disabled unless the bundle was built
 * with NEXT_PUBLIC_DEV_AUTO_LOGIN=true, so production builds are unaffected.
 */
export const DEV_AUTO_LOGIN = process.env.NEXT_PUBLIC_DEV_AUTO_LOGIN === "true";
const DEV_EMAIL = process.env.NEXT_PUBLIC_DEV_EMAIL ?? "admin@example.com";
const DEV_PASSWORD = process.env.NEXT_PUBLIC_DEV_PASSWORD ?? "change-me-now";
const DEV_ORG_SLUG = process.env.NEXT_PUBLIC_ORGANIZATION_SLUG ?? "acme-analytics";

let pendingSignIn: Promise<string | null> | null = null;

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("dataops_token");
}

export function ensureDevSession(): Promise<string | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const existing = sessionStorage.getItem("dataops_token");
  if (existing) return Promise.resolve(existing);
  if (!DEV_AUTO_LOGIN) return Promise.resolve(null);
  if (!pendingSignIn) {
    pendingSignIn = fetch(`${API}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD, organization_slug: DEV_ORG_SLUG }),
    })
      .then(async response => {
        if (!response.ok) return null;
        const body = (await response.json()) as { access_token?: string };
        if (!body.access_token) return null;
        sessionStorage.setItem("dataops_token", body.access_token);
        return body.access_token;
      })
      .catch(() => null)
      .finally(() => {
        pendingSignIn = null;
      });
  }
  return pendingSignIn;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window === "undefined" ? null : sessionStorage.getItem("dataops_token") ?? (await ensureDevSession());
  const response = await fetch(API + "/api/v1" + path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    let message = "Request failed (" + response.status + ")";
    try {
      const body = await response.json() as { detail?: string };
      message = body.detail ?? message;
    } catch { /* response body was not JSON */ }
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

export function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
