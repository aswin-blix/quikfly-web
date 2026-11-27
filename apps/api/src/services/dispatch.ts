// Dispatch: who is asked to take a live ride, one captain at a time, nearest first.
// A Worker has no background loop, so a search moves forward whenever someone asks about it: the
// rider polling GET /rides/:id, a captain's heartbeat, or the minute cron. Each step applies only to
// the offer number it read (rides.offer_seq, and one ride_offers row per step), so two callers can't
// both make the next offer. See docs/driver-app-plan.md.
import {
  DRIVER_RULES, NO_CAPTAIN, isWomenOnly, mapDistanceKm, vehicleTypeForRide, type LiveRide, type Settings,
} from "@quikfly/shared";
import { getSettings } from "./settings";
import { notify } from "./notifications";
import { parseRide, simulatedDriver } from "./live-rides";
import { ACTIVE, cancelBookingRow } from "./bookings";

/** Set when a step wrote a notification worth pushing to a phone right away (the route does the pushing). */
export interface Wake { push: boolean }

interface SearchRow { id: string; user_id: string; data: string; phase_at: string; offer_seq: number; outcome: string | null; expires_at: string | null }
interface Candidate { id: string; user_id: string; x: number; y: number; idle_since: string | null }

/** The next captain to ask: online, heard from recently, free, on the right kind of vehicle, near enough and not asked before. */
async function nextCaptain(db: D1Database, settings: Settings, ride: LiveRide, riderId: string): Promise<Candidate | null> {
  const type = vehicleTypeForRide(ride.quote.option);
  if (!type) return null;
  const now = Date.now();
  const { results } = await db.prepare(
    `SELECT d.id, d.user_id, s.x, s.y, s.idle_since
     FROM driver_state s
     JOIN vendor_drivers d ON d.id = s.driver_id AND d.status = 'active' AND d.user_id IS NOT NULL
     JOIN vendor_vehicles vv ON vv.id = d.vehicle_id AND vv.status = 'active' AND vv.type = ?2
     JOIN vendors ve ON ve.id = d.vendor_id AND ve.status = 'active'
     WHERE s.online = 1 AND s.ride_id IS NULL AND s.x IS NOT NULL AND s.seen_at >= ?3 AND d.user_id <> ?4
       AND (?5 = 0 OR d.gender = 'female')
       AND NOT EXISTS (SELECT 1 FROM ride_offers o WHERE o.ride_id = ?1 AND o.driver_id = d.id)
       AND NOT EXISTS (SELECT 1 FROM ride_offers o WHERE o.driver_id = d.id AND o.outcome = 'pending' AND o.expires_at > ?6)
     LIMIT 200`,
  ).bind(ride.id, type, new Date(now - settings.driverStaleSeconds * 1000).toISOString(), riderId, isWomenOnly(ride.quote.option) ? 1 : 0, new Date(now).toISOString())
    .all<Candidate>();
  const near = results
    .map((c) => ({ c, km: mapDistanceKm(c, ride.pickup) }))
    .filter((n) => n.km <= settings.driverSearchRadiusKm)
    // Equally near (the same distance band): whoever has waited longest goes first.
    .sort((a, b) => Math.floor(a.km / DRIVER_RULES.distanceBandKm) - Math.floor(b.km / DRIVER_RULES.distanceBandKm)
      || (a.c.idle_since ?? "9").localeCompare(b.c.idle_since ?? "9") || a.km - b.km);
  return near[0]?.c ?? null;
}

/** Nobody took it: a simulated captain steps in (setting rideSimulateDrivers), or the rider is told and anything paid goes back. */
async function giveUp(db: D1Database, settings: Settings, row: SearchRow, ride: LiveRide) {
  const now = new Date().toISOString();
  if (settings.rideSimulateDrivers) {
    const driver = await simulatedDriver(db, ride.quote.option);
    if (driver) {
      // A booking paid while an earlier captain had the ride no longer earns for that vehicle.
      await db.batch([
        db.prepare(
          "UPDATE rides SET dispatch = 'sim', phase = NULL, phase_at = ?2, data = json_set(data, '$.driver', json(?3)) WHERE id = ?1 AND phase = 'searching' AND offer_seq = ?4",
        ).bind(row.id, now, JSON.stringify(driver), row.offer_seq),
        db.prepare(`UPDATE bookings SET vendor_id = NULL, vendor_vehicle_id = NULL, vendor_driver_id = NULL WHERE ride_id = ?1 AND status IN ${ACTIVE} AND EXISTS (SELECT 1 FROM rides WHERE id = ?1 AND dispatch = 'sim' AND phase_at = ?2)`)
          .bind(row.id, now),
      ]);
      return;
    }
  }
  const res = await db.prepare("UPDATE rides SET phase = 'unmatched', phase_at = ?2 WHERE id = ?1 AND phase = 'searching' AND offer_seq = ?3").bind(row.id, now, row.offer_seq).run();
  if (!res.meta.changes) return;
  // A rider who had already paid (their captain gave the ride back) gets all of it back, with no fee.
  const paid = await db.prepare(`SELECT id FROM bookings WHERE ride_id = ? AND status IN ${ACTIVE}`).bind(row.id).first<{ id: string }>();
  if (paid) await cancelBookingRow(db, null, paid.id, "Refund, no captain was free");
  await notify(db, row.user_id, { kind: "ride.captain", ref: `${row.id}:none`, bookingId: paid?.id ?? null, title: "No captain found", body: NO_CAPTAIN });
}

