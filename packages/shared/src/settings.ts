// Business settings an owner changes from the admin panel. The API stores them in the
// `settings` table and falls back to these defaults; GET /config hands them to the website
// and the app. To add one: a key + default here, a rule in SETTING_RULES, a row in
// apps/admin/src/lib/settings-fields.ts. The API validates against SETTING_RULES.
import { CANCEL_POLICY_HINT, CANCEL_POLICY_PATTERN, checkCancelPolicy } from "./cancellation";
import type { ServiceKey } from "./types";

export interface Settings {
  /**
   * Services open for new bookings (see switches.ts). Off = hidden in the website and app and
   * refused by the API; bookings already made carry on.
   */
  serviceBike: boolean;
  serviceCar: boolean;
  serviceBus: boolean;
  serviceTours: boolean;
  serviceRent: boolean;
  serviceGroup: boolean;
  /** What customers see where a paused service would be. */
  servicePausedMessage: string;
  /** Features that can be switched off without pausing a whole service. */
  featureRideScheduling: boolean;
  featureMultiStop: boolean;
  featureCashRides: boolean;
  featureOutstation: boolean;
  featureSelfDrive: boolean;
  featureTripOffers: boolean;
  featureReferral: boolean;

  /** Verify a submitted driving licence at once instead of waiting for an admin (unattended demos). */
  licenceAutoApprove: boolean;

  /** Wallet credit every new account starts with (₹). */
  welcomeCredit: number;
  /** Credit both people get when a friend's referral code is used (₹). */
  referralBonus: number;

  /** Ride fares are multiplied by this during surge hours. 1 = no surge. */
  surgeMultiplier: number;
  /** Surge windows in India time, inclusive hours: "8-10, 17-20". Empty = never. */
  surgeHours: string;
  /** Surge never goes above this (MVAG 2025: 2× the base fare; some states ask for less). */
  surgeCap: number;

  /** Rider cancellation fee without a valid reason: % of the fare, capped (MVAG 2025: 10%, ₹100). */
  rideCancelFeePercent: number;
  rideCancelFeeCap: number;
  /** Cancelling within this many minutes of booking is always free. */
  rideCancelFreeMinutes: number;

  /** Waiting time allowed at each extra stop (minutes), added to the trip time and charged at the per-minute rate. */
  rideStopMinutes: number;

  /** Scheduled rides: how soon (minutes) and how far ahead (days) a pickup can be booked. */
  rideScheduleMinMinutes: number;
  rideScheduleMaxDays: number;
  /** Cancelling a scheduled ride is free until this many minutes before pickup. */
  rideScheduleFreeCancelMinutes: number;

  /** Bus base fares (₹ per seat) before the generator's per-bus variation. */
  busFareAc: number;
  busFareNonAc: number;
  busSleeperExtra: number;
  /** Extra for a lower-deck seat (₹). */
  busLowerDeckExtra: number;

  /** GST rates (%) per service: added to bus and holiday prices, and shown on invoices. */
  gstRides: number;
  gstBus: number;
  gstTours: number;
  gstRent: number;
  gstGroup: number;

  /** Child price as a percentage of the adult price on holidays. */
  tourChildPercent: number;

  /** Unlimited-km self-drive costs this much more than the 140 km/day plan (%). */
  rentUnlimitedKmExtraPercent: number;
  rentProtectionStandardPerDay: number;
  rentProtectionPeacePerDay: number;
  rentDoorstepFee: number;
  /** Refundable deposit collected with self-drive bookings (₹). */
  rentDeposit: number;
  /** Staff aim to confirm the car's return (which refunds the deposit) within this many hours; shown to customers. */
  rentDepositRefundHours: number;
  /** Kilometres a day included in the limited self-drive plan, and the stated rate beyond it (₹/km). */
  rentLimitedKmPerDay: number;
  rentExtraKmRate: number;
  /** Added per night a chauffeur booking runs through 10 PM–6 AM (₹). 0 = no night charge. */
  rentDriverNightCharge: number;
  /** Self-drive documents, separated by ";" (shown on the car page). */
  rentDocuments: string;
  /** On only when a roadside-assistance contract exists; off shows the support line instead. */
  rentRoadsideAssistance: boolean;

