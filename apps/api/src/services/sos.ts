// SOS alerts: a customer presses SOS on the safety sheet; the press is stored with the ride and
// the location the app shared, and staff acknowledge and close it from the admin panel. There is
// no dispatch, telephony or SMS behind it yet (free tier): the apps say "demo" on screen and
// staff call the customer. Acknowledging and closing are audited.
import { SOS_NOTE_MAX, type SosAlert, type SosReceipt, type SosRequest, type SosStatus } from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { staffAlertStatement } from "./admin/alerts";
import { auditStatement } from "./admin/audit";

interface SosRow {
  id: string; user_id: string; ride_id: string | null; booking_id: string | null; lat: number | null; lng: number | null; note: string | null;
  status: SosStatus; handled_by: string | null; handled_at: string | null; handled_note: string | null; created_at: string;
  customer_name: string; customer_phone: string; handler_name: string | null; ride_status: string | null; ride_data: string | null;
}

/** Open alerts one person can hold at once (a stuck button mustn't flood the queue). */
const MAX_OPEN_PER_USER = 3;

export async function raiseSos(db: D1Database, userId: string, req: SosRequest): Promise<SosReceipt> {
  if (req.note !== undefined && (typeof req.note !== "string" || req.note.length > SOS_NOTE_MAX)) throw badRequest(`"note" must be text up to ${SOS_NOTE_MAX} characters.`);
  for (const k of ["lat", "lng"] as const) {
    if (req[k] !== undefined && (typeof req[k] !== "number" || !Number.isFinite(req[k]))) throw badRequest(`"${k}" must be a number.`);
  }
  if (req.lat !== undefined && (req.lat < -90 || req.lat > 90)) throw badRequest('"lat" must be from -90 to 90.');
  if (req.lng !== undefined && (req.lng < -180 || req.lng > 180)) throw badRequest('"lng" must be from -180 to 180.');
  if (req.rideId) {
    const ride = await db.prepare("SELECT 1 FROM rides WHERE id = ? AND user_id = ?").bind(req.rideId, userId).first();
    if (!ride) throw notFound("Ride not found.");
  }
  if (req.bookingId) {
    const booking = await db.prepare("SELECT 1 FROM bookings WHERE id = ? AND user_id = ?").bind(req.bookingId, userId).first();
    if (!booking) throw notFound("Booking not found.");
  }
  const open = await db.prepare("SELECT COUNT(*) AS n FROM sos_alerts WHERE user_id = ? AND status = 'open'").bind(userId).first<{ n: number }>();
  if ((open?.n ?? 0) >= MAX_OPEN_PER_USER) throw conflict("Your earlier SOS is already with our team. Call 112 if you are in danger.");
  const id = uid("SOS");
  const now = new Date().toISOString();
  // The staff alert lands with the press (same batch); it names no one: the SOS page has the details.
  await db.batch([
    db.prepare(
      "INSERT INTO sos_alerts (id, user_id, ride_id, booking_id, lat, lng, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)",
    ).bind(id, userId, req.rideId ?? null, req.bookingId ?? null, req.lat ?? null, req.lng ?? null, req.note?.trim() || null, now),
    staffAlertStatement(db, {
      kind: "sos.raised", ref: id, title: "SOS pressed",
      body: req.rideId ? "A customer pressed SOS during a ride. Open the alert and call them now." : "A customer pressed SOS. Open the alert and call them now.",
      link: "/sos",
    }),
  ]);
  return { id, createdAt: now, status: "open" };
}

const SELECT = `SELECT s.*, u.name AS customer_name, u.phone AS customer_phone, a.name AS handler_name, r.status AS ride_status, r.data AS ride_data
  FROM sos_alerts s JOIN users u ON u.id = s.user_id LEFT JOIN admin_users a ON a.id = s.handled_by LEFT JOIN rides r ON r.id = s.ride_id`;

function toAlert(r: SosRow): SosAlert {
  let ride: SosAlert["ride"] = null;
  if (r.ride_data) {
    try {
      const d = JSON.parse(r.ride_data) as { driver?: { name?: string; vehicle?: string; plate?: string }; pickup?: { name?: string }; drop?: { name?: string } };
      ride = { driverName: d.driver?.name ?? "", vehicle: d.driver?.vehicle ?? "", plate: d.driver?.plate ?? "", pickup: d.pickup?.name ?? "", drop: d.drop?.name ?? "", status: r.ride_status ?? "" };
    } catch { ride = null; }
  }
  return {
    id: r.id, customer: { id: r.user_id, name: r.customer_name, phone: r.customer_phone }, rideId: r.ride_id, bookingId: r.booking_id,
    lat: r.lat, lng: r.lng, note: r.note, status: r.status, createdAt: r.created_at,
    handledBy: r.handled_by ? { id: r.handled_by, name: r.handler_name ?? "Staff" } : null, handledAt: r.handled_at, handledNote: r.handled_note, ride,
  };
}

/** Alerts in one status, newest first (open ones are what the queue shows by default). */
export async function sosQueue(db: D1Database, status: SosStatus): Promise<SosAlert[]> {
  const { results } = await db.prepare(`${SELECT} WHERE s.status = ? ORDER BY s.created_at DESC LIMIT 200`).bind(status).all<SosRow>();
  return results.map(toAlert);
}

export async function sosAlert(db: D1Database, id: string): Promise<SosAlert> {
  const row = await db.prepare(`${SELECT} WHERE s.id = ?`).bind(id).first<SosRow>();
  if (!row) throw notFound("SOS alert not found.");
  return toAlert(row);
}

/**
 * open → acknowledged (someone is on it) → closed (with what was done). An open alert may also be
 * closed straight away. The handler and the note are kept on the alert and in the audit log.
 */
export async function handleSos(db: D1Database, adminId: string, id: string, decision: "acknowledge" | "close", note: string | null): Promise<SosAlert> {
  const current = await sosAlert(db, id);
  const to: SosStatus = decision === "acknowledge" ? "acknowledged" : "closed";
  if (current.status === "closed") throw conflict("This alert is already closed.");
  if (decision === "acknowledge" && current.status === "acknowledged") throw conflict("This alert is already acknowledged.");
  if (decision === "close" && !note) throw badRequest("Say what was done before closing an SOS alert.");
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE sos_alerts SET status = ?, handled_by = ?, handled_at = ?, handled_note = COALESCE(?, handled_note) WHERE id = ? AND status = ?")
      .bind(to, adminId, now, note, id, current.status),
    auditStatement(db, { adminId, action: `sos.${decision}`, entity: "sos", entityId: id, detail: { customerId: current.customer.id, note } }),
  ]);
  return sosAlert(db, id);
}
