// Tunable API values that are NOT business settings. Business values staff change at runtime
// (fares, surge, bonuses, GST...) live in Settings (packages/shared/src/settings.ts) and the
// `settings` table; simulation constants for rides and buses are in packages/shared/src/pricing.ts.

export const API_PREFIX = "/v1";

export const SESSION_TTL_DAYS = 30;
export const DEFAULT_USER_NAME = "Guest";
export const PHONE_COUNTRY_CODE = "+91";
export const PHONE_DIGITS = 10;

/** Fares, days and coupon expiry are reckoned in Indian time, whatever region the Worker runs in. */
export const BUSINESS_UTC_OFFSET_MIN = 330;

/** Hour of the day (0–23) in India now. */
export const businessHour = (now = Date.now()) => new Date(now + BUSINESS_UTC_OFFSET_MIN * 60_000).getUTCHours();
/** Today's date in India, YYYY-MM-DD. */
export const businessDate = (now = Date.now()) => new Date(now + BUSINESS_UTC_OFFSET_MIN * 60_000).toISOString().slice(0, 10);

export const SERVICE_KEYS = ["bike", "car", "bus", "tours", "rent", "rentals"] as const;
export const MAX_BOOKING_LINES = 30;

/** Notification inbox: how many recent notifications GET /me/notifications returns. */
export const NOTIFICATIONS_PAGE = 50;
/** Push (cron): notifications older than this aren't pushed (e.g. when push was switched on later). */
export const PUSH_MAX_AGE_MINUTES = 60;
/** Push (cron): at most this many sends per minute. */
export const PUSH_BATCH = 40;
/** Firebase Cloud Messaging endpoints for the service-account sign-in. */
export const FCM = { tokenUrl: "https://oauth2.googleapis.com/token", scope: "https://www.googleapis.com/auth/firebase.messaging" };
