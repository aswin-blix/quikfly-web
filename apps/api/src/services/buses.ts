import { generateBuses, generateSeats, type Bus, type Gender, type Seat, type SeatHold } from "@quikfly/shared";
import { notFound } from "../lib/errors";
import { visible } from "./catalog";
import { getSettings } from "./settings";

/** Generated timetable from the visible operators and the bus fares in Settings. */
export async function searchBuses(db: D1Database, from: string, to: string, date: string): Promise<Bus[]> {
  const [operators, settings, held] = await Promise.all([
    visible(db, "busOperator"), getSettings(db),
    db.prepare("SELECT bus_id, COUNT(*) AS n FROM bus_seat_holds WHERE date = ? GROUP BY bus_id").bind(date).all<{ bus_id: string; n: number }>(),
  ]);
  const heldBy = new Map(held.results.map((r) => [r.bus_id, r.n]));
  return generateBuses(operators.map((o) => o.name), settings, from, to, date).map((b) => ({ ...b, seatsLeft: Math.max(0, b.seatsLeft - (heldBy.get(b.id) ?? 0)) }));
}

export async function findBus(db: D1Database, from: string, to: string, date: string, busId: string): Promise<Bus> {
  const bus = (await searchBuses(db, from, to, date)).find((b) => b.id === busId);
  if (!bus) throw notFound("That bus isn't running on this route and date.");
  return bus;
}

/** Seats held by real bookings on this bus and date. */
export async function seatHolds(db: D1Database, busId: string, date: string): Promise<SeatHold[]> {
  const { results } = await db.prepare("SELECT seat_id, gender FROM bus_seat_holds WHERE bus_id = ? AND date = ?").bind(busId, date)
    .all<{ seat_id: string; gender: Gender }>();
  return results.map((r) => ({ seatId: r.seat_id, gender: r.gender }));
}

/** Seat layout with each seat's price; real bookings show as booked, and the women-first rule applies. */
export async function busSeats(db: D1Database, from: string, to: string, date: string, busId: string): Promise<Seat[]> {
  const [bus, settings, holds] = await Promise.all([findBus(db, from, to, date, busId), getSettings(db), seatHolds(db, busId, date)]);
  return generateSeats(bus, date, settings, holds);
}
