// Real backend implementation of the API contract.
// Activated by setting NEXT_PUBLIC_API_URL. Endpoints mirror the comments in contract.ts,
// so the same REST API serves both this website and the mobile app.
import type { User } from "@quikfly/shared";
import type { QuikflyApi } from "./contract";

const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
const TOKEN_KEY = "quikfly.token";

/** Fired on `window` when the API rejects the stored session (expired or revoked). */
export const UNAUTHORIZED_EVENT = "quikfly:unauthorized";

function token() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && token()) {
    clearToken();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  // Accept both `{ data: ... }` envelopes and bare payloads.
  return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
}

const qs = (o: Record<string, string>) => "?" + new URLSearchParams(o).toString();

export const httpApi: QuikflyApi = {
  auth: {
    sendOtp: (phone) => req("POST", "/auth/otp", { phone }),
    async verifyOtp(phone, otp, name) {
      const r = await req<{ token: string; user: User }>("POST", "/auth/verify", { phone, otp, name });
      try { localStorage.setItem(TOKEN_KEY, r.token); } catch { /* ignore */ }
      return r;
    },
    async signOut() {
      try { if (token()) await req("POST", "/auth/logout"); } catch { /* signed out locally either way */ }
      clearToken();
    },
  },
  places: { search: (q) => req("GET", `/places${qs({ q })}`) },
  rides: {
    quote: (service, pickupId, dropId) => req("POST", "/rides/quote", { service, pickupId, dropId }),
    book: (input) => req("POST", "/rides", input),
    cancel: (id) => req("POST", `/rides/${id}/cancel`),
  },
  buses: {
    search: (from, to, date) => req("GET", `/buses${qs({ from, to, date })}`),
    seats: (busId, date) => req("GET", `/buses/${busId}/seats${qs({ date })}`),
  },
  tours: { list: () => req("GET", "/tours") },
  rentals: {
    cars: (city) => req("GET", `/rentals/cars${qs({ city })}`),
    travelVehicles: () => req("GET", "/rentals/travel-vehicles"),
  },
  bookings: {
    list: () => req("GET", "/bookings"),
    create: (input) => req("POST", "/bookings", input),
    cancel: (id) => req("POST", `/bookings/${id}/cancel`),
  },
};
