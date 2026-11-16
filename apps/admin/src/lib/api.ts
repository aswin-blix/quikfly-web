// The admin panel's only door to the backend. Screens call `adminApi`, never fetch().
// Endpoints are listed in apps/api/README.md (Admin section).
import type { AdminLoginResult, AdminStats, AdminUser, AuditEntry, Page, Settings } from "@quikfly/shared";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "quikfly.admin.token";

/** Fired on `window` when the API rejects the stored admin session. */
export const ADMIN_UNAUTHORIZED_EVENT = "quikfly-admin:unauthorized";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setToken(token: string | null) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the QuikFly API. Check your connection and try again.");
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && token && path !== "/admin/auth/login") {
    setToken(null);
    window.dispatchEvent(new Event(ADMIN_UNAUTHORIZED_EVENT));
  }
  if (!res.ok) throw new ApiError(res.status, json.message || `Request failed (${res.status})`);
  return json as T;
}

/** `{ a: 1, b: undefined }` → "?a=1" */
export function qs(params: Record<string, string | number | undefined | null>) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries.length ? "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : "";
}

export const adminApi = {
  auth: {
    async login(email: string, password: string) {
      const r = await req<AdminLoginResult>("POST", "/admin/auth/login", { email, password });
      setToken(r.token);
      return r.admin;
    },
    async logout() {
      try { if (getToken()) await req("POST", "/admin/auth/logout"); } catch { /* signed out locally either way */ }
      setToken(null);
    },
    me: () => req<AdminUser>("GET", "/admin/auth/me"),
  },
  stats: (days: number) => req<AdminStats>("GET", `/admin/stats${qs({ days })}`),
  settings: {
    get: () => req<Settings>("GET", "/admin/settings"),
    update: (patch: Partial<Settings>) => req<Settings>("PATCH", "/admin/settings", patch),
  },
  audit: (page: number, entity?: string) => req<Page<AuditEntry>>("GET", `/admin/audit${qs({ page, entity })}`),
};
