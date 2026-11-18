// Every-minute cron (wrangler.jsonc → triggers.crons): writes scheduled-ride reminders and
// pushes new notifications to phones when Firebase is configured. Stays well under the free
// plan's 50 queries per invocation: a fixed handful of statements, no per-row queries.
import { RIDE_SCHEDULE } from "@quikfly/shared";
import { PUSH_BATCH, PUSH_MAX_AGE_MINUTES } from "./config";
import type { Env } from "./env";
import { sendPush, serviceAccount } from "./services/push";

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
  await pushNew(env);
}
