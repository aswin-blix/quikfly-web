// Staff alerts: the admin panel's bell. Events that need a staff member's eyes (an SOS press, a new
// ticket, a partner application, a payout request, a licence, an unclaimed parcel) write one row,
// addressed to the permission that acts on it; each admin sees the kinds its role covers and keeps
// its own read marks. Alerts describe what happened and link to the page: never a customer's name
// or number, a parcel's receiver or its code. The cron pushes new rows to staff browsers and phones.
import { STAFF_ALERT_PERMISSION, permissionsOf, type AdminUser, type Permission, type StaffAlert, type StaffAlertKind } from "@quikfly/shared";
import { STAFF_ALERTS_PAGE } from "../../config";
import { uid } from "../../lib/random";

export interface NewStaffAlert {
  kind: StaffAlertKind;
  /** What the event is about (an SOS id, a ticket id, "<vendor>:<time>"): one alert per kind and ref. */
  ref: string;
  title: string;
  body: string;
  /** The admin page to open, e.g. "/sos" or "/vendors/view?id=VN…". */
  link: string;
}

const INSERT = "INSERT OR IGNORE INTO staff_alerts (id, permission, kind, ref, title, body, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

/** A prepared alert row, so it joins the `db.batch()` of the event it reports (like auditStatement). */
export function staffAlertStatement(db: D1Database, a: NewStaffAlert) {
  return db.prepare(INSERT).bind(uid("SA"), STAFF_ALERT_PERMISSION[a.kind], a.kind, a.ref, a.title, a.body, a.link, new Date().toISOString());
}

export const staffAlert = (db: D1Database, a: NewStaffAlert) => staffAlertStatement(db, a).run();

interface AlertRow { id: string; kind: StaffAlertKind; permission: Permission; title: string; body: string; link: string; created_at: string; read_at: string | null }
const toAlert = (r: AlertRow): StaffAlert => ({ id: r.id, kind: r.kind, permission: r.permission, title: r.title, body: r.body, link: r.link, createdAt: r.created_at, readAt: r.read_at });

/** SQL: alerts this admin's role covers (?1 = admin id, ?2 = JSON list of its permissions), with its read mark. */
const VISIBLE = `FROM staff_alerts a LEFT JOIN staff_alert_reads r ON r.alert_id = a.id AND r.admin_id = ?1
  WHERE a.permission IN (SELECT value FROM json_each(?2))`;

/** The newest alerts this admin can act on, and how many of them it hasn't read. */
export async function listStaffAlerts(db: D1Database, admin: AdminUser): Promise<{ items: StaffAlert[]; unread: number }> {
  const perms = JSON.stringify(permissionsOf(admin.role));
  const [rows, count] = await db.batch([
    db.prepare(`SELECT a.*, r.read_at ${VISIBLE} ORDER BY a.created_at DESC LIMIT ?3`).bind(admin.id, perms, STAFF_ALERTS_PAGE),
    db.prepare(`SELECT COUNT(*) AS n ${VISIBLE} AND r.read_at IS NULL`).bind(admin.id, perms),
  ]);
  return { items: (rows.results as AlertRow[]).map(toAlert), unread: (count.results[0] as { n: number }).n };
}

/** Marks the given alerts (or every one this admin can see) read for this admin; returns what is still unread. */
export async function markStaffAlertsRead(db: D1Database, admin: AdminUser, ids: string[] | null): Promise<{ unread: number }> {
  const perms = JSON.stringify(permissionsOf(admin.role));
  const now = new Date().toISOString();
  if (ids === null) {
    await db.prepare(
      `INSERT OR IGNORE INTO staff_alert_reads (alert_id, admin_id, read_at)
       SELECT a.id, ?1, ?3 FROM staff_alerts a WHERE a.permission IN (SELECT value FROM json_each(?2))`,
    ).bind(admin.id, perms, now).run();
  } else if (ids.length) {
    await db.prepare(
      `INSERT OR IGNORE INTO staff_alert_reads (alert_id, admin_id, read_at)
       SELECT a.id, ?1, ?3 FROM staff_alerts a WHERE a.permission IN (SELECT value FROM json_each(?2)) AND a.id IN (SELECT value FROM json_each(?4))`,
    ).bind(admin.id, perms, now, JSON.stringify(ids)).run();
  }
  const row = await db.prepare(`SELECT COUNT(*) AS n ${VISIBLE} AND r.read_at IS NULL`).bind(admin.id, perms).first<{ n: number }>();
  return { unread: row?.n ?? 0 };
}

/** Remembers a staff browser or phone for push (moving the token if another admin had it on this device). */
export async function registerAdminDevice(db: D1Database, adminId: string, token: string, platform: string) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO admin_push_devices (token, admin_id, platform, created_at, last_seen) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET admin_id = excluded.admin_id, platform = excluded.platform, last_seen = excluded.last_seen`,
  ).bind(token, adminId, platform, now, now).run();
  return { registered: true };
}

/** Forgets a staff device (sign-out, or push turned off). */
export async function removeAdminDevice(db: D1Database, adminId: string, token: string) {
  await db.prepare("DELETE FROM admin_push_devices WHERE token = ? AND admin_id = ?").bind(token, adminId).run();
  return { removed: true };
}
