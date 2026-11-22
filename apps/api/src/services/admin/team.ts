// Staff accounts (the Team screen, owners only): list, create with a generated password shown
// once, change role, counter or name, disable / enable, reset a password. Owners can't change or disable
// their own account here, so a workspace can't lock itself out. Every change is audited.
import { ADMIN_ROLES, LIMITS, PATTERNS, type AdminRole, type CounterScope, type TeamMember } from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { hashPassword } from "../../lib/password";
import { randomToken, uid } from "../../lib/random";
import { visible } from "../catalog";
import { auditStatement } from "./audit";
import { counterScope } from "./auth";

interface TeamRow {
  id: string; email: string; name: string; role: AdminRole; last_login_at: string | null; created_at: string;
  disabled_at: string | null; locked_until: number | null; scope: string | null;
}

const toMember = (r: TeamRow): TeamMember => ({
  id: r.id, email: r.email, name: r.name, role: r.role, lastLoginAt: r.last_login_at, createdAt: r.created_at,
  counter: counterScope(r.role, r.scope),
  disabledAt: r.disabled_at, lockedUntil: r.locked_until && r.locked_until > Date.now() ? r.locked_until : null,
});

const COLUMNS = "id, email, name, role, last_login_at, created_at, disabled_at, locked_until, scope";

/** The scope to store: a counter account needs a real counter, spelled as the catalog spells it; other roles have none. */
async function scopeFor(db: D1Database, role: AdminRole, counter: CounterScope | null | undefined): Promise<string | null> {
  if (role !== "counter") {
    if (counter) throw badRequest("Only a counter account has a counter.");
    return null;
  }
  if (!counter) throw badRequest("Choose the counter this person works at.");
  const real = (await visible(db, "parcelCounter")).find((c) => c.operatorId === counter.operatorId && c.city.toLowerCase() === counter.city.trim().toLowerCase());
  if (!real) throw badRequest("That operator has no parcel counter in that city (Catalog → Parcel counters).");
  return JSON.stringify({ operatorId: real.operatorId, city: real.city } satisfies CounterScope);
}

export async function listTeam(db: D1Database): Promise<TeamMember[]> {
  const { results } = await db.prepare(`SELECT ${COLUMNS} FROM admin_users ORDER BY created_at`).all<TeamRow>();
  return results.map(toMember);
}

