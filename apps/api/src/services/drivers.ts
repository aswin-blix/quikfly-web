// QuikFly Captain: who a signed-in person is as a driver, and their duty (online, position).
// A captain is a partner's driver record (vendor_drivers) linked to the account that signs in with the
// driver's number. Offers and the trip itself are in dispatch.ts and driver-rides.ts (step 2 of
// docs/driver-app-plan.md). Staff review of drivers stays in services/admin/fleet.ts.
import {
  CAPTAIN_RELEASE_REASONS, DRIVER_RULES, NOT_A_CAPTAIN, dailyFeePaise, formatRegNumber, onDailyFee, onMap, toMapPoint, vehicleTypeForCaptain,
  type CaptainDuty, type CaptainProfile, type CaptainRules, type Gender, type Settings, type MapPoint, type User, type VendorVehicleType,
} from "@quikfly/shared";
import { badRequest, conflict, forbidden } from "../lib/errors";
import { getSettings } from "./settings";



/** A captain as the API sees them: the driver record, the vehicle they are on and their fleet. */
export interface CaptainContext {
  id: string; vendor_id: string; user_id: string; name: string; phone: string; self: number; gender: Gender | null;
  status: "submitted" | "active" | "rejected" | "blocked"; review_note: string | null; blocked_reason: string | null;
  vehicle_id: string | null; vehicle_type: VendorVehicleType | null; vehicle_reg: string | null; vehicle_status: string | null;
  vendor_status: string; owner_name: string;
}

interface StateRow {
  online: number; x: number | null; y: number | null; demo: number; seen_at: string | null; ride_id: string | null;
}

const CAPTAIN_SQL = `
  SELECT d.id, d.vendor_id, d.user_id, d.name, d.phone, d.self, d.gender, d.status, d.review_note, d.blocked_reason,
         vv.id AS vehicle_id, vv.type AS vehicle_type, vv.reg_number AS vehicle_reg, vv.status AS vehicle_status,
         ve.status AS vendor_status, ou.name AS owner_name
  FROM vendor_drivers d
  JOIN vendors ve ON ve.id = d.vendor_id
  JOIN users ou ON ou.id = ve.user_id
  LEFT JOIN vendor_vehicles vv ON vv.id = d.vehicle_id
  WHERE d.user_id = ?`;

/**
 * The signed-in person's driver record, linking it at the first visit: a record with their number that
 * nobody has claimed (the number was proven at sign-in). An approved record is preferred, then the newest.
 * Null when their number has none.
 */
export async function captainFor(db: D1Database, user: Pick<User, "id" | "phone">): Promise<CaptainContext | null> {
  const linked = await db.prepare(CAPTAIN_SQL).bind(user.id).first<CaptainContext>();
  if (linked) return linked;
  const claimed = await db.prepare(
    `UPDATE vendor_drivers SET user_id = ?1 WHERE user_id IS NULL AND id = (
       SELECT id FROM vendor_drivers WHERE phone = ?2 AND user_id IS NULL AND status <> 'rejected'
       ORDER BY (status = 'active') DESC, created_at DESC LIMIT 1)`,
  ).bind(user.id, user.phone).run();
  return claimed.meta.changes ? db.prepare(CAPTAIN_SQL).bind(user.id).first<CaptainContext>() : null;
}

/** The captain, or 403 with what to do about it. */
export async function needCaptain(db: D1Database, user: Pick<User, "id" | "phone">): Promise<CaptainContext> {
  const captain = await captainFor(db, user);
  if (!captain) throw forbidden(NOT_A_CAPTAIN);
  return captain;
}

