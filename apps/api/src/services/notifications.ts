// The customer's notification inbox. Events write a row (once per event: user + kind + ref
// is unique); the every-minute cron (scheduled.ts) pushes new rows to the customer's phones
// when Firebase is configured. Notifications never carry money: they describe what happened.
import type { AppNotification, NotificationKind, PushApp, ServiceKey } from "@quikfly/shared";
import { NOTIFICATIONS_PAGE } from "../config";
import { uid } from "../lib/random";

interface NotificationRow {
  id: string; kind: NotificationKind; title: string; body: string; booking_id: string | null; created_at: string; read_at: string | null;
}
const toNotification = (r: NotificationRow): AppNotification => ({
  id: r.id, kind: r.kind, title: r.title, body: r.body, bookingId: r.booking_id, createdAt: r.created_at, readAt: r.read_at,
});

export interface NewNotification {
  kind: NotificationKind;
  /** What the event is about (a booking id, a licence number…): one notification per user, kind and ref. */
  ref: string;
  title: string;
  body: string;
  bookingId?: string | null;
}

/** Adds a notification; a repeat of the same event (user, kind, ref) is ignored. */
export async function notify(db: D1Database, userId: string, n: NewNotification): Promise<void> {
  await db.prepare(
    `INSERT OR IGNORE INTO notifications (id, user_id, kind, ref, title, body, booking_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(uid("NT"), userId, n.kind, n.ref, n.title, n.body, n.bookingId ?? null, new Date().toISOString()).run();
}

/**
 * SQL: this client can show the notification (?2 = JSON of the services it can't). Left out are a
 * hidden service's own kinds ("parcel.ready") and the booking.* ones about its bookings, which
 * would open a My Trips without that booking. Credits and support replies stay: they open their own pages.
 */
const SHOWN = `NOT EXISTS (
  SELECT 1 FROM json_each(?2) h WHERE notifications.kind LIKE h.value || '.%'
    OR (notifications.kind LIKE 'booking.%' AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = notifications.booking_id AND b.service = h.value)))`;

/** The newest notifications this client can show, and how many of those are unread. */
export async function listNotifications(db: D1Database, userId: string, hidden: ServiceKey[]) {
  const list = JSON.stringify(hidden);
  const [items, unread] = await db.batch([
    db.prepare(`SELECT * FROM notifications WHERE user_id = ?1 AND ${SHOWN} ORDER BY created_at DESC LIMIT ?3`).bind(userId, list, NOTIFICATIONS_PAGE),
    db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?1 AND ${SHOWN} AND read_at IS NULL`).bind(userId, list),
  ]);
  return { items: (items.results as NotificationRow[]).map(toNotification), unread: (unread.results[0] as { n: number }).n };
}

/** Marks the given notifications (or all this client can show) as read; returns what is still unread of those. */
export async function markRead(db: D1Database, userId: string, ids: string[] | null, hidden: ServiceKey[]) {
  const now = new Date().toISOString();
  const list = JSON.stringify(hidden);
  if (ids === null) {
    await db.prepare(`UPDATE notifications SET read_at = ?3 WHERE user_id = ?1 AND ${SHOWN} AND read_at IS NULL`).bind(userId, list, now).run();
  } else if (ids.length) {
    await db.prepare(
      `UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (SELECT value FROM json_each(?))`,
    ).bind(now, userId, JSON.stringify(ids)).run();
  }
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?1 AND ${SHOWN} AND read_at IS NULL`).bind(userId, list).first<{ n: number }>();
  return { unread: row?.n ?? 0 };
}

/** Remembers a phone's push token for this customer (moving it from another account if it was signed in there). */
export async function registerDevice(db: D1Database, userId: string, token: string, platform: string, app: PushApp | null = null) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO push_devices (token, user_id, platform, app, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, app = excluded.app, last_seen = excluded.last_seen`,
  ).bind(token, userId, platform, app, now, now).run();
  return { registered: true };
}

/** Forgets a phone (sign-out, or push turned off). */
export async function removeDevice(db: D1Database, userId: string, token: string) {
  await db.prepare("DELETE FROM push_devices WHERE token = ? AND user_id = ?").bind(token, userId).run();
  return { removed: true };
}
