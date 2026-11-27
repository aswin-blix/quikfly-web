// Live rides (docs/driver-app-plan.md): the pieces that both the booking code and dispatch need,
// kept apart so neither has to import the other. A live ride is a rides row with dispatch = 'live';
// its progress is `phase` (RIDE_PHASES) and only the API moves it.
import { RIDE_SIM, isWomenOnly, mapDistanceKm, pick, type Driver, type LiveRide, type MapPoint, type RideLive, type RideOption, type RidePhaseLive } from "@quikfly/shared";
import { visible } from "./catalog";
import { notify } from "./notifications";

export interface LiveRideRow {
  id: string; user_id: string; status: string; data: string; created_at: string; dispatch: "sim" | "live"; phase: RidePhaseLive | null; phase_at: string | null;
  offer_seq: number; otp_tries: number; otp_locked_until: string | null; vendor_vehicle_id: string | null; vendor_driver_id: string | null;
}
export const LIVE_RIDE_COLS = "id, user_id, status, data, created_at, dispatch, phase, phase_at, offer_seq, otp_tries, otp_locked_until, vendor_vehicle_id, vendor_driver_id";

/** The stored ride. `driver` is null while a live ride has no captain. */
export const parseRide = (data: string) => ({ scheduledFor: null, stops: [], ...JSON.parse(data) }) as LiveRide;

/** A captain from the demo roster for a simulated ride; null when the roster has none that fit. */
export async function simulatedDriver(db: D1Database, option: RideOption, seed = Date.now()): Promise<Driver | null> {
  const womenOnly = isWomenOnly(option);
  const roster = (await visible(db, "driver")).filter((d) => !womenOnly || d.gender === "female");
  if (!roster.length) return null;
  const { id: _id, ...d } = pick(roster, seed);
  return {
    ...d,
    vehicle: pick(option.models.length ? option.models : [option.name], seed >> 2),
    plate: `${pick(RIDE_SIM.plateStates, seed >> 3)} ${pick(RIDE_SIM.plateLetters, seed >> 5)} ${1000 + (seed % 8999)}`,
  };
}

/** Minutes to cover the straight line between two map points at the service's city speed (at least 1). */
export const minutesBetween = (a: MapPoint, b: MapPoint, service: "bike" | "car") =>
  Math.max(1, Math.ceil((mapDistanceKm(a, b) / RIDE_SIM.speedKmh[service]) * 60));

/** What the rider's screen needs about a live ride: the phase, where the captain is, and how long. */
export async function liveView(db: D1Database, row: LiveRideRow, ride: LiveRide): Promise<RideLive> {
  if (row.status === "cancelled") return { phase: "cancelled", captain: null, etaMin: null };
  const phase = row.phase ?? "searching";
  if (!row.vendor_driver_id || !["arriving", "arrived", "ontrip"].includes(phase)) return { phase, captain: null, etaMin: null };
  const s = await db.prepare("SELECT x, y FROM driver_state WHERE driver_id = ?").bind(row.vendor_driver_id).first<{ x: number | null; y: number | null }>();
  const captain = s && s.x !== null && s.y !== null ? { x: s.x, y: s.y } : null;
  const service = ride.quote.option.service === "bike" ? "bike" : "car";
  const etaMin = !captain ? null : phase === "arriving" ? minutesBetween(captain, ride.pickup, service) : phase === "ontrip" ? minutesBetween(captain, ride.drop, service) : 0;
  return { phase, captain, etaMin };
}

/**
 * A live ride ended by its rider or by staff: the ride is cancelled, a pending offer is withdrawn and
 * the captain (if one had accepted) is free again and told. Does nothing for a simulated ride.
 */
export async function closeLiveRide(db: D1Database, rideId: string): Promise<void> {
  const row = await db.prepare(
    `SELECT r.data, r.phase, d.user_id AS captain_user,
            (SELECT cd.user_id FROM ride_offers o JOIN vendor_drivers cd ON cd.id = o.driver_id WHERE o.ride_id = r.id AND o.outcome = 'pending' LIMIT 1) AS offered_user
     FROM rides r LEFT JOIN vendor_drivers d ON d.id = r.vendor_driver_id WHERE r.id = ? AND r.dispatch = 'live'`,
  ).bind(rideId).first<{ data: string; phase: string | null; captain_user: string | null; offered_user: string | null }>();
  if (!row) return;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE rides SET status = 'cancelled' WHERE id = ? AND dispatch = 'live' AND status <> 'cancelled'").bind(rideId),
    db.prepare("UPDATE ride_offers SET outcome = 'withdrawn', decided_at = ?2 WHERE ride_id = ?1 AND outcome = 'pending'").bind(rideId, now),
    db.prepare("UPDATE driver_state SET ride_id = NULL, idle_since = ?2 WHERE ride_id = ?1").bind(rideId, now),
  ]);
  const told = row.phase === "done" ? null : row.captain_user ?? row.offered_user;
  if (told) {
    const ride = parseRide(row.data);
    await notify(db, told, { kind: "driver.cancelled", ref: rideId, title: "Ride cancelled", body: `The rider cancelled ${ride.pickup.name} to ${ride.drop.name}. You're free for the next ride.` });
  }
}