/** What stops this captain from going online, in words for them; null when nothing does. */
export function captainBlocker(c: CaptainContext): string | null {
  if (c.status === "submitted") return "QuikFly is still checking your details. You can go online once you're approved.";
  if (c.status === "rejected") return `Your registration wasn't approved${c.review_note ? `: ${c.review_note}` : "."}`;
  if (c.status === "blocked") return `You can't take rides right now${c.blocked_reason ? `: ${c.blocked_reason}` : "."}`;
  if (c.vendor_status !== "active") return c.self ? "Your QuikFly Partner account isn't live yet." : `${c.owner_name}'s QuikFly Partner account isn't live.`;
  if (!c.vehicle_id) return c.self ? "Assign yourself to a vehicle in QuikFly Partner." : `No vehicle is assigned to you. Ask ${c.owner_name} to assign one in QuikFly Partner.`;
  const reg = formatRegNumber(c.vehicle_reg!);
  if (c.vehicle_status === "blocked") return `${reg} is blocked. ${c.self ? "Check it in QuikFly Partner." : `Ask ${c.owner_name} to check it in QuikFly Partner.`}`;
  if (c.vehicle_status !== "active") return `${reg} is off duty. ${c.self ? "Put it on duty in QuikFly Partner." : `Ask ${c.owner_name} to put it on duty.`}`;
  if (!vehicleTypeForCaptain(c.vehicle_type!)) return "QuikFly Captain is for autos and cars for now.";
  return null;
}

const toDuty = (s: StateRow | null): CaptainDuty => ({
  online: !!s?.online,
  position: s && s.x !== null && s.y !== null ? { x: s.x, y: s.y } : null,
  demo: !!s?.demo,
  seenAt: s?.seen_at ?? null,
});

const stateOf = (db: D1Database, driverId: string) =>
  db.prepare("SELECT online, x, y, demo, seen_at, ride_id FROM driver_state WHERE driver_id = ?").bind(driverId).first<StateRow>();

/**
 * A captain's duty as stored. One who went silent (no ping for driverStaleSeconds) and isn't on a ride is
 * set offline here, so the app never shows "online" for someone dispatch would skip.
 */
export async function dutyOf(db: D1Database, driverId: string): Promise<CaptainDuty> {
  const s = await stateOf(db, driverId);
  if (s?.online && !s.ride_id && s.seen_at) {
    const stale = (await getSettings(db)).driverStaleSeconds;
    if (Date.now() - Date.parse(s.seen_at) > stale * 1000) {
      await db.prepare("UPDATE driver_state SET online = 0, idle_since = NULL WHERE driver_id = ? AND seen_at = ?").bind(driverId, s.seen_at).run();
      return toDuty({ ...s, online: 0 });
    }
  }
  return toDuty(s);
}

/** The rules a captain works under now (the app's "How it works"); city rides, so the car service's earning model. */
export function captainRules(settings: Settings): CaptainRules {
  return {
    offerSeconds: settings.driverOfferSeconds,
    pingIdleSeconds: DRIVER_RULES.pingIdleSeconds,
    pingBusySeconds: DRIVER_RULES.pingBusySeconds,
    searchRadiusKm: settings.driverSearchRadiusKm,
    arrivedRadiusKm: settings.driverArrivedRadiusKm ?? 0,
    pinTries: DRIVER_RULES.pinTries,
    pinLockMinutes: DRIVER_RULES.pinLockMinutes,
    cancelPenaltyPercent: settings.driverCancelPenaltyPercent ?? 0,
    cancelPenaltyCap: DRIVER_RULES.cancelPenaltyCap,
    releaseReasons: CAPTAIN_RELEASE_REASONS.map((r) => ({ id: r.id, label: r.label, valid: r.valid })),
    model: onDailyFee(settings, "car") ? "dailyFee" : "commission",
    commissionPercent: settings.vendorCommissionPercent,
    dailyFeePaise: dailyFeePaise(settings, "car"),
    demoLocation: settings.driverDemoLocation !== false,
  };
}

export async function captainProfile(db: D1Database, c: CaptainContext): Promise<CaptainProfile> {
  return {
    driver: { id: c.id, name: c.name, phone: c.phone, gender: c.gender, self: !!c.self },
    vehicle: c.vehicle_id ? { id: c.vehicle_id, type: c.vehicle_type!, regNumber: c.vehicle_reg! } : null,
    owner: { name: c.owner_name },
    blocker: captainBlocker(c),
    duty: await dutyOf(db, c.id),
    rules: captainRules(await getSettings(db)),
  };
}

