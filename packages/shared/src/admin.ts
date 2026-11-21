// Admin panel: roles, permissions and the shapes the /admin API returns.
// The API enforces permissions; the admin app uses the same map to hide what a role can't do.
import type { Booking, ServiceKey, WalletTransaction, LicenceStatus } from "./types";

export const ADMIN_ROLES = ["owner", "operations", "content"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ROLE_INFO: Record<AdminRole, { label: string; summary: string }> = {
  owner: { label: "Owner", summary: "Everything, including settings and the audit log" },
  operations: { label: "Operations", summary: "Bookings, refunds, licence reviews, the catalog and prices" },
  content: { label: "Content", summary: "Catalog text, offer wording and FAQs (not prices)" },
};

/** Which roles may do what. Add a permission here, then check it in the API route and the admin UI. */
export const PERMISSIONS = {
  "dashboard.view": ["owner", "operations", "content"],
  "bookings.view": ["owner", "operations"],
  "bookings.manage": ["owner", "operations"],
  "licences.review": ["owner", "operations"],
  "vendors.review": ["owner", "operations"],
  "support.manage": ["owner", "operations"],
  "catalog.edit": ["owner", "operations", "content"],
  "offers.edit": ["owner", "operations", "content"],
  /** Fares, package and rental prices, coupon amounts and validity, showing or hiding an offer (fields flagged `pricing` in catalog-kinds.ts). */
  "pricing.edit": ["owner", "operations"],
  "settings.edit": ["owner"],
  "audit.view": ["owner"],
  /** The Customers screen: search, profile, wallet history, bookings. */
  "customers.view": ["owner", "operations"],
  /** Wallet adjustments, suspend / lift, sign out everywhere, cancel a scheduled deletion. */
  "customers.manage": ["owner", "operations"],
  /** SOS alerts: acknowledge and close. */
  "sos.manage": ["owner", "operations"],
  /** The Team screen: staff accounts, roles, password resets, disabling. */
  "team.manage": ["owner"],
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
  reasonMin: 5,
  /** Longest range the dashboard can show. */
  statsMaxDays: 90,
  /** Largest single wallet credit or debit staff can make (₹). */
  walletAdjustMax: 10_000,
  /** Rows in one CSV export (the free D1 plan and a browser download both prefer a bound). */
  exportMaxRows: 5000,
  /** Internal booking notes. */
  noteMin: 2,
  noteMax: 500,
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
  coupon: { code: string; discount: number } | null;
  /** What cancelling now would refund under the service's cancellation policy (₹ and %); null once finished. */
  refundIfCancelled: { amount: number; percent: number } | null;
  /** Audit entries for this booking (staff cancellations, completions). */
  history: AuditEntry[];
  /** The partner vehicle running this trip, if any. */
  partner: { vendorId: string; vendorName: string; vehicleId: string; regNumber: string; driverName: string | null } | null;
  /** ₹ of toll estimate in this active group trip's quote: completing it needs the actual tolls (`tollsActual`). Null otherwise. */
  tollEstimate: number | null;
  /** Internal staff notes, oldest first (missing from APIs older than Phase 6). */
  notes?: BookingNote[];
}

/** An internal note a staff member attached to a booking. Customers never see these. */
export interface BookingNote {
  id: string;
  body: string;
  admin: { id: string; name: string };
  createdAt: string;
}

export const BOOKING_STATUSES = ["confirmed", "ongoing", "completed", "cancelled"] as const;

export interface BookingFilters {
  /** Booking id, customer name or phone, or title. */
  q?: string;
  status?: (typeof BOOKING_STATUSES)[number];
  service?: ServiceKey;
  /** India-time dates, YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
  /** "returned": self-drive cars the customer has returned, waiting for staff to settle the deposit. */
  rental?: "returned";
  page?: number;
}

export const LICENCE_QUEUE_STATUSES = ["pending", "rejected", "verified"] as const;
export type LicenceQueueStatus = (typeof LICENCE_QUEUE_STATUSES)[number];

export interface LicenceReview {
  customer: CustomerRef;
  status: LicenceQueueStatus;
  number: string;
  expiry: string;
  submittedAt: string;
  reviewedAt: string | null;
  /** Rejection reason shown to the customer. */
  note: string | null;
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
  /** returnsToSettle: self-drive cars returned by the customer, waiting for staff to settle the deposit. openSos: SOS alerts nobody has acknowledged (missing from older APIs). */
  queues: { pendingLicences: number; pendingDeletions: number; returnsToSettle: number; openSos?: number };
  recent: AdminBooking[];
}

/* ───────────── Phase 6: customers, SOS, team ───────────── */

export const CUSTOMER_STATUSES = ["active", "suspended", "deleting", "erased"] as const;
/** deleting: the customer asked to delete the account (30-day grace); erased: personal details removed. */
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export interface AdminCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  walletBalance: number;
  /** All bookings ever, any status. */
  bookings: number;
  status: CustomerStatus;
  suspendReason: string | null;
  suspendedAt: string | null;
  deletedAt: string | null;
  licenceStatus: LicenceStatus;
  /** The partner application's status when this person is (or applied to be) a vehicle owner. */
  vendorStatus: string | null;
}

export interface CustomerFilters {
  /** Name, phone, email or customer id. */
  q?: string;
  status?: CustomerStatus;
  page?: number;
}

export interface AdminCustomerDetail {
  customer: AdminCustomer;
  /** Wallet history, newest first (up to 100). */
  wallet: WalletTransaction[];
  /** The newest 10 bookings. */
  bookings: AdminBooking[];
  /** Staff actions on this customer (wallet adjustments, suspensions...). */
  history: AuditEntry[];
  /** Live sign-in sessions right now. */
  sessions: number;
}

export const SOS_STATUSES = ["open", "acknowledged", "closed"] as const;
export type SosStatus = (typeof SOS_STATUSES)[number];

/** An SOS press, as staff see it: who, where (when shared), which ride, and who is handling it. */
export interface SosAlert {
  id: string;
  customer: CustomerRef;
  rideId: string | null;
  bookingId: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  status: SosStatus;
  createdAt: string;
  handledBy: { id: string; name: string } | null;
  handledAt: string | null;
  handledNote: string | null;
  /** The ride at the time of the press, when there was one. */
  ride: { driverName: string; vehicle: string; plate: string; pickup: string; drop: string; status: string } | null;
}

/** A staff account on the Team screen. */
export interface TeamMember extends AdminUser {
  disabledAt: string | null;
  /** Locked out after too many wrong passwords until this time (ms since epoch), when set. */
  lockedUntil: number | null;
}
