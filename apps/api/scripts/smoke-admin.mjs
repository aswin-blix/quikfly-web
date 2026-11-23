// End-to-end check of the /admin endpoints. Usage:
//   node scripts/smoke-admin.mjs                         local API; creates its own test admins (needs wrangler + local D1)
//   node scripts/smoke-admin.mjs <baseUrl> <email> <password>   any API, with an existing owner account
// Lockout and role checks run only in local mode, so a real owner account is never locked.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const BASE = (process.argv[2] || "http://localhost:8787/v1").replace(/\/$/, "");
const LOCAL = !process.argv[3];
const OWNER = { email: process.argv[3] || "smoke-owner@quikfly.test", password: process.argv[4] || "SmokeOwner-12345" };
const CONTENT = { email: "smoke-content@quikfly.test", password: "SmokeContent-12345" };
const LOCKME = { email: "smoke-lock@quikfly.test", password: "SmokeLock-12345" };
const CUSTOMER_PHONE = "9000000002";
const OTP = "1234";

let failed = 0;
const check = (name, ok, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`); };

// These tests act as a client that can show parcels (CLIENT_ACCEPT in packages/shared/src/clients.ts);
// OLD_CLIENT is what app 0.1.16 and any other client from before that rule sends.
const SHOWS_PARCELS = "application/json; services=parcel";
const OLD_CLIENT = "application/json";
async function call(method, path, body, token = "", accept = SHOWS_PARCELS) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", Accept: accept, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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

/** Local D1 only: moves a parcel's hold into the past, the one state a test can't wait a day for. */
function endHold(id) {
  if (!LOCAL || !/^[A-Z0-9]+$/i.test(id)) throw new Error("endHold is for local test parcels only");
  const sql = `UPDATE parcels SET hold_until = '${new Date(Date.now() - 60_000).toISOString()}' WHERE booking_id = '${id}'`;
  return spawnSync(`npx wrangler d1 execute quikfly-db --local --command "${sql}"`, { shell: true, stdio: "ignore", cwd: new URL("..", import.meta.url) }).status === 0;
}

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

/**
 * Every admin route as the source declares it. A counter login must be refused on all but its few, so a route
 * added later is covered without listing it here.
 */
function adminRoutes() {
  const dir = new URL("../src/routes/admin/", import.meta.url);
  const source = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => [f, readFileSync(new URL(f, dir), "utf8")]));
  const bases = Object.fromEntries([...source["index.ts"].matchAll(/\.route\("([^"]+)",\s*(\w+)\)/g)].map((m) => [m[2], m[1]]));
  const routes = [];
  for (const text of Object.values(source)) {
    // Each router is `export const name = new Hono...` followed by its routes.
    for (const part of text.split(/export const /).slice(1)) {
      const name = /^(\w+)/.exec(part)[1];
      if (name !== "admin" && !(name in bases)) continue;
      for (const m of part.matchAll(/\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
        routes.push({ method: m[1].toUpperCase(), path: `/admin${name === "admin" ? "" : bases[name]}${m[2] === "/" ? "" : m[2]}` });
      }
    }
  }
  return routes;
}

/** A counter login: one operator, one city, its own end's moves, and nothing else in the panel. */
async function counterChecks({ options, base, newPhone }) {
  const make = async (city) => {
    const email = `counter-${city.toLowerCase()}-${Date.now()}@quikfly.test`;
    const made = await expect(`counter: an account for ${city}`, call("POST", "/admin/team",
      { email, name: "Smoke Counter", role: "counter", counter: { operatorId: "bo1", city: city.toLowerCase() } }, T), 201,
    (j) => j.member.role === "counter" && j.member.counter.city === city && j.member.counter.operatorId === "bo1");
    return { id: made.member.id, email, password: made.password, token: (await login({ email, password: made.password })).json.token };
  };
  const account = { email: `counter-bad-${Date.now()}@quikfly.test`, name: "Smoke Counter", role: "counter" };
  await expect("counter: needs a counter", call("POST", "/admin/team", account, T), 400);
  await expect("counter: needs a real one", call("POST", "/admin/team", { ...account, counter: { operatorId: "bo1", city: "Salem" } }, T), 400);
  await expect("counter: needs a real operator", call("POST", "/admin/team", { ...account, counter: { operatorId: "nope", city: "Chennai" } }, T), 400);
  await expect("counter: other roles take none", call("POST", "/admin/team", { ...account, role: "operations", counter: { operatorId: "bo1", city: "Chennai" } }, T), 400);

  const from = await make("Chennai"), to = await make("Coimbatore"), elsewhere = await make("Madurai");
  await expect("counter: it knows where it works", call("GET", "/admin/auth/me", null, from.token), 200, (j) => j.role === "counter" && j.counter.city === "Chennai");

  const sender = (await call("POST", "/auth/verify", { phone: newPhone(), otp: OTP })).json.token;
  const book = async (patch = {}) => {
    const q = (await call("POST", "/quotes", { ...base, ...patch })).json;
    const b = await call("POST", "/bookings", { service: "parcel", title: "x", subtitle: "x", payment: "upi", lines: [], quoteId: q.id,
      receiver: { name: "Counter Receiver", phone: "9000000002" }, contents: "Counter test box", declaration: options.declaration.version }, sender);
    return b.json;
  };
  const b = await book();
  const places = (await call("GET", "/config")).json.places;
  const quickQuote = (await call("POST", "/quotes", { service: "parcel", mode: "city", pickupId: places[0].id, dropId: places[1].id, category: "documents", weightBand: "2", size: "backpack", declaredValue: 100 })).json;
  const quick = (await call("POST", "/bookings", { service: "parcel", title: "x", subtitle: "x", payment: "upi", lines: [], quoteId: quickQuote.id,
    receiver: { name: "Counter Receiver", phone: "9000000002" }, contents: "Counter test note", declaration: options.declaration.version }, sender)).json;

  // The sweep
  const allowed = new Set(["POST /admin/auth/login", "POST /admin/auth/logout", "GET /admin/auth/me", "GET /admin/parcels", "GET /admin/parcels/:id", "POST /admin/parcels/:id/legs/:seq"]);
  const routes = adminRoutes().filter((r) => !allowed.has(`${r.method} ${r.path}`));
  check("counter: the sweep found the admin routes", routes.length >= 50, routes.length);
  const open = [];
  for (const r of routes) {
    const path = r.path.replace(":kind", "parcelCounter").replace(":id", b.id).replace(/:\w+/g, "x");
    const res = await call(r.method, path, r.method === "GET" ? undefined : {}, from.token);
    if (res.status !== 403) open.push(`${r.method} ${r.path} ${res.status}`);
  }
  check(`counter: refused on all ${routes.length} other admin routes`, !open.length, open.join(", "));
  for (const kind of ["offer", "driver", "parcelRate"]) await expect(`counter: no ${kind} catalog`, call("GET", `/admin/catalog/${kind}`, null, from.token), 403);

  // What it sees
  const seen = (token, query = "") => call("GET", `/admin/parcels?state=all&${query}`, null, token);
  await expect("counter: the sending city lists it", seen(from.token, `q=${b.id}`), 200, (j) => j.total === 1);
  await expect("counter: the collecting city lists it", seen(to.token, `q=${b.id}`), 200, (j) => j.total === 1);
  await expect("counter: another city doesn't", seen(elsewhere.token, `q=${b.id}`), 200, (j) => j.total === 0);
  await expect("counter: a city filter can't widen it", seen(elsewhere.token, "city=Coimbatore"), 200,
    (j) => j.items.every((x) => x.from === "Madurai" || x.to === "Madurai"));
  await expect("counter: a phone search can't widen it", seen(elsewhere.token, "q=9000000002"), 200, (j) => j.items.every((x) => x.from === "Madurai" || x.to === "Madurai"));
  await expect("counter: no Quick parcels", seen(from.token, `q=${quick.id}`), 200, (j) => j.total === 0);
  await expect("counter: a Quick parcel is 404", call("GET", `/admin/parcels/${quick.id}`, null, from.token), 404);
  await expect("counter: another city's parcel is 404", call("GET", `/admin/parcels/${b.id}`, null, elsewhere.token), 404);
  await expect("counter: its parcel, without a refund preview or a code", call("GET", `/admin/parcels/${b.id}`, null, from.token), 200,
    (j) => j.refundIfCancelled === null && j.collectOtp === null && j.receiver.name === "Counter Receiver");

  // What it does
  const move = (token, seq, body, id = b.id) => call("POST", `/admin/parcels/${id}/legs/${seq}`, body, token);
  await expect("counter: another city can't move it", move(elsewhere.token, 0, { to: "active" }), 404);
  await expect("counter: can't move a Quick parcel", move(from.token, 0, { to: "active" }, quick.id), 404);
  await expect("counter: the collecting end can't receive", move(to.token, 0, { to: "active" }), 403);
  await expect("counter: the collecting end can't refuse", move(to.token, 0, { to: "failed", note: "Not its call" }), 403);
  await expect("counter: receive", move(from.token, 0, { to: "active" }), 200, (j) => j.state === "at_counter" && j.refundIfCancelled === null);
  await expect("counter: the collecting end can't load", move(to.token, 1, { to: "active" }), 403);
  await expect("counter: load", move(from.token, 1, { to: "active" }), 200, (j) => j.state === "on_bus");
  await expect("counter: the sending end can't mark it reached", move(from.token, 1, { to: "done" }), 403);
  await expect("counter: reached", move(to.token, 1, { to: "done" }), 200);
  await expect("counter: the sending end can't shelve it", move(from.token, 2, { to: "active" }), 403);
  await expect("counter: ready", move(to.token, 2, { to: "active" }), 200, (j) => j.state === "ready" && j.collectOtp === null);
  const code = (await call("GET", `/bookings/${b.id}/parcel`, null, sender)).json.collectOtp;
  for (let i = 0; i < 6; i++) await move(from.token, 2, { to: "done", otp: code === "111111" ? "222222" : "111111" });
  await expect("counter: the other end can't even use up the code's tries", move(to.token, 2, { to: "done", otp: code }), 200, (j) => j.state === "collected");
  await expect("counter: audited as that person", call("GET", `/admin/audit?entity=booking&entityId=${b.id}`, null, T), 200,
    (j) => j.items.filter((a) => a.action === "parcel.move").length === 5);

  const refused = await book();
  await expect("counter: the sending end refuses on sight", move(from.token, 0, { to: "failed", note: "Contains a gas cylinder" }, refused.id), 200, (j) => j.state === "cancelled");

  // Changing the account
  await expect("counter: moved to another city", call("PATCH", `/admin/team/${from.id}`, { counter: { operatorId: "bo1", city: "Trichy" } }, T), 200, (j) => j.counter.city === "Trichy");
  await expect("counter: which ends its session", call("GET", "/admin/auth/me", null, from.token), 401);
  const again = (await login(from)).json.token;
  await expect("counter: and its old city's parcels are gone", call("GET", `/admin/parcels/${b.id}`, null, again), 404);
  await expect("counter: to operations needs no counter", call("PATCH", `/admin/team/${to.id}`, { role: "operations" }, T), 200, (j) => j.role === "operations" && !j.counter);
  await expect("counter: and back needs one", call("PATCH", `/admin/team/${to.id}`, { role: "counter" }, T), 400);
  for (const a of [from, to, elsewhere]) await call("PATCH", `/admin/team/${a.id}`, { disabled: true }, T);
  await expect("counter: disabled can't sign in", login(elsewhere), 403);
}

/** Operations: another bus, the weight at the counter, returns, the dashboard and the export. */
async function parcelOpsChecks({ before, options, base, newPhone, contentStaff }) {
  const phone = newPhone();
  const O = (await call("POST", "/auth/verify", { phone, otp: OTP })).json.token;
  const me = async () => (await call("GET", "/auth/me", null, O)).json;
  const { id: userId } = await me();
  await expect("ops: wallet money for the test", call("POST", `/admin/customers/${userId}/wallet`, { amount: 3000, reason: "Smoke: parcel operations" }, T), 200);
  const balance = async () => (await me()).walletBalance;
  const quote = async (patch = {}) => (await call("POST", "/quotes", { ...base, ...patch })).json;
  const book = async (patch = {}, body = {}) => {
    const q = await quote(patch);
    const made = await call("POST", "/bookings", { service: "parcel", title: "x", subtitle: "x", payment: "wallet", lines: [], quoteId: q.id,
      receiver: { name: "Ops Receiver", phone: "9000000002" }, contents: "Operations test box", declaration: options.declaration.version, ...body }, O);
    if (made.status !== 201) return { status: made.status, json: made.json };
    return { ...made.json, parcel: (await call("GET", `/bookings/${made.json.id}/parcel`, null, O)).json };
  };
  const staff = (id, path, body, as = T) => call(body ? "POST" : "GET", `/admin/parcels/${id}/${path}`, body, as);
  const leg = (id, seq, body) => call("POST", `/admin/parcels/${id}/legs/${seq}`, body, T);
  const audited = (id, action) => call("GET", `/admin/audit?entity=booking&entityId=${id}`, null, T).then((r) => r.json.items.filter((a) => a.action === action).length);

  // Another bus
  const first = options.departures[0], last = options.departures.at(-1);
  const b = await book();
  const buses = await expect("ops: the buses it can move to", staff(b.id, "buses"), 200,
    (j) => j.length === options.departures.length - 1 && !j.some((d) => d.departAt === last.departAt));
  await expect("ops: content staff can't list them", staff(b.id, "buses", null, contentStaff), 403);
  const to = buses[0];
  const busBody = { busId: to.busId, departAt: to.departAt, note: "The booked bus was cancelled" };
  await expect("ops: content staff can't move it", staff(b.id, "bus", busBody, contentStaff), 403);
  await expect("ops: a bus change needs a reason", staff(b.id, "bus", { ...busBody, note: "" }), 400);
  await expect("ops: a made-up bus is refused", staff(b.id, "bus", { ...busBody, departAt: "2031-01-01T12:00:00.000Z" }), 400);
  const moved = await Promise.all([1, 2, 3].map(() => staff(b.id, "bus", busBody)));
  check("ops: three bus changes at once, one wins", moved.filter((r) => r.status === 200).length === 1, moved.map((r) => r.status).join(","));
  await expect("ops: the same LR on the new bus", staff(b.id, "").then(() => call("GET", `/admin/parcels/${b.id}`, null, T)), 200,
    (j) => j.lr === b.parcel.lr && j.departAt === to.departAt && j.readyAt === to.readyAt && j.state === "booked" && j.legs[1].departAt === to.departAt && j.legs[2].plannedAt === to.readyAt);
  await expect("ops: same price, and the refund still counts to the later bus", call("GET", `/bookings/${b.id}`, null, O), 200,
    (j) => j.amount === b.amount && Date.parse(j.startsAt) === Date.parse(last.departAt) && j.lines.some(([k]) => k === "Departs") && JSON.stringify(j.lines) !== JSON.stringify(b.lines));
  check("ops: the bus change is audited once", (await audited(b.id, "parcel.bus")) === 1);
  await expect("ops: tracking shows the new bus, not a second Booked or the note", call("GET", `/track/${b.parcel.lr}`), 200,
    (j) => j.departAt === to.departAt && j.events.length === 1 && !JSON.stringify(j).includes("cancelled"));
  await expect("ops: the sender is told", call("GET", "/me/notifications", null, O), 200, (j) => j.items.some((n) => n.bookingId === b.id && /Bus changed/.test(n.title)));
  check("ops: the test uses two different buses", first.departAt !== last.departAt);

  // The weight
  const preview = (id, band) => staff(id, `weight?band=${band}`);
  const up = await expect("ops: a heavier band's difference", preview(b.id, "10"), 200, (j) => j.charge > 0 && j.refund === 0);
  const five = await quote({ weightBand: "10" }), two = await quote();
  check("ops: the difference is the two quotes'", up.charge === five.total - two.total, `${up.charge} vs ${five.total - two.total}`);
  await expect("ops: the same band is refused", preview(b.id, "2"), 400);
  await expect("ops: content staff can't weigh", staff(b.id, "weight", { ...up, senderAgreed: true }, contentStaff), 403);
  await expect("ops: a charge needs the sender's agreement", staff(b.id, "weight", { ...up, senderAgreed: false }), 400);
  await expect("ops: a stale difference is refused", staff(b.id, "weight", { ...up, charge: up.charge + 1, senderAgreed: true }), 409);
  let wallet = await balance();
  const weighed = await Promise.all([1, 2, 3].map(() => staff(b.id, "weight", { ...up, senderAgreed: true })));
  check("ops: three weighings at once, one wins", weighed.filter((r) => r.status === 200).length === 1, weighed.map((r) => r.status).join(","));
  check("ops: charged once", (await balance()) === wallet - up.charge);
  await expect("ops: the booking follows the weight", call("GET", `/bookings/${b.id}`, null, O), 200,
    (j) => j.amount === b.amount + up.charge && /10 kg/.test(j.subtitle) && j.lines.some(([k]) => k === "Weight checked"));
  const down = await expect("ops: lighter again", preview(b.id, "2"), 200, (j) => j.refund === up.charge && j.charge === 0);
  wallet = await balance();
  await expect("ops: lighter is refunded", staff(b.id, "weight", { ...down, senderAgreed: false }), 200, (j) => j.weightBand === "2" && j.amount === b.amount);
  check("ops: refunded once", (await balance()) === wallet + down.refund);
  check("ops: each weighing is audited", (await audited(b.id, "parcel.weight")) === 2);
  await expect("ops: the wallet shows both", call("GET", `/admin/bookings/${b.id}`, null, T), 200, (j) => JSON.stringify(j).split("Weight checked ·").length >= 3);

  // Cancelling while it's being weighed never refunds more than was paid
  const start = await balance();
  const r = await book({ weightBand: "10" });
  const lighter = (await preview(r.id, "2")).json;
  await Promise.all([staff(r.id, "weight", { ...lighter, senderAgreed: false }), call("POST", `/bookings/${r.id}/cancel`, {}, O)]);
  if ((await call("GET", `/bookings/${r.id}`, null, O)).json.status !== "cancelled") await call("POST", `/bookings/${r.id}/cancel`, {}, O);
  check("ops: weighing and cancelling at once gives back exactly what was paid", (await balance()) === start, `${await balance()} vs ${start}`);

  const upi = await book({}, { payment: "upi" });
  const more = (await preview(upi.id, "5")).json;
  await expect("ops: UPI can't be charged more", staff(upi.id, "weight", { ...more, senderAgreed: true }), 409);
  await leg(upi.id, 0, { to: "active" });
  await expect("ops: weighed at the counter too", preview(upi.id, "5"), 200);
  await leg(upi.id, 1, { to: "active" });
  await expect("ops: not weighed on the bus", preview(upi.id, "5"), 409);
  await expect("ops: not moved on the bus", staff(upi.id, "buses"), 409);

  const poor = await book();
  const jump = (await preview(poor.id, "20")).json;
  const spare = await balance();
  await expect("ops: empty the wallet", call("POST", `/admin/customers/${userId}/wallet`, { amount: -spare, reason: "Smoke: empty wallet" }, T), 200);
  await expect("ops: a short wallet isn't charged", staff(poor.id, "weight", { ...jump, senderAgreed: true }), 409);
  await expect("ops: and the parcel is unchanged", call("GET", `/bookings/${poor.id}`, null, O), 200, (j) => j.amount === poor.amount);
  check("ops: the wallet never goes negative", (await balance()) === 0);

  const code = `WEIGH${String(Date.now()).slice(-8)}`;
  const offer = await expect("ops: a half-price coupon", call("POST", "/admin/catalog/offer",
    { data: { code, title: "Smoke half price", description: "Smoke test", service: "all", percent: 50, maxDiscount: 5000, minAmount: 0, hue: 45 } }, T), 201);
  try {
    let heavy;
    await eventually("ops: the coupon works", async () => {
      const r = await book({ weightBand: "20" }, { payment: "upi", couponCode: code });
      if (r.id) heavy = r;
      return r;
    }, () => !!heavy);
    const light = (await preview(heavy.id, "2")).json;
    const fair = Math.round((await quote()).total / 2);
    check("ops: weighing lighter gives back only the share that was paid", Math.abs(heavy.amount - light.refund - fair) <= 1, `${heavy.amount} - ${light.refund} vs ${fair}`);
  } finally {
    await call("DELETE", `/admin/catalog/offer/${offer?.id ?? offer?.item?.id}`, null, T);
  }

  const city = (await call("GET", "/config")).json.places;
  const quick = await call("POST", "/quotes", { service: "parcel", mode: "city", pickupId: city[0].id, dropId: city[1].id, category: "documents", weightBand: "2", size: "backpack", declaredValue: 100 });
  const qb = await call("POST", "/bookings", { service: "parcel", title: "x", subtitle: "x", payment: "upi", lines: [], quoteId: quick.json.id,
    receiver: { name: "Ops Receiver", phone: "9000000002" }, contents: "Operations test note", declaration: options.declaration.version }, O);
  await expect("ops: a Quick parcel isn't weighed", preview(qb.json.id, "5"), 409);

  // Back to the sender
  const lost = await book({}, { payment: "upi" });
  for (const [seq, state] of [[0, "active"], [1, "active"], [1, "done"], [2, "active"]]) await leg(lost.id, seq, { to: state });
  check("ops: the test ends the hold", endHold(lost.id));
  await expect("ops: unclaimed", leg(lost.id, 2, { to: "failed" }), 200, (j) => j.state === "unclaimed");
  await expect("ops: operations are alerted, without the receiver", call("GET", "/admin/alerts", null, T), 200,
    (j) => j.items.some((a) => a.kind === "parcel.unclaimed" && a.link === `/parcels/view?id=${lost.id}` && a.title.includes(lost.lr ?? "Unclaimed") && !/Receiver|9000000002/.test(a.title + a.body)));
  const stats = (await call("GET", "/admin/stats?days=1", null, T)).json.queues;
  const count = async (query) => (await call("GET", `/admin/parcels?${query}`, null, T)).json.total;
  check("ops: dashboard unclaimed = the queue", stats.parcelsUnclaimed === (await count("state=unclaimed")) && stats.parcelsUnclaimed >= 1, JSON.stringify(stats));
  check("ops: dashboard on the bus = the queue", stats.parcelsOnBus === (await count("state=on_bus")), JSON.stringify(stats));
  check("ops: dashboard ready = the queue", stats.parcelsReady === (await count("state=ready")), JSON.stringify(stats));
  check("ops: dashboard today = the queue", stats.parcelsToday === (await count(`state=all&date=${dayOffset(0)}`)), JSON.stringify(stats));

  await expect("ops: a return needs a real LR", staff(lost.id, "return", { lr: "QFP-CBE-MAA-ZZZZZZZZ" }), 400);
  await expect("ops: the same route isn't a return", staff(lost.id, "return", { lr: upi.parcel.lr }), 400);
  const backBus = (await call("GET", "/parcels/options?from=Coimbatore&to=Chennai")).json.departures.at(-1);
  const back = await book({ from: "Coimbatore", to: "Chennai", busId: backBus.busId, departAt: backBus.departAt }, { payment: "upi" });
  await expect("ops: content staff can't return", staff(lost.id, "return", { lr: back.parcel.lr }, contentStaff), 403);
  const S2 = (await call("POST", "/auth/verify", { phone: newPhone(), otp: OTP })).json.token;
  const theirs = await call("POST", "/quotes", { ...base, from: "Coimbatore", to: "Chennai", busId: backBus.busId, departAt: backBus.departAt });
  const other = await call("POST", "/bookings", { service: "parcel", title: "x", subtitle: "x", payment: "upi", lines: [], quoteId: theirs.json.id,
    receiver: { name: "Ops Receiver", phone: "9000000002" }, contents: "Someone else's box", declaration: options.declaration.version }, S2);
  const otherLr = (await call("GET", `/bookings/${other.json.id}/parcel`, null, S2)).json.lr;
  await expect("ops: someone else's parcel isn't a return", staff(lost.id, "return", { lr: otherLr }), 400);
  await expect("ops: returned as the parcel the sender booked", staff(lost.id, "return", { lr: back.parcel.lr.toLowerCase() }), 200, (j) => j.state === "returned" && j.bookingStatus === "completed");
  const locked = (j) => /bringing an unclaimed one back/.test(j.message);
  await expect("ops: a linked return can't be cancelled by the sender", call("POST", `/bookings/${back.id}/cancel`, {}, O), 409, locked);
  await expect("ops: nor by staff", call("POST", `/admin/bookings/${back.id}/cancel`, { reason: "Smoke: linked return" }, T), 409);
  await expect("ops: nor refused for a full refund", leg(back.id, 0, { to: "failed", note: "Smoke: linked return" }), 409, locked);
  await expect("ops: nor re-weighed", preview(back.id, "5"), 409, locked);
  await expect("ops: staff aren't offered a refund for it", call("GET", `/admin/parcels/${back.id}`, null, T), 200, (j) => j.refundIfCancelled === null);
  await expect("ops: nor on the booking page", call("GET", `/admin/bookings/${back.id}`, null, T), 200, (j) => j.refundIfCancelled === null);
  await expect("ops: returned once", staff(lost.id, "return", { lr: back.parcel.lr }), 409);
  await expect("ops: the sender sees it going back", call("GET", `/bookings/${lost.id}/parcel`, null, O), 200,
    (j) => j.state === "returned" && j.collectOtp === null && j.events.at(-1).note.includes(back.parcel.lr));
  await expect("ops: a return earns no credits", call("GET", "/me/credits", null, O), 200, (j) => !j.items.some((x) => x.bookingId === lost.id && x.kind === "earned"));
  check("ops: a return is audited", (await audited(lost.id, "parcel.move")) >= 6);

  const csv = await (await fetch(`${BASE}/admin/bookings/export.csv?service=parcel`, { headers: { Authorization: `Bearer ${T}` } })).text();
  const rows = csv.trim().split(/\r?\n/);
  check("ops: the export has the parcel columns", rows[0].endsWith("parcel_lr,parcel_mode,parcel_state,parcel_max_kg"), rows[0]);
  check("ops: with LR, mode and state", rows.some((l) => l.includes(`${lost.parcel.lr},intercity,returned,2`)));
  check("ops: and no receiver, contents", !/Ops Receiver|Operations test box/.test(csv));
  check("ops: the cap is still the owner's", before.parcelMaxKg >= 2);
}

/** Quick parcel (city): one captain's leg, the two codes, the ride cancellation rules, cash on pickup. */
async function quickParcelChecks({ before, places, options, newPhone, priced, contentStaff }) {
  const senderPhone = newPhone(), receiverPhone = newPhone();
  const Q = (await call("POST", "/auth/verify", { phone: senderPhone, otp: OTP })).json.token;
  const other = (await call("POST", "/auth/verify", { phone: receiverPhone, otp: OTP })).json.token;
  const balance = async () => (await call("GET", "/auth/me", null, Q)).json.walletBalance;
  const contents = "A signed contract";
  const req = { service: "parcel", mode: "city", pickupId: places[0].id, dropId: places[1].id, category: "documents", weightBand: "5", size: "backpack", declaredValue: 100 };
  const quote = async () => (await call("POST", "/quotes", req)).json;
  const body = (quoteId, patch = {}) => ({ service: "parcel", title: "Client title", subtitle: "Client subtitle", payment: "wallet", lines: [["Receiver", receiverPhone]], quoteId,
    receiver: { name: "Meena Receiver", phone: receiverPhone }, contents, declaration: options.declaration.version, ...patch });
  const staff = (id, payload, as = T) => call("POST", `/admin/parcels/${id}/legs/0`, payload, as);
  const own = async (id) => (await call("GET", `/bookings/${id}/parcel`, null, Q)).json;
  const wrong = (code) => (code[0] === "1" ? "2" : "1") + code.slice(1);
  const earned = async (id) => (await call("GET", "/me/credits", null, Q)).json.items.filter((x) => x.bookingId === id && x.kind === "earned").length;

  await expect("quick: the same place twice is refused", call("POST", "/quotes", { ...req, dropId: req.pickupId }), 400);
  await expect("quick: a client can't send its own plan", call("POST", "/quotes", { ...req, plan: { liability: 99999 } }), 201, (j) => j.parcel.liability === 100);
  await expect("quick: needs a receiver", call("POST", "/bookings", body(priced.id, { receiver: undefined }), Q), 400);
  await expect("quick: an old client can't book one", call("POST", "/bookings", body(priced.id), Q, OLD_CLIENT), 409);

  const start = await balance();
  const a = await expect("quick: book from the wallet at the quote", call("POST", "/bookings", body(priced.id), Q), 201,
    (j) => j.amount === priced.total && j.parcelState === "booked" && j.startsAt === null && j.rideId === null);
  check("quick: the wallet paid", (await balance()) === start - priced.total);
  check("quick: lines carry no personal data", a.title === `${places[0].name} → ${places[1].name}` && !JSON.stringify([a.title, a.subtitle, a.lines]).includes(receiverPhone), JSON.stringify(a.lines));
  check("quick: keeps the ride fee as a term, not bus tiers or a hold",
    a.terms.rideCancelFreeMinutes === before.rideCancelFreeMinutes && !("cancelPolicyParcel" in a.terms) && !("parcelCounterHoldDays" in a.terms), JSON.stringify(a.terms));
  await expect("quick: a quote books once", call("POST", "/bookings", body(priced.id), Q), 409);
  const p = await expect("quick: the sender gets a captain and the pickup code", call("GET", `/bookings/${a.id}/parcel`, null, Q), 200,
    (j) => j.mode === "city" && j.legs.length === 1 && j.legs[0].kind === "bike" && j.courier.captain.plate && j.courier.drop.id === places[1].id && /^\d{4}$/.test(j.pickupOtp) && j.collectOtp === null);
  await expect("quick: the receiver's account gets no access", call("GET", `/bookings/${a.id}/parcel`, null, other), 404);
  await expect("quick: staff see the captain, no codes", call("GET", `/admin/parcels/${a.id}`, null, T), 200,
    (j) => j.courier.captain.name && j.pickupOtp === null && j.collectOtp === null && j.refundIfCancelled.amount === priced.total);
  await expect("quick: today's queue lists it", call("GET", `/admin/parcels?date=${dayOffset(0)}&q=${p.lr}`, null, T), 200, (j) => j.total === 1);
  await expect("quick: content staff can't move it", staff(a.id, { to: "active" }, contentStaff), 403);
  await expect("quick: with simulation off the sender can't play captain", call("POST", `/bookings/${a.id}/parcel/handover`, { otp: p.pickupOtp }, Q), 409);
  await expect("quick: no delivering before pickup", staff(a.id, { to: "done", otp: "123456" }), 409);

  await expect("quick: simulation on", call("PATCH", "/admin/settings", { parcelSimulateTransit: true }, T), 200);
  try {
    await eventually("quick: a wrong pickup code is refused", () => call("POST", `/bookings/${a.id}/parcel/handover`, { otp: wrong(p.pickupOtp) }, Q), (r) => r.status === 400);
    await expect("quick: someone else can't hand it over", call("POST", `/bookings/${a.id}/parcel/handover`, { otp: p.pickupOtp }, other), 404);
    await expect("quick: an old client can't hand it over", call("POST", `/bookings/${a.id}/parcel/handover`, { otp: p.pickupOtp }, Q, OLD_CLIENT), 404);
    const picked = await Promise.all([1, 2, 3, 4].map(() => call("POST", `/bookings/${a.id}/parcel/handover`, { otp: p.pickupOtp }, Q)));
    check("quick: four pickups at once, one wins", picked.filter((r) => r.status === 200).length === 1, picked.map((r) => r.status).join(","));
    const moving = await own(a.id);
    const code = moving.collectOtp;
    check("quick: with the captain, the receiver's code replaces the pickup code", moving.state === "in_transit" && /^\d{6}$/.test(code) && moving.pickupOtp === null, JSON.stringify(moving).slice(0, 200));
    await expect("quick: the booking is ongoing", call("GET", `/bookings/${a.id}`, null, Q), 200, (j) => j.status === "ongoing" && j.parcelState === "in_transit");
    await expect("quick: no cancelling with the captain", call("POST", `/bookings/${a.id}/cancel`, {}, Q), 409);
    await expect("quick: staff can't cancel it then either", call("POST", `/admin/bookings/${a.id}/cancel`, { reason: "Smoke: too late" }, T), 409);
    await expect("quick: complete can't skip the code", call("POST", `/admin/bookings/${a.id}/complete`, {}, T), 409);
    await expect("quick: the customer can't complete it", call("POST", `/bookings/${a.id}/complete`, {}, Q), 409);
    await expect("quick: staff don't see the code", call("GET", `/admin/parcels/${a.id}`, null, T), 200, (j) => j.collectOtp === null && !JSON.stringify(j).includes(code));
    await expect("quick: the code is in no notification", call("GET", "/me/notifications", null, Q), 200, (j) => j.items.some((n) => n.kind === "parcel.moved") && !JSON.stringify(j).includes(code));
    await expect("quick: tracking is public and private", call("GET", `/track/${p.lr}`), 200, (j) => {
      const text = JSON.stringify({ ...j, events: j.events.map((e) => e.state) });
      return j.mode === "city" && j.state === "in_transit" && j.receiver === "Meena" && j.collectAt === null
        && ![receiverPhone, senderPhone, contents, code, places[0].name, places[1].name].some((v) => text.includes(v));
    });
    await expect("quick: the export omits the code", call("GET", "/me/export", null, Q), 200, (j) => !JSON.stringify(j.data.parcels_sent).includes(code));
    await expect("quick: a wrong delivery code is refused", call("POST", `/bookings/${a.id}/parcel/deliver`, { otp: wrong(code) }, Q), 400);
    const done = await Promise.all([1, 2, 3].map(() => call("POST", `/bookings/${a.id}/parcel/deliver`, { otp: code }, Q)));
    check("quick: three deliveries at once, one wins", done.filter((r) => r.status === 200).length === 1, done.map((r) => r.status).join(","));
    await expect("quick: delivered completes the booking", call("GET", `/bookings/${a.id}`, null, Q), 200, (j) => j.status === "completed" && j.parcelState === "delivered");
    await expect("quick: both codes are gone", call("GET", `/bookings/${a.id}/parcel`, null, Q), 200, (j) => j.collectOtp === null && j.pickupOtp === null);
    check("quick: credits once", (await earned(a.id)) === (Math.floor((priced.total * before.creditsParcel) / 100) ? 1 : 0));
    await expect("quick: delivered leaves the open queue", call("GET", `/admin/parcels?state=open&q=${p.lr}`, null, T), 200, (j) => j.total === 0);

    const l = await expect("quick: book for the lockout", call("POST", "/bookings", body((await quote()).id, { payment: "upi" }), Q), 201);
    await call("POST", `/bookings/${l.id}/parcel/handover`, { otp: (await own(l.id)).pickupOtp }, Q);
    const real = (await own(l.id)).collectOtp;
    for (let i = 0; i < 5; i++) await call("POST", `/bookings/${l.id}/parcel/deliver`, { otp: wrong(real) }, Q);
    await expect("quick: five wrong codes lock it", call("POST", `/bookings/${l.id}/parcel/deliver`, { otp: real }, Q), 429);
    await expect("quick: bringing it back needs a reason", staff(l.id, { to: "failed" }), 400);
    await expect("quick: brought back to the sender", staff(l.id, { to: "failed", note: "Receiver unreachable" }), 200, (j) => j.state === "returned" && j.bookingStatus === "completed");
    check("quick: a return earns no credits", (await earned(l.id)) === 0);
    await expect("quick: a return keeps the fare", call("GET", `/bookings/${l.id}`, null, Q), 200, (j) => !j.refundAmount && j.parcelState === "returned");
  } finally {
    await expect("quick: simulation back off", call("PATCH", "/admin/settings", { parcelSimulateTransit: false }, T), 200);
  }

  let paid = await balance();
  const free = await expect("quick: book to cancel", call("POST", "/bookings", body((await quote()).id), Q), 201);
  const cancels = await Promise.all([1, 2, 3, 4].map(() => call("POST", `/bookings/${free.id}/cancel`, {}, Q)));
  check("quick: four cancels at once, one wins", cancels.filter((r) => r.status === 200).length === 1, cancels.map((r) => r.status).join(","));
  check("quick: free inside the free minutes, refunded once", (await balance()) === paid);

  const refused = await expect("quick: book to refuse", call("POST", "/bookings", body((await quote()).id), Q), 201);
  await expect("quick: refusing needs a reason", staff(refused.id, { to: "failed" }), 400);
  await expect("quick: refused on sight", staff(refused.id, { to: "failed", note: "Contains a gas cylinder" }), 200, (j) => j.state === "cancelled");
  check("quick: a refusal refunds all of it", (await balance()) === paid);

  const byStaff = await expect("quick: book for staff to deliver", call("POST", "/bookings", body((await quote()).id, { payment: "upi" }), Q), 201);
  await expect("quick: staff confirm the pickup", staff(byStaff.id, { to: "active" }), 200, (j) => j.state === "in_transit");
  await expect("quick: staff delivery needs the code", staff(byStaff.id, { to: "done" }), 400);
  await expect("quick: staff deliver with it", staff(byStaff.id, { to: "done", otp: (await own(byStaff.id)).collectOtp }), 200, (j) => j.state === "delivered" && j.events.filter((e) => e.by).length === 2);

  await expect("quick: no free minutes", call("PATCH", "/admin/settings", { rideCancelFreeMinutes: 0 }, T), 200);
  try {
    let late;
    // Another isolate may still sell with the old free minutes for up to 30 s.
    await eventually("quick: sold with no free minutes", async () => {
      const r = await call("POST", "/bookings", body((await quote()).id), Q);
      if (r.json?.terms?.rideCancelFreeMinutes === 0) late = r.json;
      else if (r.status === 201) await call("POST", `/bookings/${r.json.id}/cancel`, {}, Q);
      return r;
    }, () => !!late);
    const fee = Math.min(Math.round((late.amount * before.rideCancelFeePercent) / 100), before.rideCancelFeeCap, late.amount);
    await expect("quick: staff would refund all of it", call("GET", `/admin/parcels/${late.id}`, null, T), 200, (j) => j.refundIfCancelled.amount === late.amount);
    await expect("quick: a late cancel keeps the ride fee", call("POST", `/bookings/${late.id}/cancel`, { reason: "plans_changed" }, Q), 200, (j) => j.cancelFee === fee && j.refundAmount === late.amount - fee);
    check("quick: and the wallet gets the rest", (await balance()) === paid - fee);
    paid = await balance();
    const waived = await expect("quick: book again", call("POST", "/bookings", body((await quote()).id), Q), 201);
    await expect("quick: a captain's fault waives the fee", call("POST", `/bookings/${waived.id}/cancel`, { reason: "driver_late" }, Q), 200, (j) => j.cancelFee === 0 && j.refundAmount === waived.amount);
    const cash = await expect("quick: cash on pickup", call("POST", "/bookings", body((await quote()).id, { payment: "cash" }), Q), 201);
    await expect("quick: cancelling unpaid cash promises no refund", call("POST", `/bookings/${cash.id}/cancel`, {}, Q), 200, (j) => j.refundAmount === 0);
    await expect("quick: and says nothing was paid", call("GET", "/me/notifications", null, Q), 200,
      (j) => j.items.some((n) => n.bookingId === cash.id && /Nothing was paid/.test(n.body)) && !j.items.some((n) => n.bookingId === cash.id && /Refund due/.test(n.body)));
    check("quick: cash never touches the wallet", (await balance()) === paid);
  } finally {
    await expect("quick: free minutes put back", call("PATCH", "/admin/settings", { rideCancelFreeMinutes: before.rideCancelFreeMinutes }, T), 200);
  }

  await expect("quick: cash off", call("PATCH", "/admin/settings", { featureCashRides: false }, T), 200);
  try {
    await eventually("quick: cash can be switched off", async () => call("POST", "/bookings", body((await quote()).id, { payment: "cash" }), Q), (r) => r.status === 409);
  } finally {
    await expect("quick: cash put back", call("PATCH", "/admin/settings", { featureCashRides: before.featureCashRides }, T), 200);
  }
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
if (!owner?.token) {
  // Without an owner token every later check fails and some would still write (e.g. a test licence).
  console.error("Owner login failed; stopping before anything is written.");
  process.exit(1);
}
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
// One setting's history (admin Settings → History): only changes that set that key.
await expect("GET /admin/audit?key= lists one setting's changes", call("GET", "/admin/audit?entity=settings&key=licenceAutoApprove", null, T), 200,
  (j) => j.items.length >= 1 && j.items.every((e) => e.entity === "settings" && "licenceAutoApprove" in e.detail.after));
await expect("a setting's history has only its own changes", call("GET", "/admin/audit?key=companyName", null, T), 200,
  (j) => j.items.every((e) => "companyName" in e.detail.after));
await expect("an unknown setting key is refused", call("GET", "/admin/audit?key=nope", null, T), 400);

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
await expect("staff are alerted about the licence", call("GET", "/admin/alerts", null, T), 200, (j) => j.items.some((a) => a.kind === "licence.submitted" && a.link === "/licences"));
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
// A package booked by start date (group-tour packages with departures need a departure instead).
const departureTours = new Set(((await call("GET", "/admin/catalog/departure", null, T)).json ?? []).map((d) => d.data.tourId));
const anyDateTour = tours.find((t) => t.active && !departureTours.has(t.id)) ?? tours[0];
const quote = (await call("POST", "/quotes", { service: "tours", tourId: anyDateTour.id, adults: 1, kids: 0, start: TRAVEL })).json;
await eventually("new coupon works", () => call("POST", "/offers/check", { code: "SMOKE25", quoteId: quote.id }, cust2), (r) => r.status === 200 && r.json.discount === 100);
await call("PUT", `/admin/catalog/offer/${offer.id}`, { data: { ...offer.data, validUntil: "2020-01-01" } }, T);
await eventually("expired coupon is refused", () => call("POST", "/offers/check", { code: "SMOKE25", quoteId: quote.id }, cust2), (r) => r.status === 400 && /expired/.test(r.json.message));
await call("PUT", `/admin/catalog/offer/${offer.id}`, { active: false }, T);
await eventually("hidden coupon is refused", () => call("POST", "/offers/check", { code: "SMOKE25", quoteId: quote.id }, cust2), (r) => r.status === 400 && /isn't valid/.test(r.json.message));
await call("DELETE", `/admin/catalog/offer/${offer.id}`, null, T);

// ── Pricing audit step 2: rules between settings, catalog limits, offer dates and total uses ──
{
  const sNow = (await call("GET", "/admin/settings", null, T)).json;
  await expect("surge multiplier above the cap is refused", call("PATCH", "/admin/settings", { surgeMultiplier: 1.5, surgeCap: 1.4 }, T), 400, (j) => /above the surge cap/.test(j.message));
  await expect("a surge cap above 2x is refused", call("PATCH", "/admin/settings", { surgeCap: 2.5 }, T), 400);
  await expect("Peace protection cheaper than Standard is refused", call("PATCH", "/admin/settings", { rentProtectionPeacePerDay: Math.max(0, sNow.rentProtectionStandardPerDay - 1) }, T), 400, (j) => /less than Standard/.test(j.message));
  await expect("Peace damage limit above Standard's is refused", call("PATCH", "/admin/settings", { rentExcessPeace: sNow.rentExcessStandard + 1 }, T), 400);
  await expect("an AC bus fare below non-AC is refused", call("PATCH", "/admin/settings", { busFareAc: Math.max(0, sNow.busFareNonAc - 1) }, T), 400, (j) => /AC bus fare/.test(j.message));
  const ro = (await call("GET", "/admin/catalog/rideOption", null, T)).json[0];
  await expect("a ride per-km rate above ₹100 is refused", call("PUT", `/admin/catalog/rideOption/${ro.id}`, { data: { ...ro.data, perKm: 150 } }, T), 400);
  await expect("a ride type with no fare is refused", call("PUT", `/admin/catalog/rideOption/${ro.id}`, { data: { ...ro.data, baseFare: 0, perKm: 0, perMin: 0 } }, T), 400, (j) => /needs a fare/.test(j.message));
  await expect("a departure needs a real package", call("POST", "/admin/catalog/departure", { data: { tourId: "t-nope", date: TRAVEL, fromCity: "Chennai", seats: 10, price: null } }, T), 400, (j) => /No holiday package/.test(j.message));
  const offerBase = { title: "Smoke offer", description: "Test", service: "all", percent: 10, maxDiscount: 50, minAmount: 0, validFrom: "", validUntil: "", perUserLimit: "", maxUses: "", hue: 10 };
  await expect("a flat offer needs a minimum above the discount", call("POST", "/admin/catalog/offer", { data: { ...offerBase, code: "SMOKEFLAT", percent: 100, maxDiscount: 200, minAmount: 100 } }, T), 400, (j) => /minimum booking total above/.test(j.message));
  await expect("valid from after valid until is refused", call("POST", "/admin/catalog/offer", { data: { ...offerBase, code: "SMOKEDATE", validFrom: "2030-02-01", validUntil: "2030-01-01" } }, T), 400);
  const soon = await expect("an offer that starts later", call("POST", "/admin/catalog/offer", { data: { ...offerBase, code: "SMOKESOON", validFrom: "2099-01-01" } }, T), 201);
  const once = await expect("an offer with one use in total", call("POST", "/admin/catalog/offer", { data: { ...offerBase, code: "SMOKEONE", maxUses: 1 } }, T), 201, (j) => j.data.maxUses === 1);
  const soonOffer = soon?.id ? soon : (await call("GET", "/admin/catalog/offer", null, T)).json.find((o) => o.data.code === "SMOKESOON");
  const onceOffer = once?.id ? once : (await call("GET", "/admin/catalog/offer", null, T)).json.find((o) => o.data.code === "SMOKEONE");
  await eventually("/config lists live offers only", () => call("GET", "/config"), (r) => r.json?.offers?.some((o) => o.code === "SMOKEONE") && !r.json.offers.some((o) => o.code === "SMOKESOON"));
  const q1 = (await call("POST", "/quotes", { service: "tours", tourId: anyDateTour.id, adults: 1, kids: 0, start: TRAVEL })).json;
  await expect("a coupon that hasn't started is refused", call("POST", "/offers/check", { code: "SMOKESOON", quoteId: q1.id }, cust2), 400, (j) => /starts on/.test(j.message));
  const used = await expect("book with the one-use coupon", call("POST", "/bookings", { service: "tours", title: "Smoke one-use", subtitle: "Coupon", payment: "upi", lines: [], quoteId: q1.id, couponCode: "SMOKEONE" }, cust2), 201, (j) => j.discount > 0);
  const q2 = (await call("POST", "/quotes", { service: "tours", tourId: anyDateTour.id, adults: 1, kids: 0, start: TRAVEL })).json;
  await expect("the used-up coupon is refused", call("POST", "/offers/check", { code: "SMOKEONE", quoteId: q2.id }, cust2), 400, (j) => /fully used/.test(j.message));
  if (used) await call("POST", `/bookings/${used.id}/cancel`, {}, cust2);
  await expect("cancelling gives the use back", call("POST", "/offers/check", { code: "SMOKEONE", quoteId: q2.id }, cust2), 200);
  for (const o of [soonOffer, onceOffer]) if (o) await call("DELETE", `/admin/catalog/offer/${o.id}`, null, T);
}

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
const halfBooking = await expect("holiday booking under a 50% policy", call("POST", "/bookings", { service: "tours", title: "Smoke Cheap Trip", subtitle: "Policy test", payment: payBy, lines: [], quoteId: tq.id }, P), 201,
  (j) => j.startsAt?.startsWith(TRAVEL) && j.terms?.cancelPolicyTours === "999d:100, 1h:50" && j.terms.gstTours === s0.gstTours);
// Booking terms (pricing step 3): a later policy change doesn't touch this booking.
await expect("change the holiday policy after booking", call("PATCH", "/admin/settings", { cancelPolicyTours: "999d:100" }, T), 200, (j) => j.cancelPolicyTours === "999d:100");
await eventually("the new policy reaches the API", () => call("GET", "/config"), (r) => r.json?.settings?.cancelPolicyTours === "999d:100");
await expect("admin sees the terms the booking was sold under", call("GET", `/admin/bookings/${halfBooking.id}`, null, T), 200, (j) => j.booking.terms?.cancelPolicyTours === "999d:100, 1h:50");
await expect("admin sees what a cancel would refund", call("GET", `/admin/bookings/${halfBooking.id}`, null, T), 200,
  (j) => j.refundIfCancelled?.percent === 50 && j.refundIfCancelled.amount === Math.round(halfBooking.amount / 2));
await expect("customer cancel refunds half under the policy it was sold under", call("POST", `/bookings/${halfBooking.id}/cancel`, null, P), 200,
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

// ── Self-drive rental: the customer's checklist, then staff settle the deposit ──
{
  const localIn = (minutes) => new Date(Date.now() + (330 + minutes) * 60_000).toISOString().slice(0, 16);
  const q = (await call("POST", "/quotes", { ...rentReq, start: localIn(10), end: localIn(10 + 6 * 60) })).json;
  const rb = (await call("POST", "/bookings", { service: "rent", title: "Smoke settle", subtitle: "Lifecycle", payment: "upi", lines: [], quoteId: q.id }, C2)).json;
  const path = `/bookings/${rb.id}/rental`;
  for (const s of ["front", "back", "left", "right", "odometer"]) await upload(`${path}/photos/pickup/${s}`, JPEG, C2);
  await call("POST", `${path}/start`, { odometerKm: 30000, fuel: 8 }, C2);
  await expect("settling waits for the return", call("GET", `/admin/bookings/${rb.id}/rental/settlement`, null, T), 409);
  for (const s of ["front", "back", "left", "right", "odometer"]) await upload(`${path}/photos/return/${s}`, JPEG, C2);
  await expect("customer returns the car (200 km, 2/8 less fuel)", call("POST", `${path}/return`, { odometerKm: 30200, fuel: 6 }, C2), 200, (j) => j.state === "returned");
  await expect("dashboard counts returns to settle", call("GET", "/admin/stats?days=1", null, T), 200, (j) => j.queues.returnsToSettle >= 1);
  await expect("staff see the rental with photos", call("GET", `/admin/bookings/${rb.id}/rental`, null, T), 200,
    (j) => j.state === "returned" && j.photos.return.length === 5 && j.customerName && j.pickup.odometerKm === 30000
      && j.damageExcess === s0.rentExcessStandard);
  const photo = await fetch(`${BASE}/admin/bookings/${rb.id}/rental/photos/pickup/odometer`, { headers: { Authorization: `Bearer ${T}` } });
  check("staff can open a checklist photo", photo.status === 200);
  const extraKm = Math.max(0, 200 - s0.rentLimitedKmPerDay);
  const expected = extraKm * s0.rentExtraKmRate + 2 * s0.rentFuelChargePerEighth;
  // Booking terms: rates raised after booking don't apply to this rental (always put back, even on a crash).
  const raised = { rentExtraKmRate: s0.rentExtraKmRate + 5, rentFuelChargePerEighth: s0.rentFuelChargePerEighth + 50, rentLimitedKmPerDay: Math.max(1, s0.rentLimitedKmPerDay - 40) };
  await expect("raise the self-drive rates after booking", call("PATCH", "/admin/settings", raised, T), 200, (j) => j.rentExtraKmRate === raised.rentExtraKmRate);
  try {
    await eventually("raised rates reach the API", () => call("GET", "/config"), (r) => r.json?.settings?.rentExtraKmRate === raised.rentExtraKmRate);
    await expect("settlement preview uses the booked rates: extra km and fuel", call("GET", `/admin/bookings/${rb.id}/rental/settlement`, null, T), 200,
      (j) => j.kmDriven === 200 && j.extraKm === extraKm && j.fuelShort === 2 && j.lateHours === 0 && j.deductions === expected);
  } finally {
    await expect("restore the self-drive rates", call("PATCH", "/admin/settings", { rentExtraKmRate: s0.rentExtraKmRate, rentFuelChargePerEighth: s0.rentFuelChargePerEighth, rentLimitedKmPerDay: s0.rentLimitedKmPerDay }, T), 200,
      (j) => j.rentExtraKmRate === s0.rentExtraKmRate && j.rentLimitedKmPerDay === s0.rentLimitedKmPerDay);
  }
  await expect("plain completion is refused for a returned car", call("POST", `/admin/bookings/${rb.id}/complete`, null, T), 409);
  await expect("a damage charge needs a note", call("POST", `/admin/bookings/${rb.id}/rental/settle`, { damage: 300 }, T), 400);
  await expect("damage above the protection excess is refused", call("POST", `/admin/bookings/${rb.id}/rental/settle`, { damage: s0.rentExcessStandard + 1, damageNote: "Above the excess" }, T), 400);
  const total = expected + 300;
  await expect("settle with a damage charge", call("POST", `/admin/bookings/${rb.id}/rental/settle`, { damage: 300, damageNote: "Scratch on rear bumper" }, T), 200,
    (j) => j.state === "settled" && j.settlement.deductions === total && j.settlement.depositReturned === Math.max(0, rb.deposit - total)
      && j.settlement.due === Math.max(0, total - rb.deposit) && j.settlement.lines.some((l) => l.label === "Damage" && l.amount === 300) && j.settlement.damageNote === "Scratch on rear bumper");
  await expect("the booking is completed with what came back", call("GET", `/admin/bookings/${rb.id}`, null, T), 200,
    (j) => j.booking.status === "completed" && j.booking.refundAmount === Math.max(0, rb.deposit - total) && j.booking.rentalState === "settled"
      && j.history.some((h) => h.action === "rental.settle" && h.detail.deductions === total));
  await expect("settling twice is refused", call("POST", `/admin/bookings/${rb.id}/rental/settle`, { damage: 0 }, T), 409);
  await expect("the customer sees the settlement", call("GET", path, null, C2), 200, (j) => j.settlement?.deductions === total);
}

// ── Ride rules (MVAG 2025): surge cap and the rider cancellation fee ──
await expect("a surge cap above 2× is refused", call("PATCH", "/admin/settings", { surgeCap: 5 }, T), 400);
await expect("a surge multiplier above the cap can't be saved", call("PATCH", "/admin/settings", { surgeMultiplier: 2, surgeCap: 1.5 }, T), 400);
await expect("surge ×1.5 with a ×1.5 cap, all day", call("PATCH", "/admin/settings", { surgeMultiplier: 1.5, surgeCap: 1.5, surgeHours: "0-23" }, T), 200, (j) => j.surgeCap === 1.5);
await eventually("quotes carry the surge for disclosure", () => call("POST", "/rides/quote", { service: "car", pickupId: places[0].id, dropId: places[1].id }),
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

// ── Ride pricing that fits state rules (pricing step 6): surge rules, minimum fare and included km,
// night charge, the discount floor. Everything is put back in `finally`, even on a crash (this also runs on production).
{
  const quote = (service = "car") => call("POST", "/rides/quote", { service, pickupId: places[0].id, dropId: places[1].id });
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  await expect("a surge rule needs valid hours", call("POST", "/admin/catalog/surgeRule", { data: { name: "Bad", appliesTo: "cab", days: ["Mon"], hours: "20-8", multiplier: 1.3 } }, T), 400);
  await expect("a surge rule can't go above ×2", call("POST", "/admin/catalog/surgeRule", { data: { name: "Bad", appliesTo: "cab", days: ["Mon"], hours: "8-10", multiplier: 2.5 } }, T), 400);
  const rule = await expect("create a surge rule: cabs, every day, all day, ×1.9", call("POST", "/admin/catalog/surgeRule", { data: { name: "Smoke cab surge", appliesTo: "cab", days: day, hours: "0-23", multiplier: 1.9 } }, T), 201);
  const minType = await expect("create a ride type with a minimum fare and included km", call("POST", "/admin/catalog/rideOption", { data: {
    name: "Smoke Min", service: "bike", description: "Smoke test", seats: 1, baseFare: 10, perKm: 1, perMin: 0, models: ["Test"], minFare: 1500, includedKm: 3, speedKmh: 30,
  } }, T), 201);
  await expect("a minimum fare below the base fare is refused", call("POST", "/admin/catalog/rideOption", { data: {
    name: "Smoke Bad", service: "car", description: "Smoke", seats: 4, baseFare: 100, perKm: 10, perMin: 1, models: ["Test"], minFare: 50,
  } }, T), 400);
  try {
    await eventually("the surge rule reaches GET /config", () => call("GET", "/config"), (r) => (r.json?.surgeRules ?? []).some((x) => x.id === rule?.id));
    await eventually("cab quotes take the rule's surge (up to the cap)", quote, (r) => r.status === 200 && r.json.every((q) => q.surge === Math.min(1.9, s0.surgeCap)));
    await expect("bike quotes don't", quote("bike"), 200, (j) => j.every((q) => q.surge !== 1.9 || s0.surgeMultiplier === 1.9));
    await eventually("the minimum fare applies (before surge)", () => quote("bike"), (r) => {
      const q = r.json?.find?.((x) => x.option.id === minType?.id);
      return !!q && q.fare === Math.round(1500 * q.surge) + (q.nightCharge ?? 0);
    });
    await expect("night charge 20% all day", call("PATCH", "/admin/settings", { rideNightPercent: 20, rideNightHours: "0-23" }, T), 200, (j) => j.rideNightPercent === 20);
    await expect("night hours must not run backwards", call("PATCH", "/admin/settings", { rideNightHours: "22-5" }, T), 400);
    await eventually("quotes add and show the night charge", quote, (r) => r.status === 200 && r.json.every((q) => q.nightCharge > 0 && q.nightCharge === Math.round(((q.fare - q.nightCharge) * 20) / 100)));
    // Discount floor: a 50% coupon on a ride gives only what the 10% limit allows.
    await expect("rides can be discounted at most 10%", call("PATCH", "/admin/settings", { rideMaxDiscountPercent: 10 }, T), 200);
    const floorOffer = await expect("create a 50% ride coupon", call("POST", "/admin/catalog/offer", { data: {
      code: "smokefloor", title: "Smoke floor", description: "Test", service: "car", percent: 50, maxDiscount: 1000, minAmount: 0, validUntil: "", perUserLimit: "", hue: 10,
    } }, T), 201);
    const r1 = (await call("POST", "/rides", { optionId: "mini", pickupId: places[0].id, dropId: places[1].id, payment: "cash" }, C2)).json;
    await eventually("the coupon stops at the discount floor", () => call("POST", "/offers/check", { code: "SMOKEFLOOR", rideId: r1?.id }, C2),
      (r) => r.status === 200 && r.json.discount === Math.floor((r1.quote.fare * 10) / 100));
    if (r1) await call("POST", `/rides/${r1.id}/cancel`, null, C2);
    if (floorOffer) await call("DELETE", `/admin/catalog/offer/${floorOffer.id}`, null, T);
  } finally {
    if (rule) await call("DELETE", `/admin/catalog/surgeRule/${rule.id}`, null, T);
    if (minType) await call("DELETE", `/admin/catalog/rideOption/${minType.id}`, null, T);
    await expect("restore night and discount settings", call("PATCH", "/admin/settings", {
      rideNightPercent: s0.rideNightPercent, rideNightHours: s0.rideNightHours, rideMaxDiscountPercent: s0.rideMaxDiscountPercent,
    }, T), 200, (j) => j.rideNightPercent === s0.rideNightPercent && j.rideMaxDiscountPercent === s0.rideMaxDiscountPercent);
  }
  await eventually("quotes are back to normal", quote, (r) => r.status === 200 && r.json.every((q) => !q.nightCharge && q.surge !== 1.9 || s0.surgeMultiplier === 1.9));
}

// ── Bus and holiday pricing (pricing step 7): route fares, peak dates, airport fee, toll estimates
// settled at completion. Everything is put back in `finally` (this also runs on production).
{
  const created = [];
  const make = async (name, kind, data) => {
    const r = await expect(name, call("POST", `/admin/catalog/${kind}`, { data }, T), 201);
    if (r) created.push([kind, r.id]);
    return r;
  };
  await expect("a route needs two different cities", call("POST", "/admin/catalog/busRoute", { data: { from: "Chennai", to: "chennai", km: 350, acPerKm: 2, nonAcPerKm: 1.5 } }, T), 400);
  await expect("peak dates must run forwards", call("POST", "/admin/catalog/fareCalendar", { data: { name: "Bad", service: "bus", from: TRAVEL, to: "2020-01-01", percent: 20 } }, T), 400);
  try {
    await expect("no fare variation per bus (for exact fares)", call("PATCH", "/admin/settings", { busRandomExtraMax: 0, rideAirportFee: 50 }, T), 200, (j) => j.busRandomExtraMax === 0);
    await make("create a route fare: Chennai ⇄ Bengaluru, 350 km", "busRoute", { from: "Chennai", to: "Bengaluru", km: 350, acPerKm: 2, nonAcPerKm: 1.5 });
    const seaters = (j) => (Array.isArray(j) ? j : []).filter((b) => !b.sleeper);
    await eventually("listed routes are priced by distance (AC ₹700, non-AC ₹530)", () => call("GET", `/buses?from=Bengaluru&to=Chennai&date=${TRAVEL}`),
      (r) => r.status === 200 && seaters(r.json).length > 0 && seaters(r.json).every((b) => b.fare === (b.ac ? 700 : 530)));
    await make("create peak dates: +20% on buses and holidays", "fareCalendar", { name: "Smoke festival", service: "all", from: TRAVEL, to: TRAVEL, percent: 20 });
    await eventually("peak dates raise bus fares on those dates", () => call("GET", `/buses?from=Chennai&to=Bengaluru&date=${TRAVEL}`),
      (r) => r.status === 200 && seaters(r.json).length > 0 && seaters(r.json).every((b) => b.fare === (b.ac ? 840 : 630)));
    await eventually("a holiday quote shows the peak line before GST", () => call("POST", "/quotes", { service: "tours", tourId: anyDateTour.id, adults: 1, kids: 0, start: TRAVEL }),
      (r) => r.status === 201 && r.json.lines.some((l) => l.label === "Smoke festival (+20%)" && l.amount === Math.round((anyDateTour.data.price * 20) / 100)));
    await eventually("GET /config lists the peak dates", () => call("GET", "/config"), (r) => (r.json?.fareCalendar ?? []).some((e) => e.name === "Smoke festival"));
    // Airport fee: a place marked airport adds the fee to rides there.
    const ap = await make("create an airport place", "place", { name: "Smoke Airport", area: "Smoke", x: 90, y: 90, airport: "yes" });
    await eventually("rides to an airport add and show the fee", () => call("POST", "/rides/quote", { service: "car", pickupId: places[0].id, dropId: ap?.id }),
      (r) => r.status === 200 && r.json.every((q) => q.airportFee === 50));
    // Tolls: quoted as an estimate, settled with the actual amount when staff complete the trip.
    const dest = await make("create a destination with a toll estimate", "groupDestination", { name: "Smoke Tollgate", km: 120, tollEstimate: 300 });
    const vehicles = (await call("GET", "/rentals/travel-vehicles")).json;
    let gq;
    await eventually("a round trip quotes the tolls twice", async () => (gq = await call("POST", "/quotes", { service: "rentals", vehicleId: vehicles[0].id, trip: "outstation", destinationId: dest?.id, days: 2, start: dayOffset(30) })),
      (r) => r.status === 201 && r.json.lines.some((l) => l.label === "Tolls (estimate)" && l.amount === 600));
    const gb = (await call("POST", "/bookings", { service: "rentals", title: "Smoke toll trip", subtitle: "Tolls", payment: "upi", lines: [], quoteId: gq?.json?.id }, C2)).json;
    await expect("admin sees the toll estimate", call("GET", `/admin/bookings/${gb?.id}`, null, T), 200, (j) => j.tollEstimate === 600);
    await expect("completing needs the actual tolls", call("POST", `/admin/bookings/${gb?.id}/complete`, {}, T), 400, (j) => /actual tolls/.test(j.message));
    await expect("actual tolls can't be negative", call("POST", `/admin/bookings/${gb?.id}/complete`, { tollsActual: -5 }, T), 400);
    await expect("complete with ₹500 actual tolls: ₹100 due back", call("POST", `/admin/bookings/${gb?.id}/complete`, { tollsActual: 500 }, T), 200,
      (j) => j.booking.status === "completed" && j.booking.lines.some(([k, v]) => k === "Tolls" && /₹500/.test(v) && /₹100 refund due/.test(v)) && j.history[0]?.detail?.tollsRefund === 100);
    await expect("the customer sees the tolls line", call("GET", `/bookings/${gb?.id}`, null, C2), 200, (j) => j.lines.some(([k]) => k === "Tolls"));
  } finally {
    for (const [kind, id] of created.reverse()) await call("DELETE", `/admin/catalog/${kind}/${id}`, null, T);
    await expect("restore bus variation and airport fee", call("PATCH", "/admin/settings", { busRandomExtraMax: s0.busRandomExtraMax, rideAirportFee: s0.rideAirportFee }, T), 200,
      (j) => j.busRandomExtraMax === s0.busRandomExtraMax && j.rideAirportFee === s0.rideAirportFee);
  }
}

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
  await expect("staff are alerted about the application", call("GET", "/admin/alerts", null, T), 200, (j) => j.items.some((a) => a.kind === "vendor.applied" && a.link === `/vendors/view?id=${vid}`));
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
  await expect("staff are alerted about the vehicle", call("GET", "/admin/alerts", null, T), 200, (j) => j.items.some((a) => a.kind === "vendor.fleet" && a.body.includes(reg2)));
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
  await expect("staff are alerted about the drivers, without names", call("GET", "/admin/alerts", null, T), 200,
    (j) => j.items.some((a) => a.kind === "vendor.fleet" && a.title === "Driver to review") && !j.items.some((a) => /Ravi|Copy Cat|9123456780/.test(a.title + a.body)));
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
    await expect("staff are alerted about the payout", call("GET", "/admin/alerts", null, T), 200, (j) => j.items.some((a) => a.kind === "vendor.payout" && a.title.startsWith("Payout requested") && a.link === "/vendors"));
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

// Support: a customer's ticket reaches the staff queue; a staff reply notifies them; staff close it.
{
  const CS = (await call("POST", "/auth/verify", { phone: "71" + String(Date.now()).slice(-8), otp: OTP })).json?.token ?? "";
  await call("PATCH", "/me", { name: "Smoke Support" }, CS);
  const csMe = (await call("GET", "/auth/me", null, CS)).json;
  const st = await expect("customer opens a ticket", call("POST", "/me/tickets", { topic: "refund", message: "Smoke: where is my refund?" }, CS), 201, (j) => j.status === "open");
  await expect("staff are alerted about the ticket, without the customer", call("GET", "/admin/alerts", null, T), 200,
    (j) => j.items.some((a) => a.kind === "support.ticket" && a.title.includes("A refund") && a.link === "/support") && !JSON.stringify(j.items).includes("Smoke Support"));
  await expect("GET /admin/support lists it with the customer", call("GET", "/admin/support", null, T), 200, (j) => j.some((t) => t.id === st.id && t.customerId === csMe.id && t.messages.length === 1));
  await expect("a reply needs some text", call("POST", `/admin/support/${st.id}/reply`, { body: "ok" }, T), 400);
  await expect("staff reply", call("POST", `/admin/support/${st.id}/reply`, { body: "Smoke: your refund is on its way." }, T), 200,
    (j) => j.status === "answered" && j.messages.length === 2 && j.messages[1].author === "staff");
  await expect("the customer sees the staff reply", call("GET", `/me/tickets/${st.id}`, null, CS), 200,
    (j) => j.status === "answered" && j.messages[1].staffName && !("customerId" in j));
  await expect("and is notified", call("GET", "/me/notifications", null, CS), 200, (j) => j.items.some((n) => n.kind === "support.reply"));
  await expect("the customer replies", call("POST", `/me/tickets/${st.id}/messages`, { body: "Smoke: thanks, I'll wait." }, CS), 200, (j) => j.status === "open" && j.messages.length === 3);
  await expect("staff are alerted about the reply", call("GET", "/admin/alerts", null, T), 200, (j) => j.items.some((a) => a.kind === "support.reply" && a.title.startsWith("A customer replied")));
  const callerPhone = "7" + String(Date.now()).slice(-9);
  await expect("anyone asks for a callback", call("POST", "/support/callbacks", { name: "Smoke Caller", phone: callerPhone, topic: "holiday", preferredTime: "evening" }), 201, (j) => j.status === "open");
  await expect("staff are alerted about the callback, without the number", call("GET", "/admin/alerts", null, T), 200,
    (j) => j.items.some((a) => a.kind === "support.callback" && /Evening/.test(a.body)) && !JSON.stringify(j.items).includes(callerPhone));
  await expect("staff close it with a note", call("POST", `/admin/support/${st.id}/close`, { note: "Smoke: closing." }, T), 200, (j) => j.status === "closed" && j.messages.length === 4);
  await expect("closing twice is refused", call("POST", `/admin/support/${st.id}/close`, {}, T), 409);
  await expect("audit records support replies and closes", call("GET", `/admin/audit?entity=support&entityId=${st.id}`, null, T), 200,
    (j) => j.items.some((e) => e.action === "support.reply") && j.items.some((e) => e.action === "support.close"));
  await expect("an unknown ticket is 404", call("GET", "/admin/support/SPNOPE", null, T), 404);
  await call("POST", "/me/delete", { otp: OTP }, CS);
}

if (LOCAL) {
  // Roles
  const content = await expect("login: content role", login(CONTENT), 200, (j) => j.admin.role === "content");
  await expect("content can't settle a rental", call("POST", "/admin/bookings/QFNONE/rental/settle", { damage: 0 }, content.token), 403);
  await expect("content can see the dashboard", call("GET", "/admin/stats", null, content.token), 200);
  await expect("content can read settings", call("GET", "/admin/settings", null, content.token), 200);
  await expect("content can't change settings", call("PATCH", "/admin/settings", { licenceAutoApprove: true }, content.token), 403);
  await expect("content can't read the audit log", call("GET", "/admin/audit", null, content.token), 403);
  await expect("content can edit the catalog", call("GET", "/admin/catalog/faq", null, content.token), 200);
  // Prices need "pricing.edit" (owner, operations); content edits the text around them.
  const roC = (await call("GET", "/admin/catalog/rideOption", null, T)).json[0];
  await expect("content can change a ride type's description", call("PUT", `/admin/catalog/rideOption/${roC.id}`, { data: { ...roC.data, description: "Smoke description" } }, content.token), 200);
  await expect("content can't change a fare", call("PUT", `/admin/catalog/rideOption/${roC.id}`, { data: { ...roC.data, perKm: roC.data.perKm + 1 } }, content.token), 403, (j) => /Only owners and operations/.test(j.message) && /Per km/.test(j.message));
  await call("PUT", `/admin/catalog/rideOption/${roC.id}`, { data: roC.data }, T);
  await expect("content can't add a priced holiday package", call("POST", "/admin/catalog/tour", { data: { ...tours[0].data, slug: "smoke-content", title: "Smoke content" } }, content.token), 403);
  const ofC = (await call("GET", "/admin/catalog/offer", null, T)).json[0];
  await expect("content can't switch an offer off", call("PUT", `/admin/catalog/offer/${ofC.id}`, { active: !ofC.active }, content.token), 403);
  await expect("content can't change an offer's discount", call("PUT", `/admin/catalog/offer/${ofC.id}`, { data: { ...ofC.data, maxDiscount: ofC.data.maxDiscount + 1 } }, content.token), 403);
  await expect("content can edit an offer's wording", call("PUT", `/admin/catalog/offer/${ofC.id}`, { data: { ...ofC.data, description: "Smoke wording" } }, content.token), 200);
  await call("PUT", `/admin/catalog/offer/${ofC.id}`, { data: ofC.data }, T);
  await expect("content can't reset the catalog", call("POST", "/admin/catalog/reset", null, content.token), 403);
  await expect("content can't see bookings", call("GET", "/admin/bookings", null, content.token), 403);
  await expect("content can't review licences", call("GET", "/admin/licences", null, content.token), 403);
  await expect("content can't review partners", call("GET", "/admin/vendors", null, content.token), 403);
  await expect("content can't answer support", call("GET", "/admin/support", null, content.token), 403);

  // Reset brings back the seed (local only: it would wipe real edits in production)
  const extra = (await call("POST", "/admin/catalog/city", { data: { name: "Smoke City" } }, T)).json;
  await expect("POST /admin/catalog/reset", call("POST", "/admin/catalog/reset", null, T), 200, (j) => j.reset === true);
  await expect("reset removed the added city", call("GET", "/admin/catalog/city", null, T), 200, (j) => !j.some((c) => c.id === extra.id) && j.length === 8);

  // Lockout after 5 wrong passwords
  for (let i = 1; i <= 4; i++) await call("POST", "/admin/auth/login", { email: LOCKME.email, password: `wrong-${i}-xxxxx` });
  await expect("5th wrong password locks the account", login({ email: LOCKME.email, password: "wrong-5-xxxxx" }), 429, (j) => /Try again/.test(j.message));
  await expect("locked account refuses the right password too", login(LOCKME), 429);
}

// ───────── Phase 6: customers, booking notes, CSV export, SOS, team ─────────
{
  const found = await expect("GET /admin/customers?q=<phone>", call("GET", `/admin/customers?q=${CUSTOMER_PHONE}`, null, T), 200,
    (j) => j.items.some((x) => x.phone.replace(/\D/g, "").endsWith(CUSTOMER_PHONE)) && typeof j.total === "number");
  const customer = found.items.find((x) => x.phone.replace(/\D/g, "").endsWith(CUSTOMER_PHONE));
  await expect("GET /admin/customers?status=nope is 400", call("GET", "/admin/customers?status=nope", null, T), 400);
  const detail = await expect("GET /admin/customers/:id", call("GET", `/admin/customers/${customer.id}`, null, T), 200,
    (j) => j.customer.id === customer.id && Array.isArray(j.wallet) && Array.isArray(j.bookings) && typeof j.sessions === "number");
  const balance = detail.customer.walletBalance;
  await expect("wallet credit needs a reason", call("POST", `/admin/customers/${customer.id}/wallet`, { amount: 50 }, T), 400);
  await expect("wallet credit ₹50", call("POST", `/admin/customers/${customer.id}/wallet`, { amount: 50, reason: "Smoke test credit" }, T), 200,
    (j) => j.customer.walletBalance === balance + 50 && j.wallet[0].kind === "adjustment" && j.wallet[0].amount === 50 && j.wallet[0].note === "Smoke test credit");
  await expect("wallet debit ₹50 (back to where it was)", call("POST", `/admin/customers/${customer.id}/wallet`, { amount: -50, reason: "Smoke test debit" }, T), 200,
    (j) => j.customer.walletBalance === balance && j.history[0].action === "customer.wallet_debit");
  await expect("a debit below zero is 409", call("POST", `/admin/customers/${customer.id}/wallet`, { amount: -(balance + 1), reason: "Too much, refuse" }, T), 409);
  await expect("a ₹0 adjustment is 400", call("POST", `/admin/customers/${customer.id}/wallet`, { amount: 0, reason: "Nothing at all" }, T), 400);
  // The customer smoke test schedules this account's deletion at its end (sign-in restores it), so either state is possible here.
  await expect(detail.customer.status === "deleting" ? "POST /admin/customers/:id/cancel-deletion" : "cancel-deletion when none is scheduled is 409",
    call("POST", `/admin/customers/${customer.id}/cancel-deletion`, { reason: "Smoke: keep this account" }, T), detail.customer.status === "deleting" ? 200 : 409,
    (j) => detail.customer.status !== "deleting" || j.customer.status === "active");
  await expect("customer sees the adjustment in the wallet", call("GET", "/me/wallet", null, (await call("POST", "/auth/verify", { phone: CUSTOMER_PHONE, otp: OTP })).json.token), 200,
    (j) => j[0].kind === "adjustment" && j[0].amount === -50);

  // Booking notes (internal) and the CSV export
  const page1 = (await call("GET", "/admin/bookings", null, T)).json;
  const anyBooking = page1?.items?.[0];
  if (anyBooking) {
    await expect("a one-letter note is refused", call("POST", `/admin/bookings/${anyBooking.id}/notes`, { body: "x" }, T), 400);
    const notes = await expect("POST /admin/bookings/:id/notes", call("POST", `/admin/bookings/${anyBooking.id}/notes`, { body: "Smoke note: customer called about this trip." }, T), 201,
      (j) => j.at(-1).body.startsWith("Smoke note") && j.at(-1).admin.name);
    await expect("the note is on the booking detail", call("GET", `/admin/bookings/${anyBooking.id}`, null, T), 200, (j) => j.notes.length === notes.length && j.history[0].action === "booking.note");
  }
  await expect("note on an unknown booking is 404", call("POST", "/admin/bookings/nope/notes", { body: "Smoke note for nobody" }, T), 404);
  {
    const res = await fetch(BASE + "/admin/bookings/export.csv?status=cancelled", { headers: { Authorization: `Bearer ${T}` } });
    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    check("GET /admin/bookings/export.csv", res.status === 200 && /text\/csv/.test(res.headers.get("content-type") || "") && /attachment; filename="quikfly-bookings-/.test(res.headers.get("content-disposition") || "")
      && lines[0].startsWith("booking_id,created_at,service,status"), `${res.status} ${lines[0]?.slice(0, 80)} rows=${lines.length - 1}`);
    await expect("the export is audited", call("GET", "/admin/audit?entity=bookings", null, T), 200, (j) => j.items[0]?.action === "bookings.export" && j.items[0].detail.rows === lines.length - 1);
  }

  // SOS: the customer presses it; staff acknowledge and close
  const custToken = (await call("POST", "/auth/verify", { phone: CUSTOMER_PHONE, otp: OTP })).json.token;
  const sos = await expect("customer: POST /me/sos", call("POST", "/me/sos", { note: "Smoke SOS, ignore" }, custToken), 201, (j) => j.status === "open");
  await expect("GET /admin/sos lists it open", call("GET", "/admin/sos", null, T), 200, (j) => j.some((a) => a.id === sos.id && a.customer.id === customer.id && a.note === "Smoke SOS, ignore"));
  // Staff alerts: the SOS reaches the bell at once, naming no one; read marks are per admin; a browser can register for push.
  const alerts = await expect("GET /admin/alerts has the SOS, naming no one", call("GET", "/admin/alerts", null, T), 200,
    (j) => j.unread >= 1 && "push" in j && j.items.some((a) => a.kind === "sos.raised" && a.link === "/sos" && a.readAt === null)
      && !JSON.stringify(j.items).includes(customer.name) && !JSON.stringify(j.items).includes(CUSTOMER_PHONE));
  const sosAlert = alerts.items.find((a) => a.kind === "sos.raised" && a.readAt === null);
  await expect("POST /admin/alerts/read marks one read", call("POST", "/admin/alerts/read", { ids: [sosAlert.id] }, T), 200, (j) => j.unread === alerts.unread - 1);
  await expect("it shows as read for this admin", call("GET", "/admin/alerts", null, T), 200, (j) => !!j.items.find((a) => a.id === sosAlert.id)?.readAt);
  await expect("bad ids are 400", call("POST", "/admin/alerts/read", { ids: "all" }, T), 400);
  await expect("mark everything read", call("POST", "/admin/alerts/read", {}, T), 200, (j) => j.unread === 0);
  const sos2 = await expect("pressing SOS again alerts again", call("POST", "/me/sos", { note: "Smoke SOS 2, ignore" }, custToken), 201);
  await expect("the new alert is unread", call("GET", "/admin/alerts", null, T), 200, (j) => j.unread >= 1 && j.items.some((a) => a.kind === "sos.raised" && a.readAt === null));
  // Close it, so no smoke run leaves an open SOS for staff (or fills the customer's open-alert limit).
  if (sos2?.id) await call("POST", `/admin/sos/${sos2.id}/close`, { reason: "Smoke test: second alert, ignore" }, T);
  const staffSub = JSON.stringify({ endpoint: `https://push.example/staff/${Date.now()}`, expirationTime: null, keys: { p256dh: "x", auth: "y" } });
  await expect("POST /admin/push-devices", call("POST", "/admin/push-devices", { token: staffSub, platform: "web" }, T), 201, (j) => j.registered === true);
  await expect("a staff push device needs a known platform", call("POST", "/admin/push-devices", { token: staffSub, platform: "pager" }, T), 400);
  await expect("DELETE /admin/push-devices/:token", call("DELETE", `/admin/push-devices/${encodeURIComponent(staffSub)}`, null, T), 200, (j) => j.removed === true);
  await expect("closing without a note is 400", call("POST", `/admin/sos/${sos.id}/close`, {}, T), 400);
  await expect("POST /admin/sos/:id/acknowledge", call("POST", `/admin/sos/${sos.id}/acknowledge`, { note: "Calling the customer" }, T), 200, (j) => j.status === "acknowledged" && j.handledBy?.name);
  await expect("acknowledging twice is 409", call("POST", `/admin/sos/${sos.id}/acknowledge`, {}, T), 409);
  await expect("POST /admin/sos/:id/close", call("POST", `/admin/sos/${sos.id}/close`, { reason: "Smoke test: false alarm, customer fine" }, T), 200, (j) => j.status === "closed" && /false alarm/.test(j.handledNote));
  await expect("closing twice is 409", call("POST", `/admin/sos/${sos.id}/close`, { reason: "Smoke test again" }, T), 409);
  await expect("GET /admin/sos?status=closed has it", call("GET", "/admin/sos?status=closed", null, T), 200, (j) => j.some((a) => a.id === sos.id));
  await expect("the dashboard counts open SOS", call("GET", "/admin/stats?days=1", null, T), 200, (j) => typeof j.queues.openSos === "number");

  if (LOCAL) {
    // Suspend: sessions end and sign-in is refused until lifted
    const before = (await call("POST", "/auth/verify", { phone: CUSTOMER_PHONE, otp: OTP })).json.token;
    await expect("POST /admin/customers/:id/suspend", call("POST", `/admin/customers/${customer.id}/suspend`, { reason: "Smoke: testing suspension" }, T), 200, (j) => j.customer.status === "suspended" && j.sessions === 0);
    await expect("a suspended customer's old token is 401", call("GET", "/auth/me", null, before), 401);
    await expect("a suspended customer can't sign in (403)", call("POST", "/auth/verify", { phone: CUSTOMER_PHONE, otp: OTP }), 403, (j) => /suspended/i.test(j.message));
    await expect("suspending twice is 409", call("POST", `/admin/customers/${customer.id}/suspend`, { reason: "Smoke: again" }, T), 409);
    await expect("POST /admin/customers/:id/unsuspend", call("POST", `/admin/customers/${customer.id}/unsuspend`, { reason: "Smoke: lifting it" }, T), 200, (j) => j.customer.status === "active");
    await expect("sign-in works again", call("POST", "/auth/verify", { phone: CUSTOMER_PHONE, otp: OTP }), 200, (j) => j.token);
    const live = (await call("POST", "/auth/verify", { phone: CUSTOMER_PHONE, otp: OTP })).json.token;
    await expect("POST /admin/customers/:id/sign-out", call("POST", `/admin/customers/${customer.id}/sign-out`, { reason: "Smoke: lost phone" }, T), 200, (j) => j.sessions === 0);
    await expect("signed-out token is 401", call("GET", "/auth/me", null, live), 401);
    await expect("GET /admin/customers?status=suspended", call("GET", "/admin/customers?status=suspended", null, T), 200, (j) => !j.items.some((x) => x.id === customer.id));

    // Roles: content can't see customers, SOS or the team
    const ct = (await login(CONTENT)).json.token;
    await expect("content role can't list customers", call("GET", "/admin/customers", null, ct), 403);
    await expect("content role can't see SOS", call("GET", "/admin/sos", null, ct), 403);
    await expect("content role has no staff alerts", call("GET", "/admin/alerts", null, ct), 403);
    await expect("content role can't see the team", call("GET", "/admin/team", null, ct), 403);

    // Team (owners only)
    const email = `smoke-${Date.now().toString(36)}@quikfly.test`;
    await expect("team: a bad email is 400", call("POST", "/admin/team", { email: "nope", name: "Smoke Member", role: "operations" }, T), 400);
    const made = await expect("POST /admin/team", call("POST", "/admin/team", { email, name: "Smoke Member", role: "operations" }, T), 201,
      (j) => j.member.email === email && j.member.role === "operations" && j.password?.length >= 10 && !("password_hash" in j.member));
    await expect("the same email twice is 409", call("POST", "/admin/team", { email, name: "Smoke Member", role: "operations" }, T), 409);
    await expect("GET /admin/team lists it", call("GET", "/admin/team", null, T), 200, (j) => j.some((m) => m.id === made.member.id && m.disabledAt === null));
    const first = await expect("the new member can sign in", login({ email, password: made.password }), 200, (j) => j.admin.role === "operations");
    await expect("operations can't open the team", call("GET", "/admin/team", null, first.token), 403);
    await expect("PATCH /admin/team/:id role", call("PATCH", `/admin/team/${made.member.id}`, { role: "content" }, T), 200, (j) => j.role === "content");
    await expect("a role change ends their sessions", call("GET", "/admin/auth/me", null, first.token), 401);
    await expect("you can't change your own role", call("PATCH", `/admin/team/${owner.admin.id}`, { role: "content" }, T), 409);
    const reset = await expect("POST /admin/team/:id/reset-password", call("POST", `/admin/team/${made.member.id}/reset-password`, null, T), 200, (j) => j.password && j.password !== made.password);
    await expect("the old password no longer works", login({ email, password: made.password }), 401);
    await expect("the new password works", login({ email, password: reset.password }), 200);
    await expect("PATCH /admin/team/:id disabled", call("PATCH", `/admin/team/${made.member.id}`, { disabled: true }, T), 200, (j) => j.disabledAt);
    await expect("a disabled member can't sign in (403)", login({ email, password: reset.password }), 403);
    await expect("you can't disable yourself", call("PATCH", `/admin/team/${owner.admin.id}`, { disabled: true }, T), 409);
    await expect("team changes are audited", call("GET", "/admin/audit?entity=admin", null, T), 200, (j) => j.items[0]?.action === "team.update" && j.items.some((a) => a.action === "team.create"));
  }
}

