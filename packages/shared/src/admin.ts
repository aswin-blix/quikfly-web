// Admin panel: roles, permissions and the shapes the /admin API returns.
// The API enforces permissions; the admin app uses the same map to hide what a role can't do.
import type { CaptainLiveStatus } from "./driver";
import { PARCEL_STATES, type CounterScope, type Parcel, type ParcelEvent, type ParcelLeg, type ParcelState, type ParcelWeightBand } from "./parcel";
import type { Booking, BookingStatus, PaymentMethod, ServiceKey, WalletTransaction, LicenceStatus } from "./types";

export const ADMIN_ROLES = ["owner", "operations", "content", "counter"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_ROLE_INFO: Record<AdminRole, { label: string; summary: string }> = {
  owner: { label: "Owner", summary: "Everything, including settings and the audit log" },
  operations: { label: "Operations", summary: "Bookings, refunds, licence reviews, the catalog and prices" },
  content: { label: "Content", summary: "Catalog text, offer wording and FAQs (not prices)" },
  counter: { label: "Counter", summary: "Bus parcels at one operator's counter in one city, and nothing else" },
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
  /**
   * The Parcels screen: the queue with both people's details, and counter actions (hand in, load, hand over, refuse).
   * A "counter" account has it only within its scope (AdminUser.counter): every /admin/parcels route applies that.
   */
  "parcels.manage": ["owner", "operations", "counter"],
  /** Another bus, the weight (it moves money) and returns: never a counter login's. */
  "parcels.change": ["owner", "operations"],
  /** SOS alerts: acknowledge and close. */
  "sos.manage": ["owner", "operations"],
  /** The Team screen: staff accounts, roles, password resets, disabling. */
  "team.manage": ["owner"],
  /**
   * Staff alerts (the admin bell): SOS presses, new tickets and callbacks, partner applications and
   * reviews, payout requests, licences to review, unclaimed parcels; and this browser's push subscription.
   * Each admin sees the alerts of the permissions its role has (STAFF_ALERT_PERMISSION). Not content
   * (nothing in that list is theirs to act on) and not counter (alerts have no operator or city scope).
   */
  "alerts.view": ["owner", "operations"],
  /** QuikFly Captain: the Captains page (who is online, on a ride, silent) and a live ride's dispatch log. */
  "drivers.view": ["owner", "operations"],
  /** Set a captain offline (e.g. an app left open on a parked phone). Blocking stays a partner review (vendors.review). */
  "drivers.manage": ["owner", "operations"],
} as const satisfies Record<string, readonly AdminRole[]>;
export type Permission = keyof typeof PERMISSIONS;

export const can = (role: AdminRole, permission: Permission) =>
  (PERMISSIONS[permission] as readonly AdminRole[]).includes(role);

/** Every permission a role has. */
export const permissionsOf = (role: AdminRole): Permission[] =>
  (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));

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
  /** Role "counter": where it works. null for the others (and a counter account with none sees nothing). */
  counter?: CounterScope | null;
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
  /** A live ride's dispatch log: who was offered it, in order, how far away, and what each did. Empty for simulated rides. */
  dispatch?: DispatchStep[];
}

/** One offer of a live ride (ride_offers). */
export interface DispatchStep {
  seq: number;
  driverId: string;
  driverName: string;
  vendorId: string;
  offeredAt: string;
  /** Distance to the pickup when offered (km); null for offers made before it was recorded. */
  km: number | null;
  /** pending · accepted · declined · timeout · withdrawn · released */
  outcome: string;
  decidedAt: string | null;
  /** Why the captain gave an accepted ride back (CAPTAIN_RELEASE_REASONS id). */
  reason: string | null;
}

/** A captain as staff see them (GET /admin/captains). */
export interface AdminCaptain {
  driverId: string;
  name: string;
  phone: string;
  gender: string | null;
  vendor: { id: string; name: string };
  vehicle: { id: string; type: string; regNumber: string } | null;
  status: CaptainLiveStatus;
  seenAt: string | null;
  /** On the demo city map; demo = a position the captain picked, not GPS. */
  position: { x: number; y: number } | null;
  demo: boolean;
  rideId: string | null;
  /** The same words the Captain app shows for why they can't go online; null when nothing stops them. */
  blocker: string | null;
  tripsToday: number;
  earningTodayPaise: number;
}

