// QuikFly Pass (packages/shared/src/pass.ts): bought from the wallet, waives the ride surge.
import { PASS_NAME, passEnd, passSaleError } from "@quikfly/shared";
import { conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { getSettings } from "./settings";

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/** Adds `pass_until` (when the running pass ends, or null) to a `users u` query. */
export const PASS_UNTIL_COLUMN = `(SELECT MAX(p.expires_at) FROM ride_passes p WHERE p.user_id = u.id AND p.expires_at > ${NOW}) AS pass_until`;

/** Does the user's pass cover this moment (ISO)? Used to price rides, including ones booked ahead. */
export async function passCoversAt(db: D1Database, userId: string, at: string) {
  const row = await db.prepare("SELECT 1 AS ok FROM ride_passes WHERE user_id = ? AND starts_at <= ? AND expires_at > ? LIMIT 1")
    .bind(userId, at, at).first<{ ok: number }>();
  return !!row;
}

const walletAndPass = (db: D1Database, userId: string) =>
  db.prepare(`SELECT u.wallet_balance, ${PASS_UNTIL_COLUMN} FROM users u WHERE u.id = ?`).bind(userId)
    .first<{ wallet_balance: number; pass_until: string | null }>();

/**
 * Buys a pass from the wallet: `passDays` from now, or from the end of the pass already
 * running. The pass, the debit and its ledger row land together or not at all.
 */
export async function buyPass(db: D1Database, userId: string): Promise<{ passUntil: string }> {
  const settings = await getSettings(db);
  const off = passSaleError(settings);
  if (off) throw conflict(off);
  const row = await walletAndPass(db, userId);
  if (!row) throw notFound("Account not found.");
  const price = settings.passPrice;
  if (row.wallet_balance < price) {
    throw conflict(`${PASS_NAME} costs ₹${price.toLocaleString("en-IN")} and your wallet has ₹${row.wallet_balance.toLocaleString("en-IN")}.`);
  }
  const now = new Date().toISOString();
  const running = row.pass_until;
  const startsAt = running && running > now ? running : now;
  const expiresAt = passEnd(settings, running);
  const id = uid("PS");
  const inserted = "EXISTS (SELECT 1 FROM ride_passes WHERE id = ?)";
  await db.batch([
    // Only if the wallet still covers it and no other pass was bought meanwhile.
    db.prepare(
      `INSERT INTO ride_passes (id, user_id, price, days, starts_at, expires_at, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
       WHERE (SELECT wallet_balance FROM users WHERE id = ?2) >= ?3
         AND COALESCE((SELECT MAX(expires_at) FROM ride_passes WHERE user_id = ?2 AND expires_at > ?7), '') = ?8`,
    ).bind(id, userId, price, settings.passDays, startsAt, expiresAt, now, running ?? ""),
    db.prepare(`UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ? AND ${inserted}`).bind(price, userId, id),
    db.prepare(
      `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
       SELECT ?, ?, 'payment', ?, ?, NULL, ? WHERE ${inserted}`,
    ).bind(uid("WT"), userId, -price, `${PASS_NAME} · ${settings.passDays} days`, now, id),
  ]);
  const after = await walletAndPass(db, userId);
  if (after?.pass_until !== expiresAt) throw conflict("Your wallet or pass changed meanwhile. Please try again.");
  return { passUntil: expiresAt };
}
