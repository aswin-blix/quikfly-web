// Booking terms: the settings a booking was sold under. A customer who booked under "free
// cancellation up to 15 days" or "₹12/km beyond 140 km a day" keeps those terms when staff
// change the settings later. The API stores them on the booking (bookings.terms) and applies
// them to the refund, the bus seat cancel and change, the self-drive settlement, partner
// earnings and the invoice. Bookings made before terms were stored (migration 0026) have
// none and use today's settings.
import { CANCEL_EVENT, describeCancelPolicy, parseCancelPolicy } from "./cancellation";
import type { ParcelMode } from "./parcel";
import type { Settings } from "./settings";
import type { ServiceKey } from "./types";

/** Settings that are terms of sale, per service. Prices themselves are already fixed by the quote. */
export const TERM_KEYS = {
  bike: ["gstRides", "rideCancelFeePercent", "rideCancelFeeCap", "rideCancelFreeMinutes", "rideScheduleFreeCancelMinutes"],
  car: ["gstRides", "rideCancelFeePercent", "rideCancelFeeCap", "rideCancelFreeMinutes", "rideScheduleFreeCancelMinutes"],
  bus: ["gstBus", "cancelPolicyBus", "busRescheduleHours", "busRescheduleFee"],
  tours: ["gstTours", "cancelPolicyTours"],
  rent: ["gstRent", "cancelPolicyRent", "rentLimitedKmPerDay", "rentExtraKmRate", "rentLateGraceMinutes", "rentLateFeePercent", "rentFuelChargePerEighth"],
  rentals: ["gstGroup", "cancelPolicyGroup"],
  parcel: ["gstParcel", "cancelPolicyParcel", "parcelLiabilityCap", "parcelCounterHoldDays", "rideCancelFeePercent", "rideCancelFeeCap", "rideCancelFreeMinutes"],
} as const satisfies Record<ServiceKey, readonly (keyof Settings)[]>;

export type TermKey = (typeof TERM_KEYS)[ServiceKey][number];
/** What a booking stores: some of the settings, under the same keys. */
export type BookingTerms = Partial<Pick<Settings, TermKey>>;

/** A bus parcel keeps its tiers and hold, a Quick parcel the ride cancellation rules: never both. */
const NOT_A_TERM: Record<ParcelMode, ReadonlySet<string>> = {
  city: new Set(["cancelPolicyParcel", "parcelCounterHoldDays"]),
  intercity: new Set(["rideCancelFeePercent", "rideCancelFeeCap", "rideCancelFreeMinutes"]),
};

/** The terms a new booking of `service` is sold under, taken from today's settings. */
export function bookingTerms(settings: Settings, service: ServiceKey, parcelMode: ParcelMode = "intercity"): BookingTerms {
  const keys: readonly (keyof Settings)[] = TERM_KEYS[service];
  const used = service === "parcel" ? keys.filter((k) => !NOT_A_TERM[parcelMode].has(k)) : keys;
  return Object.fromEntries(used.map((k) => [k, settings[k]])) as BookingTerms;
}

/**
 * Today's settings with a booking's terms laid over them, for any rule that takes Settings
 * (refundPercent, rideCancelFee, rentalSettlement, gstRate, ...). No terms → today's settings.
 */
export function withTerms(settings: Settings, terms: BookingTerms | null | undefined): Settings {
  if (!terms) return settings;
  const known = Object.entries(terms).filter(([k, v]) => k in settings && typeof v === typeof settings[k as keyof Settings]);
  return { ...settings, ...Object.fromEntries(known) };
}

/** Reads the stored JSON; anything unreadable counts as no terms. */
export function parseTerms(json: string | null | undefined): BookingTerms | null {
  if (!json) return null;
  try {
    const t = JSON.parse(json) as unknown;
    return t && typeof t === "object" && !Array.isArray(t) ? (t as BookingTerms) : null;
  } catch {
    return null;
  }
}

const ALL_TERM_KEYS: ReadonlySet<string> = new Set(Object.values(TERM_KEYS).flat());
/** True for a setting each booking keeps (the admin panel says "changes apply to new bookings"). */
export const isTermKey = (key: string): key is TermKey => ALL_TERM_KEYS.has(key);

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** A booking's terms in words, for staff (admin booking page). Keys the booking doesn't have are left out. */
export function termLines(terms: BookingTerms, service: ServiceKey): [string, string][] {
  const t = terms;
  const out: [string, string][] = [];
  const policy = { bus: t.cancelPolicyBus, tours: t.cancelPolicyTours, rent: t.cancelPolicyRent, rentals: t.cancelPolicyGroup, parcel: t.cancelPolicyParcel }[service as "bus"];
  if (policy !== undefined) out.push(["Cancellation", describeCancelPolicy(parseCancelPolicy(policy), CANCEL_EVENT[service])]);
  if (t.rideCancelFeePercent !== undefined && t.rideCancelFeeCap !== undefined) out.push(["Rider cancellation fee", `${t.rideCancelFeePercent}% of the fare, up to ${rupees(t.rideCancelFeeCap)}`]);
  if (t.rideCancelFreeMinutes !== undefined) out.push(["Free cancellation", `within ${t.rideCancelFreeMinutes} min of booking`]);
  if (t.rideScheduleFreeCancelMinutes !== undefined) out.push(["Scheduled ride", `free to cancel until ${t.rideScheduleFreeCancelMinutes} min before pickup`]);
  if (t.busRescheduleHours !== undefined) out.push(["Bus change", `once, until ${t.busRescheduleHours} hrs before departure${t.busRescheduleFee ? `, fee ${rupees(t.busRescheduleFee)}` : ", free"}`]);
  if (t.rentLimitedKmPerDay !== undefined && t.rentExtraKmRate !== undefined) out.push(["Limited km plan", `${t.rentLimitedKmPerDay} km a day, ${rupees(t.rentExtraKmRate)}/km beyond`]);
  if (t.rentLateFeePercent !== undefined && t.rentLateGraceMinutes !== undefined) out.push(["Late return", `${t.rentLateFeePercent}% of the hourly rate per started hour, after ${t.rentLateGraceMinutes} min`]);
  if (t.rentFuelChargePerEighth !== undefined) out.push(["Fuel", `${rupees(t.rentFuelChargePerEighth)} per 1/8 tank short`]);
  if (t.parcelLiabilityCap !== undefined) out.push(["Liability", `the declared value, up to ${rupees(t.parcelLiabilityCap)}; not insured`]);
  if (t.parcelCounterHoldDays !== undefined) out.push(["Held for collection", `${t.parcelCounterHoldDays} days`]);
  const gst = { bike: t.gstRides, car: t.gstRides, bus: t.gstBus, tours: t.gstTours, rent: t.gstRent, rentals: t.gstGroup, parcel: t.gstParcel }[service];
  if (gst !== undefined) out.push(["GST", `${gst}%`]);
  return out;
}