/** GET /admin/captains: the readiness card and the list. */
export interface AdminCaptains {
  readiness: {
    /** Approved drivers on a vehicle Captain serves (autos and cars). */
    approved: number;
    /** Of those, signed in to QuikFly Captain at least once. */
    signedIn: number;
    online: number;
    onRide: number;
    liveDrivers: boolean;
    demoLocation: boolean;
    simulateDrivers: boolean;
  };
  captains: AdminCaptain[];
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
  queues: { pendingLicences: number; pendingDeletions: number; parcelsToday?: number; parcelsOnBus?: number; parcelsReady?: number; parcelsUnclaimed?: number; returnsToSettle: number; openSos?: number };
  recent: AdminBooking[];
}

/* ───────────── Staff alerts ───────────── */

/** What happened that staff should look at. The admin panel picks an icon and a page per kind. */
export const STAFF_ALERT_KINDS = [
  "sos.raised", "support.ticket", "support.reply", "support.callback",
  "vendor.applied", "vendor.fleet", "vendor.payout", "licence.submitted", "parcel.unclaimed",
] as const;
export type StaffAlertKind = (typeof STAFF_ALERT_KINDS)[number];

/** Who an alert is for: the permission that can act on it. An admin sees the kinds its role's permissions cover. */
export const STAFF_ALERT_PERMISSION: Record<StaffAlertKind, Permission> = {
  "sos.raised": "sos.manage",
  "support.ticket": "support.manage",
  "support.reply": "support.manage",
  "support.callback": "support.manage",
  "vendor.applied": "vendors.review",
  "vendor.fleet": "vendors.review",
  "vendor.payout": "vendors.review",
  "licence.submitted": "licences.review",
  // parcels.change, not parcels.manage: returns are operations' job, and a counter login has no city scope here.
  "parcel.unclaimed": "parcels.change",
};

/** One staff alert as the panel shows it. Never carries a customer's name, number or a parcel's receiver or code. */
export interface StaffAlert {
  id: string;
  kind: StaffAlertKind;
  permission: Permission;
  title: string;
  body: string;
  /** The admin page to open, e.g. "/sos" or "/vendors/view?id=VN…". */
  link: string;
  createdAt: string;
  /** When this admin read it (read marks are per admin). */
  readAt: string | null;
}

export interface StaffAlerts {
  /** Newest first, the ones this admin's role can act on. */
  items: StaffAlert[];
  unread: number;
  /** Browser push for staff: the VAPID public key, or null when push is switched off. */
  push: { vapidPublicKey: string } | null;
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

/* ───────────── Parcels ───────────── */

/** "open" is everything staff may still have to act on: neither collected nor cancelled. */
export const PARCEL_QUEUE_STATES = ["open", ...PARCEL_STATES, "all"] as const;
export type ParcelQueueState = (typeof PARCEL_QUEUE_STATES)[number];

export interface ParcelFilters {
  /** A counter city: parcels handed in or collected there. */
  city?: string;
  /** Default "open". */
  state?: ParcelQueueState;
  /** The bus's departure date in India, YYYY-MM-DD. */
  date?: string;
  /** An LR number, a booking id, or part of either person's number. */
  q?: string;
  page?: number;
}

/** A row of the parcels queue. */
export interface AdminParcelRow {
  bookingId: string;
  bookingStatus: BookingStatus;
  lr: string;
  state: ParcelState;
  from: string;
  to: string;
  departAt: string | null;
  weightBand: ParcelWeightBand;
  holdUntil: string | null;
  legs: ParcelLeg[];
  sender: CustomerRef;
  receiver: { name: string; phone: string };
}

/** One parcel for staff. `collectOtp` is always null here. */
export interface AdminParcel extends Parcel {
  bookingStatus: BookingStatus;
  sender: CustomerRef;
  amount: number;
  payment: PaymentMethod;
  /** Under the policy it was sold with; null once it can't be cancelled. */
  refundIfCancelled: { amount: number; percent: number } | null;
  /** `by`: the staff member; null for the customer or the simulated carrier. */
  events: (ParcelEvent & { by: string | null })[];
}
