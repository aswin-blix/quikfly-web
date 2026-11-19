// Validation rules and business constants shared by the API (which enforces them)
// and the apps (which check early so users see errors before submitting).

export const LIMITS = {
  savedPlaces: 10,
  travellers: 10,
  emergencyContacts: 3,
  nameMin: 2,
  nameMax: 60,
  minAge: 13,
  maxAge: 100,
  /** Driving licence must be valid for at least this many more days. */
  licenceMinDaysLeft: 1,
};

export const DELETION_GRACE_DAYS = 30;

/** Scheduled rides: the driver is assigned (and "Start ride" opens) this many minutes before pickup. */
export const RIDE_SCHEDULE = { startWindowMinutes: 15 };

/** Stops a rider can add between pickup and drop (Uber allows the same). */
export const RIDE_MAX_STOPS = 2;

/** Trips: the cab to a bus is scheduled to arrive this many minutes before boarding; a holiday's ride is offered at this hour on the start date. */
export const TRIP_RIDE = { leadMinutes: 45, holidayHour: 6 };

/**
 * Why a rider cancels (Motor Vehicle Aggregator Guidelines 2025: apps list the reasons, and a
 * cancellation fee applies only without a valid one). `waivesFee` marks the valid ones.
 */
export const RIDE_CANCEL_REASONS = [
  { key: "driver_late", label: "Driver is taking too long", waivesFee: true },
  { key: "driver_not_moving", label: "Driver isn't coming towards me", waivesFee: true },
  { key: "driver_asked", label: "Driver asked me to cancel", waivesFee: true },
  { key: "wrong_address", label: "I entered the wrong pickup or drop", waivesFee: false },
  { key: "plans_changed", label: "My plans changed", waivesFee: false },
  { key: "other_ride", label: "I found another ride", waivesFee: false },
] as const;
export type RideCancelReason = (typeof RIDE_CANCEL_REASONS)[number]["key"];
export const RIDE_CANCEL_REASON_KEYS = RIDE_CANCEL_REASONS.map((r) => r.key) as RideCancelReason[];
export const SHARE_LINK_HOURS = 24;
/** Local hours [from, to) counted as night for auto-sharing rides. */
export const NIGHT_HOURS: [number, number] = [22, 6];

/** Simulated ride timings, used by the ride screen and the shared-trip page. */
export const RIDE_SIMULATION = { arriveMs: 9000, tripMs: 12000 };

/** A rider's own ride PIN: exactly 4 digits. */
export const RIDE_PIN = /^\d{4}$/;

/** Is this ride type for women riders only (B8)? */
export const isWomenOnly = (o: { riders?: string }) => o.riders === "women";

/** Should this ride be shared with emergency contacts automatically, given the rider's Safety Preferences? */
export function autoSharesAt(mode: "off" | "night" | "always" | undefined, hour: number) {
  return mode === "always" || (mode === "night" && isNightHour(hour));
}

export const PATTERNS = {
  phone: /^[6-9]\d{9}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  /** e.g. 33ABCDE1234F1Z5 */
  gstin: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  /** State (2 letters) + RTO (2 digits) + year (4) + number (7), e.g. TN0920190001234 */
  licence: /^[A-Z]{2}\d{2}(19|20)\d{2}\d{7}$/,
  referralCode: /^[A-Z0-9]{6,10}$/,
  isoDate: /^\d{4}-\d{2}-\d{2}$/,
};

/** Upper-cases and strips spaces and dashes: "tn09 2019-0001234" → "TN0920190001234". */
export const compactCode = (s: string) => s.toUpperCase().replace(/[\s-]/g, "");

/** "TN0920190001234" → "TN09 20190001234" */
export const formatLicence = (n: string) => `${n.slice(0, 4)} ${n.slice(4)}`;

/** Whole years between a YYYY-MM-DD birth date and today. */
export function ageFrom(dob: string, today = new Date()) {
  const d = new Date(`${dob}T00:00:00`);
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

export function isNightHour(hour: number) {
  const [from, to] = NIGHT_HOURS;
  return from > to ? hour >= from || hour < to : hour >= from && hour < to;
}
