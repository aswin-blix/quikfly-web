// Business settings an owner changes from the admin panel. The API stores them in the
// `settings` table and falls back to these defaults; GET /config hands them to the website
// and the app. To add one: a key + default here, a rule in SETTING_RULES, a row in
// apps/admin/src/lib/settings-fields.ts. The API validates against SETTING_RULES.
import { CANCEL_POLICY_HINT, CANCEL_POLICY_PATTERN, checkCancelPolicy } from "./cancellation";
import type { ServiceKey } from "./types";

export interface Settings {
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

  /** Kilometres included per day in the group-travel local package. */
  groupLocalKmPerDay: number;

  /**
   * Refund tiers per service, as "notice:percent" pairs with the longest notice first,
   * e.g. "15d:100, 7d:50" = full refund 15+ days before, half 7+ days before, nothing later.
   * Empty = full refund any time. Rides have none (they start at once). See cancellation.ts.
   */
  cancelPolicyBus: string;
  cancelPolicyTours: string;
  cancelPolicyRent: string;
  cancelPolicyGroup: string;

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
  licenceAutoApprove: false,
  welcomeCredit: 500,
  referralBonus: 100,
  surgeMultiplier: 1.2,
  surgeHours: "8-10, 17-20",
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
  groupLocalKmPerDay: 80,
  cancelPolicyBus: "12h:100, 4h:50",
  cancelPolicyTours: "15d:100, 7d:50",
  cancelPolicyRent: "24h:100",
  cancelPolicyGroup: "48h:100",
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
  licenceAutoApprove: { type: "boolean" },
  welcomeCredit: money(5000),
  referralBonus: money(5000),
  surgeMultiplier: { type: "number", min: 1, max: 3 },
  surgeHours: { type: "text", max: 60, pattern: SURGE_HOURS, hint: 'Hour ranges like "8-10, 17-20" (0–23), or empty for no surge.' },
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
  groupLocalKmPerDay: { type: "number", min: 10, max: 500, integer: true },
  cancelPolicyBus: cancelPolicy,
  cancelPolicyTours: cancelPolicy,
  cancelPolicyRent: cancelPolicy,
  cancelPolicyGroup: cancelPolicy,
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

/** "8-10, 17-20" → [[8,10],[17,20]] */
export function parseSurgeHours(s: string): [number, number][] {
  return s.split(",").map((p) => p.trim()).filter(Boolean).map((p) => p.split("-").map((n) => parseInt(n, 10)) as [number, number]);
}

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
