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

/** Retries for up to 35 s: other Worker isolates may serve cached catalog/settings for 30 s. */
async function eventually(name, make, test) {
  const until = Date.now() + 35_000;
  let r;
  do {
    r = await make();
    if (test(r)) return check(name, true);
    await new Promise((res) => setTimeout(res, 3000));
  } while (Date.now() < until);
  check(name, false, `${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`);
}

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

// ── Catalog ──
const kinds = await expect("GET /admin/catalog lists every kind", call("GET", "/admin/catalog", null, T), 200,
  (j) => j.length >= 12 && j.every((k) => typeof k.total === "number" && k.canEdit === true) && j.find((k) => k.kind === "place").total > 5);
await expect("GET /admin/catalog/:kind unknown is 404", call("GET", "/admin/catalog/nope", null, T), 404);
const placesBefore = await expect("GET /admin/catalog/place", call("GET", "/admin/catalog/place", null, T), 200,
  (j) => j.length > 5 && j[0].kind === "place" && j[0].data.name && typeof j[0].active === "boolean");
await expect("create refuses missing fields", call("POST", "/admin/catalog/place", { data: { name: "Smoke Spot" } }, T), 400, (j) => /required/.test(j.message));
await expect("create refuses out-of-range values", call("POST", "/admin/catalog/place", { data: { name: "Smoke Spot", area: "Test", x: 500, y: 5 } }, T), 400);
const spot = await expect("create a place", call("POST", "/admin/catalog/place", { data: { name: "Smoke Spot", area: "Test Area", x: 50, y: 50, extra: "ignored" } }, T), 201,
  (j) => j.id && j.data.id === j.id && j.data.name === "Smoke Spot" && !("extra" in j.data) && j.active === true);
await eventually("new place appears in GET /config", () => call("GET", "/config"), (r) => r.json?.places?.some((p) => p.id === spot.id));
await expect("rides can be quoted to the new place", call("POST", "/rides/quote", { service: "car", pickupId: placesBefore[0].id, dropId: spot.id }), 200, (j) => j.length > 0);
await expect("update a place", call("PUT", `/admin/catalog/place/${spot.id}`, { data: { ...spot.data, name: "Smoke Spot 2" } }, T), 200, (j) => j.data.name === "Smoke Spot 2");
await expect("hide a place", call("PUT", `/admin/catalog/place/${spot.id}`, { active: false }, T), 200, (j) => j.active === false && j.data.name === "Smoke Spot 2");
await eventually("hidden place leaves GET /config", () => call("GET", "/config"), (r) => r.json?.places && !r.json.places.some((p) => p.id === spot.id));
await eventually("hidden place can't be quoted", () => call("POST", "/rides/quote", { service: "car", pickupId: placesBefore[0].id, dropId: spot.id }), (r) => r.status === 400);
await expect("update with nothing is refused", call("PUT", `/admin/catalog/place/${spot.id}`, {}, T), 400);
await expect("delete a place", call("DELETE", `/admin/catalog/place/${spot.id}`, null, T), 200, (j) => j.deleted === true);
await expect("deleting again is 404", call("DELETE", `/admin/catalog/place/${spot.id}`, null, T), 404);
await expect("audit records the catalog changes", call("GET", "/admin/audit?entity=catalog", null, T), 200,
  (j) => ["catalog.delete", "catalog.hide", "catalog.update", "catalog.create"].every((a) => j.items.some((e) => e.action === a && e.entityId === `place/${spot.id}`)));

const tours = await expect("GET /admin/catalog/tour", call("GET", "/admin/catalog/tour", null, T), 200, (j) => j.length > 0);
await expect("a duplicate tour slug is refused", call("POST", "/admin/catalog/tour", { data: { ...tours[0].data, title: "Copy" } }, T), 409, (j) => /already uses/.test(j.message));
await expect("nights can't exceed days", call("POST", "/admin/catalog/tour", { data: { ...tours[0].data, slug: "smoke-trip", days: 2, nights: 5 } }, T), 400);
const trip = await expect("create a tour", call("POST", "/admin/catalog/tour", { data: { ...tours[0].data, slug: "smoke-trip", title: "Smoke Trip", price: 999 } }, T), 201, (j) => j.data.slug === "smoke-trip");
await eventually("new tour is served by GET /tours/:slug", () => call("GET", "/tours/smoke-trip"), (r) => r.status === 200 && r.json.price === 999);
await expect("new tour can be quoted", call("POST", "/quotes", { service: "tours", tourId: trip.id, adults: 1, kids: 0 }), 201, (j) => j.lines[0].amount === 999);
await call("DELETE", `/admin/catalog/tour/${trip.id}`, null, T);

