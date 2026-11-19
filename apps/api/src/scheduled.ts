// Every-minute cron (wrangler.jsonc → triggers.crons): writes scheduled-ride reminders,
// records expired QuikFly Credits, closes long-unused accounts and erases deleted ones past
// their grace period (services/privacy.ts), and pushes new notifications to phones when Firebase is
// configured. Stays well under the free plan's 50 queries per invocation: a fixed handful of
// statements, no per-row queries.
import { RIDE_SCHEDULE } from "@quikfly/shared";
import { PUSH_BATCH, PUSH_MAX_AGE_MINUTES } from "./config";
import type { Env } from "./env";
import { sendPush, serviceAccount } from "./services/push";
import { getSettings } from "./services/settings";
import { privacySweep } from "./services/privacy";

/** One reminder per scheduled ride, when "Start ride" opens (startWindowMinutes before pickup). */
async function rideReminders(db: D1Database) {
  await db.prepare(
    `INSERT OR IGNORE INTO notifications (id, user_id, kind, ref, title, body, booking_id, created_at)
     SELECT 'NT' || upper(hex(randomblob(8))), user_id, 'ride.reminder', id, 'Your ride starts soon',
            'Your driver is being assigned. Open My Trips and tap Start ride.', id, ?1
     FROM bookings
     WHERE service IN ('bike', 'car') AND status = 'confirmed' AND ride_id IS NOT NULL AND starts_at IS NOT NULL
       AND julianday(starts_at) > julianday('now') AND julianday(starts_at) <= julianday('now', ?2)`,
  ).bind(new Date().toISOString(), `+${RIDE_SCHEDULE.startWindowMinutes} minutes`).run();
}

/** Writes an 'expired' row for credits left unused past their expiry (balances already ignore them). */
async function expireCredits(db: D1Database) {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `INSERT INTO credits (id, user_id, kind, amount, remaining, expires_at, booking_id, note, created_at)
       SELECT 'CR' || upper(hex(randomblob(8))), user_id, 'expired', -remaining, 0, NULL, booking_id, 'Expired unused', expires_at
       FROM credits WHERE remaining > 0 AND expires_at <= ?1`,
    ).bind(now),
    db.prepare("UPDATE credits SET remaining = 0 WHERE remaining > 0 AND expires_at <= ?1").bind(now),
  ]);
}

/**
 * Partner documents: one warning per document and validity date when it's within
 * vendorExpiryWarnDays, then on the expiry date the vehicle or driver is blocked (reason
 * "Expired: …") until a renewal is checked by staff. A fixed handful of statements.
 */
