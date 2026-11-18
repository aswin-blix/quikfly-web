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
  status: "pending" | "active" | "inactive" | "blocked";
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
