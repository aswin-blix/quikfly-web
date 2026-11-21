// Privacy (DPDP Act 2023 + Rules 2025): the notice, consent records, the data export, and the
// cron sweep that closes long-unused accounts and erases accounts past their deletion grace.
// The notice text is packages/shared/src/privacy.ts; contact details are runtime Settings.
import {
  DELETION_GRACE_DAYS, PRIVACY_NOTICE, periodText, privacyNotice, type DataExport, type PrivacyNotice, type User,
} from "@quikfly/shared";
import { ERASE_BATCH } from "../config";
import { badRequest } from "../lib/errors";
import { getUserRow, toUser } from "./auth";
import { getSettings } from "./settings";

export const getNotice = async (db: D1Database): Promise<PrivacyNotice> => privacyNotice(await getSettings(db));

/** Records agreement to the current notice (and keeps every earlier one as proof). */
export async function giveConsent(db: D1Database, userId: string, version: string): Promise<User> {
  if (version !== PRIVACY_NOTICE.version) throw badRequest("The privacy notice has changed. Please read the new one and agree again.");
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE users SET privacy_version = ?, privacy_consent_at = ? WHERE id = ?").bind(version, now, userId),
    db.prepare("INSERT OR IGNORE INTO privacy_consents (user_id, version, given_at) VALUES (?, ?, ?)").bind(userId, version, now),
  ]);
  return toUser((await getUserRow(db, userId))!);
}

/** Internal columns left out of an export: login secrets and storage keys of document photos. */
const HIDDEN = new Set(["token_hash", "token"]);
const clean = (rows: Record<string, unknown>[]) => rows.map((r) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (HIDDEN.has(k)) continue;
    if (k.endsWith("_key")) out[k.replace(/_key$/, "_photo")] = v ? "on file (ask support for a copy)" : null;
    else out[k] = v;
  }
  return out;
});

/** Everything QuikFly holds about one person: a fixed set of reads in one batch (well under 50). */
export async function exportData(db: D1Database, userId: string): Promise<DataExport> {
  const byUser = (table: string) => [table, `SELECT * FROM ${table} WHERE user_id = ?1`] as const;
  const byVendor = (table: string) => [table, `SELECT * FROM ${table} WHERE vendor_id IN (SELECT id FROM vendors WHERE user_id = ?1)`] as const;
  const queries: (readonly [string, string])[] = [
    ["account", "SELECT * FROM users WHERE id = ?1"],
    ["sessions", "SELECT expires_at FROM sessions WHERE user_id = ?1"],
    byUser("privacy_consents"),
    byUser("saved_places"),
    byUser("travellers"),
    byUser("emergency_contacts"),
    byUser("bookings"),
    byUser("rides"),
    ["rentals", "SELECT * FROM rentals WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?1)"],
    ["rental_extensions", "SELECT * FROM rental_extensions WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?1)"],
    byUser("wallet_transactions"),
    byUser("credits"),
    byUser("ride_passes"),
    byUser("notifications"),
    ["push_devices", "SELECT platform, created_at, last_seen FROM push_devices WHERE user_id = ?1"],
    byUser("support_tickets"),
    ["support_messages", "SELECT * FROM support_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE user_id = ?1)"],
    byUser("sos_alerts"),
    ["booking_notes", "SELECT booking_id, body, created_at FROM booking_notes WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?1)"],
    byUser("vendors"),
    byVendor("vendor_vehicles"),
    byVendor("vendor_drivers"),
    byVendor("vendor_trips"),
    byVendor("vendor_ledger"),
    byVendor("vendor_payouts"),
  ];
  const results = await db.batch(queries.map(([, sql]) => db.prepare(sql).bind(userId)));
  const data: Record<string, unknown[]> = {};
  queries.forEach(([name], i) => { data[name] = clean(results[i].results as Record<string, unknown>[]); });
  return { exportedAt: new Date().toISOString(), noticeVersion: PRIVACY_NOTICE.version, data };
}

/**
 * Erases accounts: document photos are deleted from R2, personal lists and messages are
 * deleted, and the account row is anonymised (name, number, email, licence, GST...). Bookings,
 * wallet history and partner earnings stay, without the person's details, because tax and
 * accounting law needs them; the number becomes free to sign up again.
 */
