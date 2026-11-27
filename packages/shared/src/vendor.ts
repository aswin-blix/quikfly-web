import { gstRate, type Settings } from "./settings";
import type { Gender, PaymentMethod, ServiceKey } from "./types";

// Vendor (partner) registration: vehicle owners who put a cab, auto, tempo traveller or bus
// on QuikFly, through the QuikFly Partner app. Step 1 is an application of six sections that
// staff review one by one; step 2 (onboarding) is the joining fee, the agreement, and the
// QuikFly sticker and paint. The API enforces these rules; the apps check early with them.

export const VENDOR_VEHICLE_TYPES = ["car", "auto", "tempo", "bus"] as const;
export type VendorVehicleType = (typeof VENDOR_VEHICLE_TYPES)[number];
export const VENDOR_VEHICLE_LABEL: Record<VendorVehicleType, string> = {
  car: "Car (cab or outstation)",
  auto: "Auto",
  tempo: "Tempo traveller",
  bus: "Bus or coach",
};

export const FUEL_TYPES = ["petrol_diesel", "cng_lpg", "electric"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];
export const FUEL_LABEL: Record<FuelType, string> = { petrol_diesel: "Petrol or diesel", cng_lpg: "CNG or LPG", electric: "Electric" };

/** The application's sections, in the order the Partner app lists them. */
export const VENDOR_SECTIONS = ["vehicle", "photo", "bank", "rc", "insurance", "audit"] as const;
export type VendorSection = (typeof VENDOR_SECTIONS)[number];
export const VENDOR_SECTION_LABEL: Record<VendorSection, string> = {
  vehicle: "City & vehicle details",
  photo: "Profile photo",
  bank: "Bank account details",
  rc: "Vehicle registration certificate",
  insurance: "Vehicle insurance",
  audit: "Vehicle audit",
};

/** Document photos a vendor uploads (stored privately; only the vendor and reviewing staff can open them). */
export const VENDOR_DOCUMENTS = ["photo", "rc", "insurance"] as const;
/** Photos on a vehicle added after joining, and on a driver. */
export const VEHICLE_DOCUMENTS = ["rc", "insurance"] as const;
export type VehicleDocument = (typeof VEHICLE_DOCUMENTS)[number];
export type VendorDocument = (typeof VENDOR_DOCUMENTS)[number];

/** pending: not filled yet · filled: waiting for review · changes: staff asked for a fix (see note) · approved */
export type SectionState = "pending" | "filled" | "changes" | "approved";

/**
 * draft: filling in (also after staff asked for changes) · submitted: waiting for review ·
 * onboarding: approved, doing step 2 · active: live on QuikFly · rejected · blocked
 */
export const VENDOR_STATUSES = ["draft", "submitted", "onboarding", "active", "rejected", "blocked"] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const AUDIT_SLOTS = ["morning", "afternoon"] as const;
export type AuditSlot = (typeof AUDIT_SLOTS)[number];
export const AUDIT_SLOT_LABEL: Record<AuditSlot, string> = { morning: "Morning (9 AM to 1 PM)", afternoon: "Afternoon (2 PM to 6 PM)" };

/** Bump when the agreement text changes; vendors accept a version. */
export const VENDOR_AGREEMENT_VERSION = "2026-11";

/** The partner agreement's terms, as the website shows them (Dart copy: apps/mobile/lib/partner/onboarding_screens.dart). Change both with the version. */
export const VENDOR_AGREEMENT_TERMS = [
  "Your vehicle and every driver you assign keep valid RC, insurance, permit and licence. Expired documents stop trips until renewed.",
  "Only drivers registered with QuikFly drive your vehicle on QuikFly trips.",
  "QuikFly sets customer fares. Your earnings are the fare less QuikFly's commission and taxes, shown for every trip.",
  "Earnings are paid to your registered bank account; you can request a payout from the app.",
  "The QuikFly sticker and paint stay on the vehicle while it's listed and come off when you leave.",
  "Safety rules (SOS, trip sharing, customer complaints) apply to every trip; QuikFly can pause a vehicle while a complaint is checked.",
  "Either side can end the partnership with 15 days' notice.",
] as const;

export interface VendorVehicle {
  id: string;
  type: VendorVehicleType;
  fuel: FuelType;
  regNumber: string;
  /** YYYY-MM-DD */
  purchaseDate: string;
  rc: { ownerName: string; validTill: string; hasPhoto: boolean } | null;
  insurance: { insurer: string; policyNumber: string; validTill: string; hasPhoto: boolean } | null;
  audit: { date: string; slot: AuditSlot; result: "booked" | "passed" | "failed"; note: string | null } | null;
  /**
   * pending: part of the application · draft: an added vehicle being filled · submitted: waiting
   * for review · approved: waiting for sticker & paint · active · inactive (the partner paused it)
   * · blocked (staff, or a document expired: see blockedReason) · rejected
   */
  status: VehicleStatus;
  /** Staff note when a vehicle was sent back or rejected. */
  reviewNote: string | null;
  blockedReason: string | null;
  /** A renewed RC or insurance waiting for staff to check it. */
  docsPending: boolean;
  /** The driver assigned to this vehicle, if any. */
  driverId: string | null;
}

