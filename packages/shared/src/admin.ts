// Admin panel: roles, permissions and the shapes the /admin API returns.
// The API enforces permissions; the admin app uses the same map to hide what a role can't do.
import type { Booking, ServiceKey, WalletTransaction } from "./types";

export const ADMIN_ROLES = ["owner", "operations", "content"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ROLE_INFO: Record<AdminRole, { label: string; summary: string }> = {
  owner: { label: "Owner", summary: "Everything, including settings and the audit log" },
  operations: { label: "Operations", summary: "Bookings, refunds, licence reviews and the catalog" },
  content: { label: "Content", summary: "Catalog, offers and FAQs" },
};

/** Which roles may do what. Add a permission here, then check it in the API route and the admin UI. */
export const PERMISSIONS = {
  "dashboard.view": ["owner", "operations", "content"],
  "bookings.view": ["owner", "operations"],
  "bookings.manage": ["owner", "operations"],
  "licences.review": ["owner", "operations"],
  "catalog.edit": ["owner", "operations", "content"],
  "offers.edit": ["owner", "operations", "content"],
  "settings.edit": ["owner"],
  "audit.view": ["owner"],
} as const satisfies Record<string, readonly AdminRole[]>;
export type Permission = keyof typeof PERMISSIONS;

export const can = (role: AdminRole, permission: Permission) =>
  (PERMISSIONS[permission] as readonly AdminRole[]).includes(role);

export const ADMIN_RULES = {
  passwordMin: 10,
  passwordMax: 128,
  /** Wrong passwords in a row before the account is locked for `lockMinutes`. */
  maxFailedLogins: 5,
  lockMinutes: 15,
  sessionHours: 12,
  pageSize: 25,
  reasonMax: 300,
  /** Longest range the dashboard can show. */
  statsMaxDays: 90,
} as const;

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminLoginResult {
  token: string;
  admin: AdminUser;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditEntry {
  id: string;
  admin: { id: string; name: string } | null;
  /** e.g. "booking.cancel", "licence.approve", "catalog.update", "settings.update" */
  action: string;
  entity: string;
  entityId: string | null;
  /** What changed: usually `{ before, after }` or the request's key fields. */
  detail: unknown;
  createdAt: string;
}

export interface CustomerRef {
  id: string;
  name: string;
  phone: string;
}

export interface AdminBooking extends Booking {
  customer: CustomerRef;
}

export interface AdminBookingDetail {
  booking: AdminBooking;
  /** Wallet entries linked to this booking (payment, refund). */
  wallet: WalletTransaction[];
}

export interface LicenceReview {
  customer: CustomerRef;
  number: string;
  expiry: string;
  submittedAt: string;
}

export interface AdminStats {
  days: number;
  totals: {
    bookings: number;
    /** Sum of non-cancelled bookings in the range, in rupees. */
    revenue: number;
    cancelled: number;
    newCustomers: number;
    customers: number;
    /** Money customers hold in wallets now (a liability). */
    walletBalance: number;
  };
  byService: { service: ServiceKey; bookings: number; revenue: number }[];
  /** One entry per day in the range, oldest first (YYYY-MM-DD, India time). */
  byDay: { date: string; bookings: number; revenue: number; cancelled: number }[];
  queues: { pendingLicences: number; pendingDeletions: number };
  recent: AdminBooking[];
}
