// The admin panel's only door to the backend. Screens call `adminApi`, never fetch().
// Endpoints are listed in apps/api/README.md (Admin section).
import type {
  AdminCustomer, AdminCustomerDetail, AdminRental, AdminRole, AdminSupportTicket, BookingNote, CustomerFilters, RentalPhotoSide, RentalSettlement, RentalStage,
  SosAlert, SosStatus, SupportStatus, TeamMember,
} from "@quikfly/shared";
import type {
  AdminBooking, AdminBookingDetail, AdminLoginResult, AdminStats, AdminUser, AuditEntry, BookingFilters, CatalogItem, CatalogKind, LicenceQueueStatus,
  LicenceReview, Page, Settings, AdminVendorDetail, AdminPayout, AssignableVehicle, FleetReviewItem, VehicleDocument, VendorDocument, VendorSection, VendorStatus, VendorSummary,
} from "@quikfly/shared";

export interface CatalogKindSummary { kind: CatalogKind; total: number; visible: number; canEdit: boolean }
export interface CatalogItemInput { data?: Record<string, unknown>; active?: boolean; sort?: number }

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

/** A private image (partner documents) as an object URL; revoke it when done. */
async function photo(path: string): Promise<string> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => ({}))) as { message?: string }).message || "Couldn't load the photo.");
  return URL.createObjectURL(await res.blob());
}

/** `{ a: 1, b: undefined }` → "?a=1" */
export function qs(params: Record<string, string | number | undefined | null>) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries.length ? "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : "";
}