  /** Kilometres included per day in the group-travel local package. */
  groupLocalKmPerDay: number;
  /** One-way trips cost this much more per km than round trips (the vehicle returns empty). */
  groupOneWaySurchargePercent: number;
  /** Paid to the driver for each night of a multi-day round trip (₹). 0 = none. */
  groupDriverNightAllowance: number;

  /**
   * Refund tiers per service, as "notice:percent" pairs with the longest notice first,
   * e.g. "15d:100, 7d:50" = full refund 15+ days before, half 7+ days before, nothing later.
   * Empty = full refund any time. Rides have none (they start at once). See cancellation.ts.
   */
  cancelPolicyBus: string;
  cancelPolicyTours: string;
  cancelPolicyRent: string;
  cancelPolicyGroup: string;

  /** QuikFly Credits earned back on completed trips, % of the amount paid per service (0 = none). */
  creditsRides: number;
  creditsBus: number;
  creditsTours: number;
  creditsRent: number;
  creditsGroup: number;
  /** Most credits one booking can earn (₹). */
  creditsCap: number;
  /** Credits expire this many days after they are earned (or returned). */
  creditsExpiryDays: number;
  /** Credits can pay at most this share of a booking (%). */
  creditsMaxRedeemPercent: number;

  /** Seller details printed on invoices. */
  companyName: string;
  companyAddress: string;
  companyGstin: string;
  companyEmail: string;
  companyPhone: string;
  /** QuikFly's 24×7 safety line, shown in the SOS sheet. */
  safetyLine: string;
}

export const DEFAULT_SETTINGS: Settings = {
  serviceBike: true,
  serviceCar: true,
  serviceBus: true,
  serviceTours: true,
  serviceRent: true,
  serviceGroup: true,
  servicePausedMessage: "This service is paused for now. Please check back soon.",
  featureRideScheduling: true,
  featureMultiStop: true,
  featureCashRides: true,
  featureOutstation: true,
  featureSelfDrive: true,
  featureTripOffers: true,
  featureReferral: true,
  licenceAutoApprove: false,
  welcomeCredit: 500,
  referralBonus: 100,
  surgeMultiplier: 1.2,
  surgeHours: "8-10, 17-20",
  surgeCap: 2,
  rideCancelFeePercent: 10,
  rideCancelFeeCap: 100,
  rideCancelFreeMinutes: 2,
  rideStopMinutes: 3,
  rideScheduleMinMinutes: 30,
  rideScheduleMaxDays: 30,
  rideScheduleFreeCancelMinutes: 60,
  busFareAc: 650,
  busFareNonAc: 420,
  busSleeperExtra: 250,
  busLowerDeckExtra: 50,
  gstRides: 5,
  gstBus: 5,
  gstTours: 5,
  gstRent: 18,
  gstGroup: 5,
  tourChildPercent: 60,
  rentUnlimitedKmExtraPercent: 25,
  rentProtectionStandardPerDay: 199,
  rentProtectionPeacePerDay: 399,
  rentDoorstepFee: 299,
  rentDeposit: 2000,
  rentDepositRefundHours: 48,
  rentLimitedKmPerDay: 140,
  rentExtraKmRate: 12,
  rentDriverNightCharge: 250,
  rentDocuments: "Driving licence held for at least 1 year; Aadhaar or passport; Driver aged 21 or over",
  rentRoadsideAssistance: false,
  groupLocalKmPerDay: 80,
  groupOneWaySurchargePercent: 15,
  groupDriverNightAllowance: 250,
  cancelPolicyBus: "12h:100, 4h:50",
  cancelPolicyTours: "15d:100, 7d:50",
  cancelPolicyRent: "24h:100",
  cancelPolicyGroup: "48h:100",
  creditsRides: 5,
  creditsBus: 2,
  creditsTours: 3,
  creditsRent: 3,
  creditsGroup: 3,
  creditsCap: 150,
  creditsExpiryDays: 60,
  creditsMaxRedeemPercent: 50,
  companyName: "QuikFly Mobility Pvt. Ltd.",
  companyAddress: "Chennai, Tamil Nadu, India",
  companyGstin: "33AAACQ0000A1Z5",
  companyEmail: "support@quikfly.in",
  companyPhone: "1800 123 4567",
  safetyLine: "1800 123 4567",
};

