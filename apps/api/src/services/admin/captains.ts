// Staff view of QuikFly Captain (step 5 of docs/driver-app-plan.md): who is online, on a ride or silent,
// with the same "why can't I go online" words the Captain app shows, and setting a captain offline.
// Blocking a driver and their gender stay on the partner's fleet review (services/admin/fleet.ts).
import { CAPTAIN_VEHICLE_TYPES, captainLiveStatus, type AdminCaptain, type AdminCaptains, type DispatchStep } from "@quikfly/shared";
import { conflict, notFound } from "../../lib/errors";
import { captainBlocker, type CaptainContext } from "../drivers";
import { getSettings } from "../settings";
import { auditStatement } from "./audit";

/** The most captains the page lists (approved and signed in first). */
const CAPTAINS_PAGE = 300;

type Row = CaptainContext & {
  vendor_name: string; online: number | null; x: number | null; y: number | null; demo: number | null; seen_at: string | null; ride_id: string | null;
  trips: number; earning: number;
};

/** Every driver who has signed in to QuikFly Captain, with their live status, plus the readiness counts. */
export async function listCaptains(db: D1Database): Promise<AdminCaptains> {
  const settings = await getSettings(db);
  const types = JSON.stringify(CAPTAIN_VEHICLE_TYPES);
  // India day, for today's trips.
  const day = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${day}T00:00:00+05:30`)).toISOString();
  const [rows, ready] = await db.batch([
    db.prepare(
      `SELECT d.id, d.vendor_id, d.user_id, d.name, d.phone, d.self, d.gender, d.status, d.review_note, d.blocked_reason,
              vv.id AS vehicle_id, vv.type AS vehicle_type, vv.reg_number AS vehicle_reg, vv.status AS vehicle_status,
              ve.status AS vendor_status, ou.name AS owner_name, ou.name AS vendor_name,
              s.online, s.x, s.y, s.demo, s.seen_at, s.ride_id,
              (SELECT COUNT(*) FROM vendor_trips t WHERE t.driver_id = d.id AND t.completed_at >= ?1) AS trips,
              (SELECT COALESCE(SUM(t.earning_paise), 0) FROM vendor_trips t WHERE t.driver_id = d.id AND t.completed_at >= ?1) AS earning
       FROM vendor_drivers d
       JOIN vendors ve ON ve.id = d.vendor_id JOIN users ou ON ou.id = ve.user_id
       LEFT JOIN vendor_vehicles vv ON vv.id = d.vehicle_id
       LEFT JOIN driver_state s ON s.driver_id = d.id
       WHERE d.user_id IS NOT NULL
       ORDER BY (s.ride_id IS NOT NULL) DESC, COALESCE(s.online, 0) DESC, s.seen_at DESC, d.name
       LIMIT ?2`,
    ).bind(from, CAPTAINS_PAGE),
    db.prepare(
      `SELECT COUNT(*) AS approved, COALESCE(SUM(d.user_id IS NOT NULL), 0) AS signed_in
       FROM vendor_drivers d JOIN vendor_vehicles vv ON vv.id = d.vehicle_id AND vv.status = 'active'
       JOIN vendors ve ON ve.id = d.vendor_id AND ve.status = 'active'
       WHERE d.status = 'active' AND vv.type IN (SELECT value FROM json_each(?))`,
    ).bind(types),
  ]) as [D1Result<Row>, D1Result<{ approved: number; signed_in: number }>];
  const now = Date.now();
  const captains: AdminCaptain[] = rows.results.map((r) => ({
    driverId: r.id, name: r.name, phone: r.phone, gender: r.gender, vendor: { id: r.vendor_id, name: r.vendor_name },
    vehicle: r.vehicle_id ? { id: r.vehicle_id, type: r.vehicle_type!, regNumber: r.vehicle_reg! } : null,
    status: captainLiveStatus(r.online === null ? null : { online: r.online, rideId: r.ride_id, seenAt: r.seen_at }, settings.driverStaleSeconds, now),
    seenAt: r.seen_at, position: r.x !== null && r.y !== null ? { x: r.x, y: r.y } : null, demo: !!r.demo, rideId: r.ride_id,
    blocker: captainBlocker(r), tripsToday: r.trips, earningTodayPaise: r.earning,
  }));
  const r0 = ready.results[0];
  return {
    readiness: {
      approved: r0?.approved ?? 0, signedIn: r0?.signed_in ?? 0,
      online: captains.filter((c) => c.status === "online").length, onRide: captains.filter((c) => c.status === "onRide").length,
      liveDrivers: settings.featureLiveDrivers === true, demoLocation: settings.driverDemoLocation !== false, simulateDrivers: settings.rideSimulateDrivers !== false,
    },
    captains,
  };
}

/** Sets a captain offline (not during a ride): their next heartbeat shows it, and dispatch skips them. Audited on the partner. */
export async function setCaptainOffline(db: D1Database, adminId: string, driverId: string): Promise<AdminCaptains> {
  const d = await db.prepare("SELECT d.vendor_id, d.name, s.online, s.ride_id FROM vendor_drivers d LEFT JOIN driver_state s ON s.driver_id = d.id WHERE d.id = ?")
    .bind(driverId).first<{ vendor_id: string; name: string; online: number | null; ride_id: string | null }>();
  if (!d) throw notFound("Captain not found.");
  if (d.ride_id) throw conflict(`${d.name} is on a ride. They can go offline once it ends.`);
  if (!d.online) throw conflict(`${d.name} is already offline.`);
  const [res] = await db.batch([
    db.prepare("UPDATE driver_state SET online = 0, idle_since = NULL WHERE driver_id = ? AND online = 1 AND ride_id IS NULL").bind(driverId),
    auditStatement(db, { adminId, action: "vendor.captain.offline", entity: "vendor", entityId: d.vendor_id, detail: { driverId, name: d.name } }),
  ]);
  if (!res.meta.changes) throw conflict("This captain's status changed meanwhile. Refresh and try again.");
  return listCaptains(db);
}

/** A live ride's dispatch log for its booking: every offer in order. Empty for simulated rides. */
export async function dispatchLog(db: D1Database, bookingId: string): Promise<DispatchStep[]> {
  const { results } = await db.prepare(
    `SELECT o.seq, o.driver_id, d.name, d.vendor_id, o.offered_at, o.km, o.outcome, o.decided_at, o.reason
     FROM bookings b JOIN ride_offers o ON o.ride_id = b.ride_id JOIN vendor_drivers d ON d.id = o.driver_id
     WHERE b.id = ? ORDER BY o.seq`,
  ).bind(bookingId).all<{ seq: number; driver_id: string; name: string; vendor_id: string; offered_at: string; km: number | null; outcome: string; decided_at: string | null; reason: string | null }>();
  return results.map((o) => ({
    seq: o.seq, driverId: o.driver_id, driverName: o.name, vendorId: o.vendor_id, offeredAt: o.offered_at, km: o.km, outcome: o.outcome, decidedAt: o.decided_at, reason: o.reason,
  }));
}
