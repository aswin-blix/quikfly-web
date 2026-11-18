// QuikFly Credits: promotional money earned back on completed trips. Kept apart from the
// wallet (real money): credits expire, can pay only part of a booking, and can't be
// withdrawn. The API applies these rules; the apps call them to preview the same numbers.
import type { Settings } from "./settings";
import type { ServiceKey } from "./types";

/** The fare line a booking paid partly with credits shows (like COUPON_LINE). */
export const CREDITS_LINE = "QuikFly Credits";

/** % of the amount paid that comes back as credits, per service (0 = none). */
export function creditPercent(settings: Settings, service: ServiceKey) {
  switch (service) {
    case "bike": case "car": return settings.creditsRides;
    case "bus": return settings.creditsBus;
    case "tours": return settings.creditsTours;
    case "rent": return settings.creditsRent;
    case "rentals": return settings.creditsGroup;
  }
}

/**
 * Credits a completed booking earns: its % of what was paid (not the refundable deposit,
 * not the part paid with credits), rounded down, at most `creditsCap`.
 */
export function creditsEarned(settings: Settings, service: ServiceKey, paid: number, deposit = 0) {
  const base = Math.max(0, paid - deposit);
  return Math.max(0, Math.min(settings.creditsCap, Math.floor((base * creditPercent(settings, service)) / 100)));
}

/** Credits usable on a booking: up to `creditsMaxRedeemPercent` of the payable amount (deposit excluded), within the balance. */
export function creditsUsable(settings: Settings, balance: number, payable: number, deposit = 0) {
  const limit = Math.floor((Math.max(0, payable - deposit) * settings.creditsMaxRedeemPercent) / 100);
  return Math.max(0, Math.min(Math.floor(balance), limit));
}

/** Credits that come back when a booking is cancelled: the same share as the refund. */
export const creditsReturned = (used: number, refundPercent: number) => Math.round((used * refundPercent) / 100);