export async function eraseAccounts(db: D1Database, bucket: R2Bucket | undefined, ids: string[]) {
  if (!ids.length) return;
  const list = JSON.stringify(ids);
  const IN_USERS = "(SELECT value FROM json_each(?1))";
  const IN_VENDORS = `(SELECT id FROM vendors WHERE user_id IN ${IN_USERS})`;
  const { results: keys } = await db.prepare(
    `SELECT photo_key AS k FROM vendors WHERE user_id IN ${IN_USERS} AND photo_key IS NOT NULL
     UNION ALL SELECT rc_key FROM vendor_vehicles WHERE vendor_id IN ${IN_VENDORS} AND rc_key IS NOT NULL
     UNION ALL SELECT insurance_key FROM vendor_vehicles WHERE vendor_id IN ${IN_VENDORS} AND insurance_key IS NOT NULL
     UNION ALL SELECT dl_key FROM vendor_drivers WHERE vendor_id IN ${IN_VENDORS} AND dl_key IS NOT NULL`,
  ).bind(list).all<{ k: string }>();
  // Photos first: if the database step then fails, the account is picked up again next run.
  if (bucket && keys.length) await bucket.delete(keys.map((r) => r.k));
  const now = new Date().toISOString();
  const forUsers = (sql: string) => db.prepare(sql).bind(list);
  await db.batch([
    ...["sessions", "saved_places", "travellers", "emergency_contacts", "push_devices", "notifications", "ride_shares", "support_tickets", "sos_alerts"]
      .map((t) => forUsers(`DELETE FROM ${t} WHERE user_id IN ${IN_USERS}`)),
    forUsers(`DELETE FROM booking_notes WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN ${IN_USERS})`),
    forUsers(`UPDATE vendor_vehicles SET rc_key = NULL, insurance_key = NULL WHERE vendor_id IN ${IN_VENDORS}`),
    forUsers(`UPDATE vendor_drivers SET dl_key = NULL WHERE vendor_id IN ${IN_VENDORS}`),
    db.prepare(`UPDATE vendors SET bank_holder = NULL, bank_ifsc = NULL, bank_account = NULL, photo_key = NULL, updated_at = ?2 WHERE user_id IN ${IN_USERS}`)
      .bind(list, now),
    db.prepare(
      `UPDATE users SET name = 'Erased account', phone = 'erased:' || id, email = NULL, gender = NULL, dob = NULL,
         licence_number = NULL, licence_expiry = NULL, licence_note = NULL, gstin = NULL, gst_name = NULL, ride_pin = NULL,
         suspend_reason = NULL, erased_at = ?2
       WHERE id IN ${IN_USERS}`,
    ).bind(list, now),
  ]);
}

/**
 * Every cron run (cheap: both reads use partial indexes and usually find nothing):
 * 1. Accounts unused for Settings.inactivityEraseDays are told and closed, starting the normal
 *    deletion grace (signing in restores them). Skipped: money in the wallet, a confirmed
 *    booking, or a partner application past draft; staff handle those.
 * 2. Accounts closed more than DELETION_GRACE_DAYS ago are erased, ERASE_BATCH at a time.
 */
export async function privacySweep(db: D1Database, bucket: R2Bucket | undefined) {
  const { inactivityEraseDays: days } = await getSettings(db);
  const now = new Date();
  if (days > 0) {
    const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
    const eligible = `deleted_at IS NULL AND last_active_at < ?1
      AND wallet_balance <= 0
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.user_id = users.id AND b.status = 'confirmed')
      AND NOT EXISTS (SELECT 1 FROM vendors v WHERE v.user_id = users.id AND v.status <> 'draft')`;
    const eraseOn = new Date(now.getTime() + DELETION_GRACE_DAYS * 86_400_000).toISOString().slice(0, 10);
    const stamp = now.toISOString();
    await db.batch([
      db.prepare(
        `INSERT OR IGNORE INTO notifications (id, user_id, kind, ref, title, body, booking_id, created_at)
         SELECT 'NT' || upper(hex(randomblob(8))), id, 'privacy.inactive', ?2, 'Your QuikFly account is closing',
                'You haven''t used QuikFly for ${periodText(days)}, so we have closed your account. It will be erased on ' || ?3 || '. Sign in before then to keep it.',
                NULL, ?2
         FROM users WHERE ${eligible}`,
      ).bind(cutoff, stamp, eraseOn),
      db.prepare(`UPDATE users SET deleted_at = ?2 WHERE ${eligible}`).bind(cutoff, stamp),
    ]);
  }
  const graceCutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * 86_400_000).toISOString();
  const { results } = await db.prepare(
    "SELECT id FROM users WHERE deleted_at IS NOT NULL AND erased_at IS NULL AND deleted_at < ? LIMIT ?",
  ).bind(graceCutoff, ERASE_BATCH).all<{ id: string }>();
  await eraseAccounts(db, bucket, results.map((r) => r.id));
}
