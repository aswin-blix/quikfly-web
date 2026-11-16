import {
  DEFAULT_USER_NAME, NEW_USER_WALLET_BALANCE, PHONE_COUNTRY_CODE, PHONE_DIGITS, SESSION_TTL_DAYS,
} from "../config";
import { badRequest } from "../lib/errors";
import { randomToken, sha256, uid } from "../lib/random";
import type { User } from "@quikfly/shared";

interface UserRow { id: string; name: string; phone: string; wallet_balance: number }
const toUser = (r: UserRow): User => ({ id: r.id, name: r.name, phone: r.phone, walletBalance: r.wallet_balance });

/** Accepts "9876543210", "+91 98765 43210" and similar; returns "+91 9876543210". */
export function normalisePhone(input: string) {
  const digits = input.replace(/\D/g, "").slice(-PHONE_DIGITS);
  if (digits.length !== PHONE_DIGITS) throw badRequest(`Enter a valid ${PHONE_DIGITS}-digit mobile number.`);
  return `${PHONE_COUNTRY_CODE} ${digits}`;
}

/** Checks the code, creates the user on first login, and opens a session. */
export async function verifyOtp(db: D1Database, demoOtp: string, phoneInput: string, otp: string, name?: string) {
  const phone = normalisePhone(phoneInput);
  if (!demoOtp || otp !== demoOtp) throw badRequest("Invalid OTP. Please try again.");

  let row = await db.prepare("SELECT * FROM users WHERE phone = ?").bind(phone).first<UserRow>();
  if (!row) {
    row = { id: uid("U"), phone, name: name || DEFAULT_USER_NAME, wallet_balance: NEW_USER_WALLET_BALANCE };
    await db.prepare("INSERT INTO users (id, phone, name, wallet_balance, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(row.id, row.phone, row.name, row.wallet_balance, new Date().toISOString()).run();
  } else if (name && name !== row.name) {
    row.name = name;
    await db.prepare("UPDATE users SET name = ? WHERE id = ?").bind(name, row.id).run();
  }

  const token = randomToken();
  const expiresAt = Date.now() + SESSION_TTL_DAYS * 86_400_000;
  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), row.id, expiresAt).run();
  return { token, user: toUser(row) };
}

/** Deletes the session for this token. Unknown or expired tokens are ignored. */
export async function endSession(db: D1Database, token: string) {
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function userForToken(db: D1Database, token: string): Promise<User | null> {
  const row = await db.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
  ).bind(await sha256(token), Date.now()).first<UserRow>();
  return row ? toUser(row) : null;
}
