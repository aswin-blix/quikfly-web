import { RIDE_SIM, pick, rideQuotes, type FareQuote, type PaymentMethod, type Ride } from "@quikfly/shared";
import { businessHour } from "../config";
import { badRequest, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { visible, visibleById } from "./catalog";
import { placeById } from "./places";
import { getSettings } from "./settings";

/** Fares for every visible option of a service, with surge from Settings. */
export async function quoteRides(db: D1Database, service: "bike" | "car", pickupId: string, dropId: string): Promise<FareQuote[]> {
  if (pickupId === dropId) throw badRequest("Pickup and drop must be different places.");
  const [a, b, options, settings] = await Promise.all([
    placeById(db, pickupId), placeById(db, dropId), visible(db, "rideOption"), getSettings(db),
  ]);
  return rideQuotes(options.filter((o) => o.service === service), a, b, settings, businessHour());
}

export async function bookRide(
  db: D1Database, userId: string,
  input: { optionId: string; pickupId: string; dropId: string; payment: PaymentMethod },
): Promise<Ride> {
  const option = await visibleById(db, "rideOption", input.optionId);
  const quote = (await quoteRides(db, option.service, input.pickupId, input.dropId)).find((q) => q.option.id === option.id)!;
  const drivers = await visible(db, "driver");
  if (!drivers.length) throw badRequest("No drivers are available right now. Please try again shortly.");

  const seed = Date.now();
  const { id: _driverId, ...driver } = pick(drivers, seed);
  const ride: Ride = {
    id: uid("RD"),
    quote,
    pickup: await placeById(db, input.pickupId),
    drop: await placeById(db, input.dropId),
    payment: input.payment,
    otp: String(1000 + (seed % 9000)),
    driver: {
      ...driver,
      vehicle: pick(option.models.length ? option.models : [option.name], seed >> 2),
      plate: `${pick(RIDE_SIM.plateStates, seed >> 3)} ${pick(RIDE_SIM.plateLetters, seed >> 5)} ${1000 + (seed % 8999)}`,
    },
  };
  await db.prepare("INSERT INTO rides (id, user_id, status, data, created_at) VALUES (?, ?, 'confirmed', ?, ?)")
    .bind(ride.id, userId, JSON.stringify(ride), new Date().toISOString()).run();
  return ride;
}

export async function cancelRide(db: D1Database, userId: string, rideId: string) {
  const res = await db.prepare("UPDATE rides SET status = 'cancelled' WHERE id = ? AND user_id = ?").bind(rideId, userId).run();
  if (!res.meta.changes) throw notFound("Ride not found.");
}

/** The user's own, not-cancelled ride (used to price its booking). */
export async function ownRide(db: D1Database, userId: string, rideId: string): Promise<Ride> {
  const row = await db.prepare("SELECT data, status FROM rides WHERE id = ? AND user_id = ?").bind(rideId, userId).first<{ data: string; status: string }>();
  if (!row) throw notFound("Ride not found.");
  if (row.status === "cancelled") throw badRequest("This ride was cancelled.");
  return JSON.parse(row.data);
}