async function memberRow(db: D1Database, id: string): Promise<TeamRow> {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM admin_users WHERE id = ?`).bind(id).first<TeamRow>();
  if (!row) throw notFound("Staff account not found.");
  return row;
}

/** A password people can type from a screen: 14 characters, letters and digits only. */
const newPassword = () => randomToken(16).replace(/[^A-Za-z0-9]/g, "").slice(0, 14).padEnd(14, "7");

export function checkMemberInput(email: string, name: string, role: string) {
  if (!PATTERNS.email.test(email)) throw badRequest("That email doesn't look valid.");
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) throw badRequest(`"name" must be ${LIMITS.nameMin}–${LIMITS.nameMax} characters.`);
  if (!(ADMIN_ROLES as readonly string[]).includes(role)) throw badRequest(`"role" must be one of: ${ADMIN_ROLES.join(", ")}.`);
}

/** Creates the account and returns the one-time password (never stored or logged in clear). */
export async function createMember(db: D1Database, adminId: string, input: { email: string; name: string; role: AdminRole; counter?: CounterScope | null }): Promise<{ member: TeamMember; password: string }> {
  const email = input.email.trim().toLowerCase();
  checkMemberInput(email, input.name, input.role);
  const scope = await scopeFor(db, input.role, input.counter);
  const taken = await db.prepare("SELECT id FROM admin_users WHERE email = ?").bind(email).first();
  if (taken) throw conflict("A staff account with that email already exists.");
  const password = newPassword();
  const id = uid("AD");
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO admin_users (id, email, name, role, password_hash, failed_logins, locked_until, created_at, scope) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)")
      .bind(id, email, input.name, input.role, await hashPassword(password), now, scope),
    auditStatement(db, { adminId, action: "team.create", entity: "admin", entityId: id, detail: { email, name: input.name, role: input.role, ...(scope ? { counter: JSON.parse(scope) } : {}) } }),
  ]);
  return { member: await memberRow(db, id).then(toMember), password };
}

/** Role, counter, name or disabled state. A new role or counter, or disabling, ends the person's sessions. Not allowed on yourself. */
export async function updateMember(
  db: D1Database, adminId: string, id: string, patch: { role?: AdminRole; name?: string; disabled?: boolean; counter?: CounterScope | null },
): Promise<TeamMember> {
  const row = await memberRow(db, id);
  if (id === adminId && (patch.role !== undefined || patch.disabled !== undefined || patch.counter !== undefined)) throw conflict("You can't change your own role or disable your own account. Ask another owner.");
  const sets: string[] = [];
  const params: unknown[] = [];
  const detail: Record<string, unknown> = {};
  if (patch.name !== undefined) { checkMemberInput(row.email, patch.name, row.role); sets.push("name = ?"); params.push(patch.name); detail.name = { before: row.name, after: patch.name }; }
  if (patch.role !== undefined) { checkMemberInput(row.email, row.name, patch.role); sets.push("role = ?"); params.push(patch.role); detail.role = { before: row.role, after: patch.role }; }
  let scopeChanged = false;
  if (patch.role !== undefined || patch.counter !== undefined) {
    const role = patch.role ?? row.role;
    const scope = await scopeFor(db, role, patch.counter !== undefined ? patch.counter : role === "counter" ? counterScope(row.role, row.scope) : null);
    if (scope !== (row.scope ?? null)) {
      scopeChanged = true;
      sets.push("scope = ?"); params.push(scope);
      detail.counter = { before: counterScope(row.role, row.scope), after: scope ? JSON.parse(scope) : null };
    }
  }
  if (patch.disabled !== undefined) {
    const at = patch.disabled ? new Date().toISOString() : null;
    sets.push("disabled_at = ?"); params.push(at); detail.disabled = { before: !!row.disabled_at, after: patch.disabled };
  }
  if (!sets.length) throw badRequest("Nothing to update.");
  if (patch.role !== undefined && patch.role !== "owner" && row.role === "owner") await assertAnotherOwner(db, id);
  if (patch.disabled) await assertAnotherOwner(db, id, row.role);
  await db.batch([
    db.prepare(`UPDATE admin_users SET ${sets.join(", ")} WHERE id = ?`).bind(...params, id),
    ...(patch.disabled || scopeChanged || (patch.role !== undefined && patch.role !== row.role) ? [db.prepare("DELETE FROM admin_sessions WHERE admin_id = ?").bind(id)] : []),
    auditStatement(db, { adminId, action: "team.update", entity: "admin", entityId: id, detail }),
  ]);
  return toMember(await memberRow(db, id));
}

/** New one-time password; lockout cleared; the person's sessions end. */
export async function resetMemberPassword(db: D1Database, adminId: string, id: string): Promise<{ member: TeamMember; password: string }> {
  const row = await memberRow(db, id);
  const password = newPassword();
  await db.batch([
    db.prepare("UPDATE admin_users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?").bind(await hashPassword(password), id),
    db.prepare("DELETE FROM admin_sessions WHERE admin_id = ?").bind(id),
    auditStatement(db, { adminId, action: "team.reset_password", entity: "admin", entityId: id, detail: { email: row.email } }),
  ]);
  return { member: toMember(await memberRow(db, id)), password };
}

/** There must always be at least one other live owner before an owner is demoted or disabled. */
async function assertAnotherOwner(db: D1Database, exceptId: string, role: AdminRole = "owner") {
  if (role !== "owner") return;
  const other = await db.prepare("SELECT COUNT(*) AS n FROM admin_users WHERE role = 'owner' AND disabled_at IS NULL AND id <> ?").bind(exceptId).first<{ n: number }>();
  if (!other?.n) throw conflict("That would leave QuikFly without an active owner.");
}
