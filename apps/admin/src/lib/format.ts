// Formatting helpers (no React). Indian number grouping and dates in India time.
import type { BookingStatus, ServiceKey } from "@quikfly/shared";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const inr = (n: number) => inrFmt.format(n);

const compactFmt = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
/** 1,284 · 12.9K · 4.2L — compact once the number gets long. */
export const compact = (n: number) => (Math.abs(n) < 10_000 ? n.toLocaleString("en-IN") : compactFmt.format(n));
export const inrCompact = (n: number) => (Math.abs(n) < 100_000 ? inr(n) : `₹${compactFmt.format(n)}`);

const TZ = "Asia/Kolkata";
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
export const dayLabel = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short" });
export const weekday = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short" });

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return dateTime(iso);
}

export const SERVICE_LABEL: Record<ServiceKey, string> = {
  bike: "Bike taxi", car: "Cab", bus: "Bus", tours: "Holidays", rent: "Self-drive", rentals: "Group travel",
};

export const STATUS_STYLE: Record<BookingStatus, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-info/10 text-info" },
  ongoing: { label: "Ongoing", cls: "bg-warning/10 text-warning" },
  completed: { label: "Completed", cls: "bg-success/10 text-success" },
  cancelled: { label: "Cancelled", cls: "bg-danger/10 text-danger" },
};

export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