// ── Parcels: the whole journey. Local only: it switches the service on, then puts it back. ──
if (LOCAL) {
  const before = await expect("settings before the parcel checks", call("GET", "/admin/settings", null, T), 200);
  await expect("parcel band extras must be well formed", call("PATCH", "/admin/settings", { parcelCityBandExtra: "2:0, 5:10" }, T), 400);
  await expect("parcel band extras can't fall as weight rises", call("PATCH", "/admin/settings", { parcelCityBandExtra: "2:0, 5:30, 10:25, 20:50" }, T), 400);
  await expect("declared value stays below the e-way bill limit", call("PATCH", "/admin/settings", { parcelMaxDeclaredValue: 50000 }, T), 400);
  await expect("parcels on", call("PATCH", "/admin/settings", { serviceParcel: true, parcelSimulateTransit: false }, T), 200, (j) => j.serviceParcel === true);
  try {
    await eventually("the switch reaches customers", () => call("GET", "/parcels/options?from=Chennai&to=Coimbatore"), (r) => r.status === 200);
    const newPhone = () => `8${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
    const senderPhone = newPhone(), receiverPhone = newPhone();
    const S = (await call("POST", "/auth/verify", { phone: senderPhone, otp: OTP })).json.token;
    const R = (await call("POST", "/auth/verify", { phone: receiverPhone, otp: OTP })).json.token;
    const balance = async () => (await call("GET", "/auth/me", null, S)).json.walletBalance;

    const options = await expect("parcel departures", call("GET", "/parcels/options?from=chennai&to=coimbatore"), 200,
      (j) => j.departures.length >= 6 && j.departures.every((d) => d.operator === "QuikFly Travels" && d.from === "Chennai"));
    await expect("the same city twice is refused", call("GET", "/parcels/options?from=Chennai&to=Chennai"), 400);
    await expect("an unknown city is refused", call("GET", "/parcels/options?from=Chennai&to=Salem"), 400);
    const bus = options.departures.at(-1);
    const base = { service: "parcel", mode: "intercity", from: "Chennai", to: "Coimbatore", busId: bus.busId, departAt: bus.departAt, category: "clothes", weightBand: "2", size: "box", declaredValue: 8000, pickup: "counter", delivery: "counter" };
    const quoteOf = async (patch = {}) => (await call("POST", "/quotes", { ...base, ...patch })).json;
    const priced = await quoteOf();
    check("route slab + handling + GST", priced.total === Math.round((80 + before.parcelHandlingFee) * (1 + before.gstParcel / 100)), JSON.stringify(priced));
    check("liability is the lower of value and cap", priced.parcel?.liability === Math.min(8000, before.parcelLiabilityCap), JSON.stringify(priced.parcel));
    check("an unlisted route is priced per kg", (await (async () => {
      const d = (await call("GET", "/parcels/options?from=Madurai&to=Kochi")).json.departures[0];
      const q = await quoteOf({ from: "Madurai", to: "Kochi", busId: d.busId, departAt: d.departAt, weightBand: "10" });
      return q.lines?.[0].amount === Math.max(before.parcelIntercityMinCharge, before.parcelIntercityPerKg * 10);
    })()));
    await expect("over the value cap is refused", call("POST", "/quotes", { ...base, declaredValue: before.parcelMaxDeclaredValue + 1 }), 400);
    await expect("a bus that doesn't run is refused", call("POST", "/quotes", { ...base, departAt: "2031-01-01T12:00:00.000Z" }), 400);
    await expect("door legs aren't open yet", call("POST", "/quotes", { ...base, pickup: "door" }), 400);
    await expect("a client can't send its own plan", call("POST", "/quotes", { ...base, plan: { liability: 99999 } }), 201, (j) => j.parcel.liability !== 99999);
    const places = (await call("GET", "/config")).json.places;
    const city = await expect("a Quick parcel can be priced", call("POST", "/quotes", { service: "parcel", mode: "city", pickupId: places[0].id, dropId: places[1].id, category: "documents", weightBand: "5", size: "backpack", declaredValue: 100 }), 201,
      (j) => j.parcel.departure === null && j.lines.some((l) => l.label.startsWith("Weight")));

    const contents = "Two cotton shirts";
    const bodyFor = (quoteId, patch = {}) => ({ service: "parcel", title: "Client title", subtitle: "Client subtitle", payment: "wallet", lines: [["Receiver", receiverPhone]], quoteId,
      receiver: { name: "Ravi Receiver", phone: receiverPhone }, contents, declaration: options.declaration.version, ...patch });
    await expect("a parcel needs a receiver", call("POST", "/bookings", bodyFor(priced.id, { receiver: undefined }), S), 400);
    await expect("a parcel needs a valid number", call("POST", "/bookings", bodyFor(priced.id, { receiver: { name: "Ravi", phone: "1234567890" } }), S), 400);
    await expect("a parcel needs the current declaration", call("POST", "/bookings", bodyFor(priced.id, { declaration: "2000-01-01" }), S), 400);
    await expect("a bus parcel can't be cash", call("POST", "/bookings", bodyFor(priced.id, { payment: "cash" }), S), 400);

    await quickParcelChecks({ before, places, options, newPhone, priced: city, contentStaff: (await login(CONTENT)).json.token });

    const opening = await balance();
    const book = async (name) => expect(name, call("POST", "/bookings", bodyFor((await quoteOf()).id), S), 201, (j) => j.parcelState === "booked" && j.amount === priced.total);
    const move = (id, seq, body, as = T) => call("POST", `/admin/parcels/${id}/legs/${seq}`, body, as);
    const b = await book("book a bus parcel from the wallet");
    check("the wallet paid the quote", (await balance()) === opening - priced.total);
    check("the API writes the booking's text, with no personal data", b.title === "Chennai → Coimbatore" && !JSON.stringify([b.title, b.subtitle, b.lines]).includes(receiverPhone), JSON.stringify(b.lines));
    const p = await expect("the sender reads the parcel", call("GET", `/bookings/${b.id}/parcel`, null, S), 200, (j) => j.state === "booked" && j.collectOtp === null);
    await expect("the receiver's account gets no access", call("GET", `/bookings/${b.id}/parcel`, null, R), 404);

    // A client that can't show parcels (app 0.1.16) gets none of them.
    const old = (method, path, body) => call(method, path, body, S, OLD_CLIENT);
    const ride = await (async () => {
      const opts = await call("POST", "/rides/quote", { service: "car", pickupId: places[0].id, dropId: places[1].id });
      const made = await call("POST", "/rides", { optionId: opts.json[0].option.id, pickupId: places[0].id, dropId: places[1].id, payment: "upi" }, S);
      return (await call("POST", "/bookings", { service: "car", title: "Old client ride", subtitle: "A → B", payment: "upi", lines: [], rideId: made.json.id }, S)).json;
    })();
    await expect("a client that shows parcels lists it", call("GET", "/bookings", null, S), 200, (j) => j.some((x) => x.id === b.id) && j.some((x) => x.id === ride.id));
    await expect("an old client's My Trips has no parcel, and keeps the rest", old("GET", "/bookings"), 200, (j) => !j.some((x) => x.service === "parcel") && j.some((x) => x.id === ride.id));
    await expect("an old client still opens its other bookings", old("GET", `/bookings/${ride.id}`), 200, (j) => j.id === ride.id);
    await expect("an old client can't open a parcel booking", old("GET", `/bookings/${b.id}`), 404, (j) => /Update QuikFly/.test(j.message));
    await expect("an old client can't read the parcel or its code", old("GET", `/bookings/${b.id}/parcel`), 404);
    await expect("an old client can't cancel on a cab's refund promise", old("POST", `/bookings/${b.id}/cancel`, {}), 404);
    await expect("an old client can't complete one either", old("POST", `/bookings/${b.id}/complete`, {}), 404);
    await expect("an old client can't book one", old("POST", "/bookings", bodyFor((await quoteOf()).id)), 409, (j) => /Update QuikFly/.test(j.message));
    for (const accept of ["*/*", "text/html", "application/json; services=", "application/json; services=parcels"]) {
      await expect(`"${accept}" doesn't declare parcels`, call("GET", "/bookings", null, S, accept), 200, (j) => !j.some((x) => x.service === "parcel"));
    }
    await expect("parcels among several declared services", call("GET", "/bookings", null, S, "application/json; services=other+parcel"), 200, (j) => j.some((x) => x.id === b.id));
    await expect("someone else's parcel is still just not found", call("GET", `/bookings/${b.id}`, null, R, OLD_CLIENT), 404, (j) => !/Update QuikFly/.test(j.message));
    const contentStaff = (await login(CONTENT)).json.token;
    const queue = (query = "", as = T) => call("GET", `/admin/parcels${query}`, null, as);
    const listed = (j) => j.items.some((x) => x.bookingId === b.id);
    const busDate = new Date(Date.parse(bus.departAt) + 330 * 60_000).toISOString().slice(0, 10);
    await expect("content staff can't read the queue", queue("", contentStaff), 403);
    await expect("content staff can't read a parcel", queue(`/${b.id}`, contentStaff), 403);
    await expect("a customer token can't read the queue", queue("", S), 401);
    await expect("no token, no queue", queue("", ""), 401);
    await expect("an unknown parcel is 404", queue("/QFNOPE"), 404);
    await expect("the queue refuses an unknown status", queue("?state=lost"), 400);
    await expect("the queue refuses a malformed date", queue("?date=22-11-2026"), 400);
    await expect("search by LR", queue(`?q=${p.lr.toLowerCase()}`), 200,
      (j) => j.total === 1 && listed(j) && j.items[0].receiver.name === "Ravi Receiver" && j.items[0].legs.length === 3);
    await expect("search by booking id", queue(`?q=${b.id}`), 200, listed);
    await expect("search by the sender's number", queue(`?q=${senderPhone}`), 200, listed);
    await expect("search by the receiver's number, spaced", queue(`?q=${encodeURIComponent(`+91 ${receiverPhone.slice(0, 5)} ${receiverPhone.slice(5)}`)}`), 200, listed);
    await expect("search is not a wildcard", queue("?q=QFP-%25%25%25%25%25ZZZZZZZZZ"), 200, (j) => j.total === 0);
    await expect("search by a number with a leading 0", queue(`?q=0${senderPhone}`), 200, listed);
    await expect("only wildcards find nothing", queue("?q=%25%25%25"), 200, (j) => j.total === 0);
    await expect("a 60-character search doesn't break", queue(`?q=${"A".repeat(60)}`), 200, (j) => j.total === 0);
    await expect("a 55-digit search doesn't break", queue(`?q=${"9".repeat(55)}`), 200);
    await expect("filter by the sending counter", queue(`?city=chennai&q=${p.lr}`), 200, listed);
    await expect("filter by the collecting counter", queue(`?city=Coimbatore&q=${p.lr}`), 200, listed);
    await expect("another city's counter doesn't list it", queue(`?city=Madurai&q=${p.lr}`), 200, (j) => j.total === 0);
    await expect("filter by the bus's India date", queue(`?date=${busDate}&q=${p.lr}`), 200, listed);
    await expect("another date doesn't list it", queue(`?date=2031-01-01&q=${p.lr}`), 200, (j) => j.total === 0);
    await expect("filter by status", queue(`?state=booked&q=${p.lr}`), 200, listed);
    await expect("open parcels come soonest bus first", queue("?state=open"), 200,
      (j) => j.pageSize > 0 && j.items.every((x) => !["collected", "cancelled", "delivered", "returned"].includes(x.state))
        && j.items.filter((x) => x.departAt).every((x, i, buses) => i === 0 || buses[i - 1].departAt <= x.departAt));
    await expect("one parcel for staff", queue(`/${b.id}`), 200,
      (j) => j.sender.phone.replace(/\D/g, "").endsWith(senderPhone) && j.refundIfCancelled?.amount === priced.total && j.payment === "wallet" && j.collectOtp === null && j.events[0].by === null);
    await expect("content staff can't move parcels", move(b.id, 0, { to: "active" }, contentStaff), 403);
    await expect("a customer token can't move parcels", move(b.id, 0, { to: "active" }, S), 401);
    await expect("can't load before hand-in", move(b.id, 1, { to: "active" }), 409);
    await expect("receive at the counter", move(b.id, 0, { to: "active" }), 200, (j) => j.state === "at_counter");
    await expect("the booking is ongoing", call("GET", `/bookings/${b.id}`, null, S), 200, (j) => j.status === "ongoing" && j.parcelState === "at_counter");
    await expect("the same move twice is 409", move(b.id, 0, { to: "active" }), 409);
    const race = await Promise.all([1, 2, 3, 4].map(() => move(b.id, 1, { to: "active" })));
    check("four staff loading at once: one wins", race.filter((r) => r.status === 200).length === 1 && race.filter((r) => r.status === 409).length === 3, race.map((r) => r.status).join(","));
    await expect("no cancelling on the bus", call("POST", `/bookings/${b.id}/cancel`, {}, S), 409, (j) => /on its way/.test(j.message));
    await expect("staff can't cancel on the bus either", call("POST", `/admin/bookings/${b.id}/cancel`, { reason: "Smoke: too late" }, T), 409);
    await expect("no refund preview on the bus", call("GET", `/admin/bookings/${b.id}`, null, T), 200, (j) => j.refundIfCancelled === null && j.booking.parcelState === "on_bus");
    await expect("no refusing on the bus", move(b.id, 0, { to: "failed", note: "Too late to refuse" }), 409);
    await expect("reached", move(b.id, 1, { to: "done" }), 200, (j) => j.state === "reached");
    await expect("ready, and staff don't see the code", move(b.id, 2, { to: "active" }), 200, (j) => j.state === "ready" && j.collectOtp === null && Date.parse(j.holdUntil) > Date.now());
    const ready = await expect("the sender sees the code", call("GET", `/bookings/${b.id}/parcel`, null, S), 200, (j) => /^\d{6}$/.test(j.collectOtp));
    const code = ready.collectOtp;
    await expect("the code is in no notification", call("GET", "/me/notifications", null, S), 200, (j) => j.items.some((n) => n.kind === "parcel.ready") && !JSON.stringify(j).includes(code));
    await expect("the code isn't in the queue", queue(`?q=${p.lr}`), 200, (j) => j.items[0].state === "ready" && !JSON.stringify(j).includes(code));
    await expect("staff read who moved it, never the code", queue(`/${b.id}`), 200,
      (j) => !JSON.stringify(j).includes(code) && j.collectOtp === null && j.refundIfCancelled === null && j.events.filter((e) => e.by).length === 4);
    const inbox = (await call("GET", "/me/notifications", null, S)).json;
    const about = inbox.items.filter((n) => n.bookingId === b.id);
    await expect("an old client's inbox has nothing about the parcel", old("GET", "/me/notifications"), 200,
      (j) => about.length >= 2 && !j.items.some((n) => n.bookingId === b.id) && j.unread < inbox.unread && j.items.every((n) => !n.kind.startsWith("parcel.")));
    await expect("an old client's 'mark all read' reads only what it showed", old("POST", "/me/notifications/read", {}), 200, (j) => j.unread === 0);
    await expect("the parcel's notifications are still unread where they show", call("GET", "/me/notifications", null, S), 200,
      (j) => j.items.filter((n) => n.bookingId === b.id).every((n) => n.readAt === null) && j.unread >= about.length);
    await expect("the receiver's inbox has nothing about it", call("GET", "/me/notifications", null, R), 200, (j) => !j.items.some((n) => n.kind.startsWith("parcel.")));
    await expect("the tracking page is public and private", call("GET", `/track/${p.lr.toLowerCase()}`), 200,
      (j) => j.state === "ready" && j.receiver === "Ravi" && ![receiverPhone, senderPhone, contents, code, "8000"].some((v) => JSON.stringify({ ...j, events: j.events.map((e) => e.state) }).includes(v)));
    await expect("the sender's export masks the receiver and omits the code", call("GET", "/me/export", null, S), 200,
      (j) => j.data.parcels_sent[0].receiver_phone === `******${receiverPhone.slice(-4)}` && !("collect_otp" in j.data.parcels_sent[0]) && !JSON.stringify(j.data.parcels_sent).includes(code));
    await expect("the receiver's export lists it, sender masked", call("GET", "/me/export", null, R), 200,
      (j) => j.data.parcels_received[0].sender_phone === `******${senderPhone.slice(-4)}` && !JSON.stringify(j.data).includes(contents) && !JSON.stringify(j.data.parcels_received).includes(code));
    await expect("complete can't skip the code", call("POST", `/admin/bookings/${b.id}/complete`, {}, T), 409, (j) => /code/.test(j.message));
    await expect("the customer can't complete it", call("POST", `/bookings/${b.id}/complete`, {}, S), 409);
    await expect("not unclaimed before the hold ends", move(b.id, 2, { to: "failed" }), 409);
    await expect("hand-over needs the code", move(b.id, 2, { to: "done" }), 400);
    await expect("a wrong code is refused", move(b.id, 2, { to: "done", otp: code === "111111" ? "222222" : "111111" }), 400);
    await expect("hand over with the code", move(b.id, 2, { to: "done", otp: code }), 200, (j) => j.state === "collected");
    await expect("collected leaves the open queue", queue(`?state=open&q=${p.lr}`), 200, (j) => j.total === 0);
    await expect("but a search still finds it", queue(`?q=${p.lr}`), 200, listed);
    await expect("collected completes the booking", call("GET", `/bookings/${b.id}`, null, S), 200, (j) => j.status === "completed" && j.parcelState === "collected");
    await expect("collected stays out of an old client's Past trips", old("GET", "/bookings"), 200, (j) => !j.some((x) => x.id === b.id));
    await expect("collection earns credits once", call("GET", "/me/credits", null, S), 200,
      (j) => j.items.filter((x) => x.bookingId === b.id && x.kind === "earned").length === (Math.floor((priced.total * before.creditsParcel) / 100) ? 1 : 0));
    await expect("every move is audited once", call("GET", `/admin/audit?entity=booking&entityId=${b.id}`, null, T), 200,
      (j) => j.items.filter((a) => a.action === "parcel.move").length === 5 && j.items.filter((a) => a.action === "parcel.code_wrong").length === 1 && !JSON.stringify(j).includes(code));

    const paid = await balance();
    const c = await book("book a parcel to cancel");
    const cancels = await Promise.all([1, 2, 3, 4].map(() => call("POST", `/bookings/${c.id}/cancel`, {}, S)));
    check("four cancels at once: one wins", cancels.filter((r) => r.status === 200).length === 1, cancels.map((r) => r.status).join(","));
    check("and refunds once", (await balance()) === paid);
    await expect("a cancelled parcel can't move", move(c.id, 0, { to: "active" }), 409);

    const r = await book("book a parcel to refuse");
    await move(r.id, 0, { to: "active" });
    await expect("refusing needs a reason", move(r.id, 0, { to: "failed" }), 400);
    await expect("refused on sight", move(r.id, 0, { to: "failed", note: "Contains a gas cylinder" }), 200, (j) => j.state === "cancelled" && j.legs.every((l) => l.state === "failed"));
    check("a refusal refunds all of it", (await balance()) === paid);
    await expect("a refusal is audited with its reason", call("GET", `/admin/audit?entity=booking&entityId=${r.id}`, null, T), 200, (j) => j.items.some((a) => a.action === "parcel.refuse" && /cylinder/.test(a.detail.reason)));

    // UPI for these, so the sender's wallet stays out of it.
    const g = await expect("a parcel with no GST profile gets no GST line", call("POST", "/bookings",
      bodyFor((await quoteOf()).id, { payment: "upi", lines: [["GSTIN", "29AAAAA0000A1Z5 · Not Theirs"]] }), S), 201, (j) => !j.lines.some(([k]) => k === "GSTIN"));
    await expect("save a GST profile", call("PATCH", "/me", { gst: { gstin: "33ABCDE1234F1Z5", name: "Smoke Traders" } }, S), 200);
    const gst = await expect("a GST parcel invoice uses the profile, not the request", call("POST", "/bookings",
      bodyFor((await quoteOf()).id, { payment: "upi", lines: [["GSTIN", "29AAAAA0000A1Z5 · Not Theirs"], ["Receiver", receiverPhone]] }), S), 201,
      (j) => j.lines.filter(([k]) => k === "GSTIN").length === 1 && j.lines.some(([, v]) => v === "33ABCDE1234F1Z5 · Smoke Traders") && !JSON.stringify(j.lines).includes(receiverPhone));
    await expect("no GST line unless asked", call("POST", "/bookings", bodyFor((await quoteOf()).id, { payment: "upi", lines: [] }), S), 201,
      (j) => !j.lines.some(([k]) => k === "GSTIN"));

    await move(g.id, 0, { to: "active" }); // at the counter: the sender may still cancel
    await expect("the sender can cancel at the counter", call("POST", `/bookings/${g.id}/cancel`, {}, S), 200, (j) => j.parcelState === "cancelled");

    const u = gst;
    for (const [seq, to] of [[0, "active"], [1, "active"], [1, "done"], [2, "active"]]) await move(u.id, seq, { to });
    check("the test ends the hold", endHold(u.id));
    await expect("unclaimed after the hold", move(u.id, 2, { to: "failed" }), 200, (j) => j.state === "unclaimed" && j.bookingStatus === "ongoing" && j.collectOtp === null);
    await expect("unclaimed clears the code", call("GET", `/bookings/${u.id}/parcel`, null, S), 200, (j) => j.state === "unclaimed" && j.collectOtp === null);
    await expect("unclaimed stays in the open queue", queue(`?state=open&q=${u.id}`), 200, (j) => j.total === 1 && j.items[0].state === "unclaimed");
    await expect("unclaimed can't be handed over", move(u.id, 2, { to: "done", otp: "123456" }), 409);

    await parcelOpsChecks({ before, options, base, newPhone, contentStaff });
    await counterChecks({ options, base, newPhone });

    await expect("a counter needs a real operator", call("POST", "/admin/catalog/parcelCounter", { data: { operatorId: "nope", city: "Chennai", name: "X", address: "Y", hours: "9-5", phone: "1800 123 4567" } }, T), 400);
    await expect("a counter needs a listed city", call("POST", "/admin/catalog/parcelCounter", { data: { operatorId: "bo1", city: "Salem", name: "X", address: "Y", hours: "9-5", phone: "1800 123 4567" } }, T), 400);
    const rate = { operatorId: "bo1", from: "Trichy", to: "Kochi", price2: 70, price5: 90, price10: 120, price20: 200 };
    await expect("content staff can't set parcel rates", call("POST", "/admin/catalog/parcelRate", { data: rate }, contentStaff), 403);
    await expect("a heavier band can't be cheaper", call("POST", "/admin/catalog/parcelRate", { data: { ...rate, price20: 10 } }, T), 400);
  } finally {
    await expect("parcel settings put back", call("PATCH", "/admin/settings", { serviceParcel: before.serviceParcel, parcelSimulateTransit: before.parcelSimulateTransit }, T), 200);
  }
}

// Sign out
await expect("POST /admin/auth/logout", call("POST", "/admin/auth/logout", null, T), 200, (j) => j.signedOut === true);
await expect("token is rejected after logout", call("GET", "/admin/auth/me", null, T), 401);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll admin checks passed");
process.exit(failed ? 1 : 0);
