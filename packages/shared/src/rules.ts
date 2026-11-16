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

/** Wallet credit every new account starts with. */
export const WELCOME_CREDIT = 500;
export const REFERRAL_BONUS = 100;
export const DELETION_GRACE_DAYS = 30;
/** Simulated licence review time before "pending" becomes "verified". */
export const LICENCE_REVIEW_SECONDS = 20;
export const SHARE_LINK_HOURS = 24;
/** Local hours [from, to) counted as night for auto-sharing rides. */
export const NIGHT_HOURS: [number, number] = [22, 6];

/** Simulated ride timings, used by the ride screen and the shared-trip page. */
export const RIDE_SIMULATION = { arriveMs: 9000, tripMs: 12000 };

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