async function documentExpiry(db: D1Database) {
  const warnDays = (await getSettings(db)).vendorExpiryWarnDays;
  const day = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10); // India date
  const warnUntil = new Date(Date.parse(`${day}T00:00:00Z`) + warnDays * 86_400_000).toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const nid = "'NT' || upper(hex(randomblob(8)))";
  const vehicleNote = (col: string, label: string, expired: boolean) => db.prepare(
    `INSERT OR IGNORE INTO notifications (id, user_id, kind, ref, title, body, booking_id, created_at)
     SELECT ${nid}, ve.user_id, 'vendor.document', vv.id || ':${col}:' || vv.${col}${expired ? " || ':expired'" : ""},
            '${label} ${expired ? "expired" : "expiring"}: ' || vv.reg_number,
            ${expired
              ? `'The ${label.toLowerCase()} for ' || vv.reg_number || ' expired on ' || vv.${col} || '. The vehicle is blocked until you upload the renewal and QuikFly checks it.'`
              : `'The ${label.toLowerCase()} for ' || vv.reg_number || ' expires on ' || vv.${col} || '. Renew it and upload the new one in the Partner app.'`},
            NULL, ?3
     FROM vendor_vehicles vv JOIN vendors ve ON ve.id = vv.vendor_id
     WHERE vv.status IN ('active', 'inactive') AND ${expired ? `vv.${col} < ?1` : `vv.${col} >= ?1 AND vv.${col} <= ?2`}`,
  ).bind(day, warnUntil, now);
  const driverNote = (expired: boolean) => db.prepare(
    `INSERT OR IGNORE INTO notifications (id, user_id, kind, ref, title, body, booking_id, created_at)
     SELECT ${nid}, ve.user_id, 'vendor.document', d.id || ':dl:' || d.dl_valid_till${expired ? " || ':expired'" : ""},
            'Driving licence ${expired ? "expired" : "expiring"}: ' || d.name,
            ${expired
              ? `'The driving licence of ' || d.name || ' expired on ' || d.dl_valid_till || '. They cannot drive QuikFly trips until you upload the renewal and QuikFly checks it.'`
              : `'The driving licence of ' || d.name || ' expires on ' || d.dl_valid_till || '. Upload the renewed licence in the Partner app.'`},
            NULL, ?3
     FROM vendor_drivers d JOIN vendors ve ON ve.id = d.vendor_id
     WHERE d.status = 'active' AND ${expired ? "d.dl_valid_till < ?1" : "d.dl_valid_till >= ?1 AND d.dl_valid_till <= ?2"}`,
  ).bind(day, warnUntil, now);
  await db.batch([
    vehicleNote("insurance_valid_till", "Insurance", false),
    vehicleNote("rc_valid_till", "RC", false),
    driverNote(false),
    // Expired: tell the partner first, then block (the notices read the status before it changes).
    vehicleNote("insurance_valid_till", "Insurance", true),
    vehicleNote("rc_valid_till", "RC", true),
    driverNote(true),
    db.prepare(
      `UPDATE vendor_vehicles SET status = 'blocked',
         blocked_reason = 'Expired: ' || CASE WHEN insurance_valid_till < ?1 THEN 'insurance (' || insurance_valid_till || ')' ELSE 'RC (' || rc_valid_till || ')' END
       WHERE status IN ('active', 'inactive') AND (insurance_valid_till < ?1 OR rc_valid_till < ?1)`,
    ).bind(day),
    db.prepare("UPDATE vendor_drivers SET status = 'blocked', blocked_reason = 'Expired: driving licence (' || dl_valid_till || ')', vehicle_id = NULL, updated_at = ?2 WHERE status = 'active' AND dl_valid_till < ?1")
      .bind(day, now),
  ]);
}

/** Pushes recent, not-yet-pushed notifications to each customer's phones; forgets dead tokens. */
async function pushNew(env: Env) {
  const sa = serviceAccount(env.FCM_SERVICE_ACCOUNT);
  if (!sa) return; // push not configured: the inbox still works
  const db = env.DB;
  const since = new Date(Date.now() - PUSH_MAX_AGE_MINUTES * 60_000).toISOString();
  const { results: rows } = await db.prepare(
    `SELECT n.id, n.user_id, n.kind, n.title, n.body, n.booking_id, d.token
     FROM notifications n JOIN push_devices d ON d.user_id = n.user_id
     WHERE n.pushed_at IS NULL AND n.created_at >= ? ORDER BY n.created_at LIMIT ?`,
  ).bind(since, PUSH_BATCH).all<{ id: string; user_id: string; kind: string; title: string; body: string; booking_id: string | null; token: string }>();
  if (!rows.length) {
    // Nothing deliverable: mark what's left (customers with no phone) so it isn't scanned again.
    await db.prepare("UPDATE notifications SET pushed_at = ? WHERE pushed_at IS NULL AND created_at >= ?").bind(new Date().toISOString(), since).run();
    return;
  }
  const gone: string[] = [];
  const done = new Set<string>();
  await Promise.all(rows.map(async (r) => {
    const result = await sendPush(sa, r.token, { title: r.title, body: r.body, data: { kind: r.kind, bookingId: r.booking_id ?? "" } }).catch(() => "failed" as const);
    if (result === "gone") gone.push(r.token);
    if (result !== "failed") done.add(r.id);
  }));
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE notifications SET pushed_at = ? WHERE id IN (SELECT value FROM json_each(?))").bind(now, JSON.stringify([...done])),
    db.prepare("DELETE FROM push_devices WHERE token IN (SELECT value FROM json_each(?))").bind(JSON.stringify(gone)),
  ]);
}

export async function runScheduled(env: Env) {
  await rideReminders(env.DB);
  await expireCredits(env.DB);
  await documentExpiry(env.DB);
  await privacySweep(env.DB, env.DOCS);
  await pushNew(env);
}