// Offers created in admin work as coupons at once; hidden ones stop
const cust2 = (await call("POST", "/auth/verify", { phone: CUSTOMER_PHONE, otp: OTP })).json.token;
const offer = await expect("create an offer", call("POST", "/admin/catalog/offer", { data: {
  code: "smoke25", title: "Smoke 25", description: "Test", service: "all", percent: 25, maxDiscount: 100, minAmount: 0, validUntil: "", perUserLimit: "", hue: 10,
} }, T), 201, (j) => j.data.code === "SMOKE25" && j.data.validUntil === null && j.data.perUserLimit === null);
const quote = (await call("POST", "/quotes", { service: "tours", tourId: tours[0].id, adults: 1, kids: 0 })).json;
await eventually("new coupon works", () => call("POST", "/offers/check", { code: "SMOKE25", quoteId: quote.id }, cust2), (r) => r.status === 200 && r.json.discount === 100);
await call("PUT", `/admin/catalog/offer/${offer.id}`, { data: { ...offer.data, validUntil: "2020-01-01" } }, T);
await eventually("expired coupon is refused", () => call("POST", "/offers/check", { code: "SMOKE25", quoteId: quote.id }, cust2), (r) => r.status === 400 && /expired/.test(r.json.message));
await call("PUT", `/admin/catalog/offer/${offer.id}`, { active: false }, T);
await eventually("hidden coupon is refused", () => call("POST", "/offers/check", { code: "SMOKE25", quoteId: quote.id }, cust2), (r) => r.status === 400 && /isn't valid/.test(r.json.message));
await call("DELETE", `/admin/catalog/offer/${offer.id}`, null, T);

// Settings reach prices: bus lower-deck extra, then restore
const s0 = (await call("GET", "/admin/settings", null, T)).json;
await expect("PATCH /admin/settings refuses a negative fare", call("PATCH", "/admin/settings", { busLowerDeckExtra: -5 }, T), 400);
await expect("PATCH /admin/settings refuses bad surge hours", call("PATCH", "/admin/settings", { surgeHours: "25-30" }, T), 400);
await expect("PATCH /admin/settings refuses a bad GSTIN", call("PATCH", "/admin/settings", { companyGstin: "123" }, T), 400);
await expect("PATCH /admin/settings: lower-deck extra", call("PATCH", "/admin/settings", { busLowerDeckExtra: s0.busLowerDeckExtra + 111 }, T), 200, (j) => j.busLowerDeckExtra === s0.busLowerDeckExtra + 111);
const bus = (await call("GET", "/buses?from=Chennai&to=Madurai&date=2026-12-05")).json[0];
await eventually("seat prices follow the setting", () => call("GET", `/buses/${encodeURIComponent(bus.id)}/seats?from=Chennai&to=Madurai&date=2026-12-05`),
  (r) => r.status === 200 && r.json.find((x) => x.deck === "lower").price === bus.fare + s0.busLowerDeckExtra + 111);
await expect("restore the lower-deck extra", call("PATCH", "/admin/settings", { busLowerDeckExtra: s0.busLowerDeckExtra }, T), 200);
await call("POST", "/me/delete", { otp: OTP }, C);

if (LOCAL) {
  // Roles
  const content = await expect("login: content role", login(CONTENT), 200, (j) => j.admin.role === "content");
  await expect("content can see the dashboard", call("GET", "/admin/stats", null, content.token), 200);
  await expect("content can read settings", call("GET", "/admin/settings", null, content.token), 200);
  await expect("content can't change settings", call("PATCH", "/admin/settings", { licenceAutoApprove: true }, content.token), 403);
  await expect("content can't read the audit log", call("GET", "/admin/audit", null, content.token), 403);
  await expect("content can edit the catalog", call("GET", "/admin/catalog/faq", null, content.token), 200);
  await expect("content can't reset the catalog", call("POST", "/admin/catalog/reset", null, content.token), 403);

  // Reset brings back the seed (local only: it would wipe real edits in production)
  const extra = (await call("POST", "/admin/catalog/city", { data: { name: "Smoke City" } }, T)).json;
  await expect("POST /admin/catalog/reset", call("POST", "/admin/catalog/reset", null, T), 200, (j) => j.reset === true);
  await expect("reset removed the added city", call("GET", "/admin/catalog/city", null, T), 200, (j) => !j.some((c) => c.id === extra.id) && j.length === 8);

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
