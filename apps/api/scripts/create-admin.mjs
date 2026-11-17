// Creates (or resets) an admin account straight in D1, since there is no sign-up for staff.
// Usage: node scripts/create-admin.mjs --local|--remote <email> <name> <owner|operations|content> [password]
// Without a password one is generated and printed once. Running again for the same email
// resets the password, name and role and clears any lockout.
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROLES = ["owner", "operations", "content"];
const [target, emailArg, name, role, passwordArg] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();

if (!["--local", "--remote"].includes(target) || !email || !name || !ROLES.includes(role)) {
  console.error("Usage: node scripts/create-admin.mjs --local|--remote <email> <name> <owner|operations|content> [password]");
  process.exit(2);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { console.error("That email doesn't look valid."); process.exit(2); }

const password = passwordArg ?? randomBytes(12).toString("base64url");
if (password.length < 10) { console.error("Password must be at least 10 characters."); process.exit(2); }

// Same format as src/lib/password.ts: pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>
const ITERATIONS = 100_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const stored = `pbkdf2-sha256$${ITERATIONS}$${salt.toString("hex")}$${hash.toString("hex")}`;

const id = `AD${Date.now().toString(36).toUpperCase()}${100 + (randomBytes(2).readUInt16BE() % 900)}`;
const now = new Date().toISOString();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = `
INSERT INTO admin_users (id, email, name, role, password_hash, failed_logins, locked_until, created_at)
  VALUES (${q(id)}, ${q(email)}, ${q(name)}, ${q(role)}, ${q(stored)}, 0, NULL, ${q(now)})
  ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = excluded.role, password_hash = excluded.password_hash,
    failed_logins = 0, locked_until = NULL;
INSERT INTO audit_log (id, admin_id, action, entity, entity_id, detail, created_at)
  VALUES (${q("AU" + id.slice(2))}, NULL, 'admin.upsert', 'admin', (SELECT id FROM admin_users WHERE email = ${q(email)}),
    ${q(JSON.stringify({ email, name, role, by: "scripts/create-admin.mjs" }))}, ${q(now)});
`;

const dir = mkdtempSync(join(tmpdir(), "quikfly-admin-"));
const file = join(dir, "create-admin.sql");
writeFileSync(file, sql);
try {
  // One command string: npx is a .cmd on Windows, which Node only runs through a shell. Every part is validated or quoted above.
  const r = spawnSync(`npx wrangler d1 execute quikfly-db ${target} --file "${file}"`, {
    stdio: ["ignore", "inherit", "inherit"], shell: true, cwd: new URL("..", import.meta.url),
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\nAdmin ready (${target.slice(2)}): ${email} · ${role}`);
if (!passwordArg) console.log(`Password (shown once, store it safely): ${password}`);
