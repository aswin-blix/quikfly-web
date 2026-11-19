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
// Partner (vendor) test helpers: a raw image upload and dates relative to today.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(256).fill(7)]);
async function upload(path, bytes, bearer) {
  const res = await fetch(BASE + path, { method: "PUT", headers: { "Content-Type": "image/jpeg", Authorization: `Bearer ${bearer}` }, body: bytes });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const dayOffset = (days) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
const randomReg = () => `TN${String(10 + Math.floor(Math.random() * 89))}QF${String(1000 + Math.floor(Math.random() * 8999))}`;
async function expect(name, promise, status, test = () => true) {
  const r = await promise;
  check(name, r.status === status && test(r.json), `${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`);
  return r.json;
}
const login = (a) => call("POST", "/admin/auth/login", a);
const TRAVEL = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

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
// Other Worker isolates may still hold "off" for SETTINGS_CACHE_MS, so retry until the new value reaches them.
await eventually("licence auto-approved while the setting is on", () => call("PUT", "/me/licence", licence, C),
  (r) => r.status === 200 && r.json?.licence?.status === "verified" && r.json.licence.note === null);
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
await expect("new tour can be quoted", call("POST", "/quotes", { service: "tours", tourId: trip.id, adults: 1, kids: 0, start: TRAVEL }), 201, (j) => j.lines[0].amount === 999);
await call("DELETE", `/admin/catalog/tour/${trip.id}`, null, T);

// Offers created in admin work as coupons at once; hidden ones stop
const cust2 = (await call("POST", "/auth/verify", { phone: CUSTOMER_PHONE, otp: OTP })).json.token;
const offer = await expect("create an offer", call("POST", "/admin/catalog/offer", { data: {
  code: "smoke25", title: "Smoke 25", description: "Test", service: "all", percent: 25, maxDiscount: 100, minAmount: 0, validUntil: "", perUserLimit: "", hue: 10,
} }, T), 201, (j) => j.data.code === "SMOKE25" && j.data.validUntil === null && j.data.perUserLimit === null);
const quote = (await call("POST", "/quotes", { service: "tours", tourId: tours[0].id, adults: 1, kids: 0, start: TRAVEL })).json;
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
// The lower-deck extra applies to 2+1 sleeper buses (seaters and seater/sleeper lower decks are plain seats).
const sleeperBus = (await call("GET", "/buses?from=Chennai&to=Madurai&date=2026-12-05")).json.find((b) => b.sleeper && !b.type.includes("Seater"));
if (sleeperBus) {
  await eventually("seat prices follow the setting", () => call("GET", `/buses/${encodeURIComponent(sleeperBus.id)}/seats?from=Chennai&to=Madurai&date=2026-12-05`),
    (r) => r.status === 200 && r.json.find((x) => x.deck === "lower").price === sleeperBus.fare + s0.busLowerDeckExtra + 111);
} else console.log("SKIP  no 2+1 sleeper bus on the sample route");
await expect("restore the lower-deck extra", call("PATCH", "/admin/settings", { busLowerDeckExtra: s0.busLowerDeckExtra }, T), 200);

// ── Bookings ──
const places = (await call("GET", "/places")).json;
const cMe = (await call("GET", "/auth/me", null, C)).json;
const rideA = (await call("POST", "/rides", { optionId: "mini", pickupId: places[0].id, dropId: places[1].id, payment: "wallet" }, C)).json;
const bookA = (await call("POST", "/bookings", { service: "car", title: "Smoke admin ride", subtitle: "A → B", payment: "wallet", lines: [], rideId: rideA.id }, C)).json;
check("customer booked a wallet ride", !!bookA?.id, JSON.stringify(bookA)?.slice(0, 200));
const afterPay = (await call("GET", "/auth/me", null, C)).json.walletBalance;
await expect("GET /admin/bookings", call("GET", "/admin/bookings", null, T), 200, (j) => j.items.length > 0 && j.total >= j.items.length && j.items[0].customer?.phone);
await expect("search bookings by phone", call("GET", `/admin/bookings?q=${CUSTOMER_PHONE.slice(-6)}`, null, T), 200,
  (j) => j.items.some((b) => b.id === bookA.id) && j.items.every((b) => b.customer.phone.replace(/\s/g, "").includes(CUSTOMER_PHONE.slice(-6))));
await expect("search bookings by id", call("GET", `/admin/bookings?q=${bookA.id}`, null, T), 200, (j) => j.items.length === 1 && j.items[0].id === bookA.id);
await expect("filter by status and service", call("GET", "/admin/bookings?status=confirmed&service=car", null, T), 200, (j) => j.items.every((b) => b.status === "confirmed" && b.service === "car"));
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
await expect("filter by date", call("GET", `/admin/bookings?from=${today}&to=${today}&q=${bookA.id}`, null, T), 200, (j) => j.items.length === 1);
await expect("bad filter is refused", call("GET", "/admin/bookings?status=nope", null, T), 400);
await expect("GET /admin/bookings/:id", call("GET", `/admin/bookings/${bookA.id}`, null, T), 200,
  (j) => j.booking.id === bookA.id && j.booking.customer.id === cMe.id && j.wallet.some((w) => w.kind === "payment" && w.amount === -bookA.amount) && Array.isArray(j.history));
await expect("cancel needs a reason", call("POST", `/admin/bookings/${bookA.id}/cancel`, {}, T), 400);
await expect("staff cancel refunds the wallet", call("POST", `/admin/bookings/${bookA.id}/cancel`, { reason: "Driver unavailable (smoke)" }, T), 200,
  (j) => j.booking.status === "cancelled" && j.wallet.some((w) => w.kind === "refund" && w.amount === bookA.amount) && j.history[0]?.action === "booking.cancel" && j.history[0].detail.reason.includes("smoke"));
check("refund reached the customer's wallet", (await call("GET", "/auth/me", null, C)).json.walletBalance === afterPay + bookA.amount);
await expect("cancelling again is refused", call("POST", `/admin/bookings/${bookA.id}/cancel`, { reason: "Again please" }, T), 409);
await expect("the customer is notified of a staff cancel, with the reason", call("GET", "/me/notifications", null, C), 200,
  (j) => j.items.some((n) => n.kind === "booking.cancelled_by_staff" && n.bookingId === bookA.id && /Driver unavailable/.test(n.body)));
await expect("customer sees the cancellation", call("GET", `/bookings/${bookA.id}`, null, C), 200, (j) => j.status === "cancelled");
const rideB = (await call("POST", "/rides", { optionId: "mini", pickupId: places[0].id, dropId: places[1].id, payment: "cash" }, C)).json;
const bookB = (await call("POST", "/bookings", { service: "car", title: "Smoke admin ride 2", subtitle: "A → B", payment: "cash", lines: [], rideId: rideB.id }, C)).json;
await expect("staff mark complete", call("POST", `/admin/bookings/${bookB.id}/complete`, null, T), 200, (j) => j.booking.status === "completed" && j.history[0]?.action === "booking.complete");
await expect("completing again is refused", call("POST", `/admin/bookings/${bookB.id}/complete`, null, T), 409);
const rideCredits = Math.min(s0.creditsCap, Math.floor((bookB.amount * s0.creditsRides) / 100));
await expect("staff completion earns the customer credits", call("GET", "/me/credits", null, C), 200,
  (j) => j.items.filter((x) => x.kind === "earned" && x.bookingId === bookB.id).length === (rideCredits ? 1 : 0)
    && (!rideCredits || j.items.find((x) => x.bookingId === bookB.id).amount === rideCredits));
await expect("credit settings are range-checked", call("PATCH", "/admin/settings", { creditsMaxRedeemPercent: 150 }, T), 400);
await expect("credit expiry must be at least a day", call("PATCH", "/admin/settings", { creditsExpiryDays: 0 }, T), 400);
await expect("unknown booking is 404", call("GET", "/admin/bookings/QFNOPE", null, T), 404);

// ── Cancellation policies reach refunds ──
await expect("a policy that refunds more on shorter notice is refused", call("PATCH", "/admin/settings", { cancelPolicyTours: "2d:50, 1d:100" }, T), 400, (j) => /Shorter notice/.test(j.message));
await expect("a malformed policy is refused", call("PATCH", "/admin/settings", { cancelPolicyTours: "50%" }, T), 400);
const policy0 = s0.cancelPolicyTours;
// Any start inside 999 days but more than an hour away gets 50% under this policy.
await expect("PATCH a holiday policy", call("PATCH", "/admin/settings", { cancelPolicyTours: "999d:100, 1h:50" }, T), 200, (j) => j.cancelPolicyTours === "999d:100, 1h:50");
const cheap = (await call("POST", "/admin/catalog/tour", { data: { ...tours[0].data, slug: "smoke-cheap", title: "Smoke Cheap Trip", price: 40 } }, T)).json;
const C2 = (await call("POST", "/auth/verify", { phone: CUSTOMER_PHONE, otp: OTP })).json.token;
await eventually("policy and cheap tour reach the API", () => call("GET", "/config"), (r) => r.json?.settings?.cancelPolicyTours === "999d:100, 1h:50");
const tq = (await call("POST", "/quotes", { service: "tours", tourId: cheap.id, adults: 1, kids: 0, start: TRAVEL })).json;
// A partial refund costs the payer money, so locally a fresh customer pays from their welcome credit;
// against production the shared test customer pays by UPI and only the refund amount is checked.
const P = LOCAL ? (await call("POST", "/auth/verify", { phone: `90001${String(Date.now()).slice(-5)}`, otp: OTP })).json.token : C2;
const payBy = LOCAL ? "wallet" : "upi";
const walletBefore = (await call("GET", "/auth/me", null, P)).json.walletBalance;
const halfBooking = await expect("holiday booking under a 50% policy", call("POST", "/bookings", { service: "tours", title: "Smoke Cheap Trip", subtitle: "Policy test", payment: payBy, lines: [], quoteId: tq.id }, P), 201, (j) => j.startsAt?.startsWith(TRAVEL));
await expect("admin sees what a cancel would refund", call("GET", `/admin/bookings/${halfBooking.id}`, null, T), 200,
  (j) => j.refundIfCancelled?.percent === 50 && j.refundIfCancelled.amount === Math.round(halfBooking.amount / 2));
await expect("customer cancel refunds half under the policy", call("POST", `/bookings/${halfBooking.id}/cancel`, null, P), 200,
  (j) => j.status === "cancelled" && j.refundAmount === Math.round(halfBooking.amount / 2));
if (LOCAL) {
  check("wallet got back only the policy's share", (await call("GET", "/auth/me", null, P)).json.walletBalance === walletBefore - halfBooking.amount + Math.round(halfBooking.amount / 2));
  await expect("finished booking has no refund preview", call("GET", `/admin/bookings/${halfBooking.id}`, null, T), 200,
    (j) => j.refundIfCancelled === null && j.wallet.some((w) => w.kind === "refund" && w.amount === Math.round(halfBooking.amount / 2) && /50%/.test(w.note)));
  await call("POST", "/me/delete", { otp: OTP }, P);
} else {
  await expect("finished booking has no refund preview", call("GET", `/admin/bookings/${halfBooking.id}`, null, T), 200, (j) => j.refundIfCancelled === null && j.wallet.length === 0);
}
await call("DELETE", `/admin/catalog/tour/${cheap.id}`, null, T);
await expect("restore the holiday policy", call("PATCH", "/admin/settings", { cancelPolicyTours: policy0 }, T), 200, (j) => j.cancelPolicyTours === policy0);

// ── Self-drive deposit: always back on cancel; back on staff completion ──
await expect("documents list must not be empty", call("PATCH", "/admin/settings", { rentDocuments: "ab" }, T), 400);
const rentPolicy0 = s0.cancelPolicyRent;
await expect("PATCH a no-refund rent policy", call("PATCH", "/admin/settings", { cancelPolicyRent: "999d:0" }, T), 200, (j) => j.cancelPolicyRent === "999d:0");
await eventually("rent policy reaches the API", () => call("GET", "/config"), (r) => r.json?.settings?.cancelPolicyRent === "999d:0");
const carList = (await call("GET", "/rentals/cars?city=Chennai")).json;
const rentReq = { service: "rent", carId: carList[0].id, mode: "self", start: `${TRAVEL}T10:00`, end: `${TRAVEL}T16:00`, kmPlan: "limited", protection: "standard", doorstep: false };
const rentBook = async (payment) => {
  const q = (await call("POST", "/quotes", rentReq)).json;
  return (await call("POST", "/bookings", { service: "rent", title: "Smoke self-drive", subtitle: "Deposit test", payment, lines: [], quoteId: q.id }, C2)).json;
};
const r1 = await rentBook("upi");
check("self-drive booking records its deposit", r1?.deposit === s0.rentDeposit && r1.amount > r1.deposit, JSON.stringify(r1)?.slice(0, 200));
await expect("cancel under a 0% policy still returns the deposit", call("POST", `/bookings/${r1.id}/cancel`, null, C2), 200,
  (j) => j.status === "cancelled" && j.refundAmount === r1.deposit);
const r2 = await rentBook("upi");
await expect("admin preview includes the deposit", call("GET", `/admin/bookings/${r2.id}`, null, T), 200, (j) => j.refundIfCancelled?.amount === r2.deposit && j.refundIfCancelled.percent === 0);
await expect("customer can't complete a rental", call("POST", `/bookings/${r2.id}/complete`, null, C2), 409);
await expect("staff completion records the deposit as due back", call("POST", `/admin/bookings/${r2.id}/complete`, null, T), 200,
  (j) => j.booking.status === "completed" && j.booking.refundAmount === r2.deposit && j.history[0]?.detail?.depositReturned === r2.deposit && j.history[0].detail.toWallet === false && j.wallet.length === 0);
const rentCredits = Math.min(s0.creditsCap, Math.floor(((r2.amount - r2.deposit) * s0.creditsRent) / 100));
await expect("rental credits leave out the deposit", call("GET", "/me/credits", null, C2), 200,
  (j) => !rentCredits || j.items.find((x) => x.kind === "earned" && x.bookingId === r2.id)?.amount === rentCredits);
// Wallet path, when the test customer can afford a self-drive booking.
const balance0 = (await call("GET", "/auth/me", null, C2)).json.walletBalance;
const rq = (await call("POST", "/quotes", rentReq)).json;
if (balance0 >= rq.total) {
  const r3 = (await call("POST", "/bookings", { service: "rent", title: "Smoke self-drive", subtitle: "Wallet deposit", payment: "wallet", lines: [], quoteId: rq.id }, C2)).json;
  await expect("staff completion returns a wallet deposit", call("POST", `/admin/bookings/${r3.id}/complete`, null, T), 200,
    (j) => j.wallet.some((w) => w.kind === "refund" && w.amount === r3.deposit && /Deposit returned/.test(w.note)));
  check("deposit reached the wallet", (await call("GET", "/auth/me", null, C2)).json.walletBalance === balance0 - r3.amount + r3.deposit);
} else {
  console.log(`SKIP  wallet deposit return (test wallet ₹${balance0} < ₹${rq.total})`);
}
await expect("restore the rent policy", call("PATCH", "/admin/settings", { cancelPolicyRent: rentPolicy0 }, T), 200, (j) => j.cancelPolicyRent === rentPolicy0);

// ── Ride rules (MVAG 2025): surge cap and the rider cancellation fee ──
await expect("a surge cap above 3× is refused", call("PATCH", "/admin/settings", { surgeCap: 5 }, T), 400);
await expect("surge ×3 with a ×1.5 cap, all day", call("PATCH", "/admin/settings", { surgeMultiplier: 3, surgeCap: 1.5, surgeHours: "0-23" }, T), 200, (j) => j.surgeCap === 1.5);
await eventually("quotes apply the cap, not the multiplier", () => call("POST", "/rides/quote", { service: "car", pickupId: places[0].id, dropId: places[1].id }),
  (r) => r.status === 200 && r.json.every((q) => q.surge === 1.5));
await expect("fee from the first minute: 10%, capped at ₹100", call("PATCH", "/admin/settings", { rideCancelFreeMinutes: 0, rideCancelFeePercent: 10, rideCancelFeeCap: 100 }, T), 200);
await eventually("fee settings reach the API", () => call("GET", "/config"), (r) => r.json?.settings?.rideCancelFreeMinutes === 0);
const cashRide = async () => {
  const r = (await call("POST", "/rides", { optionId: "mini", pickupId: places[0].id, dropId: places[1].id, payment: "cash" }, C2)).json;
  return (await call("POST", "/bookings", { service: "car", title: "Smoke fee ride", subtitle: "A → B", payment: "cash", lines: [], rideId: r.id }, C2)).json;
};
const f1 = await cashRide();
const fee1 = Math.min(Math.round(f1.amount * 0.1), 100);
await expect("rider cancel without a reason pays the fee", call("POST", `/bookings/${f1.id}/cancel`, {}, C2), 200,
  (j) => j.cancelFee === fee1 && j.refundAmount === f1.amount - fee1 && j.cancelReason === null);
const f2 = await cashRide();
await expect("a non-driver reason still pays the fee", call("POST", `/bookings/${f2.id}/cancel`, { reason: "plans_changed" }, C2), 200, (j) => j.cancelFee > 0 && j.cancelReason === "plans_changed");
const f3 = await cashRide();
await expect("a driver-side reason waives the fee", call("POST", `/bookings/${f3.id}/cancel`, { reason: "driver_asked" }, C2), 200, (j) => j.cancelFee === 0 && j.refundAmount === f3.amount);
const f4 = await cashRide();
await expect("staff cancels never charge the rider", call("POST", `/admin/bookings/${f4.id}/cancel`, { reason: "Driver unavailable (smoke)" }, T), 200,
  (j) => j.booking.cancelFee === 0 && j.booking.refundAmount === f4.amount);
await expect("admin sees the rider's reason and fee", call("GET", `/admin/bookings/${f2.id}`, null, T), 200, (j) => j.booking.cancelReason === "plans_changed" && j.booking.cancelFee > 0);
// Scheduled ride near pickup: starts inside the window, and cancelling inside the free-cancel window pays the fee.
await expect("schedule 5+ minutes ahead (for the test)", call("PATCH", "/admin/settings", { rideScheduleMinMinutes: 5, rideScheduleFreeCancelMinutes: 60 }, T), 200);
await eventually("schedule settings reach the API", () => call("GET", "/config"), (r) => r.json?.settings?.rideScheduleMinMinutes === 5);
const soon = new Date(Date.now() + (330 + 10) * 60_000).toISOString().slice(0, 16);
const soonRide = (await call("POST", "/rides", { optionId: "mini", pickupId: places[0].id, dropId: places[1].id, payment: "cash", scheduledFor: soon }, C2)).json;
check("ride scheduled 10 minutes ahead", !!soonRide?.scheduledFor, JSON.stringify(soonRide)?.slice(0, 160));
const soonBooking = (await call("POST", "/bookings", { service: "car", title: "Smoke soon", subtitle: "A → B", payment: "cash", lines: [], rideId: soonRide.id }, C2)).json;
if (LOCAL) {
  // Run the cron once (wrangler dev --test-scheduled): a ride 10 minutes out gets its reminder.
  await fetch(BASE.replace(/\/v1$/, "") + "/__scheduled?cron=*+*+*+*+*").catch(() => null);
  await expect("the cron writes the scheduled-ride reminder", call("GET", "/me/notifications", null, C2), 200,
    (j) => j.items.some((n) => n.kind === "ride.reminder" && n.bookingId === soonBooking.id));
}
await expect("inside the window the ride starts", call("POST", `/rides/${soonRide.id}/start`, null, C2), 200, (j) => j.id === soonRide.id);
await expect("cancelling within the free-cancel window pays the fee", call("POST", `/bookings/${soonBooking.id}/cancel`, {}, C2), 200,
  (j) => j.cancelFee === Math.min(Math.round(soonBooking.amount * 0.1), 100));
await expect("restore schedule settings", call("PATCH", "/admin/settings", { rideScheduleMinMinutes: s0.rideScheduleMinMinutes, rideScheduleFreeCancelMinutes: s0.rideScheduleFreeCancelMinutes }, T), 200);
await expect("restore ride settings", call("PATCH", "/admin/settings", {
  surgeMultiplier: s0.surgeMultiplier, surgeCap: s0.surgeCap, surgeHours: s0.surgeHours,
  rideCancelFreeMinutes: s0.rideCancelFreeMinutes, rideCancelFeePercent: s0.rideCancelFeePercent, rideCancelFeeCap: s0.rideCancelFeeCap,
}, T), 200, (j) => j.surgeMultiplier === s0.surgeMultiplier && j.rideCancelFreeMinutes === s0.rideCancelFreeMinutes);

// ── Licence reviews ── (the customer's licence is pending from the settings test above)
await expect("GET /admin/licences lists pending first", call("GET", "/admin/licences", null, T), 200, (j) => j.some((l) => l.customer.id === cMe.id && l.status === "pending" && l.number));
await expect("reject needs a reason", call("POST", `/admin/licences/${cMe.id}/reject`, { reason: "no" }, T), 400);
await expect("reject a licence", call("POST", `/admin/licences/${cMe.id}/reject`, { reason: "Photo is blurry, please resubmit" }, T), 200, (j) => j.status === "rejected");
await expect("customer sees the rejection and reason", call("GET", "/auth/me", null, C), 200, (j) => j.licence.status === "rejected" && j.licence.note === "Photo is blurry, please resubmit");
await expect("rejected list shows it", call("GET", "/admin/licences?status=rejected", null, T), 200, (j) => j.some((l) => l.customer.id === cMe.id && l.note));
await expect("a reviewed licence can't be reviewed again", call("POST", `/admin/licences/${cMe.id}/approve`, null, T), 409);
await expect("customer resubmits", call("PUT", "/me/licence", licence, C), 200, (j) => j.licence.status === "pending" && j.licence.note === null);
await expect("approve a licence", call("POST", `/admin/licences/${cMe.id}/approve`, null, T), 200, (j) => j.status === "verified");
await expect("licence decisions are notified (rejected, then verified)", call("GET", "/me/notifications", null, C), 200,
  (j) => j.items.some((n) => n.kind === "licence.rejected" && /blurry/.test(n.body)) && j.items.some((n) => n.kind === "licence.approved"));
await expect("customer sees it verified", call("GET", "/auth/me", null, C), 200, (j) => j.licence.status === "verified");
await expect("audit records licence decisions", call("GET", `/admin/audit?entity=licence&entityId=${cMe.id}`, null, T), 200,
  (j) => j.items.some((e) => e.action === "licence.approve") && j.items.some((e) => e.action === "licence.reject" && e.detail.reason));
await expect("unknown customer licence is 404", call("POST", "/admin/licences/UNOPE/approve", null, T), 404);
// Service and feature switches: everything off at once, each refusal checked, then restored.
const switches0 = (await call("GET", "/admin/settings", null, T)).json;
const SWITCHES_OFF = {
  serviceBus: false, servicePausedMessage: "Bus tickets are paused (smoke test).",
  featureRideScheduling: false, featureMultiStop: false, featureCashRides: false, featureOutstation: false,
  featureSelfDrive: false, featureTripOffers: false, featureReferral: false, featureRidePass: false, featureWomenOnlyRides: false,
};
await expect("the paused message can't be blank", call("PATCH", "/admin/settings", { servicePausedMessage: " " }, T), 400);
await expect("switch a service and every feature off", call("PATCH", "/admin/settings", SWITCHES_OFF, T), 200, (j) => j.serviceBus === false && j.featureReferral === false);
// Always switch back, even if a check below crashes (this also runs against production).
try {
await eventually("switches reach the API", () => call("GET", "/config"), (r) => r.json?.settings?.serviceBus === false && r.json.settings.featureCashRides === false);
const swVehicles = (await call("GET", "/rentals/travel-vehicles")).json;
const swCfg = (await call("GET", "/config")).json;
const swBuses = (await call("GET", `/buses?from=Chennai&to=Bengaluru&date=${TRAVEL}`)).json;
await expect("a paused service quotes nothing, with the owner's message", call("POST", "/quotes", { service: "bus", from: "Chennai", to: "Bengaluru", date: TRAVEL, busId: swBuses[0]?.id ?? "x", seatIds: ["L1"] }, C), 409,
  (j) => j.message === SWITCHES_OFF.servicePausedMessage);
const rideBase = { optionId: "mini", pickupId: places[0].id, dropId: places[1].id };
const ahead = new Date(Date.now() + 330 * 60_000 + 3 * 3600_000).toISOString().slice(0, 13) + ":00";
await expect("booking rides ahead is refused when off", call("POST", "/rides", { ...rideBase, payment: "upi", scheduledFor: ahead }, C), 409, (j) => /ahead/.test(j.message));
await expect("extra stops are refused when off", call("POST", "/rides", { ...rideBase, payment: "upi", stopIds: [places[2].id] }, C), 409, (j) => /stops/.test(j.message));
await expect("cash rides are refused when off", call("POST", "/rides", { ...rideBase, payment: "cash" }, C), 409, (j) => /Cash/.test(j.message));
const okRide = await expect("a plain UPI ride still books", call("POST", "/rides", { ...rideBase, payment: "upi" }, C), 201);
await expect("self-drive is refused when off", call("POST", "/quotes", rentReq, C), 409, (j) => /Self-drive/.test(j.message));
await expect("chauffeur rentals still quote", call("POST", "/quotes", { ...rentReq, mode: "driver" }, C), 201);
await expect("one-way trips are refused when outstation is off", call("POST", "/quotes", { service: "rentals", vehicleId: swVehicles[0].id, trip: "oneway", destinationId: swCfg.groupDestinations[0].id, days: 1, start: TRAVEL }, C), 409, (j) => /Outstation/.test(j.message));
await expect("local group trips still quote", call("POST", "/quotes", { service: "rentals", vehicleId: swVehicles[0].id, trip: "local", days: 1, start: TRAVEL }, C), 201);
const anyBooking = [].concat((await call("GET", "/bookings", null, C)).json ?? []).find((b) => b.status !== "cancelled");
if (anyBooking) {
  await expect("joining a trip is refused when trip offers are off", call("POST", "/bookings", { service: "car", title: "Smoke", subtitle: "A → B", payment: "upi", lines: [], rideId: okRide.id, tripOf: anyBooking.id }, C), 409, (j) => /trip/.test(j.message));
}
await expect("referral codes are refused when off", call("POST", "/me/referral", { code: "QFZZZZZZ9" }, C), 409, (j) => /Refer/.test(j.message));
await expect("QuikFly Pass isn't sold when off", call("POST", "/me/pass", null, C), 409, (j) => /isn't on sale/.test(j.message));
await expect("women-only rides are refused when off", call("POST", "/rides", { optionId: "pink", pickupId: places[0].id, dropId: places[1].id, payment: "upi" }, C), 409, (j) => /paused/.test(j.message));
if (okRide) await call("POST", `/rides/${okRide.id}/cancel`, null, C);
} finally {
const restore = Object.fromEntries(Object.keys(SWITCHES_OFF).map((k) => [k, switches0[k]]));
await expect("restore the switches", call("PATCH", "/admin/settings", restore, T), 200, (j) => j.serviceBus === switches0.serviceBus && j.featureReferral === switches0.featureReferral);
await eventually("restored switches reach the API", () => call("GET", "/config"), (r) => r.json?.settings?.serviceBus === switches0.serviceBus && r.json.settings.featureCashRides === switches0.featureCashRides);
}
// QuikFly Pass dearer than the wallet: refused, nothing taken; the price is put back.
const cBefore = (await call("GET", "/auth/me", null, C)).json;
if (switches0.featureRidePass && cBefore.walletBalance < 2000) {
  await expect("set the pass price to ₹2,000", call("PATCH", "/admin/settings", { passPrice: 2000 }, T), 200, (j) => j.passPrice === 2000);
  try {
    await eventually("the new pass price reaches the API", () => call("GET", "/config"), (r) => r.json?.settings?.passPrice === 2000);
    await expect("a pass the wallet can't cover is refused", call("POST", "/me/pass", null, C), 409, (j) => /wallet has/.test(j.message));
    await expect("nothing was taken", call("GET", "/auth/me", null, C), 200, (j) => j.walletBalance === cBefore.walletBalance && j.passUntil === cBefore.passUntil);
  } finally {
    await expect("restore the pass price", call("PATCH", "/admin/settings", { passPrice: switches0.passPrice }, T), 200, (j) => j.passPrice === switches0.passPrice);
  }
}
await call("POST", "/me/delete", { otp: OTP }, C);

// Partner (vendor) review: sections, changes, approval, onboarding, going live
const PV = (await call("POST", "/auth/verify", { phone: "7" + String(Date.now()).slice(-9), otp: OTP })).json.token;
await call("PATCH", "/me", { name: "Smoke Vendor" }, PV);
await call("POST", "/vendor", null, PV);
const pvReg = randomReg();
await call("PUT", "/vendor/sections/vehicle", { city: "Chennai", type: "tempo", fuel: "petrol_diesel", regNumber: pvReg, purchaseDate: dayOffset(-500) }, PV);
await call("PUT", "/vendor/sections/bank", { holder: "Smoke Vendor", account: "998877665544", ifsc: "HDFC0001234" }, PV);
await call("PUT", "/vendor/sections/rc", { ownerName: "Smoke Vendor", validTill: dayOffset(400) }, PV);
await call("PUT", "/vendor/sections/insurance", { insurer: "Smoke General", policyNumber: "TT-55667788", validTill: dayOffset(300) }, PV);
await call("PUT", "/vendor/sections/audit", { date: dayOffset(2), slot: "morning" }, PV);
const pvUp = await upload("/vendor/documents/photo", JPEG, PV);
if (pvUp.status === 409) {
  console.log("SKIP  partner review (R2 not switched on for this API)");
} else {
  await upload("/vendor/documents/rc", JPEG, PV);
  await upload("/vendor/documents/insurance", JPEG, PV);
  const sent = await expect("partner sends the application", call("POST", "/vendor/submit", null, PV), 200, (j) => j.status === "submitted");
  const vid = sent?.id;
  await expect("GET /admin/vendors lists it (oldest first)", call("GET", "/admin/vendors", null, T), 200, (j) => j.some((x) => x.id === vid && x.vehicle.regNumber === pvReg && x.open === 6));
  await expect("bad status filter is refused", call("GET", "/admin/vendors?status=nope", null, T), 400);
  await expect("staff see the full bank account", call("GET", `/admin/vendors/${vid}`, null, T), 200, (j) => j.bankAccount === "998877665544" && j.application.bank.accountLast4 === "5544");
  const doc = await fetch(BASE + `/admin/vendors/${vid}/documents/rc`, { headers: { Authorization: `Bearer ${T}` } });
  check("staff can open the RC photo", doc.status === 200 && doc.headers.get("content-type") === "image/jpeg", String(doc.status));
  await expect("sending a section back needs a note", call("POST", `/admin/vendors/${vid}/sections/rc`, { decision: "changes" }, T), 400);
  await expect("approve can't happen with open sections", call("POST", `/admin/vendors/${vid}/review`, { decision: "approve" }, T), 409);
  for (const s of ["vehicle", "photo", "bank", "insurance", "audit"]) await call("POST", `/admin/vendors/${vid}/sections/${s}`, { decision: "approve" }, T);
  await expect("send the RC back with a note", call("POST", `/admin/vendors/${vid}/sections/rc`, { decision: "changes", note: "RC photo is blurry, please retake" }, T), 200,
    (j) => j.application.sections.rc.state === "changes" && j.application.sections.audit.state === "approved" && j.application.vehicle.audit.result === "passed");
  await expect("return the application for changes", call("POST", `/admin/vendors/${vid}/review`, { decision: "changes" }, T), 200, (j) => j.application.status === "draft");
  await expect("the partner is told what to fix", call("GET", "/me/notifications", null, PV), 200, (j) => j.items.some((n) => n.kind === "vendor.changes" && /registration certificate/.test(n.body)));
  await expect("the partner sees the staff note", call("GET", "/vendor", null, PV), 200, (j) => j.application.sections.rc.note === "RC photo is blurry, please retake");
  await upload("/vendor/documents/rc", JPEG, PV);
  await expect("partner resends", call("POST", "/vendor/submit", null, PV), 200, (j) => j.status === "submitted" && j.sections.rc.state === "filled" && j.sections.bank.state === "approved");
  await call("POST", `/admin/vendors/${vid}/sections/rc`, { decision: "approve" }, T);
  await expect("approve the application", call("POST", `/admin/vendors/${vid}/review`, { decision: "approve" }, T), 200,
    (j) => j.application.status === "onboarding" && j.application.onboarding.fee === s0.vendorJoiningFee);
  await expect("agreement waits for the joining fee", call("POST", "/vendor/onboarding/agreement", { name: "Smoke Vendor", accept: true }, PV), s0.vendorJoiningFee ? 409 : 200);
  await expect("pay the joining fee (demo)", call("POST", "/vendor/onboarding/payment", null, PV), 200, (j) => !!j.onboarding.paidAt);
  await expect("sticker waits for the agreement", call("POST", "/vendor/onboarding/sticker", null, PV), 409);
  await expect("the agreement needs the tick", call("POST", "/vendor/onboarding/agreement", { name: "Smoke Vendor" }, PV), 400);
  await expect("accept the agreement", call("POST", "/vendor/onboarding/agreement", { name: "Smoke Vendor", accept: true }, PV), 200, (j) => !!j.onboarding.agreementAt);
  await expect("ask for sticker and paint", call("POST", "/vendor/onboarding/sticker", null, PV), 200, (j) => !!j.onboarding.stickerRequestedAt);
  await expect("staff mark sticker done: partner goes live", call("POST", `/admin/vendors/${vid}/sticker`, null, T), 200,
    (j) => j.application.status === "active" && j.application.vehicle.status === "active");
  await expect("the partner is told they're live", call("GET", "/me/notifications", null, PV), 200, (j) => j.items.some((n) => n.kind === "vendor.active"));

  // Fleet (part 2): add a vehicle, drivers, renewals, blocks
  await expect("the live partner's fleet has the first vehicle", call("GET", "/vendor/fleet", null, PV), 200,
    (j) => j.vehicles.length === 1 && j.vehicles[0].status === "active" && j.drivers.length === 0);
  await expect("a duplicate registration is refused", call("POST", "/vendor/vehicles", { type: "car", fuel: "petrol_diesel", regNumber: pvReg, purchaseDate: dayOffset(-100) }, PV), 409);
  const reg2 = randomReg();
  const added = await expect("add a second vehicle (draft)", call("POST", "/vendor/vehicles", { type: "bus", fuel: "petrol_diesel", regNumber: reg2, purchaseDate: dayOffset(-300) }, PV), 201,
    (j) => j.vehicles.some((v) => v.regNumber === reg2 && v.status === "draft"));
  const v2 = added.vehicles.find((v) => v.regNumber === reg2).id;
  await expect("an incomplete vehicle can't be sent", call("POST", `/vendor/vehicles/${v2}/submit`, null, PV), 400, (j) => /RC/.test(j.message));
  await call("PUT", `/vendor/vehicles/${v2}/rc`, { ownerName: "Smoke Vendor", validTill: dayOffset(500) }, PV);
  await call("PUT", `/vendor/vehicles/${v2}/insurance`, { insurer: "Smoke General", policyNumber: "BUS-445566", validTill: dayOffset(300) }, PV);
  await call("PUT", `/vendor/vehicles/${v2}/audit`, { date: dayOffset(3), slot: "afternoon" }, PV);
  await upload(`/vendor/vehicles/${v2}/documents/rc`, JPEG, PV);
  await upload(`/vendor/vehicles/${v2}/documents/insurance`, JPEG, PV);
  await expect("send the vehicle for review", call("POST", `/vendor/vehicles/${v2}/submit`, null, PV), 200, (j) => j.vehicles.find((v) => v.id === v2).status === "submitted");
  await expect("a vehicle under review can't be edited", call("PUT", `/vendor/vehicles/${v2}/details`, { type: "bus", fuel: "petrol_diesel", regNumber: reg2, purchaseDate: dayOffset(-300) }, PV), 409);
  await expect("the fleet queue shows it", call("GET", "/admin/vendors/fleet-queue", null, T), 200, (j) => j.some((x) => x.id === v2 && x.kind === "vehicle" && x.vendorId === vid));
  await expect("sending a vehicle back needs a note", call("POST", `/admin/vendors/${vid}/vehicles/${v2}/review`, { decision: "changes" }, T), 400);
  await expect("send the vehicle back", call("POST", `/admin/vendors/${vid}/vehicles/${v2}/review`, { decision: "changes", note: "Insurance photo is blurry" }, T), 200,
    (j) => j.fleet.vehicles.find((v) => v.id === v2).status === "draft");
  await expect("the partner sees the note", call("GET", "/vendor/fleet", null, PV), 200, (j) => j.vehicles.find((v) => v.id === v2).reviewNote === "Insurance photo is blurry");
  await upload(`/vendor/vehicles/${v2}/documents/insurance`, JPEG, PV);
  await call("POST", `/vendor/vehicles/${v2}/submit`, null, PV);
  await expect("approve the vehicle", call("POST", `/admin/vendors/${vid}/vehicles/${v2}/review`, { decision: "approve" }, T), 200,
    (j) => j.fleet.vehicles.find((v) => v.id === v2).status === "approved" && j.fleet.vehicles.find((v) => v.id === v2).audit.result === "passed");
  await expect("approved vehicles wait for sticker in the queue", call("GET", "/admin/vendors/fleet-queue", null, T), 200, (j) => j.some((x) => x.id === v2 && x.kind === "vehicle_sticker"));
  await expect("sticker done: the vehicle goes live", call("POST", `/admin/vendors/${vid}/vehicles/${v2}/sticker`, null, T), 200, (j) => j.fleet.vehicles.find((v) => v.id === v2).status === "active");
  await expect("take it off duty", call("PATCH", `/vendor/vehicles/${v2}`, { active: false }, PV), 200, (j) => j.vehicles.find((v) => v.id === v2).status === "inactive");
  await expect("and back on", call("PATCH", `/vendor/vehicles/${v2}`, { active: true }, PV), 200, (j) => j.vehicles.find((v) => v.id === v2).status === "active");
  // Drivers
  const dl1 = `TN09${new Date().getFullYear() - 5}${String(Date.now()).slice(-7)}`;
  const dl2 = `TN10${new Date().getFullYear() - 3}${String(Date.now() + 5).slice(-7)}`;
  await expect("a bad licence number is refused", call("POST", "/vendor/drivers", { self: true, dlNumber: "12345", dlValidTill: dayOffset(900) }, PV), 400);
  const withSelf = await expect("the partner registers themselves as a driver", call("POST", "/vendor/drivers", { self: true, dlNumber: dl1, dlValidTill: dayOffset(900) }, PV), 201,
    (j) => j.drivers.some((d) => d.self && d.name === "Smoke Vendor" && d.status === "submitted"));
  const d1 = withSelf.drivers.find((d) => d.self).id;
  await expect("only one self driver", call("POST", "/vendor/drivers", { self: true, dlNumber: dl2, dlValidTill: dayOffset(900) }, PV), 409);
  await expect("a duplicate licence is refused", call("POST", "/vendor/drivers", { name: "Copy Cat", phone: "9123456780", dlNumber: dl1, dlValidTill: dayOffset(900) }, PV), 409);
  await expect("a driver needs a 10-digit phone", call("POST", "/vendor/drivers", { name: "Ravi Kumar", phone: "123", dlNumber: dl2, dlValidTill: dayOffset(900) }, PV), 400);
  const withRavi = await expect("add a driver", call("POST", "/vendor/drivers", { name: "Ravi Kumar", phone: "91234 56780", dlNumber: dl2, dlValidTill: dayOffset(20) }, PV), 201,
    (j) => j.drivers.some((d) => d.name === "Ravi Kumar" && d.phone === "+91 9123456780"));
  const d2 = withRavi.drivers.find((d) => d.name === "Ravi Kumar").id;
  await expect("an unapproved driver can't be assigned", call("POST", `/vendor/drivers/${d1}/assign`, { vehicleId: v2 }, PV), 409);
  await expect("approving needs police verification and training", call("POST", `/admin/vendors/${vid}/drivers/${d1}/review`, { decision: "approve" }, T), 400, (j) => /police/.test(j.message));
  await expect("approving needs the licence photo", call("POST", `/admin/vendors/${vid}/drivers/${d1}/review`, { decision: "approve", policeVerified: true, trainingDone: true }, T), 409);
  await upload(`/vendor/drivers/${d1}/documents/dl`, JPEG, PV);
  await upload(`/vendor/drivers/${d2}/documents/dl`, JPEG, PV);
  await expect("the fleet queue shows new drivers", call("GET", "/admin/vendors/fleet-queue", null, T), 200, (j) => j.some((x) => x.id === d1 && x.kind === "driver"));
  const dlDoc = await fetch(BASE + `/admin/vendors/${vid}/drivers/${d1}/documents/dl`, { headers: { Authorization: `Bearer ${T}` } });
  check("staff can open the licence photo", dlDoc.status === 200, String(dlDoc.status));
  await expect("approve a driver", call("POST", `/admin/vendors/${vid}/drivers/${d1}/review`, { decision: "approve", policeVerified: true, trainingDone: true }, T), 200,
    (j) => { const d = j.fleet.drivers.find((x) => x.id === d1); return d.status === "active" && !!d.policeVerifiedAt && !!d.trainingDoneAt; });
  await call("POST", `/admin/vendors/${vid}/drivers/${d2}/review`, { decision: "approve", policeVerified: true, trainingDone: true }, T);
  await expect("assign a driver to a vehicle", call("POST", `/vendor/drivers/${d1}/assign`, { vehicleId: v2 }, PV), 200,
    (j) => j.drivers.find((d) => d.id === d1).vehicleId === v2 && j.vehicles.find((v) => v.id === v2).driverId === d1);
  await expect("assigning another driver takes the first off", call("POST", `/vendor/drivers/${d2}/assign`, { vehicleId: v2 }, PV), 200,
    (j) => j.drivers.find((d) => d.id === d2).vehicleId === v2 && j.drivers.find((d) => d.id === d1).vehicleId === null);
  // Renewals and blocks
  await expect("renew the insurance of a live vehicle", call("PUT", `/vendor/vehicles/${v2}/insurance`, { insurer: "Smoke General", policyNumber: "BUS-445577", validTill: dayOffset(600) }, PV), 200,
    (j) => j.vehicles.find((v) => v.id === v2).docsPending && j.vehicles.find((v) => v.id === v2).status === "active");
  await expect("renewals show in the fleet queue", call("GET", "/admin/vendors/fleet-queue", null, T), 200, (j) => j.some((x) => x.id === v2 && x.kind === "vehicle_docs"));
  await expect("accept the renewal", call("POST", `/admin/vendors/${vid}/vehicles/${v2}/docs`, { decision: "approve" }, T), 200, (j) => !j.fleet.vehicles.find((v) => v.id === v2).docsPending);
  await expect("blocking needs a reason", call("POST", `/admin/vendors/${vid}/vehicles/${v2}/block`, { block: true }, T), 400);
  await expect("block a vehicle", call("POST", `/admin/vendors/${vid}/vehicles/${v2}/block`, { block: true, note: "Customer complaint under review" }, T), 200,
    (j) => j.fleet.vehicles.find((v) => v.id === v2).status === "blocked");
  await expect("a blocked vehicle can't be put on duty by the partner", call("PATCH", `/vendor/vehicles/${v2}`, { active: true }, PV), 409);
  await expect("unblock it", call("POST", `/admin/vendors/${vid}/vehicles/${v2}/block`, { block: false }, T), 200, (j) => j.fleet.vehicles.find((v) => v.id === v2).status === "active");
  await expect("block a driver (taken off the vehicle)", call("POST", `/admin/vendors/${vid}/drivers/${d2}/block`, { block: true, note: "Licence check failed" }, T), 200,
    (j) => { const d = j.fleet.drivers.find((x) => x.id === d2); return d.status === "blocked" && d.vehicleId === null; });
  await expect("unblock the driver", call("POST", `/admin/vendors/${vid}/drivers/${d2}/block`, { block: false }, T), 200, (j) => j.fleet.drivers.find((x) => x.id === d2).status === "active");
  if (LOCAL) {
    // Ravi's licence runs out in 20 days, inside the warning window: the cron warns once.
    await fetch(BASE.replace(/\/v1$/, "") + "/__scheduled?cron=*+*+*+*+*");
    await fetch(BASE.replace(/\/v1$/, "") + "/__scheduled?cron=*+*+*+*+*");
    await expect("the cron warns once about an expiring licence", call("GET", "/me/notifications", null, PV), 200,
      (j) => j.items.filter((n) => n.kind === "vendor.document" && /Ravi Kumar/.test(n.body)).length === 1);
  }
  const junk = randomReg();
  const withJunk = (await call("POST", "/vendor/vehicles", { type: "car", fuel: "electric", regNumber: junk, purchaseDate: dayOffset(-30) }, PV)).json;
  const junkId = withJunk.vehicles.find((v) => v.regNumber === junk).id;
  await expect("a draft vehicle can be removed", call("DELETE", `/vendor/vehicles/${junkId}`, null, PV), 200, (j) => !j.vehicles.some((v) => v.id === junkId));
  await expect("a live vehicle can't be removed", call("DELETE", `/vendor/vehicles/${v2}`, null, PV), 409);
  await expect("remove a driver", call("DELETE", `/vendor/drivers/${d2}`, null, PV), 200, (j) => !j.drivers.some((d) => d.id === d2));
  await expect("fleet decisions are audited", call("GET", `/admin/audit?entity=vendor&entityId=${vid}`, null, T), 200,
    (j) => ["vendor.vehicle.approve", "vendor.vehicle.activate", "vendor.driver.approve", "vendor.vehicle.block", "vendor.vehicle.docs.approve"].every((a) => j.items.some((e) => e.action === a)));

  // Trips and money (part 3): a partner cab takes rides; completing settles earnings; payouts
  const RC = (await call("POST", "/auth/verify", { phone: "6" + String(Date.now()).slice(-9), otp: OTP })).json.token;
  const regCar = randomReg();
  const withCar = (await call("POST", "/vendor/vehicles", { type: "car", fuel: "cng_lpg", regNumber: regCar, purchaseDate: dayOffset(-150) }, PV)).json;
  const car = withCar.vehicles.find((v) => v.regNumber === regCar).id;
  await call("PUT", `/vendor/vehicles/${car}/rc`, { ownerName: "Smoke Vendor", validTill: dayOffset(900) }, PV);
  await call("PUT", `/vendor/vehicles/${car}/insurance`, { insurer: "Smoke General", policyNumber: "CAR-778899", validTill: dayOffset(300) }, PV);
  await call("PUT", `/vendor/vehicles/${car}/audit`, { date: dayOffset(2), slot: "morning" }, PV);
  await upload(`/vendor/vehicles/${car}/documents/rc`, JPEG, PV);
  await upload(`/vendor/vehicles/${car}/documents/insurance`, JPEG, PV);
  await call("POST", `/vendor/vehicles/${car}/submit`, null, PV);
  await call("POST", `/admin/vendors/${vid}/vehicles/${car}/review`, { decision: "approve" }, T);
  await call("POST", `/admin/vendors/${vid}/vehicles/${car}/sticker`, null, T);
  await expect("put the partner's own driver on the cab", call("POST", `/vendor/drivers/${d1}/assign`, { vehicleId: car }, PV), 200, (j) => j.vehicles.find((v) => v.id === car).driverId === d1);
  const carPlate = regCar.replace(/^([A-Z]{2})(\d{2})([A-Z]+)(\d{4})$/, "$1 $2 $3 $4");
  // Other live partner cabs may exist; each booked ride keeps its cab busy, so the next ride tries another.
  const ridesToCancel = [];
  async function partnerRide(payment) {
    for (let i = 0; i < 8; i++) {
      const r = (await call("POST", "/rides", { optionId: "mini", pickupId: places[0].id, dropId: places[1].id, payment }, RC)).json;
      const b = (await call("POST", "/bookings", { service: "car", title: "Smoke partner ride", subtitle: "A → B", payment, lines: [], rideId: r.id }, RC)).json;
      if (r.driver?.plate === carPlate) return { r, b };
      ridesToCancel.push(b.id);
    }
    return null;
  }
  const upiRide = await partnerRide("upi");
  check("a cab ride goes to the live partner cab, with its driver and plate", !!upiRide && upiRide.r.driver.name === "Smoke Vendor", JSON.stringify(upiRide?.r.driver));
  if (upiRide) {
    await expect("the partner sees the trip as an estimate before it's done", call("GET", "/vendor/trips", null, PV), 200,
      (j) => j.some((t) => t.bookingId === upiRide.b.id && t.estimate && t.status === "confirmed" && t.regNumber === regCar));
    await call("POST", `/bookings/${upiRide.b.id}/complete`, null, RC);
    const gross = upiRide.b.amount * 100;
    const fareX = Math.round(gross / (1 + s0.gstRides / 100));
    const earn1 = fareX - Math.round((fareX * s0.vendorCommissionPercent) / 100) - Math.round((gross * 0.1) / 100);
    await expect("completing settles the trip: fare less GST, commission and 0.1% TDS", call("GET", "/vendor/trips", null, PV), 200,
      (j) => { const t = j.find((x) => x.bookingId === upiRide.b.id); return t && !t.estimate && t.earningPaise === earn1 && t.grossPaise === gross && t.gstPaise === gross - fareX; });
    await expect("the dashboard counts it for the cab and the driver", call("GET", "/vendor/summary", null, PV), 200,
      (j) => j.revenue.trips >= 1 && j.vehicles.some((v) => v.vehicleId === car && v.trips === 1) && j.drivers.some((d) => d.driverId === d1));
    await expect("a bad date range is refused", call("GET", "/vendor/summary?from=2026-12-10&to=2026-12-01", null, PV), 400);
    await expect("QuikFly owes the partner the earning", call("GET", "/vendor/money", null, PV), 200,
      (j) => j.balancePaise === earn1 && j.entries[0].kind === "earning" && j.statements.length >= 1 && j.pendingPayout === null);
    await expect("payouts wait for the minimum", call("POST", "/vendor/payouts", null, PV), s0.vendorMinPayout * 100 > earn1 ? 409 : 201);
    await call("PATCH", "/admin/settings", { vendorMinPayout: 1 }, T);
    await eventually("the lower minimum reaches the API", () => call("GET", "/config"), (r) => r.json?.settings?.vendorMinPayout === 1);
    const req = await expect("request a payout", call("POST", "/vendor/payouts", null, PV), 201, (j) => j.pendingPayout?.amountPaise === earn1);
    await expect("only one open request", call("POST", "/vendor/payouts", null, PV), 409);
    await expect("staff see it with the bank account", call("GET", "/admin/vendors/payouts", null, T), 200,
      (j) => j.some((x) => x.id === req.pendingPayout.id && x.bank?.account === "998877665544"));
    await expect("paying needs the bank reference", call("POST", `/admin/vendors/payouts/${req.pendingPayout.id}`, { decision: "paid" }, T), 400);
    await expect("mark it paid", call("POST", `/admin/vendors/payouts/${req.pendingPayout.id}`, { decision: "paid", reference: "UTR20261118001" }, T), 200, (j) => !j.some((x) => x.id === req.pendingPayout.id));
    await expect("the ledger records the payout", call("GET", "/vendor/money", null, PV), 200,
      (j) => j.balancePaise === 0 && j.entries[0].kind === "payout" && j.payouts[0].status === "paid" && j.payouts[0].reference === "UTR20261118001");
    await expect("the partner is told it was paid", call("GET", "/me/notifications", null, PV), 200, (j) => j.items.some((n) => n.kind === "vendor.payout"));
    await call("PATCH", "/admin/settings", { vendorMinPayout: s0.vendorMinPayout }, T);
    const cashRide = await partnerRide("cash");
    if (cashRide) {
      await call("POST", `/bookings/${cashRide.b.id}/complete`, null, RC);
      await expect("on a cash ride the partner owes QuikFly what the driver kept, less the earning", call("GET", "/vendor/money", null, PV), 200,
        (j) => j.balancePaise < 0 && j.entries.some((e) => e.kind === "cash" && e.amountPaise === -cashRide.b.amount * 100));
      await expect("pay what's owed (demo)", call("POST", "/vendor/payments", null, PV), 200, (j) => j.balancePaise === 0 && j.entries[0].kind === "payment");
      await expect("nothing more to pay", call("POST", "/vendor/payments", null, PV), 409);
    }
  }
  for (const id of ridesToCancel) await call("POST", `/bookings/${id}/cancel`, null, RC);
  // Staff give a group-travel booking to a partner vehicle
  const gv = (await call("GET", "/rentals/travel-vehicles")).json;
  const gq = (await call("POST", "/quotes", { service: "rentals", vehicleId: gv[0].id, trip: "local", days: 1, start: TRAVEL }, RC)).json;
  const gb = (await call("POST", "/bookings", { service: "rentals", title: "Smoke group trip", subtitle: "Chennai local", payment: "upi", lines: [], quoteId: gq.id }, RC)).json;
  await expect("assignable vehicles include the partner cab", call("GET", "/admin/vendors/assignable-vehicles", null, T), 200, (j) => j.some((v) => v.vehicleId === car && v.driverId === d1));
  if (upiRide) await expect("rides can't be assigned by staff", call("POST", `/admin/bookings/${upiRide.b.id}/vendor`, { vehicleId: car }, T), 409);
  await expect("assign the group trip to the partner cab", call("POST", `/admin/bookings/${gb.id}/vendor`, { vehicleId: car }, T), 200,
    (j) => j.partner?.vehicleId === car && j.partner.driverName === "Smoke Vendor");
  await expect("the partner is told about the new trip", call("GET", "/me/notifications", null, PV), 200, (j) => j.items.some((n) => n.kind === "vendor.trip" && n.body.includes("Smoke group trip")));
  await call("POST", `/admin/bookings/${gb.id}/complete`, null, T);
  await expect("the completed group trip settles for the partner", call("GET", "/vendor/trips", null, PV), 200,
    (j) => j.some((t) => t.bookingId === gb.id && !t.estimate && t.service === "rentals" && t.earningPaise > 0));
  await call("POST", "/me/delete", { otp: OTP }, RC);
  await expect("vendor decisions are audited", call("GET", `/admin/audit?entity=vendor&entityId=${vid}`, null, T), 200,
    (j) => ["vendor.approve", "vendor.changes", "vendor.activate", "vendor.section.changes"].every((a) => j.items.some((e) => e.action === a)));
  // Rejection path with a second partner
  const RV = (await call("POST", "/auth/verify", { phone: "7" + String(Date.now() + 3).slice(-9), otp: OTP })).json.token;
  await call("POST", "/vendor", null, RV);
  await call("PUT", "/vendor/sections/vehicle", { city: "Chennai", type: "bus", fuel: "petrol_diesel", regNumber: randomReg(), purchaseDate: dayOffset(-200) }, RV);
  await call("PUT", "/vendor/sections/bank", { holder: "Reject Me", account: "112233445566", ifsc: "ICIC0001234" }, RV);
  await call("PUT", "/vendor/sections/rc", { ownerName: "Reject Me", validTill: dayOffset(400) }, RV);
  await call("PUT", "/vendor/sections/insurance", { insurer: "Smoke General", policyNumber: "BB-11223344", validTill: dayOffset(300) }, RV);
  await call("PUT", "/vendor/sections/audit", { date: dayOffset(2), slot: "morning" }, RV);
  for (const k of ["photo", "rc", "insurance"]) await upload(`/vendor/documents/${k}`, JPEG, RV);
  const rv = (await call("POST", "/vendor/submit", null, RV)).json;
  await expect("rejecting needs a reason", call("POST", `/admin/vendors/${rv.id}/review`, { decision: "reject" }, T), 400);
  await expect("reject an application", call("POST", `/admin/vendors/${rv.id}/review`, { decision: "reject", note: "Permit not valid for this route (smoke)" }, T), 200, (j) => j.application.status === "rejected");
  await expect("the partner sees why", call("GET", "/vendor", null, RV), 200, (j) => j.application.status === "rejected" && /Permit/.test(j.application.note));
  await expect("a partner who isn't live can't add vehicles", call("POST", "/vendor/vehicles", { type: "car", fuel: "petrol_diesel", regNumber: randomReg(), purchaseDate: dayOffset(-100) }, RV), 409);
  await call("POST", "/me/delete", { otp: OTP }, RV);
}
await call("POST", "/me/delete", { otp: OTP }, PV);

if (LOCAL) {
  // Roles
  const content = await expect("login: content role", login(CONTENT), 200, (j) => j.admin.role === "content");
  await expect("content can see the dashboard", call("GET", "/admin/stats", null, content.token), 200);
  await expect("content can read settings", call("GET", "/admin/settings", null, content.token), 200);
  await expect("content can't change settings", call("PATCH", "/admin/settings", { licenceAutoApprove: true }, content.token), 403);
  await expect("content can't read the audit log", call("GET", "/admin/audit", null, content.token), 403);
  await expect("content can edit the catalog", call("GET", "/admin/catalog/faq", null, content.token), 200);
  await expect("content can't reset the catalog", call("POST", "/admin/catalog/reset", null, content.token), 403);
  await expect("content can't see bookings", call("GET", "/admin/bookings", null, content.token), 403);
  await expect("content can't review licences", call("GET", "/admin/licences", null, content.token), 403);
  await expect("content can't review partners", call("GET", "/admin/vendors", null, content.token), 403);

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
