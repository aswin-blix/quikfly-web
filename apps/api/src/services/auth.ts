import { DELETION_GRACE_DAYS, type AutoShareMode, type AuthResult, type Gender, type LicenceStatus, type User } from "@quikfly/shared";
import { ACTIVITY_TOUCH_HOURS, DEFAULT_USER_NAME, PHONE_COUNTRY_CODE, PHONE_DIGITS, SESSION_TTL_DAYS } from "../config";
import { badRequest, forbidden } from "../lib/errors";
import { randomToken, sha256, uid } from "../lib/random";
import { getSettings } from "./settings";
import { eraseAccounts } from "./privacy";
import { CREDIT_BALANCE_COLUMN } from "./credits";
import { PASS_UNTIL_COLUMN } from "./pass";
import { txnStatement } from "./wallet";

/** What a suspended customer is told at sign-in (staff lift suspensions in admin → Customers). */
export const SUSPENDED_MESSAGE = "This account is suspended. Please contact QuikFly support.";

export interface UserRow {
  id: string; name: string; phone: string; wallet_balance: number; created_at: string;
  email: string | null; gender: Gender | null; dob: string | null; profile_completed_at: string | null;
  referral_code: string; referred_by: string | null;
  licence_number: string | null; licence_expiry: string | null; licence_submitted_at: string | null;
  licence_status: LicenceStatus; licence_note: string | null; licence_reviewed_at: string | null;
  gstin: string | null; gst_name: string | null; auto_share_night: number; deleted_at: string | null;
  /** Set by staff (admin → Customers → Suspend); sign-in and sessions are refused while set. */
  suspended_at?: string | null;
  auto_share_mode: AutoShareMode | null; ride_pin: string | null;
  privacy_version: string | null; last_active_at: string | null; erased_at: string | null;
  /** Computed by CREDIT_BALANCE_COLUMN; absent when a query didn't ask for it. */
  credit_balance?: number;
  /** Computed by PASS_UNTIL_COLUMN; absent when a query didn't ask for it. */
  pass_until?: string | null;
}

export const toUser = (r: UserRow): User => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  walletBalance: r.wallet_balance,
  creditBalance: r.credit_balance ?? 0,
  passUntil: r.pass_until ?? null,
  email: r.email,
  gender: r.gender,
  dob: r.dob,
  profileComplete: !!r.profile_completed_at,
  referralCode: r.referral_code,
  referred: !!r.referred_by,
  licence: { status: r.licence_status, number: r.licence_number, expiry: r.licence_expiry, note: r.licence_note },
  gst: r.gstin && r.gst_name ? { gstin: r.gstin, name: r.gst_name } : null,
  autoShareNightRides: (r.auto_share_mode ?? (r.auto_share_night ? "night" : "off")) !== "off",
  autoShareRides: r.auto_share_mode ?? (r.auto_share_night ? "night" : "off"),
  ridePin: r.ride_pin ?? null,
  privacyConsent: r.privacy_version ?? null,
});

/** Accepts "9876543210", "+91 98765 43210" and similar; returns "+91 9876543210". */
export function normalisePhone(input: string) {
  const digits = input.replace(/\D/g, "").slice(-PHONE_DIGITS);
  if (digits.length !== PHONE_DIGITS) throw badRequest(`Enter a valid ${PHONE_DIGITS}-digit mobile number.`);
  return `${PHONE_COUNTRY_CODE} ${digits}`;
}

export function checkOtp(demoOtp: string, otp: string) {
  if (!demoOtp || otp !== demoOtp) throw badRequest("Invalid OTP. Please try again.");
}

export const getUserRow = (db: D1Database, id: string) =>
  db.prepare(`SELECT u.*, ${CREDIT_BALANCE_COLUMN}, ${PASS_UNTIL_COLUMN} FROM users u WHERE u.id = ?`).bind(id).first<UserRow>();

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const referralCode = () => "QF" + [...crypto.getRandomValues(new Uint8Array(6))].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");

async function createUser(db: D1Database, phone: string) {
  const id = uid("U");
  const credit = (await getSettings(db)).welcomeCredit;
  for (let attempt = 0; ; attempt++) {
    try {
      await db.batch([
        db.prepare("INSERT INTO users (id, phone, name, wallet_balance, created_at, referral_code, last_active_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?5)")
          .bind(id, phone, DEFAULT_USER_NAME, credit, new Date().toISOString(), referralCode()),
        ...(credit ? [txnStatement(db, { userId: id, kind: "welcome", amount: credit, note: "Welcome credit" })] : []),
      ]);
      return (await getUserRow(db, id))!;
    } catch (e) {
      // Retry only a referral-code collision; anything else is a real error.
      if (attempt >= 2 || !String(e).includes("referral_code")) throw e;
    }
  }
}

/** Checks the code, creates or restores the account, and opens a session. */
export async function verifyOtp(db: D1Database, docs: R2Bucket | undefined, demoOtp: string, phoneInput: string, otp: string): Promise<AuthResult> {
  const phone = normalisePhone(phoneInput);
  checkOtp(demoOtp, otp);

  let row = await db.prepare(`SELECT u.*, ${CREDIT_BALANCE_COLUMN}, ${PASS_UNTIL_COLUMN} FROM users u WHERE u.phone = ?`).bind(phone).first<UserRow>();
  let restored = false;
  if (row?.deleted_at) {
    const graceEnds = Date.parse(row.deleted_at) + DELETION_GRACE_DAYS * 86_400_000;
    if (Date.now() < graceEnds) {
      await db.prepare("UPDATE users SET deleted_at = NULL WHERE id = ?").bind(row.id).run();
      row.deleted_at = null;
      restored = true;
    } else {
      // Grace period over (the cron sweep hasn't reached it yet): erase it now and start fresh.
      await eraseAccounts(db, docs, [row.id]);
      row = null;
    }
  }
  row ??= await createUser(db, phone);
  // Staff suspended the account (admin → Customers): no new session until they lift it.
  if (row.suspended_at) throw forbidden(SUSPENDED_MESSAGE);

  const token = randomToken();
  await db.batch([
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(await sha256(token), row.id, Date.now() + SESSION_TTL_DAYS * 86_400_000),
    db.prepare("UPDATE users SET last_active_at = ? WHERE id = ?").bind(new Date().toISOString(), row.id),
  ]);
  return { token, user: toUser(row), isNew: !row.profile_completed_at, restored };
}

/** Deletes the session for this token. Unknown or expired tokens are ignored. */
export async function endSession(db: D1Database, token: string) {
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function userForToken(db: D1Database, token: string): Promise<User | null> {
  const row = await db.prepare(
    `SELECT u.*, ${CREDIT_BALANCE_COLUMN}, ${PASS_UNTIL_COLUMN} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.deleted_at IS NULL AND u.suspended_at IS NULL`,
  ).bind(await sha256(token), Date.now()).first<UserRow>();
  if (!row) return null;
  // Remember the account is in use (for the inactivity sweep), at most once a day.
  if (!row.last_active_at || Date.now() - Date.parse(row.last_active_at) > ACTIVITY_TOUCH_HOURS * 3_600_000) {
    await db.prepare("UPDATE users SET last_active_at = ? WHERE id = ?").bind(new Date().toISOString(), row.id).run();
  }
  return toUser(row);
}
