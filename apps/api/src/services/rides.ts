import { FEATURE_OFF, RIDE_MAX_STOPS, RIDE_SCHEDULE, RIDE_SIM, isWomenOnly, localToIso, minutesUntilStart, pick, rideQuotes, scheduleError, switchError, type FareQuote, type PaymentMethod, type Place, type Ride, type RideOption, type Settings } from "@quikfly/shared";
import { businessHour } from "../config";
import { badRequest, conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { visible, visibleById } from "./catalog";
import { placeById } from "./places";
import { getSettings } from "./settings";
import { partnerDriverCard, partnerForRide } from "./partner-trips";
import { passCoversAt } from "./pass";

/**
 * Fares for every visible option of a service, with surge from Settings. `scheduledFor`
 * (local "YYYY-MM-DDTHH:mm", India) prices a ride booked ahead at its pickup hour. A signed-in
 * rider (`userId`) whose QuikFly Pass covers the pickup time pays no surge.
 */
export async function quoteRides(
  db: D1Database, service: "bike" | "car", pickupId: string, dropId: string, scheduledFor?: string, stopIds: string[] = [], userId?: string | null,
): Promise<FareQuote[]> {
  if (pickupId === dropId) throw badRequest("Pickup and drop must be different places.");
  // Service and feature switches (Settings) come first: a paused service quotes nothing.
  const off = switchError(await getSettings(db), { service, scheduledFor, stopCount: stopIds.length });
  if (off) throw conflict(off);
  const stops = await rideStops(db, pickupId, dropId, stopIds);
  const [a, b, options, settings] = await Promise.all([
    placeById(db, pickupId), placeById(db, dropId), visible(db, "rideOption"), getSettings(db),
  ]);
  if (scheduledFor) {
    const err = scheduleError(settings, scheduledFor);
    if (err) throw badRequest(err);
  }
  const hour = scheduledFor ? parseInt(scheduledFor.slice(11, 13), 10) : businessHour();
  const waive = !!userId && await passCoversAt(db, userId, new Date(scheduledFor ? localToIso(scheduledFor) : Date.now()).toISOString());
  const forRider = await ridesFor(db, settings, options.filter((o) => o.service === service), userId);
  return rideQuotes(forRider, a, b, settings, hour, stops, waive);
}

/** Women-only ride types (B8) are offered only to signed-in women riders, while the feature is on. */
async function ridesFor(db: D1Database, settings: Settings, options: RideOption[], userId?: string | null) {
  if (!options.some(isWomenOnly)) return options;
  const woman = settings.featureWomenOnlyRides && !!userId && (await riderProfile(db, userId))?.gender === "female";
  return woman ? options : options.filter((o) => !isWomenOnly(o));
}

const riderProfile = (db: D1Database, userId: string) =>
  db.prepare("SELECT gender, ride_pin FROM users WHERE id = ?").bind(userId).first<{ gender: string | null; ride_pin: string | null }>();

/** Checks the stops (up to RIDE_MAX_STOPS visible places, none repeating the place before it) and loads them. */
export async function rideStops(db: D1Database, pickupId: string, dropId: string, stopIds: string[]): Promise<Place[]> {
  if (stopIds.length > RIDE_MAX_STOPS) throw badRequest(`Add up to ${RIDE_MAX_STOPS} stops.`);
  const route = [pickupId, ...stopIds, dropId];
  if (route.some((id, i) => i > 0 && id === route[i - 1])) throw badRequest("A stop can't be the same as the place before it.");
  return Promise.all(stopIds.map((id) => placeById(db, id)));
}

export async function bookRide(
  db: D1Database, userId: string,
  input: { optionId: string; pickupId: string; dropId: string; payment: PaymentMethod; scheduledFor?: string; stopIds?: string[] },
): Promise<Ride> {
  const option = await visibleById(db, "rideOption", input.optionId);
  const settings = await getSettings(db);
  const cashOff = switchError(settings, { service: option.service, payment: input.payment });
  if (cashOff) throw conflict(cashOff);
  const rider = await riderProfile(db, userId);
  const womenOnly = isWomenOnly(option);
  if (womenOnly && !settings.featureWomenOnlyRides) throw conflict(FEATURE_OFF.womenOnly);
  if (womenOnly && rider?.gender !== "female") throw conflict("This ride type is for women riders. Set your gender in your profile, or pick another ride type.");
  const stopIds = input.stopIds ?? [];
  const quote = (await quoteRides(db, option.service, input.pickupId, input.dropId, input.scheduledFor, stopIds, userId)).find((q) => q.option.id === option.id)!;
  const stops = await rideStops(db, input.pickupId, input.dropId, stopIds);
  // A live partner vehicle of the right type takes the ride when one is free; otherwise a simulated driver.
  // Women-only rides always get a woman captain from the roster (partner drivers have no gender on file).
  const partner = womenOnly ? null : await partnerForRide(db, option);
  const drivers = partner ? [] : (await visible(db, "driver")).filter((d) => !womenOnly || d.gender === "female");
  if (!partner && !drivers.length) throw badRequest(womenOnly ? "No women captains are free right now. Please try again shortly." : "No drivers are available right now. Please try again shortly.");

  const seed = Date.now();
  const model = pick(option.models.length ? option.models : [option.name], seed >> 2);
  const simulated = partner ? null : (({ id: _driverId, ...d }) => d)(pick(drivers, seed));
  const ride: Ride = {
    id: uid("RD"),
    quote,
    pickup: await placeById(db, input.pickupId),
    drop: await placeById(db, input.dropId),
    payment: input.payment,
    // The rider's own PIN when they set one (Safety Preferences); otherwise a new code.
    otp: rider?.ride_pin ?? String(1000 + (seed % 9000)),
    driver: partner ? partnerDriverCard(partner, model) : {
      ...simulated!,
      vehicle: model,
      plate: `${pick(RIDE_SIM.plateStates, seed >> 3)} ${pick(RIDE_SIM.plateLetters, seed >> 5)} ${1000 + (seed % 8999)}`,
    },
    scheduledFor: input.scheduledFor ? localToIso(input.scheduledFor) : null,
    stops,
  };
  await db.prepare("INSERT INTO rides (id, user_id, status, data, created_at, vendor_vehicle_id, vendor_driver_id) VALUES (?, ?, 'confirmed', ?, ?, ?, ?)")
    .bind(ride.id, userId, JSON.stringify(ride), new Date().toISOString(), partner?.vehicle_id ?? null, partner?.driver_id ?? null).run();
  return ride;
}

export async function cancelRide(db: D1Database, userId: string, rideId: string) {
  const res = await db.prepare("UPDATE rides SET status = 'cancelled' WHERE id = ? AND user_id = ?").bind(rideId, userId).run();
  if (!res.meta.changes) throw notFound("Ride not found.");
}

/** The user's own ride, whatever its status (to show or start it). */
export async function getRide(db: D1Database, userId: string, rideId: string): Promise<Ride> {
  const row = await db.prepare("SELECT data FROM rides WHERE id = ? AND user_id = ?").bind(rideId, userId).first<{ data: string }>();
  if (!row) throw notFound("Ride not found.");
  return { scheduledFor: null, stops: [], ...JSON.parse(row.data) } as Ride;
}

/**
 * Starts a scheduled ride: allowed from RIDE_SCHEDULE.startWindowMinutes before pickup (the
 * driver is assigned then). The share link and the live trip count from this moment.
 */
export async function startRide(db: D1Database, userId: string, rideId: string): Promise<Ride> {
  const row = await db.prepare("SELECT data, status FROM rides WHERE id = ? AND user_id = ?").bind(rideId, userId).first<{ data: string; status: string }>();
  if (!row) throw notFound("Ride not found.");
  if (row.status === "cancelled") throw conflict("This ride was cancelled.");
  const ride = { scheduledFor: null, stops: [], ...JSON.parse(row.data) } as Ride;
  if (!ride.scheduledFor) throw badRequest("Only scheduled rides are started this way.");
  const wait = minutesUntilStart(ride.scheduledFor, RIDE_SCHEDULE.startWindowMinutes);
  if (wait > 0) throw conflict(`Your driver is assigned ${RIDE_SCHEDULE.startWindowMinutes} minutes before pickup. Start the ride in ${wait} minute${wait === 1 ? "" : "s"}.`);
  await db.prepare("UPDATE rides SET started_at = COALESCE(started_at, ?) WHERE id = ?").bind(new Date().toISOString(), rideId).run();
  return ride;
}

/** The user's own, not-cancelled ride and when its fare was set (used to price its booking). */
export async function ownRideWithTime(db: D1Database, userId: string, rideId: string): Promise<{ ride: Ride; createdAt: string }> {
  const row = await db.prepare("SELECT data, status, created_at FROM rides WHERE id = ? AND user_id = ?").bind(rideId, userId).first<{ data: string; status: string; created_at: string }>();
  if (!row) throw notFound("Ride not found.");
  if (row.status === "cancelled") throw badRequest("This ride was cancelled.");
  return { ride: { scheduledFor: null, stops: [], ...JSON.parse(row.data) } as Ride, createdAt: row.created_at };
}

/** The user's own, not-cancelled ride. */
export const ownRide = async (db: D1Database, userId: string, rideId: string): Promise<Ride> => (await ownRideWithTime(db, userId, rideId)).ride;
