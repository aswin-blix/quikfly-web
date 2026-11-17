import { generateBuses, generateSeats, type Bus, type Seat } from "@quikfly/shared";
import { notFound } from "../lib/errors";
import { visible } from "./catalog";
import { getSettings } from "./settings";

/** Generated timetable from the visible operators and the bus fares in Settings. */
export async function searchBuses(db: D1Database, from: string, to: string, date: string): Promise<Bus[]> {
  const [operators, settings] = await Promise.all([visible(db, "busOperator"), getSettings(db)]);
  return generateBuses(operators.map((o) => o.name), settings, from, to, date);
}

export async function findBus(db: D1Database, from: string, to: string, date: string, busId: string): Promise<Bus> {
  const bus = (await searchBuses(db, from, to, date)).find((b) => b.id === busId);
  if (!bus) throw notFound("That bus isn't running on this route and date.");
  return bus;
}

/** Seat layout with each seat's price. */
export async function busSeats(db: D1Database, from: string, to: string, date: string, busId: string): Promise<Seat[]> {
  return generateSeats(await findBus(db, from, to, date, busId), date, await getSettings(db));
}
