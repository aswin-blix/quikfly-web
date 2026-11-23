import { FEATURE_OFF, type ProfileUpdate, type User } from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { checkOtp, getUserRow, normalisePhone, toUser, type UserRow } from "./auth";
import { uid } from "../lib/random";
import { getSettings } from "./settings";

async function reload(db: D1Database, userId: string): Promise<User> {
  const row = await getUserRow(db, userId);
  if (!row) throw notFound("Account not found.");
  return toUser(row);
}

/**
 * Applies a validated profile change. Saving a name also completes sign-up,
 * so the "complete your profile" step is not shown again.
 */
export async function updateProfile(db: D1Database, userId: string, p: ProfileUpdate): Promise<User> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (col: string, v: unknown) => { sets.push(`${col} = ?`); values.push(v); };
  if (p.name !== undefined) { set("name", p.name); sets.push("profile_completed_at = COALESCE(profile_completed_at, ?)"); values.push(new Date().toISOString()); }
  if (p.email !== undefined) set("email", p.email);
  if (p.gender !== undefined) set("gender", p.gender);
  if (p.dob !== undefined) set("dob", p.dob);
  if (p.gst !== undefined) { set("gstin", p.gst?.gstin ?? null); set("gst_name", p.gst?.name ?? null); }
  // Safety Preferences. Older apps send the night-only flag; it maps to "night" / "off".
  const mode = p.autoShareRides ?? (p.autoShareNightRides === undefined ? undefined : p.autoShareNightRides ? "night" : "off");
  if (mode !== undefined) { set("auto_share_mode", mode); set("auto_share_night", mode === "off" ? 0 : 1); }
  if (p.ridePin !== undefined) set("ride_pin", p.ridePin);
  if (sets.length) await db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...values, userId).run();
  return reload(db, userId);
}

async function assertPhoneFree(db: D1Database, phone: string, userId: string) {
  const owner = await db.prepare("SELECT id FROM users WHERE phone = ?").bind(phone).first<{ id: string }>();
  if (owner && owner.id !== userId) throw conflict("This number is already linked to another QuikFly account.");
  if (owner) throw badRequest("That's already your number.");
}

/** Step 1 of changing number: checks it's free. (No SMS yet; the demo OTP applies.) */
export async function requestPhoneChange(db: D1Database, userId: string, phoneInput: string) {
  await assertPhoneFree(db, normalisePhone(phoneInput), userId);
}

export async function changePhone(db: D1Database, demoOtp: string, userId: string, phoneInput: string, otp: string) {
  const phone = normalisePhone(phoneInput);
  checkOtp(demoOtp, otp);
  await assertPhoneFree(db, phone, userId);
  await db.prepare("UPDATE users SET phone = ? WHERE id = ?").bind(phone, userId).run();
  return reload(db, userId);
}

export async function signOutEverywhere(db: D1Database, userId: string) {
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}

/**
 * Schedules deletion: the account is hidden and every session ends at once.
 * Signing in again within the grace period restores it; after that it is erased.
 */
export async function deleteAccount(db: D1Database, demoOtp: string, userId: string, otp: string) {
  checkOtp(demoOtp, otp);
  await db.batch([
    db.prepare("UPDATE users SET deleted_at = ? WHERE id = ?").bind(new Date().toISOString(), userId),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
  ]);
}

/** Applies a friend's code once: both accounts get the referral bonus (Settings) in their wallet. */
export async function applyReferral(db: D1Database, userId: string, code: string): Promise<User> {
  const settings = await getSettings(db);
  if (!settings.featureReferral) throw conflict(FEATURE_OFF.referral);
  const me = await getUserRow(db, userId);
  if (!me) throw notFound("Account not found.");
  if (me.referred_by) throw conflict("You've already used a referral code.");
  if (me.referral_code === code) throw badRequest("You can't use your own referral code.");
  const friend = await db.prepare("SELECT * FROM users WHERE referral_code = ? AND deleted_at IS NULL").bind(code).first<UserRow>();
  if (!friend) throw badRequest("That referral code doesn't exist.");
  const REFERRAL_BONUS = settings.referralBonus;

  // The joiner's ledger row is written only while the account has no referrer, and every other
  // statement only if that row exists, so the batch applies whole or not at all.
  const claim = uid("WT");
  const now = new Date().toISOString();
  const claimed = "EXISTS (SELECT 1 FROM wallet_transactions WHERE id = ?)";
  const [first] = await db.batch([
    db.prepare(
      `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
       SELECT ?1, ?2, 'referral', ?3, ?4, NULL, ?5 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?2 AND referred_by IS NULL)`,
    ).bind(claim, userId, REFERRAL_BONUS, `Referral bonus · code ${code}`, now),
    db.prepare(`UPDATE users SET referred_by = ?, wallet_balance = wallet_balance + ? WHERE id = ? AND referred_by IS NULL AND ${claimed}`)
      .bind(friend.id, REFERRAL_BONUS, userId, claim),
    db.prepare(`UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ? AND ${claimed}`).bind(REFERRAL_BONUS, friend.id, claim),
    db.prepare(
      `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
       SELECT ?, ?, 'referral', ?, ?, NULL, ? WHERE ${claimed}`,
    ).bind(uid("WT"), friend.id, REFERRAL_BONUS, `${me.name} joined with your code`, now, claim),
  ]);
  if (!first.meta.changes) throw conflict("You've already used a referral code.");
  return reload(db, userId);
}

/**
 * Saves the licence for review. An admin approves or rejects it (routes/admin/licences.ts);
 * with the `licenceAutoApprove` setting on it is verified at once, for unattended demos.
 */
export async function submitLicence(db: D1Database, userId: string, number: string, expiry: string, autoApprove: boolean): Promise<User> {
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE users SET licence_number = ?, licence_expiry = ?, licence_submitted_at = ?, licence_status = ?, licence_note = NULL,
       licence_reviewed_at = ? WHERE id = ?`,
  ).bind(number, expiry, now, autoApprove ? "verified" : "pending", autoApprove ? now : null, userId).run();
  return reload(db, userId);
}
