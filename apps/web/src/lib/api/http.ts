// Real backend implementation of the API contract.
// Activated by setting NEXT_PUBLIC_API_URL. Endpoints mirror the comments in contract.ts,
// so the same REST API serves both this website and the mobile app.
import { CLIENT_ACCEPT, type AuthResult } from "@quikfly/shared";
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
      // Also says which newer services this site can show (packages/shared/src/clients.ts).
      Accept: CLIENT_ACCEPT,
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

/** Sends a raw image body (partner document photos). */
async function upload<T>(path: string, image: Blob): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": image.type || "application/octet-stream", Accept: CLIENT_ACCEPT, ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
    body: image,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Upload failed (${res.status})`);
  return json as T;
}

/** A signed-in image (partner document photos) as an object URL, or null when there's none. */
async function imageUrl(path: string): Promise<string | null> {
  const res = await fetch(`${BASE}${path}`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {} });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Couldn't load the photo (${res.status})`);
  return URL.createObjectURL(await res.blob());
}

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
    consent: (version) => req("POST", "/me/consent", { version }),
    exportData: () => req("GET", "/me/export"),
    async deleteAccount(otp) { await req("POST", "/me/delete", { otp }); clearToken(); },
    applyReferral: (code) => req("POST", "/me/referral", { code }),
    submitLicence: (number, expiry) => req("PUT", "/me/licence", { number, expiry }),
    walletHistory: () => req("GET", "/me/wallet"),
    credits: () => req("GET", "/me/credits"),
    buyPass: () => req("POST", "/me/pass"),
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
  sos: {
    raise: (r) => req("POST", "/me/sos", r),
  },
  contacts: {
    list: () => req("GET", "/me/contacts"),
    add: (c) => req("POST", "/me/contacts", c),
    remove: (id) => req("DELETE", `/me/contacts/${id}`),
  },
  places: { search: (q) => req("GET", `/places${qs({ q })}`) },
  rides: {
    quote: (service, pickupId, dropId, scheduledFor, stopIds) =>
      req("POST", "/rides/quote", { service, pickupId, dropId, ...(scheduledFor ? { scheduledFor } : {}), ...(stopIds?.length ? { stopIds } : {}) }),
    book: (input) => req("POST", "/rides", input),
    get: (id) => req("GET", `/rides/${id}`),
    start: (id) => req("POST", `/rides/${id}/start`),
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
  notifications: {
    list: () => req("GET", "/me/notifications"),
    markRead: (ids) => req("POST", "/me/notifications/read", ids ? { ids } : {}),
  },
  pushDevices: {
    register: (token, platform) => req("POST", "/me/push-devices", { token, platform }),
    remove: (token) => req("DELETE", `/me/push-devices/${encodeURIComponent(token)}`),
  },
  bookings: {
    list: () => req("GET", "/bookings"),
    get: (id) => req("GET", `/bookings/${encodeURIComponent(id)}`),
    create: (input) => req("POST", "/bookings", input),
    cancel: (id, reason) => req("POST", `/bookings/${id}/cancel`, reason ? { reason } : undefined),
    complete: (id) => req("POST", `/bookings/${id}/complete`),
    cancelSeats: (id, seatIds) => req("POST", `/bookings/${id}/cancel-seats`, { seatIds }),
    reschedule: (id, change) => req("POST", `/bookings/${id}/reschedule`, change),
  },
  parcels: {
    options: (from, to) => req("GET", `/parcels/options${qs({ from, to })}`),
    get: (id) => req("GET", `/bookings/${encodeURIComponent(id)}/parcel`),
    handover: (id, otp) => req("POST", `/bookings/${encodeURIComponent(id)}/parcel/handover`, { otp }),
    deliver: (id, otp) => req("POST", `/bookings/${encodeURIComponent(id)}/parcel/deliver`, { otp }),
    track: (lr) => req("GET", `/track/${encodeURIComponent(lr)}`),
  },
  tickets: {
    get: (t) => req("GET", `/tickets/${encodeURIComponent(t)}`),
  },
  rental: {
    get: (id) => req("GET", `/bookings/${encodeURIComponent(id)}/rental`),
    uploadPhoto: (id, stage, side, image) => upload(`/bookings/${encodeURIComponent(id)}/rental/photos/${stage}/${side}`, image),
    photoUrl: (id, stage, side) => imageUrl(`/bookings/${encodeURIComponent(id)}/rental/photos/${stage}/${side}`),
    start: (id, reading) => req("POST", `/bookings/${encodeURIComponent(id)}/rental/start`, reading),
    extensionQuote: (id, hours) => req("GET", `/bookings/${encodeURIComponent(id)}/rental/extension${qs({ hours: String(hours) })}`),
    extend: (id, hours) => req("POST", `/bookings/${encodeURIComponent(id)}/rental/extend`, { hours }),
    end: (id, reading) => req("POST", `/bookings/${encodeURIComponent(id)}/rental/return`, reading),
  },
  support: {
    requestCallback: (input) => req("POST", "/support/callbacks", input),
    list: () => req("GET", "/me/tickets"),
    get: (id) => req("GET", `/me/tickets/${encodeURIComponent(id)}`),
    open: (input) => req("POST", "/me/tickets", input),
    reply: (id, body) => req("POST", `/me/tickets/${encodeURIComponent(id)}/messages`, { body }),
    close: (id) => req("POST", `/me/tickets/${encodeURIComponent(id)}/close`),
  },
  vendor: {
    get: async () => (await req<{ application: import("@quikfly/shared").VendorApplication | null }>("GET", "/vendor")).application,
    start: () => req("POST", "/vendor"),
    saveSection: (section, body) => req("PUT", `/vendor/sections/${section}`, body),
    uploadDocument: (kind, image) => upload(`/vendor/documents/${kind}`, image),
    documentUrl: (kind) => imageUrl(`/vendor/documents/${kind}`),
    reset: () => req("POST", "/vendor/reset"),
    submit: () => req("POST", "/vendor/submit"),
    payJoiningFee: () => req("POST", "/vendor/onboarding/payment"),
    acceptAgreement: (name) => req("POST", "/vendor/onboarding/agreement", { name, accept: true }),
    requestSticker: () => req("POST", "/vendor/onboarding/sticker"),
  },
};
