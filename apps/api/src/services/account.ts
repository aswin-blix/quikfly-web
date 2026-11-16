import type { ProfileUpdate, User } from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { checkOtp, getUserRow, normalisePhone, toUser, type UserRow } from "./auth";
import { getSettings } from "./settings";
import { txnStatement } from "./wallet";

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
  if (p.autoShareNightRides !== undefined) set("auto_share_night", p.autoShareNightRides ? 1 : 0);
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
  const me = await getUserRow(db, userId);
  if (!me) throw notFound("Account not found.");
  if (me.referred_by) throw conflict("You've already used a referral code.");
  if (me.referral_code === code) throw badRequest("You can't use your own referral code.");
  const friend = await db.prepare("SELECT * FROM users WHERE referral_code = ? AND deleted_at IS NULL").bind(code).first<UserRow>();
  if (!friend) throw badRequest("That referral code doesn't exist.");
  const REFERRAL_BONUS = (await getSettings(db)).referralBonus;

  await db.batch([
    db.prepare("UPDATE users SET referred_by = ?, wallet_balance = wallet_balance + ? WHERE id = ? AND referred_by IS NULL")
      .bind(friend.id, REFERRAL_BONUS, userId),
    txnStatement(db, { userId, kind: "referral", amount: REFERRAL_BONUS, note: `Referral bonus · code ${code}` }),
    db.prepare("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?").bind(REFERRAL_BONUS, friend.id),
    txnStatement(db, { userId: friend.id, kind: "referral", amount: REFERRAL_BONUS, note: `${me.name} joined with your code` }),
  ]);
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