/** Moves one ride's search forward if it is due: times out a silent offer, then asks the next captain or gives up. */
export async function advanceDispatch(db: D1Database, rideId: string, wake?: Wake): Promise<void> {
  const row = await db.prepare(
    `SELECT r.id, r.user_id, r.data, r.phase_at, r.offer_seq, o.outcome, o.expires_at
     FROM rides r LEFT JOIN ride_offers o ON o.ride_id = r.id AND o.seq = r.offer_seq
     WHERE r.id = ? AND r.dispatch = 'live' AND r.phase = 'searching' AND r.status <> 'cancelled'`,
  ).bind(rideId).first<SearchRow>();
  if (!row) return;
  const now = Date.now();
  if (row.outcome === "pending") {
    if (Date.parse(row.expires_at!) > now) return; // still theirs to answer
    await db.prepare("UPDATE ride_offers SET outcome = 'timeout', decided_at = ?3 WHERE ride_id = ?1 AND seq = ?2 AND outcome = 'pending'")
      .bind(rideId, row.offer_seq, new Date(now).toISOString()).run();
  }
  const settings = await getSettings(db);
  const ride = parseRide(row.data);
  const searched = (now - Date.parse(row.phase_at)) / 1000;
  if (row.offer_seq >= settings.driverOfferMaxDrivers || searched > settings.driverSearchSeconds) return giveUp(db, settings, row, ride);
  const captain = await nextCaptain(db, settings, ride, row.user_id);
  if (!captain) {
    // Nobody left to ask. A fresh search waits a moment in case a captain is just coming online.
    if (row.offer_seq > 0 || searched >= DRIVER_RULES.noCaptainSeconds) await giveUp(db, settings, row, ride);
    return;
  }
  const seq = row.offer_seq + 1;
  const [offered] = await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO ride_offers (ride_id, driver_id, seq, offered_at, expires_at)
       SELECT ?1, ?2, ?3, ?4, ?5
       WHERE EXISTS (SELECT 1 FROM rides WHERE id = ?1 AND offer_seq = ?3 - 1 AND phase = 'searching' AND status <> 'cancelled')
         AND EXISTS (SELECT 1 FROM driver_state WHERE driver_id = ?2 AND online = 1 AND ride_id IS NULL)`,
    ).bind(rideId, captain.id, seq, new Date(now).toISOString(), new Date(now + settings.driverOfferSeconds * 1000).toISOString()),
    db.prepare("UPDATE rides SET offer_seq = ?2 WHERE id = ?1 AND offer_seq = ?2 - 1 AND EXISTS (SELECT 1 FROM ride_offers WHERE ride_id = ?1 AND seq = ?2)").bind(rideId, seq),
  ]);
  if (!offered.meta.changes) return;
  await notify(db, captain.user_id, {
    kind: "driver.offer", ref: `${rideId}:${seq}`, title: `New ${ride.quote.option.name} ride · ₹${ride.quote.fare}`,
    body: `${ride.pickup.name} to ${ride.drop.name}, ${ride.quote.distanceKm} km. Answer within ${settings.driverOfferSeconds} seconds.`,
  });
  if (wake) wake.push = true;
}

/** Moves the oldest waiting searches forward (a captain's heartbeat and the cron call this for rides nobody is polling). */
export async function advanceSearching(db: D1Database, limit: number, wake?: Wake): Promise<void> {
  const { results } = await db.prepare("SELECT id FROM rides WHERE phase = 'searching' AND dispatch = 'live' AND status <> 'cancelled' ORDER BY phase_at LIMIT ?").bind(limit).all<{ id: string }>();
  for (const r of results) await advanceDispatch(db, r.id, wake);
}
