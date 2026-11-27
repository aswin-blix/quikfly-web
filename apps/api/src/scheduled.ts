// Every-minute cron (wrangler.jsonc → triggers.crons): writes scheduled-ride reminders,
// records expired QuikFly Credits, closes long-unused accounts and erases deleted ones past
// their grace period (services/privacy.ts), moves demo parcels (services/parcels/carriers.ts), and pushes new
// customer notifications and staff alerts to phones (Firebase) and browsers (Web Push) when those are
// configured. Stays well under the free plan's 50 queries per invocation: a fixed handful of
// statements, no per-row queries.
import { CAPTAIN_NOTIFICATION_PREFIX, PARTNER_NOTIFICATION_PREFIX, RIDE_SCHEDULE, can, type AdminRole, type Permission } from "@quikfly/shared";
import { PUSH_BATCH, PUSH_MAX_AGE_MINUTES } from "./config";
import type { Env } from "./env";
import { sendPush, serviceAccount, type PushResult } from "./services/push";
import { isWebToken, sendWebPush, vapidKeys, type WebPushMessage } from "./services/webpush";
import { getSettings } from "./services/settings";
import { privacySweep } from "./services/privacy";
import { runSimulatedCarrier } from "./services/parcels/carriers";
import { advanceSearching } from "./services/dispatch";

/** Live-ride searches the cron moves forward each minute, for riders who stopped polling (a few queries each). */
const CRON_SEARCH_ADVANCES = 2;

/**
 * Live captains (docs/driver-app-plan.md), as a backstop to the heartbeats: captains silent for
 * driverStaleSeconds and not on a ride go offline, and the oldest searches nobody is polling move on.
 */
async function captainBackstop(db: D1Database) {
  const stale = new Date(Date.now() - (await getSettings(db)).driverStaleSeconds * 1000).toISOString();
  await db.prepare("UPDATE driver_state SET online = 0, idle_since = NULL WHERE online = 1 AND ride_id IS NULL AND (seen_at IS NULL OR seen_at < ?)").bind(stale).run();
  await advanceSearching(db, CRON_SEARCH_ADVANCES);
}

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

/** The configured push channels: phones through Firebase, browsers through Web Push. Either may be off. */
function pushChannels(env: Env) {
  const sa = serviceAccount(env.FCM_SERVICE_ACCOUNT);
  const vapid = vapidKeys(env);
  return sa || vapid ? { sa, vapid } : null;
}
type Channels = NonNullable<ReturnType<typeof pushChannels>>;

/** Sends one message to one device over the channel its token belongs to; "failed" when that channel is off. */
async function deliver(ch: Channels, token: string, msg: WebPushMessage, data: Record<string, string>): Promise<PushResult> {
  try {
    if (isWebToken(token)) return ch.vapid ? await sendWebPush(ch.vapid, token, msg) : "failed";
    return ch.sa ? await sendPush(ch.sa, token, { title: msg.title, body: msg.body, data }) : "failed";
  } catch {
    return "failed";
  }
}

/**
 * Pushes recent, not-yet-pushed notifications to each customer's phones and browsers; forgets dead
 * tokens. A row counts as pushed once any device took it; a failed send is retried next minute until
 * the row is older than PUSH_MAX_AGE_MINUTES. A phone gets only its app's kinds (pushAppsForKind in the
 * shared package: partner updates to QuikFly Partner, captain ones to QuikFly Captain, the rest to
 * QuikFly); a browser (app NULL) gets every kind except a captain's.
 */
