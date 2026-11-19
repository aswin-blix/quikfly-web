// Holiday group departures (catalog kind "departure"): which ones customers see and how full
// they are. The API counts seats from active bookings; the apps show the same labels.
import type { DepartureView, TourDeparture } from "./types";

/** A departure shows "Filling fast" with this many seats or fewer left (and isn't sold out). */
export const DEPARTURE_FILLING_SEATS = 5;

/** A departure can be booked until this many days before it leaves. */
export const DEPARTURE_BOOK_UNTIL_DAYS = 1;

export type DepartureStatus = "open" | "filling" | "sold_out";
export const departureStatus = (d: Pick<DepartureView, "seatsLeft">): DepartureStatus =>
  d.seatsLeft <= 0 ? "sold_out" : d.seatsLeft <= DEPARTURE_FILLING_SEATS ? "filling" : "open";

/** "2026-12-05" + days → "2026-12-06" (UTC date maths on plain dates). */
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The departures customers can still book (from DEPARTURE_BOOK_UNTIL_DAYS ahead), soonest first,
 * with seats left from `taken` (travellers on active bookings, by departure id).
 */
export function upcomingDepartures(all: TourDeparture[], tourPrice: number, taken: Record<string, number>, today: string): DepartureView[] {
  const from = addDays(today, DEPARTURE_BOOK_UNTIL_DAYS);
  return all
    .filter((d) => d.date >= from)
    .sort((a, b) => a.date.localeCompare(b.date) || a.fromCity.localeCompare(b.fromCity))
    .map((d) => ({ id: d.id, date: d.date, fromCity: d.fromCity, seats: d.seats, seatsLeft: Math.max(0, d.seats - (taken[d.id] ?? 0)), price: d.price ?? tourPrice }));
}

/** "YYYY-MM" of a departure, for the month filter. */
export const departureMonth = (d: Pick<DepartureView, "date">) => d.date.slice(0, 7);
