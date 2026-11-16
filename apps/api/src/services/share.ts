// Public "follow my ride" links. Anyone with the token sees the trip, without personal details.
import { SHARE_LINK_HOURS, type Ride, type SharedRide } from "@quikfly/shared";
import { notFound } from "../lib/errors";
import { randomToken } from "../lib/random";

interface ShareRow { data: string; status: string; created_at: string; rider: string }

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
    `SELECT r.data, r.status, r.created_at, u.name AS rider FROM ride_shares s
     JOIN rides r ON r.id = s.ride_id JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`,
  ).bind(token, Date.now()).first<ShareRow>();
  if (!row) throw notFound("This trip link has expired or doesn't exist.");
  const ride = JSON.parse(row.data) as Ride;
  return {
    riderName: row.rider.split(" ")[0],
    status: row.status === "cancelled" ? "cancelled" : "active",
    startedAt: row.created_at,
    pickup: ride.pickup,
    drop: ride.drop,
    distanceKm: ride.quote.distanceKm,
    durationMin: ride.quote.durationMin,
    etaMin: ride.quote.etaMin,
    driver: { name: ride.driver.name, rating: ride.driver.rating, vehicle: ride.driver.vehicle, plate: ride.driver.plate },
  };
}