export const adminApi = {
  customers: {
    search: (f: CustomerFilters) => req<Page<AdminCustomer>>("GET", `/admin/customers${qs({ ...f })}`),
    get: (id: string) => req<AdminCustomerDetail>("GET", `/admin/customers/${encodeURIComponent(id)}`),
    /** amount in ₹, negative to debit; the reason goes on the wallet entry the customer sees. */
    wallet: (id: string, amount: number, reason: string) => req<AdminCustomerDetail>("POST", `/admin/customers/${encodeURIComponent(id)}/wallet`, { amount, reason }),
    suspend: (id: string, reason: string) => req<AdminCustomerDetail>("POST", `/admin/customers/${encodeURIComponent(id)}/suspend`, { reason }),
    unsuspend: (id: string, reason: string) => req<AdminCustomerDetail>("POST", `/admin/customers/${encodeURIComponent(id)}/unsuspend`, { reason }),
    signOut: (id: string, reason: string) => req<AdminCustomerDetail>("POST", `/admin/customers/${encodeURIComponent(id)}/sign-out`, { reason }),
    cancelDeletion: (id: string, reason: string) => req<AdminCustomerDetail>("POST", `/admin/customers/${encodeURIComponent(id)}/cancel-deletion`, { reason }),
  },
  sos: {
    list: (status: SosStatus) => req<SosAlert[]>("GET", `/admin/sos${qs({ status })}`),
    get: (id: string) => req<SosAlert>("GET", `/admin/sos/${encodeURIComponent(id)}`),
    acknowledge: (id: string, note?: string) => req<SosAlert>("POST", `/admin/sos/${encodeURIComponent(id)}/acknowledge`, note ? { note } : {}),
    close: (id: string, reason: string) => req<SosAlert>("POST", `/admin/sos/${encodeURIComponent(id)}/close`, { reason }),
  },
  team: {
    list: () => req<TeamMember[]>("GET", "/admin/team"),
    create: (body: { email: string; name: string; role: AdminRole }) => req<{ member: TeamMember; password: string }>("POST", "/admin/team", body),
    update: (id: string, patch: { role?: AdminRole; name?: string; disabled?: boolean }) => req<TeamMember>("PATCH", `/admin/team/${encodeURIComponent(id)}`, patch),
    resetPassword: (id: string) => req<{ member: TeamMember; password: string }>("POST", `/admin/team/${encodeURIComponent(id)}/reset-password`),
  },
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
  audit: (page: number, entity?: string, key?: string) => req<Page<AuditEntry>>("GET", `/admin/audit${qs({ page, entity, key })}`),
  bookings: {
    search: (f: BookingFilters) => req<Page<AdminBooking>>("GET", `/admin/bookings${qs({ ...f })}`),
    get: (id: string) => req<AdminBookingDetail>("GET", `/admin/bookings/${encodeURIComponent(id)}`),
    cancel: (id: string, reason: string) => req<AdminBookingDetail>("POST", `/admin/bookings/${encodeURIComponent(id)}/cancel`, { reason }),
    complete: (id: string, tollsActual?: number) => req<AdminBookingDetail>("POST", `/admin/bookings/${encodeURIComponent(id)}/complete`, tollsActual === undefined ? undefined : { tollsActual }),
    assignVendor: (id: string, vehicleId: string | null) => req<AdminBookingDetail>("POST", `/admin/bookings/${encodeURIComponent(id)}/vendor`, { vehicleId }),
    rental: (id: string) => req<AdminRental>("GET", `/admin/bookings/${encodeURIComponent(id)}/rental`),
    rentalPhoto: (id: string, stage: RentalStage, side: RentalPhotoSide) => photo(`/admin/bookings/${encodeURIComponent(id)}/rental/photos/${stage}/${side}`),
    settlementPreview: (id: string, damage: number) => req<RentalSettlement>("GET", `/admin/bookings/${encodeURIComponent(id)}/rental/settlement${qs({ damage })}`),
    settle: (id: string, damage: number, damageNote: string) => req<AdminRental>("POST", `/admin/bookings/${encodeURIComponent(id)}/rental/settle`, { damage, damageNote }),
    addNote: (id: string, body: string) => req<BookingNote[]>("POST", `/admin/bookings/${encodeURIComponent(id)}/notes`, { body }),
    /** Downloads the CSV of the current filters (the API audits every export). */
    exportCsv: async (f: BookingFilters) => {
      const token = getToken();
      const res = await fetch(`${BASE}/admin/bookings/export.csv${qs({ ...f, page: undefined })}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => ({}))) as { message?: string }).message || "Couldn't export.");
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "quikfly-bookings.csv";
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return name;
    },
  },
  support: {
    list: (status: SupportStatus) => req<AdminSupportTicket[]>("GET", `/admin/support${qs({ status })}`),
    get: (id: string) => req<AdminSupportTicket>("GET", `/admin/support/${encodeURIComponent(id)}`),
    reply: (id: string, body: string) => req<AdminSupportTicket>("POST", `/admin/support/${encodeURIComponent(id)}/reply`, { body }),
    close: (id: string, note?: string) => req<AdminSupportTicket>("POST", `/admin/support/${encodeURIComponent(id)}/close`, note ? { note } : {}),
  },
  vendors: {
    list: (status: VendorStatus) => req<VendorSummary[]>("GET", `/admin/vendors${qs({ status })}`),
    get: (id: string) => req<AdminVendorDetail>("GET", `/admin/vendors/${encodeURIComponent(id)}`),
    section: (id: string, section: VendorSection, decision: "approve" | "changes", note?: string) =>
      req<AdminVendorDetail>("POST", `/admin/vendors/${encodeURIComponent(id)}/sections/${section}`, { decision, note }),
    review: (id: string, decision: "approve" | "changes" | "reject", note?: string) =>
      req<AdminVendorDetail>("POST", `/admin/vendors/${encodeURIComponent(id)}/review`, { decision, note }),
    sticker: (id: string) => req<AdminVendorDetail>("POST", `/admin/vendors/${encodeURIComponent(id)}/sticker`),
    /** A document photo as an object URL (the image needs the staff token, so it can't be a plain <img src>). */
    document: (id: string, kind: VendorDocument) => photo(`/admin/vendors/${encodeURIComponent(id)}/documents/${kind}`),
    vehicleDocument: (id: string, vehicleId: string, kind: VehicleDocument) => photo(`/admin/vendors/${encodeURIComponent(id)}/vehicles/${encodeURIComponent(vehicleId)}/documents/${kind}`),
    driverLicence: (id: string, driverId: string) => photo(`/admin/vendors/${encodeURIComponent(id)}/drivers/${encodeURIComponent(driverId)}/documents/dl`),
    fleetQueue: () => req<FleetReviewItem[]>("GET", "/admin/vendors/fleet-queue"),
    payouts: (status: AdminPayout["status"]) => req<AdminPayout[]>("GET", `/admin/vendors/payouts${qs({ status })}`),
    /** Paid (with the bank reference) or rejected (with a reason); returns the open requests. */
    decidePayout: (id: string, decision: "paid" | "rejected", body: { reference?: string; note?: string }) =>
      req<AdminPayout[]>("POST", `/admin/vendors/payouts/${encodeURIComponent(id)}`, { decision, ...body }),
    assignable: () => req<AssignableVehicle[]>("GET", "/admin/vendors/assignable-vehicles"),
    vehicle: (id: string, vehicleId: string, action: "review" | "sticker" | "docs" | "block", body?: Record<string, unknown>) =>
      req<AdminVendorDetail>("POST", `/admin/vendors/${encodeURIComponent(id)}/vehicles/${encodeURIComponent(vehicleId)}/${action}`, body),
    driver: (id: string, driverId: string, action: "review" | "docs" | "block", body: Record<string, unknown>) =>
      req<AdminVendorDetail>("POST", `/admin/vendors/${encodeURIComponent(id)}/drivers/${encodeURIComponent(driverId)}/${action}`, body),
  },
  licences: {
    list: (status: LicenceQueueStatus) => req<LicenceReview[]>("GET", `/admin/licences${qs({ status })}`),
    approve: (userId: string) => req<{ status: string }>("POST", `/admin/licences/${encodeURIComponent(userId)}/approve`),
    reject: (userId: string, reason: string) => req<{ status: string }>("POST", `/admin/licences/${encodeURIComponent(userId)}/reject`, { reason }),
  },
  catalog: {
    kinds: () => req<CatalogKindSummary[]>("GET", "/admin/catalog"),
    list: (kind: CatalogKind) => req<CatalogItem[]>("GET", `/admin/catalog/${kind}`),
    create: (kind: CatalogKind, body: CatalogItemInput) => req<CatalogItem>("POST", `/admin/catalog/${kind}`, body),
    update: (kind: CatalogKind, id: string, body: CatalogItemInput) => req<CatalogItem>("PUT", `/admin/catalog/${kind}/${encodeURIComponent(id)}`, body),
    remove: (kind: CatalogKind, id: string) => req<{ deleted: boolean }>("DELETE", `/admin/catalog/${kind}/${encodeURIComponent(id)}`),
    reset: () => req<{ reset: boolean }>("POST", "/admin/catalog/reset"),
  },
};