export const VEHICLE_STATUSES = ["pending", "draft", "submitted", "approved", "active", "inactive", "blocked", "rejected"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

/** A driver a partner registers; staff confirm police verification and training before approving. */
export interface VendorDriver {
  id: string;
  name: string;
  phone: string;
  dlNumber: string;
  /** YYYY-MM-DD */
  dlValidTill: string;
  hasDlPhoto: boolean;
  /** submitted (waiting for review) · active · rejected · blocked (staff, or the licence expired) */
  status: "submitted" | "active" | "rejected" | "blocked";
  policeVerifiedAt: string | null;
  trainingDoneAt: string | null;
  reviewNote: string | null;
  blockedReason: string | null;
  docsPending: boolean;
  vehicleId: string | null;
  /** The partner drives this vehicle themselves. */
  self: boolean;
  /** Set by staff at review; women-only rides go only to women captains. */
  gender: Gender | null;
  /** True once the driver has signed in to QuikFly Captain with this number. */
  linked: boolean;
}

/** A partner's vehicles and drivers (GET /vendor/fleet). */
export interface VendorFleet {
  vehicles: VendorVehicle[];
  drivers: VendorDriver[];
}

/** Something staff need to look at on a live partner's fleet. */
export interface FleetReviewItem {
  vendorId: string;
  vendorName: string;
  kind: "vehicle" | "vehicle_sticker" | "vehicle_docs" | "driver" | "driver_docs";
  id: string;
  label: string;
  since: string;
}

export interface VendorApplication {
  id: string;
  status: VendorStatus;
  name: string;
  phone: string;
  city: string | null;
  hasPhoto: boolean;
  /** The account number is shown to the vendor masked (last 4 digits). */
  bank: { holder: string; ifsc: string; accountLast4: string } | null;
  vehicle: VendorVehicle | null;
  sections: Record<VendorSection, { state: SectionState; note: string | null }>;
  onboarding: {
    fee: number;
    paidAt: string | null;
    agreementAt: string | null;
    agreementName: string | null;
    stickerRequestedAt: string | null;
    stickerDoneAt: string | null;
  };
  submittedAt: string | null;
  reviewedAt: string | null;
  /** Why the application was rejected (or a general note from staff). */
  note: string | null;
}

/** What staff see in the review queue. */
export interface VendorSummary {
  id: string;
  status: VendorStatus;
  name: string;
  phone: string;
  city: string | null;
  vehicle: { type: VendorVehicleType; regNumber: string } | null;
  /** Sections not yet approved. */
  open: number;
  submittedAt: string | null;
  updatedAt: string;
}

/** The staff view of one vendor: the application plus the full bank account number. */
export interface AdminVendorDetail {
  application: VendorApplication;
  /** What QuikFly owes the partner (negative: the partner owes), and a payout waiting for staff. */
  money: { balancePaise: number; pendingPayoutPaise: number | null };
  /** Every vehicle and driver, once the partner is live. */
  fleet: VendorFleet;
  bankAccount: string | null;
  customerId: string;
}

export const VENDOR_RULES = {
  /** "TN57AX9979" style (state, district, series, number) or Bharat series "22BH1234AB". Spaces and dashes are ignored. */
  regNumber: /^(?:[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  account: /^\d{9,18}$/,
  policyNumber: /^[A-Z0-9/-]{6,30}$/,
  nameMin: 2,
  nameMax: 60,
  /** Largest document photo accepted (bytes); the apps shrink photos well below this. */
  maxPhotoBytes: 2 * 1024 * 1024,
  photoTypes: ["image/jpeg", "image/png", "image/webp"],
  /** How far ahead an audit can be booked (days). */
  auditMaxDays: 30,
} as const;

// ── Trips, earnings and payouts (part 3) ──

/** Income-tax TDS an e-commerce operator deducts from partners' gross sales (section 194-O, from Oct 2024). */
export const TDS_194O_PERCENT = 0.1;

/**
 * What a partner earns on one trip, in paise. `gross` is the fare before coupons and credits
 * (QuikFly absorbs those); prices include GST, which QuikFly pays as the e-commerce operator.
 * earning = fare without GST − QuikFly's commission − TDS.
 */
export function tripEarnings(settings: Settings, service: ServiceKey, grossRupees: number) {
  const gross = Math.round(grossRupees * 100);
  const fare = Math.round(gross / (1 + gstRate(settings, service) / 100));
  const commission = Math.round((fare * settings.vendorCommissionPercent) / 100);
  const tds = Math.round((gross * TDS_194O_PERCENT) / 100);
  return { gross, gst: gross - fare, fare, commission, tds, earning: fare - commission - tds };
}

/** Which partner vehicle type can take a ride option: cabs for car rides, autos for the Auto option. */
export function vehicleTypeForRide(option: { id: string; service: ServiceKey }): VendorVehicleType | null {
  if (option.service === "car") return "car";
  return option.id === "auto" ? "auto" : null;
}

/** Vehicle types whose drivers can take rides in QuikFly Captain (bikes join with self sign-up, step 6 of the plan). */
export const CAPTAIN_VEHICLE_TYPES: readonly VendorVehicleType[] = ["car", "auto"];
export const vehicleTypeForCaptain = (type: VendorVehicleType) => CAPTAIN_VEHICLE_TYPES.includes(type);

/** A trip on a partner's vehicle (GET /vendor/trips). Money is in paise. */
export interface VendorTrip {
  bookingId: string;
  status: "confirmed" | "ongoing" | "completed" | "cancelled";
  service: ServiceKey;
  title: string;
  subtitle: string;
  createdAt: string;
  startsAt: string | null;
  completedAt: string | null;
  vehicleId: string | null;
  regNumber: string | null;
  driverId: string | null;
  driverName: string | null;
  payment: PaymentMethod;
  grossPaise: number;
  discountPaise: number;
  gstPaise: number;
  farePaise: number;
  commissionPaise: number;
  tdsPaise: number;
  earningPaise: number;
  /** True until the trip is completed: the numbers use today's commission and may change. */
  estimate: boolean;
}

/** The dashboard for a date range (GET /vendor/summary). */
export interface VendorTripSummary {
  from: string;
  to: string;
  revenue: { trips: number; grossPaise: number; cashPaise: number; onlinePaise: number; discountPaise: number; earningPaise: number };
  vehicles: { vehicleId: string; regNumber: string; trips: number; earningPaise: number }[];
  drivers: { driverId: string; name: string; trips: number; earningPaise: number }[];
}

export type LedgerKind = "earning" | "cash" | "payout" | "payment" | "adjustment";
export const LEDGER_LABEL: Record<LedgerKind, string> = {
  earning: "Trip earning",
  cash: "Cash your driver collected",
  payout: "Paid to your bank",
  payment: "You paid QuikFly",
  adjustment: "Adjustment",
};

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  amountPaise: number;
  note: string;
  bookingId: string | null;
  createdAt: string;
}

export interface VendorPayout {
  id: string;
  amountPaise: number;
  status: "requested" | "paid" | "rejected";
  reference: string | null;
  note: string | null;
  requestedAt: string;
  decidedAt: string | null;
}

/** GET /vendor/money: balance, monthly statements (every month kept), ledger and payouts. */
export interface VendorMoney {
  /** Positive: QuikFly owes the partner. Negative: the partner owes QuikFly (cash their drivers kept). */
  balancePaise: number;
  minPayoutPaise: number;
  pendingPayout: VendorPayout | null;
  statements: { month: string; trips: number; grossPaise: number; commissionPaise: number; tdsPaise: number; earningPaise: number; cashPaise: number }[];
  entries: LedgerEntry[];
  payouts: VendorPayout[];
}

/** A payout request in the staff queue. */
export interface AdminPayout extends VendorPayout {
  vendorId: string;
  vendorName: string;
  bank: { holder: string; ifsc: string; account: string } | null;
}

/** A live partner vehicle staff can assign a trip to. */
export interface AssignableVehicle {
  vehicleId: string;
  regNumber: string;
  type: VendorVehicleType;
  vendorId: string;
  vendorName: string;
  driverId: string;
  driverName: string;
}

/** "₹1,234.50" from paise. */
export const inrPaise = (paise: number) =>
  `${paise < 0 ? "−" : ""}₹${(Math.abs(paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Vehicles that count towards a partner's fleet on the dashboard. */
export const isLiveVehicle = (v: Pick<VendorVehicle, "status">) => v.status === "active" || v.status === "inactive" || v.status === "blocked";

/** "tn 57 ax-9979" → "TN57AX9979" */
export const normaliseRegNumber = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

/** "TN57AX9979" → "TN 57 AX 9979" (for display). */
export function formatRegNumber(s: string) {
  const m = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{4})$/.exec(s);
  return m ? [m[1], m[2], m[3], m[4]].filter(Boolean).join(" ") : s;
}

/** Age of a vehicle in whole years on `today` (YYYY-MM-DD dates). */
export function vehicleAgeYears(purchaseDate: string, today = new Date().toISOString().slice(0, 10)) {
  const [py, pm, pd] = purchaseDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - py - (tm < pm || (tm === pm && td < pd) ? 1 : 0);
}

/** Step 1 is ready to send when every section is filled (or already approved). */
export const readyToSubmit = (a: Pick<VendorApplication, "sections">) =>
  VENDOR_SECTIONS.every((s) => a.sections[s].state === "filled" || a.sections[s].state === "approved");