async function pushNew(env: Env, ch: Channels) {
  const db = env.DB;
  const since = new Date(Date.now() - PUSH_MAX_AGE_MINUTES * 60_000).toISOString();
  const { results: rows } = await db.prepare(
    `SELECT n.id, n.user_id, n.kind, n.title, n.body, n.booking_id, d.token
     FROM notifications n JOIN push_devices d ON d.user_id = n.user_id
       -- A browser (app NULL) gets every kind but a captain's: those only make sense in QuikFly Captain.
       AND ((d.app IS NULL AND substr(n.kind, 1, length(?4)) <> ?4) OR d.app = CASE
             WHEN substr(n.kind, 1, length(?1)) = ?1 THEN 'partner'
             WHEN substr(n.kind, 1, length(?4)) = ?4 THEN 'captain'
             ELSE 'customer' END
         -- Partner updates also reach QuikFly Captain: an owner-driver who registered there (pushAppsForKind).
         OR (d.app = 'captain' AND substr(n.kind, 1, length(?1)) = ?1))
     WHERE n.pushed_at IS NULL AND n.created_at >= ?2 ORDER BY n.created_at LIMIT ?3`,
  ).bind(PARTNER_NOTIFICATION_PREFIX, since, PUSH_BATCH, CAPTAIN_NOTIFICATION_PREFIX).all<{ id: string; user_id: string; kind: string; title: string; body: string; booking_id: string | null; token: string }>();
  if (!rows.length) {
    // Nothing deliverable: mark what's left (customers with no device) so it isn't scanned again.
    await db.prepare("UPDATE notifications SET pushed_at = ? WHERE pushed_at IS NULL AND created_at >= ?").bind(new Date().toISOString(), since).run();
    return;
  }
  const gone: string[] = [];
  const done = new Set<string>();
  await Promise.all(rows.map(async (r) => {
    const result = await deliver(ch, r.token, { id: r.id, kind: r.kind, title: r.title, body: r.body, url: "/notifications" }, { id: r.id, kind: r.kind, bookingId: r.booking_id ?? "" });
    if (result === "gone") gone.push(r.token);
    if (result !== "failed") done.add(r.id);
  }));
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE notifications SET pushed_at = ? WHERE id IN (SELECT value FROM json_each(?))").bind(now, JSON.stringify([...done])),
    db.prepare("DELETE FROM push_devices WHERE token IN (SELECT value FROM json_each(?))").bind(JSON.stringify(gone)),
  ]);
}

/**
 * Pushes recent staff alerts to the browsers and phones of the staff whose role covers them (an alert
 * is addressed to a permission, services/admin/alerts.ts). Same ageing and retry as pushNew.
 */
async function pushStaff(env: Env, ch: Channels) {
  const db = env.DB;
  const since = new Date(Date.now() - PUSH_MAX_AGE_MINUTES * 60_000).toISOString();
  const { results: rows } = await db.prepare(
    `SELECT a.id, a.kind, a.permission, a.title, a.body, a.link, d.token, u.role
     FROM staff_alerts a JOIN admin_push_devices d JOIN admin_users u ON u.id = d.admin_id AND u.disabled_at IS NULL
     WHERE a.pushed_at IS NULL AND a.created_at >= ? ORDER BY a.created_at LIMIT ?`,
  ).bind(since, PUSH_BATCH).all<{ id: string; kind: string; permission: Permission; title: string; body: string; link: string; token: string; role: AdminRole }>();
  const mine = rows.filter((r) => can(r.role, r.permission));
  if (!mine.length) {
    await db.prepare("UPDATE staff_alerts SET pushed_at = ? WHERE pushed_at IS NULL AND created_at >= ?").bind(new Date().toISOString(), since).run();
    return;
  }
  const gone: string[] = [];
  const done = new Set<string>();
  await Promise.all(mine.map(async (r) => {
    const result = await deliver(ch, r.token, { id: r.id, kind: r.kind, title: r.title, body: r.body, url: r.link }, { id: r.id, kind: r.kind, link: r.link });
    if (result === "gone") gone.push(r.token);
    if (result !== "failed") done.add(r.id);
  }));
  // Alerts no listed device's role covers are done too, or they would be re-read every minute.
  for (const r of rows) if (!mine.some((m) => m.id === r.id)) done.add(r.id);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE staff_alerts SET pushed_at = ? WHERE id IN (SELECT value FROM json_each(?))").bind(now, JSON.stringify([...done])),
    db.prepare("DELETE FROM admin_push_devices WHERE token IN (SELECT value FROM json_each(?))").bind(JSON.stringify(gone)),
  ]);
}

/**
 * Pushes waiting notifications now instead of at the next minute (a ride offer has seconds to answer).
 * Routes call it through executionCtx.waitUntil, so the response doesn't wait for it.
 */
export async function pushSoon(env: Env) {
  const channels = pushChannels(env);
  if (channels) await pushNew(env, channels);
}

export async function runScheduled(env: Env) {
  await rideReminders(env.DB);
  await expireCredits(env.DB);
  await documentExpiry(env.DB);
  await privacySweep(env.DB, env.DOCS);
  // A failure in the demo's simulation mustn't hold up everyone's notifications.
  await runSimulatedCarrier(env.DB).catch((e) => console.error("parcel simulation", e));
  await captainBackstop(env.DB).catch((e) => console.error("captain backstop", e));
  const channels = pushChannels(env);
  if (!channels) return; // no push configured: the inboxes still work
  await pushNew(env, channels);
  await pushStaff(env, channels);
}