type Rule =
  | { type: "boolean" }
  | { type: "number"; min: number; max: number; integer?: boolean }
  | { type: "text"; max: number; min?: number; pattern?: RegExp; hint?: string };

const money = (max: number): Rule => ({ type: "number", min: 0, max, integer: true });
const percent: Rule = { type: "number", min: 0, max: 100, integer: true };
const SURGE_HOURS = /^\s*$|^\s*\d{1,2}\s*-\s*\d{1,2}(\s*,\s*\d{1,2}\s*-\s*\d{1,2})*\s*$/;
const cancelPolicy: Rule = { type: "text", max: 80, pattern: CANCEL_POLICY_PATTERN, hint: CANCEL_POLICY_HINT };

/** Allowed values per setting. The API refuses anything else. */
export const SETTING_RULES: Record<keyof Settings, Rule> = {
  serviceBike: { type: "boolean" },
  serviceCar: { type: "boolean" },
  serviceBus: { type: "boolean" },
  serviceTours: { type: "boolean" },
  serviceRent: { type: "boolean" },
  serviceGroup: { type: "boolean" },
  servicePausedMessage: { type: "text", min: 5, max: 160 },
  featureRideScheduling: { type: "boolean" },
  featureMultiStop: { type: "boolean" },
  featureCashRides: { type: "boolean" },
  featureOutstation: { type: "boolean" },
  featureSelfDrive: { type: "boolean" },
  featureTripOffers: { type: "boolean" },
  featureReferral: { type: "boolean" },
  licenceAutoApprove: { type: "boolean" },
  welcomeCredit: money(5000),
  referralBonus: money(5000),
  surgeMultiplier: { type: "number", min: 1, max: 3 },
  surgeHours: { type: "text", max: 60, pattern: SURGE_HOURS, hint: 'Hour ranges like "8-10, 17-20" (0–23), or empty for no surge.' },
  surgeCap: { type: "number", min: 1, max: 3 },
  rideCancelFeePercent: percent,
  rideCancelFeeCap: money(1000),
  rideCancelFreeMinutes: { type: "number", min: 0, max: 30, integer: true },
  rideStopMinutes: { type: "number", min: 0, max: 15, integer: true },
  rideScheduleMinMinutes: { type: "number", min: 5, max: 240, integer: true },
  rideScheduleMaxDays: { type: "number", min: 1, max: 90, integer: true },
  rideScheduleFreeCancelMinutes: { type: "number", min: 0, max: 1440, integer: true },
  busFareAc: money(10000),
  busFareNonAc: money(10000),
  busSleeperExtra: money(5000),
  busLowerDeckExtra: money(2000),
  gstRides: percent,
  gstBus: percent,
  gstTours: percent,
  gstRent: percent,
  gstGroup: percent,
  tourChildPercent: percent,
  rentUnlimitedKmExtraPercent: { type: "number", min: 0, max: 200, integer: true },
  rentProtectionStandardPerDay: money(5000),
  rentProtectionPeacePerDay: money(5000),
  rentDoorstepFee: money(5000),
  rentDeposit: money(50000),
  rentDepositRefundHours: { type: "number", min: 1, max: 720, integer: true },
  rentLimitedKmPerDay: { type: "number", min: 10, max: 2000, integer: true },
  rentExtraKmRate: money(500),
  rentDriverNightCharge: money(5000),
  rentDocuments: { type: "text", min: 3, max: 300 },
  rentRoadsideAssistance: { type: "boolean" },
  groupLocalKmPerDay: { type: "number", min: 10, max: 500, integer: true },
  groupOneWaySurchargePercent: percent,
  groupDriverNightAllowance: money(5000),
  cancelPolicyBus: cancelPolicy,
  cancelPolicyTours: cancelPolicy,
  cancelPolicyRent: cancelPolicy,
  cancelPolicyGroup: cancelPolicy,
  creditsRides: { type: "number", min: 0, max: 50, integer: true },
  creditsBus: { type: "number", min: 0, max: 50, integer: true },
  creditsTours: { type: "number", min: 0, max: 50, integer: true },
  creditsRent: { type: "number", min: 0, max: 50, integer: true },
  creditsGroup: { type: "number", min: 0, max: 50, integer: true },
  creditsCap: money(5000),
  creditsExpiryDays: { type: "number", min: 1, max: 365, integer: true },
  creditsMaxRedeemPercent: percent,
  companyName: { type: "text", min: 2, max: 120 },
  companyAddress: { type: "text", min: 2, max: 240 },
  companyGstin: { type: "text", max: 15, pattern: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, hint: "A 15-character GSTIN, e.g. 33ABCDE1234F1Z5." },
  companyEmail: { type: "text", max: 120, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, hint: "A valid email address." },
  companyPhone: { type: "text", min: 6, max: 30 },
  safetyLine: { type: "text", min: 3, max: 30 },
};

