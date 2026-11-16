// Real backend implementation of the API contract.
// Activated by setting NEXT_PUBLIC_API_URL. Endpoints mirror the comments in contract.ts,
// so the same REST API serves both this website and the mobile app.
import type { AuthResult } from "@quikfly/shared";
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
  config: { get: () => req("GET", "/config") },
  auth: {
    sendOtp: (phone) => req("POST", "/auth/otp", { phone }),
    async verifyOtp(phone, otp) {
      const r = await req<AuthResult>("POST", "/auth/verify", { phone, otp });
      try { localStorage.setItem(TOKEN_KEY, r.token); } catch { /* ignore */ }
      return r;
    },
    async signOut() {
      try { if (token()) await req("POST", "/auth/logout"); } catch { /* signed out locally either way */ }
      clearToken();
    },
    me: () => req("GET", "/auth/me"),
  },
  account: {
    update: (patch) => req("PATCH", "/me", patch),
    requestPhoneChange: (phone) => req("POST", "/me/phone/otp", { phone }),
    changePhone: (phone, otp) => req("POST", "/me/phone", { phone, otp }),
    async signOutEverywhere() { await req("POST", "/me/logout-all"); clearToken(); },
    async deleteAccount(otp) { await req("POST", "/me/delete", { otp }); clearToken(); },
    applyReferral: (code) => req("POST", "/me/referral", { code }),
    submitLicence: (number, expiry) => req("PUT", "/me/licence", { number, expiry }),
    walletHistory: () => req("GET", "/me/wallet"),
  },
  savedPlaces: {
    list: () => req("GET", "/me/places"),
    save: (kind, placeId, label) => req("POST", "/me/places", { kind, placeId, label }),
    remove: (id) => req("DELETE", `/me/places/${id}`),
  },
  travellers: {
    list: () => req("GET", "/me/travellers"),
    add: (t) => req("POST", "/me/travellers", t),
    remove: (id) => req("DELETE", `/me/travellers/${id}`),
  },
  contacts: {
    list: () => req("GET", "/me/contacts"),
    add: (c) => req("POST", "/me/contacts", c),
    remove: (id) => req("DELETE", `/me/contacts/${id}`),
  },
  places: { search: (q) => req("GET", `/places${qs({ q })}`) },
  rides: {
    quote: (service, pickupId, dropId) => req("POST", "/rides/quote", { service, pickupId, dropId }),
    book: (input) => req("POST", "/rides", input),
    cancel: (id) => req("POST", `/rides/${id}/cancel`),
    share: (id) => req("POST", `/rides/${id}/share`),
    shared: (t) => req("GET", `/share/${encodeURIComponent(t)}`),
  },
  buses: {
    search: (from, to, date) => req("GET", `/buses${qs({ from, to, date })}`),
    seats: (bus, date) => req("GET", `/buses/${encodeURIComponent(bus.id)}/seats${qs({ from: bus.from, to: bus.to, date })}`),
  },
  tours: {
    list: () => req("GET", "/tours"),
    get: (slug) => req("GET", `/tours/${encodeURIComponent(slug)}`),
  },
  rentals: {
    cars: (city) => req("GET", `/rentals/cars${qs({ city })}`),
    car: (id) => req("GET", `/rentals/cars/${encodeURIComponent(id)}`),
    travelVehicles: () => req("GET", "/rentals/travel-vehicles"),
  },
  quotes: { create: (r) => req("POST", "/quotes", r) },
  offers: { check: (code, ref) => req("POST", "/offers/check", { code, ...ref }) },
  bookings: {
    list: () => req("GET", "/bookings"),
    get: (id) => req("GET", `/bookings/${encodeURIComponent(id)}`),
    create: (input) => req("POST", "/bookings", input),
    cancel: (id) => req("POST", `/bookings/${id}/cancel`),
    complete: (id) => req("POST", `/bookings/${id}/complete`),
  },
};
