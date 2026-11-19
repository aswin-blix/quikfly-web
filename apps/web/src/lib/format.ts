export const inr = (n: number) =>
  "₹" + Math.round(n).toLocaleString("en-IN");

export const todayISO = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
};

/** Moves a YYYY-MM-DD date by whole days. */
export const shiftISO = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** A Date as the value of an `<input type="datetime-local">` (local time, no seconds). */
export const toLocalInput = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export const prettyDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

/** "19 November 2026" (in Tamil or Hindi when a locale like "ta-IN" is given). */
export const longDate = (iso: string, locale = "en-IN") =>
  new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

export const prettyDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
