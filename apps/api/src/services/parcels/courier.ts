// A Quick parcel's captain. The ride engine's card (fare, places, driver, pickup code) is kept as a
// rides row with status 'parcel', so it can't be booked or paid for as a ride.
import { PARCEL_RULES, RIDE_SIM, isWomenOnly, pick, type PaymentMethod, type QuickParcelPlan, type Ride } from "@quikfly/shared";
import { conflict } from "../../lib/errors";
import { randomDigits, uid } from "../../lib/random";
import { visible } from "../catalog";

/** A simulated captain for a priced Quick parcel. Partner drivers don't carry parcels yet. */
export async function newCourierRide(db: D1Database, plan: QuickParcelPlan, payment: PaymentMethod): Promise<Ride> {
  const option = plan.fare.option;
  if (isWomenOnly(option)) throw conflict("Quick parcel isn't available right now.");
  const drivers = await visible(db, "driver");
  if (!drivers.length) throw conflict("No captains are available right now. Please try again shortly.");
  const seed = Date.now();
  const { id: _driverId, ...captain } = pick(drivers, seed);
  return {
    id: uid("RD"), quote: plan.fare, pickup: plan.pickup, drop: plan.drop, payment,
    otp: randomDigits(PARCEL_RULES.pickupOtpDigits),
    driver: {
      ...captain,
      vehicle: pick(option.models.length ? option.models : [option.name], seed >> 2),
      plate: `${pick(RIDE_SIM.plateStates, seed >> 3)} ${pick(RIDE_SIM.plateLetters, seed >> 5)} ${1000 + (seed % 8999)}`,
    },
    scheduledFor: null, stops: [],
  };
}

/** The captain's ride of a parcel, or null. */
export async function parcelRide(db: D1Database, bookingId: string): Promise<Ride | null> {
  const row = await db.prepare(
    "SELECT r.data FROM parcel_legs l JOIN rides r ON r.id = l.ride_id WHERE l.booking_id = ? ORDER BY l.seq LIMIT 1",
  ).bind(bookingId).first<{ data: string }>();
  return row ? (JSON.parse(row.data) as Ride) : null;
}
