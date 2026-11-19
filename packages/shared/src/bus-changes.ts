// Changing a bus booking after it's made: cancel some of its seats, or move it once to another
// bus or date on the same route (IntrCity "Smart Switch" style). The API applies these rules;
// the apps call them to preview the same numbers.
import { cancelPolicyFor, refundAmount, refundPercent } from "./cancellation";
import type { Settings } from "./settings";
import type { Booking, BookingSeat } from "./types";

/** Booking lines a bus change rewrites (the rest, e.g. traveller names and GSTIN, stay). */
export const BUS_TRIP_LINES = ["Date", "Departure", "Arrival", "Seats"] as const;
export const SEATS_LINE = "Seats";
export const TRAVELLERS_LINE = "Traveller names";
export const SEATS_CANCELLED_LINE = "Seats cancelled";
export const BUS_CHANGED_LINE = "Changed from";
/** Bookings made before app 0.1.6 labelled the names line "Travellers". */
export const LEGACY_TRAVELLERS_LINE = "Travellers";

/** An m-ticket stops showing as valid this many hours after departure (bus bookings stay "confirmed" until staff close them). */
export const TICKET_VALID_HOURS_AFTER_DEPARTURE = 12;

/** What an m-ticket shows: valid until a while after departure, then "expired"; cancelled and completed as they are. */
export function ticketStatus(b: Pick<Booking, "status" | "startsAt">, now = Date.now()): "valid" | "expired" | "cancelled" | "completed" {
  if (b.status === "cancelled") return "cancelled";
  if (b.status === "completed") return "completed";
  if (b.startsAt && Date.parse(b.startsAt) + TICKET_VALID_HOURS_AFTER_DEPARTURE * 3_600_000 < now) return "expired";
  return "valid";
}

/** The travellers' names on a bus booking, in seat order (either label). */
export function travellerNames(lines: [string, string][]): string[] {
  const line = lines.find(([k]) => k === TRAVELLERS_LINE)?.[1] ?? lines.find(([k]) => k === LEGACY_TRAVELLERS_LINE)?.[1] ?? "";
  return line.split(", ").map((n) => n.trim()).filter(Boolean);
}

/**
 * The part of `total` (₹) that belongs to the seats in `ids`, by seat price. Seats booked
 * before prices were stored (price 0) split evenly. Rounded down, so the shares never add up
 * to more than was paid.
 */
export function seatsShare(total: number, seats: BookingSeat[], ids: string[]) {
  const picked = seats.filter((s) => ids.includes(s.id));
  const all = seats.reduce((a, s) => a + s.price, 0);
  const part = picked.reduce((a, s) => a + s.price, 0);
  if (!seats.length) return 0;
  return Math.floor(all > 0 ? (total * part) / all : (total * picked.length) / seats.length);
}

/** Why these seats can't be cancelled on their own, or null when they can. */
export function seatCancelError(booking: Pick<Booking, "service" | "status" | "seats">, ids: string[]): string | null {
  if (booking.service !== "bus") return "Only bus tickets can cancel single seats.";
  if (booking.status !== "confirmed") return `This booking is already ${booking.status}.`;
  if (!ids.length) return "Choose the seats to cancel.";
  if (new Set(ids).size !== ids.length) return "A seat is listed twice.";
  if (ids.some((id) => !booking.seats.some((s) => s.id === id))) return "That seat isn't on this booking.";
  if (ids.length >= booking.seats.length) return "To cancel every seat, cancel the whole booking.";
  return null;
}

/** What cancelling these seats now gives back: their share of what was paid, at the bus policy's rate. */
export function seatCancelRefund(settings: Settings, booking: Pick<Booking, "amount" | "seats" | "startsAt">, ids: string[], now = Date.now()) {
  const share = seatsShare(booking.amount, booking.seats, ids);
  const percent = refundPercent(cancelPolicyFor(settings, "bus"), booking.startsAt, now);
  return { share, percent, refund: refundAmount(share, percent, 0) };
}

/** Why this booking can't move to another bus now, or null when it can. */
export function rescheduleError(settings: Settings, booking: Pick<Booking, "service" | "status" | "rescheduledAt" | "startsAt">, now = Date.now()): string | null {
  if (booking.service !== "bus") return "Only bus tickets can change to another bus.";
  if (booking.status !== "confirmed") return `This booking is already ${booking.status}.`;
  if (booking.rescheduledAt) return "This ticket was already changed once.";
  if (!booking.startsAt) return "This ticket has no departure time to change from.";
  const hoursLeft = (Date.parse(booking.startsAt) - now) / 3_600_000;
  if (hoursLeft < settings.busRescheduleHours) return `Bus changes close ${settings.busRescheduleHours} hours before departure.`;
  return null;
}

/**
 * Money for a change to a bus whose quote totals `newTotal`. The coupon and credits already
 * used stay with the booking; the change fee is added. Positive `charge` is paid now,
 * positive `refund` comes back (to the wallet for wallet bookings).
 */
export function rescheduleAmounts(settings: Settings, booking: Pick<Booking, "amount" | "discount" | "creditsUsed">, newTotal: number) {
  const newAmount = Math.max(0, newTotal - booking.discount - booking.creditsUsed) + settings.busRescheduleFee;
  return { newAmount, charge: Math.max(0, newAmount - booking.amount), refund: Math.max(0, booking.amount - newAmount), fee: settings.busRescheduleFee };
}