/**
 * A position report as a point on the city map: a GPS fix is placed on it (outside the city is refused);
 * a map point is a demo location and needs the driverDemoLocation setting.
 */
async function readPosition(db: D1Database, body: Record<string, unknown>): Promise<{ point: MapPoint; lat: number | null; lng: number | null; demo: boolean } | null> {
  const p = body.position;
  if (p === undefined || p === null) return null;
  if (typeof p !== "object" || Array.isArray(p)) throw badRequest('"position" must be { lat, lng } or { x, y }.');
  const { lat, lng, x, y } = p as Record<string, unknown>;
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (num(lat) && num(lng)) {
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw badRequest("That isn't a valid location.");
    const point = toMapPoint({ lat, lng });
    if (!point) throw conflict("You're outside the area QuikFly serves (Chennai). Move into the city to take rides.");
    return { point, lat, lng, demo: false };
  }
  if (num(x) && num(y)) {
    if (!(await getSettings(db)).driverDemoLocation) throw badRequest("Demo locations are switched off. Turn on location on your phone.");
    if (!onMap({ x, y })) throw badRequest("That point isn't on the map.");
    return { point: { x, y }, lat: null, lng: null, demo: true };
  }
  throw badRequest('"position" must be { lat, lng } or { x, y }.');
}

/** Goes online (needs nothing stopping them and a position) or offline (not during a ride). */
export async function setDuty(db: D1Database, c: CaptainContext, body: Record<string, unknown>): Promise<void> {
  if (typeof body.online !== "boolean") throw badRequest('"online" must be true or false.');
  const now = new Date().toISOString();
  if (!body.online) {
    const res = await db.prepare("UPDATE driver_state SET online = 0, idle_since = NULL, seen_at = ? WHERE driver_id = ? AND ride_id IS NULL").bind(now, c.id).run();
    if (!res.meta.changes && (await stateOf(db, c.id))?.ride_id) throw conflict("Finish your ride before going offline.");
    return;
  }
  const blocker = captainBlocker(c);
  if (blocker) throw conflict(blocker);
  const pos = await readPosition(db, body);
  if (!pos && !(await dutyOf(db, c.id)).position) throw badRequest("Share your location to go online.");
  await db.prepare(
    pos
      ? `INSERT INTO driver_state (driver_id, online, x, y, lat, lng, demo, seen_at, idle_since) VALUES (?1, 1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(driver_id) DO UPDATE SET online = 1, x = excluded.x, y = excluded.y, lat = excluded.lat, lng = excluded.lng, demo = excluded.demo,
           seen_at = excluded.seen_at, idle_since = COALESCE(CASE WHEN driver_state.online = 1 THEN driver_state.idle_since END, excluded.idle_since)`
      : `UPDATE driver_state SET online = 1, seen_at = ?7, idle_since = COALESCE(CASE WHEN online = 1 THEN idle_since END, ?7) WHERE driver_id = ?1`,
  ).bind(c.id, pos?.point.x ?? null, pos?.point.y ?? null, pos?.lat ?? null, pos?.lng ?? null, pos?.demo ? 1 : 0, now).run();
}

/**
 * The captain's heartbeat while online: records where they are and that the app is alive (the route then
 * returns captainState). Offline, it changes nothing. A bad or outside-the-city fix keeps the last good position.
 */
export async function ping(db: D1Database, c: CaptainContext, body: Record<string, unknown>): Promise<void> {
  const pos = await readPosition(db, body).catch(() => null);
  const now = new Date().toISOString();
  await db.prepare(
    pos
      ? "UPDATE driver_state SET x = ?2, y = ?3, lat = ?4, lng = ?5, demo = ?6, seen_at = ?7 WHERE driver_id = ?1 AND online = 1"
      : "UPDATE driver_state SET seen_at = ?7 WHERE driver_id = ?1 AND online = 1",
  ).bind(c.id, pos?.point.x ?? null, pos?.point.y ?? null, pos?.lat ?? null, pos?.lng ?? null, pos?.demo ? 1 : 0, now).run();
}
