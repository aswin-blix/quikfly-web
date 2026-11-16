// End-to-end check of every endpoint. Usage: node scripts/smoke.mjs [baseUrl] [otp]
// Creates one test user (phone 90000 00001) with one cancelled ride and booking, then signs out.
const BASE = (process.argv[2] || "http://localhost:8787/v1").replace(/\/$/, "");
const OTP = process.argv[3] || "1234";
const PHONE = "9000000001";

let token = "";
let failed = 0;

async function call(method, path, body, auth = true) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

function check(name, ok, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`);
}

async function expect(name, promise, status, test = () => true) {
  const r = await promise;
  check(name, r.status === status && test(r.json), `${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`);
  return r.json;
}

await expect("GET /health", call("GET", "/health"), 200, (j) => j.ok === true);

// Auth
await expect("POST /auth/otp", call("POST", "/auth/otp", { phone: PHONE }), 200, (j) => j.sent === true);
await expect("POST /auth/otp rejects a bad phone", call("POST", "/auth/otp", { phone: "123" }), 400, (j) => !!j.message);
await expect("POST /auth/verify rejects a wrong OTP", call("POST", "/auth/verify", { phone: PHONE, otp: "0000" }), 400);
const login = await expect("POST /auth/verify", call("POST", "/auth/verify", { phone: `+91 ${PHONE}`, otp: OTP, name: "Smoke Test" }), 200,
  (j) => j.token && j.user.phone === `+91 ${PHONE}` && j.user.name === "Smoke Test");
token = login?.token ?? "";

// Catalog
const places = await expect("GET /places", call("GET", "/places"), 200, (j) => j.length > 5);
await expect("GET /places?q=airport", call("GET", "/places?q=airport"), 200, (j) => j.length === 1);
await expect("GET /tours", call("GET", "/tours"), 200, (j) => j.length > 0 && j[0].itinerary.length > 0);
await expect("GET /rentals/cars", call("GET", "/rentals/cars?city=Chennai"), 200, (j) => j.length > 0);
await expect("GET /rentals/travel-vehicles", call("GET", "/rentals/travel-vehicles"), 200, (j) => j.length > 0);

// Buses
const busPath = "/buses?from=Chennai&to=Bengaluru&date=2026-12-01";
const buses = await expect("GET /buses", call("GET", busPath), 200, (j) => j.length === 7 && j[0].operator);
const again = (await call("GET", busPath)).json;
check("GET /buses is stable for the same search", JSON.stringify(buses) === JSON.stringify(again));
await expect("GET /buses needs from/to/date", call("GET", "/buses?from=Chennai"), 400);
await expect("GET /buses/:id/seats", call("GET", `/buses/${encodeURIComponent(buses[0].id)}/seats?date=2026-12-01`), 200, (j) => j.length === 36);

// Rides
const [a, b] = places;
const quotes = await expect("POST /rides/quote", call("POST", "/rides/quote", { service: "car", pickupId: a.id, dropId: b.id }), 200,
  (j) => j.length === 4 && j.every((q) => q.fare > 0 && q.option.service === "car"));
await expect("POST /rides/quote rejects an unknown place", call("POST", "/rides/quote", { service: "car", pickupId: "nope", dropId: b.id }), 400);
const rideInput = { optionId: quotes[0].option.id, pickupId: a.id, dropId: b.id, payment: "cash" };
await expect("POST /rides needs sign-in", call("POST", "/rides", rideInput, false), 401);
const ride = await expect("POST /rides", call("POST", "/rides", rideInput), 201, (j) => j.id && j.driver.plate && j.otp.length === 4);
await expect("POST /rides/:id/cancel", call("POST", `/rides/${ride.id}/cancel`), 200);
await expect("POST /rides/:id/cancel unknown ride", call("POST", "/rides/RDNOPE/cancel"), 404);

// Bookings
await expect("GET /bookings needs sign-in", call("GET", "/bookings", null, false), 401);
const newBooking = (extra) => ({ service: "bus", title: "Chennai → Bengaluru", subtitle: "Smoke test", amount: 950, payment: "upi", lines: [["Seats", "L1"]], ...extra });
const booking = await expect("POST /bookings", call("POST", "/bookings", newBooking()), 201,
  (j) => j.id && j.status === "confirmed" && j.payment === "upi" && j.lines[0][1] === "L1");
await expect("POST /bookings rejects a bad service", call("POST", "/bookings", newBooking({ service: "x" })), 400);
await expect("POST /bookings needs a payment method", call("POST", "/bookings", newBooking({ payment: undefined })), 400);
await expect("GET /bookings lists it first", call("GET", "/bookings"), 200, (j) => j[0].id === booking.id);
await expect("POST /bookings/:id/cancel", call("POST", `/bookings/${booking.id}/cancel`), 200, (j) => j.status === "cancelled");
await expect("POST /bookings/:id/cancel twice is refused", call("POST", `/bookings/${booking.id}/cancel`), 409, (j) => !!j.message);
await expect("POST /bookings/:id/cancel unknown booking", call("POST", "/bookings/QFNOPE/cancel"), 404);

// Wallet: debit on booking, refuse an overdraft, refund on cancel. Relative to the
// current balance, because this test user is reused across runs.
const me = await expect("GET /auth/me", call("GET", "/auth/me"), 200, (j) => j.phone === `+91 ${PHONE}` && typeof j.walletBalance === "number");
const balance = () => call("GET", "/auth/me").then((r) => r.json.walletBalance);
const start = me.walletBalance;
await expect("GET /auth/me needs sign-in", call("GET", "/auth/me", null, false), 401);
await expect("wallet booking over the balance is refused", call("POST", "/bookings", newBooking({ payment: "wallet", amount: start + 1 })), 400);
check("refused wallet booking leaves the balance alone", (await balance()) === start);
if (start >= 100) {
  const paid = await expect("wallet booking", call("POST", "/bookings", newBooking({ payment: "wallet", amount: 100 })), 201, (j) => j.payment === "wallet");
  check("wallet booking deducts the amount", (await balance()) === start - 100);
  await expect("cancel wallet booking", call("POST", `/bookings/${paid.id}/cancel`), 200, (j) => j.status === "cancelled");
  check("cancelling refunds the wallet", (await balance()) === start);
} else {
  check("smoke user has at least ₹100 in the wallet", false, `balance is ${start}`);
}

// Completing a trip
const trip = await expect("POST /bookings (trip)", call("POST", "/bookings", newBooking({ service: "car", payment: "cash" })), 201);
await expect("POST /bookings/:id/complete", call("POST", `/bookings/${trip.id}/complete`), 200, (j) => j.status === "completed");
await expect("completed booking can't be cancelled", call("POST", `/bookings/${trip.id}/cancel`), 409);
await expect("POST /bookings/:id/complete unknown booking", call("POST", "/bookings/QFNOPE/complete"), 404);

await expect("unknown route", call("GET", "/nope"), 404, (j) => !!j.message);

// Logout last: it ends the session used above.
await expect("POST /auth/logout ends the session", call("POST", "/auth/logout"), 200, (j) => j.signedOut === true);
await expect("token is rejected after logout", call("GET", "/bookings"), 401);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
