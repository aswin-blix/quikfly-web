// Staff sign-in: email + password, lockout after repeated failures, bearer sessions
// (hash stored, like customer sessions). Accounts are created by scripts/create-admin.mjs.
import { ADMIN_RULES, type AdminLoginResult, type AdminRole, type AdminUser } from "@quikfly/shared";
import { tooMany, unauthorized } from "../../lib/errors";
import { hashPassword, verifyPassword } from "../../lib/password";
import { randomToken, sha256 } from "../../lib/random";

export interface AdminRow {
  id: string; email: string; name: string; role: AdminRole; password_hash: string;
  failed_logins: number; locked_until: number | null; last_login_at: string | null; created_at: string;
}

export const toAdmin = (r: AdminRow): AdminUser => ({
  id: r.id, email: r.email, name: r.name, role: r.role, lastLoginAt: r.last_login_at, createdAt: r.created_at,
});

const BAD_LOGIN = "Email or password is incorrect.";

export async function adminLogin(db: D1Database, emailInput: string, password: string): Promise<AdminLoginResult> {
  const email = emailInput.trim().toLowerCase();
  const row = await db.prepare("SELECT * FROM admin_users WHERE email = ?").bind(email).first<AdminRow>();
  if (!row) {
    // Same work and the same message as a wrong password, so an attacker can't tell which emails exist.
    await hashPassword(password);
    throw unauthorized(BAD_LOGIN);
  }
  if (row.locked_until && row.locked_until > Date.now()) {
    const minutes = Math.max(1, Math.ceil((row.locked_until - Date.now()) / 60_000));
    throw tooMany(`Too many failed attempts. Try again in ${minutes} min.`);
  }

  if (!(await verifyPassword(password, row.password_hash))) {
    const failed = row.failed_logins + 1;
    const lockUntil = failed >= ADMIN_RULES.maxFailedLogins ? Date.now() + ADMIN_RULES.lockMinutes * 60_000 : null;
    await db.prepare("UPDATE admin_users SET failed_logins = ?, locked_until = ? WHERE id = ?")
      .bind(lockUntil ? 0 : failed, lockUntil, row.id).run();
    if (lockUntil) throw tooMany(`Too many failed attempts. Try again in ${ADMIN_RULES.lockMinutes} min.`);
    throw unauthorized(BAD_LOGIN);
  }

  const token = randomToken();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE admin_users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?").bind(now, row.id),
    db.prepare("INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)")
      .bind(await sha256(token), row.id, Date.now() + ADMIN_RULES.sessionHours * 3_600_000),
  ]);
  return { token, admin: toAdmin({ ...row, last_login_at: now }) };
}

export async function adminForToken(db: D1Database, token: string): Promise<AdminUser | null> {
  const row = await db.prepare(
    "SELECT u.* FROM admin_sessions s JOIN admin_users u ON u.id = s.admin_id WHERE s.token_hash = ? AND s.expires_at > ?",
  ).bind(await sha256(token), Date.now()).first<AdminRow>();
  return row ? toAdmin(row) : null;
}

export async function endAdminSession(db: D1Database, token: string) {
  await db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}
