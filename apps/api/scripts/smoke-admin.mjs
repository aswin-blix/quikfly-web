// End-to-end check of the /admin endpoints. Usage:
//   node scripts/smoke-admin.mjs                         local API; creates its own test admins (needs wrangler + local D1)
//   node scripts/smoke-admin.mjs <baseUrl> <email> <password>   any API, with an existing owner account
// Lockout and role checks run only in local mode, so a real owner account is never locked.
import { spawnSync } from "node:child_process";

const BASE = (process.argv[2] || "http://localhost:8787/v1").replace(/\/$/, "");
const LOCAL = !process.argv[3];
const OWNER = { email: process.argv[3] || "smoke-owner@quikfly.test", password: process.argv[4] || "SmokeOwner-12345" };
const CONTENT = { email: "smoke-content@quikfly.test", password: "SmokeContent-12345" };
const LOCKME = { email: "smoke-lock@quikfly.test", password: "SmokeLock-12345" };
const CUSTOMER_PHONE = "9000000002";
const OTP = "1234";

let failed = 0;
const check = (name, ok, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`); };

async function call(method, path, body, token = "") {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
async function expect(name, promise, status, test = () => true) {
  const r = await promise;
  check(name, r.status === status && test(r.json), `${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`);
  return r.json;
}
const login = (a) => call("POST", "/admin/auth/login", a);

if (LOCAL) {
  for (const [a, role] of [[OWNER, "owner"], [CONTENT, "content"], [LOCKME, "content"]]) {
    const r = spawnSync("node", ["scripts/create-admin.mjs", "--local", a.email, `Smoke ${role}`, role, a.password],
      { stdio: ["ignore", "ignore", "inherit"], cwd: new URL("..", import.meta.url) });
    if (r.status !== 0) { console.error(`Could not create ${a.email}`); process.exit(1); }
  }
}

// Sign-in
await expect("GET /admin/auth/me without a token", call("GET", "/admin/auth/me"), 401);
const bad = await expect("login: wrong password", login({ email: OWNER.email, password: "nope-nope-nope" }), 401, (j) => j.message);
await expect("login: unknown email gives the same message", login({ email: "nobody@quikfly.test", password: "nope-nope-nope" }), 401, (j) => j.message === bad.message);
await expect("login: missing fields", login({ email: OWNER.email }), 400);
const owner = await expect("login: owner", login(OWNER), 200, (j) => j.token && j.admin.email === OWNER.email && j.admin.role === "owner" && !("password_hash" in j.admin));
const T = owner.token;
await expect("GET /admin/auth/me", call("GET", "/admin/auth/me", null, T), 200, (j) => j.email === OWNER.email && j.lastLoginAt);

// Dashboard
await expect("GET /admin/stats (7 days)", call("GET", "/admin/stats", null, T), 200,
  (j) => j.days === 7 && j.byDay.length === 7 && typeof j.totals.customers === "number" && typeof j.totals.walletBalance === "number"
    && Array.isArray(j.byService) && Array.isArray(j.recent) && typeof j.queues.pendingLicences === "number");
await expect("GET /admin/stats?days=1 is today only", call("GET", "/admin/stats?days=1", null, T), 200, (j) => j.byDay.length === 1);
await expect("GET /admin/stats?days=999 is clamped", call("GET", "/admin/stats?days=999", null, T), 200, (j) => j.days === 90 && j.byDay.length === 90);

// Settings + audit
await expect("GET /admin/settings", call("GET", "/admin/settings", null, T), 200, (j) => typeof j.licenceAutoApprove === "boolean");
await expect("PATCH /admin/settings rejects an unknown key", call("PATCH", "/admin/settings", { nope: 1 }, T), 400);
await expect("PATCH /admin/settings rejects a wrong type", call("PATCH", "/admin/settings", { licenceAutoApprove: "yes" }, T), 400);
await expect("PATCH /admin/settings rejects an empty body", call("PATCH", "/admin/settings", {}, T), 400);
await expect("PATCH /admin/settings: licence auto-approve on", call("PATCH", "/admin/settings", { licenceAutoApprove: true }, T), 200, (j) => j.licenceAutoApprove === true);
await expect("GET /admin/audit shows the change", call("GET", "/admin/audit", null, T), 200,
  (j) => j.items[0].action === "settings.update" && j.items[0].admin?.email === undefined && j.items[0].admin.name && j.items[0].detail.after.licenceAutoApprove === true && j.total >= 1);
await expect("GET /admin/audit?entity=settings", call("GET", "/admin/audit?entity=settings", null, T), 200, (j) => j.items.every((e) => e.entity === "settings"));
await expect("GET /admin/audit?entity=nothing is empty", call("GET", "/admin/audit?entity=nothing", null, T), 200, (j) => j.total === 0 && j.items.length === 0);

// The setting reaches the customer side: a licence is verified at once while auto-approve is on, pending when off.
const cust = (await call("POST", "/auth/verify", { phone: CUSTOMER_PHONE, otp: OTP })).json;
const C = cust?.token;
check("customer signs in", !!C);
const licence = { number: "TN0920190007777", expiry: "2035-01-01" };
await expect("licence auto-approved while the setting is on", call("PUT", "/me/licence", licence, C), 200,
  (j) => j.licence.status === "verified" && j.licence.note === null);
await expect("PATCH /admin/settings: licence auto-approve off", call("PATCH", "/admin/settings", { licenceAutoApprove: false }, T), 200, (j) => j.licenceAutoApprove === false);
// Other Worker isolates may hold the old value for SETTINGS_CACHE_MS; retry once after that window.
let resub = await call("PUT", "/me/licence", licence, C);
if (resub.json?.licence?.status !== "pending") { await new Promise((r) => setTimeout(r, 31_000)); resub = await call("PUT", "/me/licence", licence, C); }
check("licence is pending review while the setting is off", resub.status === 200 && resub.json?.licence?.status === "pending", JSON.stringify(resub.json)?.slice(0, 200));
await expect("dashboard counts the pending licence", call("GET", "/admin/stats", null, T), 200, (j) => j.queues.pendingLicences >= 1);
await call("POST", "/me/delete", { otp: OTP }, C);

if (LOCAL) {
  // Roles
  const content = await expect("login: content role", login(CONTENT), 200, (j) => j.admin.role === "content");
  await expect("content can see the dashboard", call("GET", "/admin/stats", null, content.token), 200);
  await expect("content can read settings", call("GET", "/admin/settings", null, content.token), 200);
  await expect("content can't change settings", call("PATCH", "/admin/settings", { licenceAutoApprove: true }, content.token), 403);
  await expect("content can't read the audit log", call("GET", "/admin/audit", null, content.token), 403);

  // Lockout after 5 wrong passwords
  for (let i = 1; i <= 4; i++) await call("POST", "/admin/auth/login", { email: LOCKME.email, password: `wrong-${i}-xxxxx` });
  await expect("5th wrong password locks the account", login({ email: LOCKME.email, password: "wrong-5-xxxxx" }), 429, (j) => /Try again/.test(j.message));
  await expect("locked account refuses the right password too", login(LOCKME), 429);
}

// Sign out
await expect("POST /admin/auth/logout", call("POST", "/admin/auth/logout", null, T), 200, (j) => j.signedOut === true);
await expect("token is rejected after logout", call("GET", "/admin/auth/me", null, T), 401);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll admin checks passed");
process.exit(failed ? 1 : 0);
