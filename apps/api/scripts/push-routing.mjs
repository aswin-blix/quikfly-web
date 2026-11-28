// Checks which devices each notification kind is pushed to, against the LOCAL D1 database.
//   node apps/api/scripts/push-routing.mjs        (after npm run db:migrate:local; no API needed)
// Why: pushNew (src/scheduled.ts) routes pushes with SQL, while the apps and docs follow pushAppsForKind
// (packages/shared/src/types.ts). If the two drift, a captain's ride offer could pop up in the rider app,
// or a partner's payout in QuikFly. This runs pushNew's own query (read from scheduled.ts, so it can't go
// stale) on one test account with a QuikFly, a Partner, a Captain and a browser device and one row of
// every NOTIFICATION_KINDS kind, then compares the result with pushAppsForKind. A browser gets every kind
// except a captain's. The test rows are removed afterwards.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPTAIN_NOTIFICATION_PREFIX, NOTIFICATION_KINDS, PARTNER_NOTIFICATION_PREFIX, PUSH_APPS, pushAppsForKind } from "../../../packages/shared/src/types.ts";

const api = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "push-routing-"));
const TAG = "pushroutecheck";

function d1(sql) {
  const file = join(tmp, "q.sql");
  writeFileSync(file, sql);
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "DB", "--local", "--json", "--file", file], { cwd: api, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out).flatMap((r) => r.results ?? []);
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// pushNew's query, with this run's values in place of its parameters and limited to the test rows.
const src = readFileSync(join(api, "src/scheduled.ts"), "utf8");
const m = src.match(/async function pushNew[\s\S]*?db\.prepare\(\s*`([\s\S]*?)`,\s*\)\.bind\(([^)]*)\)/);
if (!m) throw new Error("Couldn't find pushNew's query in src/scheduled.ts: update this script with it.");
const binds = m[2].split(",").map((s) => s.trim());
const values = { PARTNER_NOTIFICATION_PREFIX: q(PARTNER_NOTIFICATION_PREFIX), CAPTAIN_NOTIFICATION_PREFIX: q(CAPTAIN_NOTIFICATION_PREFIX), since: q("2000-01-01"), PUSH_BATCH: "1000" };
let query = m[1].replace(/--[^\n]*/g, "");
binds.forEach((name, i) => {
  if (!(name in values)) throw new Error(`pushNew binds ${name}, which this script doesn't know: update it.`);
  query = query.replaceAll(`?${i + 1}`, values[name]);
});
query = query.replace(/SELECT[\s\S]*?FROM notifications n/, "SELECT n.kind, d.token FROM notifications n")
  .replace("WHERE n.pushed_at IS NULL", `WHERE n.id LIKE 'NT${TAG}%' AND d.token LIKE '${TAG}-%' AND n.pushed_at IS NULL`);

const [user] = d1("SELECT id FROM users LIMIT 1");
if (!user) throw new Error("The local database has no users: run the API smoke test once first.");
const now = new Date().toISOString();
const devices = [...PUSH_APPS.map((app) => ({ app, token: `${TAG}-${app}`, platform: "android" })), { app: null, token: `${TAG}-browser`, platform: "web" }];
const cleanup = `DELETE FROM push_devices WHERE token LIKE '${TAG}-%'; DELETE FROM notifications WHERE id LIKE 'NT${TAG}%';`;
let rows;
try {
  d1(`${cleanup}
    INSERT INTO push_devices (token, user_id, platform, app, created_at, last_seen) VALUES ${devices.map((d) => `(${q(d.token)}, ${q(user.id)}, ${q(d.platform)}, ${d.app ? q(d.app) : "NULL"}, ${q(now)}, ${q(now)})`).join(", ")};
    INSERT INTO notifications (id, user_id, kind, ref, title, body, booking_id, created_at) VALUES ${NOTIFICATION_KINDS.map((k, i) => `(${q(`NT${TAG}${i}`)}, ${q(user.id)}, ${q(k)}, ${q(`${TAG}${i}`)}, 't', 'b', NULL, ${q(now)})`).join(", ")};`);
  rows = d1(query);
} finally {
  d1(cleanup);
}

const got = new Map(NOTIFICATION_KINDS.map((k) => [k, new Set()]));
for (const r of rows) got.get(r.kind)?.add(r.token.slice(TAG.length + 1));
let failed = 0;
for (const kind of NOTIFICATION_KINDS) {
  const want = new Set([...pushAppsForKind(kind), ...(kind.startsWith(CAPTAIN_NOTIFICATION_PREFIX) ? [] : ["browser"])]);
  const have = got.get(kind);
  const ok = want.size === have.size && [...want].every((a) => have.has(a));
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${kind.padEnd(28)} → ${[...have].sort().join(", ") || "nobody"}${ok ? "" : `  (expected ${[...want].sort().join(", ")})`}`);
}
console.log(failed ? `\n${failed} kind(s) routed wrongly` : `\nAll ${NOTIFICATION_KINDS.length} kinds reach only their own apps`);
process.exit(failed ? 1 : 0);