/** Returns an error message, or null when the value is allowed. */
export function checkSetting(key: string, value: unknown): string | null {
  const rule = SETTING_RULES[key as keyof Settings];
  if (!rule) return `Unknown setting "${key}".`;
  if (rule.type === "boolean") return typeof value === "boolean" ? null : `"${key}" must be true or false.`;
  if (rule.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return `"${key}" must be a number.`;
    if (rule.integer && !Number.isInteger(value)) return `"${key}" must be a whole number.`;
    if (value < rule.min || value > rule.max) return `"${key}" must be between ${rule.min} and ${rule.max}.`;
    return null;
  }
  if (typeof value !== "string") return `"${key}" must be text.`;
  if (value.length > rule.max) return `"${key}" is too long (max ${rule.max}).`;
  if (rule.min && value.trim().length < rule.min) return `"${key}" is too short.`;
  if (rule.pattern && !rule.pattern.test(value)) return rule.hint ?? `"${key}" isn't in the right format.`;
  if (key === "surgeHours" && parseSurgeHours(value).some(([a, b]) => a > 23 || b > 23 || a > b)) return "Surge hours must be 0–23 with the start before the end.";
  if (key.startsWith("cancelPolicy")) return checkCancelPolicy(value);
  return null;
}

/** The surge actually applied: the multiplier, never above the cap. */
export const effectiveSurge = (settings: Settings) => Math.max(1, Math.min(settings.surgeMultiplier, settings.surgeCap));

/** "8-10, 17-20" → [[8,10],[17,20]] */
export function parseSurgeHours(s: string): [number, number][] {
  return s.split(",").map((p) => p.trim()).filter(Boolean).map((p) => p.split("-").map((n) => parseInt(n, 10)) as [number, number]);
}

/** The self-drive documents list ("a; b; c" → ["a", "b", "c"]). */
export const rentDocumentList = (settings: Settings) => settings.rentDocuments.split(";").map((s) => s.trim()).filter(Boolean);

/** GST rate (%) for a booking's service. */
export function gstRate(settings: Settings, service: ServiceKey) {
  switch (service) {
    case "bike": case "car": return settings.gstRides;
    case "bus": return settings.gstBus;
    case "tours": return settings.gstTours;
    case "rent": return settings.gstRent;
    case "rentals": return settings.gstGroup;
  }
}
