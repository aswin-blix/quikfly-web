import { BUSINESS_UTC_OFFSET_MIN, RIDE } from "../config";
import { DRIVERS, RIDE_OPTIONS, VEHICLES } from "@quikfly/shared";
import { badRequest, notFound } from "../lib/errors";
import { pick, uid } from "../lib/random";
import type { FareQuote, PaymentMethod, Ride } from "@quikfly/shared";
import { placeById } from "./places";

function surgeNow() {
  const hour = new Date(Date.now() + BUSINESS_UTC_OFFSET_MIN * 60_000).getUTCHours();
  return RIDE.surgeHours.some(([from, to]) => hour >= from && hour <= to) ? RIDE.surgeMultiplier : 1;
}

export function quoteRides(service: "bike" | "car", pickupId: string, dropId: string): FareQuote[] {
  if (pickupId === dropId) throw badRequest("Pickup and drop must be different places.");
  const a = placeById(pickupId), b = placeById(dropId);
  const distanceKm = Math.max(RIDE.minDistanceKm, Math.round(Math.hypot(a.x - b.x, a.y - b.y) * RIDE.kmPerMapUnit * 10) / 10);
  const surge = surgeNow();
  return RIDE_OPTIONS.filter((o) => o.service === service).map((option, i) => {
    const durationMin = Math.round((distanceKm / RIDE.speedKmh[option.service]) * 60) + RIDE.pickupBufferMin;
    const fare = Math.round((option.baseFare + option.perKm * distanceKm + option.perMin * durationMin) * surge);
    return { option, fare, distanceKm, durationMin, etaMin: 2 + ((i * 3 + Math.round(distanceKm)) % 6) };
  });
}

export async function bookRide(
  db: D1Database, userId: string,
  input: { optionId: string; pickupId: string; dropId: string; payment: PaymentMethod },
): Promise<Ride> {
  const option = RIDE_OPTIONS.find((o) => o.id === input.optionId);
  if (!option) throw badRequest("Unknown ride option.");
  const quote = quoteRides(option.service, input.pickupId, input.dropId).find((q) => q.option.id === option.id)!;

  const seed = Date.now();
  const driver = pick(DRIVERS, seed);
  const ride: Ride = {
    id: uid("RD"),
    quote,
    pickup: placeById(input.pickupId),
    drop: placeById(input.dropId),
    payment: input.payment,
    otp: String(1000 + (seed % 9000)),
    driver: {
      ...driver,
      vehicle: pick(VEHICLES[option.id], seed >> 2),
      plate: `${pick(RIDE.plateStates, seed >> 3)} ${pick(RIDE.plateLetters, seed >> 5)} ${1000 + (seed % 8999)}`,
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
