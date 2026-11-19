// Holiday group departures (packages/shared/src/holidays.ts): upcoming ones with seats left.
import { upcomingDepartures, type DepartureView, type TourDeparture, type TourPackage } from "@quikfly/shared";
import { businessDate } from "../config";
import { visible } from "./catalog";

/** Travellers on active bookings, by departure id (one query). */
export async function takenSeats(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db.prepare(
    "SELECT departure_id, SUM(travellers) AS n FROM bookings WHERE departure_id IS NOT NULL AND status <> 'cancelled' GROUP BY departure_id",
  ).all<{ departure_id: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.departure_id, r.n]));
}

/** The packages with their upcoming departures attached (GET /tours). */
export async function withDepartures(db: D1Database, tours: TourPackage[]): Promise<TourPackage[]> {
  const [all, taken] = await Promise.all([visible(db, "departure"), takenSeats(db)]);
  const today = businessDate();
  return tours.map((t) => ({ ...t, departures: upcomingDepartures(all.filter((d) => d.tourId === t.id), t.price, taken, today) }));
}

/** One package's upcoming departures (for pricing a quote). */
export async function departuresOf(db: D1Database, tour: TourPackage): Promise<{ views: DepartureView[]; all: TourDeparture[] }> {
  const [all, taken] = await Promise.all([visible(db, "departure"), takenSeats(db)]);
  const mine = all.filter((d) => d.tourId === tour.id);
  return { views: upcomingDepartures(mine, tour.price, taken, businessDate()), all: mine };
}
