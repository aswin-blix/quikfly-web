// Cancellation policies: how much of a booking comes back when it is cancelled, by how
// long before the start it is cancelled. One policy per service lives in Settings as text
// like "15d:100, 7d:50" (≥ 15 days before → 100 %, ≥ 7 days → 50 %, later → nothing).
// The API applies it inside the refund transaction; the website and the app use the same
// functions to show the policy and the refund before the customer confirms.
import type { Settings } from "./settings";
import type { QuoteRequest, ServiceKey } from "./types";

export interface CancelTier {
  /** Cancel at least this many hours before the start… */
  hoursBefore: number;
  /** …and this much of the amount is refunded. */
  refundPercent: number;
}

/** Empty (no policy: always a full refund) or tiers "15d:100, 7d:50, 24h:0". */
export const CANCEL_POLICY_PATTERN = /^\s*$|^\s*\d{1,3}[dh]\s*:\s*\d{1,3}(\s*,\s*\d{1,3}[dh]\s*:\s*\d{1,3})*\s*$/i;
export const CANCEL_POLICY_HINT = 'Tiers like "15d:100, 7d:50" (days or hours before the start : % refunded), largest first. Empty = full refund any time.';

/** Business time zone for date-only starts (holidays, group trips): India. */
export const BUSINESS_TZ_OFFSET = "+05:30";

/** What the countdown runs to, per service, for policy text. */
export const CANCEL_EVENT: Record<ServiceKey, string> = {
  bike: "pickup", car: "pickup", bus: "departure", tours: "travel", rent: "pickup", rentals: "the trip",
};

/** "15d:100, 7d:50" → tiers sorted with the longest notice first. Garbage parses to no tiers. */
export function parseCancelPolicy(text: string): CancelTier[] {
  if (!CANCEL_POLICY_PATTERN.test(text)) return [];
  return text.split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = /^(\d+)([dh]):(\d+)$/i.exec(p.replace(/\s+/g, ""))!;
    const n = parseInt(m[1], 10);
    return { hoursBefore: m[2].toLowerCase() === "d" ? n * 24 : n, refundPercent: Math.min(100, parseInt(m[3], 10)) };
  }).sort((a, b) => b.hoursBefore - a.hoursBefore);
}

/** Error message for a policy text, or null when it is allowed. */
export function checkCancelPolicy(text: string): string | null {
  if (!CANCEL_POLICY_PATTERN.test(text)) return CANCEL_POLICY_HINT;
  const tiers = parseCancelPolicy(text);
  if (tiers.some((t) => t.refundPercent > 100)) return "A refund can't be more than 100%.";
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].hoursBefore === tiers[i - 1].hoursBefore) return "Each tier needs a different notice period.";
    if (tiers[i].refundPercent > tiers[i - 1].refundPercent) return "Shorter notice can't refund more than longer notice.";
  }
  return null;
}

/** The policy for a service. Rides have none (they start at once). */
export function cancelPolicyFor(settings: Settings, service: ServiceKey): CancelTier[] {
  switch (service) {
    case "bus": return parseCancelPolicy(settings.cancelPolicyBus);
    case "tours": return parseCancelPolicy(settings.cancelPolicyTours);
    case "rent": return parseCancelPolicy(settings.cancelPolicyRent);
    case "rentals": return parseCancelPolicy(settings.cancelPolicyGroup);
    default: return [];
  }
}

/**
 * Percentage refunded for a cancellation at `now`. No policy or no known start
 * (rides, old bookings) → 100. Past the last tier → 0.
 */
export function refundPercent(tiers: CancelTier[], startsAt: string | null, now = Date.now()): number {
  if (!tiers.length || !startsAt) return 100;
  const start = Date.parse(startsAt);
  if (Number.isNaN(start)) return 100;
  const hoursLeft = (start - now) / 3_600_000;
  const tier = tiers.find((t) => hoursLeft >= t.hoursBefore);
  return tier ? tier.refundPercent : 0;
}

/**
 * Rupees refunded, rounded to whole rupees. A refundable deposit always comes back in
 * full; the policy's percentage applies to the rest.
 */
export function refundAmount(amount: number, percent: number, deposit = 0): number {
  const held = Math.min(Math.max(deposit, 0), amount);
  return held + Math.round(((amount - held) * percent) / 100);
}

/** "15 days", "24 hours", "4 hours". */
export function noticeLabel(hours: number): string {
  if (hours >= 48 && hours % 24 === 0) return `${hours / 24} days`;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * Customer wording for a policy, e.g. "Free cancellation up to 15 days before travel;
 * 50% refund up to 7 days before; no refund after that."
 */
export function describeCancelPolicy(tiers: CancelTier[], event = "the start"): string {
  if (!tiers.length) return `Free cancellation any time before ${event}.`;
  const parts = tiers.filter((t) => t.refundPercent > 0).map((t, i) =>
    `${t.refundPercent === 100 ? "Free cancellation" : `${t.refundPercent}% refund`} up to ${noticeLabel(t.hoursBefore)} before${i === 0 ? ` ${event}` : ""}`);
  if (!parts.length) return `Non-refundable once booked.`;
  return `${parts.join("; ")}; no refund after that.`;
}

/** The customer wording of a service's current policy. */
export const cancelPolicyText = (settings: Settings, service: ServiceKey) =>
  describeCancelPolicy(cancelPolicyFor(settings, service), CANCEL_EVENT[service]);

/**
 * When a quoted booking starts, as an ISO time, so the refund can be worked out later.
 * Buses need the departure time ("22:30") from the generated bus; dates alone count from
 * midnight India time.
 */
export function quoteStartsAt(req: QuoteRequest, busDepart = "00:00"): string {
  switch (req.service) {
    case "bus": return `${req.date}T${busDepart}:00${BUSINESS_TZ_OFFSET}`;
    case "tours": return `${req.start}T00:00:00${BUSINESS_TZ_OFFSET}`;
    case "rent": return `${req.start}:00${BUSINESS_TZ_OFFSET}`;
    case "rentals": return `${req.start}T00:00:00${BUSINESS_TZ_OFFSET}`;
  }
}
