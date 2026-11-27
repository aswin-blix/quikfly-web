// Public "follow my ride" links. Anyone with the token sees the trip, without personal details.
import { SHARE_LINK_HOURS, type LiveRide, type SharedRide } from "@quikfly/shared";
import { notFound } from "../lib/errors";
import { randomToken } from "../lib/random";

interface ShareRow { data: string; status: string; created_at: string; started_at: string | null; rider: string; dispatch: string; phase: SharedRide["phase"]; cx: number | null; cy: number | null }

/** Returns the existing link for this ride if there is a live one, otherwise a new one. */
export async function shareRide(db: D1Database, userId: string, rideId: string) {
  const ride = await db.prepare("SELECT id FROM rides WHERE id = ? AND user_id = ?").bind(rideId, userId).first();
  if (!ride) throw notFound("Ride not found.");
  const existing = await db.prepare("SELECT token, expires_at FROM ride_shares WHERE ride_id = ? AND expires_at > ?")
    .bind(rideId, Date.now()).first<{ token: string; expires_at: number }>();
  if (existing) return { token: existing.token, expiresAt: new Date(existing.expires_at).toISOString() };

  const token = randomToken(12);
  const expiresAt = Date.now() + SHARE_LINK_HOURS * 3_600_000;
  await db.prepare("INSERT INTO ride_shares (token, ride_id, user_id, expires_at) VALUES (?, ?, ?, ?)")
    .bind(token, rideId, userId, expiresAt).run();
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

export async function readShare(db: D1Database, token: string): Promise<SharedRide> {
  const row = await db.prepare(
    `SELECT r.data, r.status, r.created_at, r.started_at, r.dispatch, r.phase, u.name AS rider, ds.x AS cx, ds.y AS cy FROM ride_shares s
     JOIN rides r ON r.id = s.ride_id JOIN users u ON u.id = s.user_id
     LEFT JOIN driver_state ds ON ds.driver_id = r.vendor_driver_id AND r.phase IN ('arriving', 'arrived', 'ontrip')
     WHERE s.token = ? AND s.expires_at > ?`,
  ).bind(token, Date.now()).first<ShareRow>();
  if (!row) throw notFound("This trip link has expired or doesn't exist.");
  // A live ride has no driver until a captain accepts (LiveRide).
  const ride = JSON.parse(row.data) as Omit<LiveRide, "live">;
  return {
    riderName: row.rider.split(" ")[0],
    service: ride.quote.option.service,
    status: row.status === "cancelled" ? "cancelled" : "active",
    // Scheduled rides count from when the rider started them (or the pickup time until then).
    startedAt: row.started_at ?? ride.scheduledFor ?? row.created_at,
    pickup: ride.pickup,
    drop: ride.drop,
    stops: ride.stops ?? [],
    distanceKm: ride.quote.distanceKm,
    durationMin: ride.quote.durationMin,
    etaMin: ride.quote.etaMin,
    driver: ride.driver ? { name: ride.driver.name, rating: ride.driver.rating, vehicle: ride.driver.vehicle, plate: ride.driver.plate } : null,
    // The real progress of a live ride; a simulated one is played by the page from startedAt.
    phase: row.dispatch === "live" ? row.phase : null,
    // Where the captain is (the city map, never GPS), so family can follow the real ride.
    captain: row.dispatch === "live" && row.status !== "cancelled" && row.cx !== null && row.cy !== null ? { x: row.cx, y: row.cy } : null,
  };
}
