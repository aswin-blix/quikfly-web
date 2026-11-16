// End-to-end check of every endpoint. Usage: node scripts/smoke.mjs [baseUrl] [otp]
// Creates one test user (phone 90000 00001) with one cancelled ride and booking, then signs out.
const BASE = (process.argv[2] || "http://localhost:8787/v1").replace(/\/$/, "");
const OTP = process.argv[3] || "1234";
const PHONE = "9000000001";

let token = "";
let failed = 0;

/** `auth`: true = the main test user's token, false = none, or a specific token string. */
async function call(method, path, body, auth = true) {
  const bearer = typeof auth === "string" ? auth : auth ? token : "";
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
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
const login = await expect("POST /auth/verify", call("POST", "/auth/verify", { phone: `+91 ${PHONE}`, otp: OTP }), 200,
  (j) => j.token && j.user.phone === `+91 ${PHONE}` && typeof j.isNew === "boolean" && j.restored === false && /^[A-Z0-9]{6,10}$/.test(j.user.referralCode));
token = login?.token ?? "";
await expect("PATCH /me sets the name and completes sign-up", call("PATCH", "/me", { name: "Smoke Test" }), 200,
  (j) => j.name === "Smoke Test" && j.profileComplete === true);

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

// ── Accounts ──────────────────────────────────────────────

// Profile validation and fields
await expect("PATCH /me needs something to change", call("PATCH", "/me", {}), 400);
await expect("PATCH /me rejects a bad email", call("PATCH", "/me", { email: "nope" }), 400);
await expect("PATCH /me rejects an under-13 birth date", call("PATCH", "/me", { dob: new Date().toISOString().slice(0, 10) }), 400);
await expect("PATCH /me rejects a bad GSTIN", call("PATCH", "/me", { gst: { gstin: "123", name: "Smoke Co" } }), 400);
await expect("PATCH /me saves profile fields", call("PATCH", "/me", {
  email: "Smoke@Example.com", gender: "other", dob: "1995-06-15", gst: { gstin: "33abcde1234f1z5", name: "Smoke Co" }, autoShareNightRides: true,
}), 200, (j) => j.email === "smoke@example.com" && j.gender === "other" && j.dob === "1995-06-15"
  && j.gst?.gstin === "33ABCDE1234F1Z5" && j.autoShareNightRides === true);
await expect("PATCH /me with null clears a field", call("PATCH", "/me", { gst: null, autoShareNightRides: false }), 200,
  (j) => j.gst === null && j.autoShareNightRides === false);

// A second, brand-new user for referral, isolation and deletion checks
const phoneB = "9" + String(Date.now()).slice(-9);
const loginB = await expect("new user: verify says isNew", call("POST", "/auth/verify", { phone: phoneB, otp: OTP }), 200,
  (j) => j.isNew === true && j.user.profileComplete === false && j.user.walletBalance === 500);
const tokenB = loginB?.token ?? "";
await expect("new user: welcome credit is in the wallet history", call("GET", "/me/wallet", null, tokenB), 200,
  (j) => j.length === 1 && j[0].kind === "welcome" && j[0].amount === 500);
await call("PATCH", "/me", { name: "Smoke Friend" }, tokenB);
await expect("returning user: verify says not new", call("POST", "/auth/verify", { phone: phoneB, otp: OTP }), 200, (j) => j.isNew === false);

// Referral
const meA = (await call("GET", "/auth/me")).json;
await expect("referral: own code is refused", call("POST", "/me/referral", { code: loginB.user.referralCode }, tokenB), 400);
await expect("referral: unknown code is refused", call("POST", "/me/referral", { code: "QFZZZZZZ9" }, tokenB), 400);
await expect("referral: friend's code credits the new user", call("POST", "/me/referral", { code: meA.referralCode }, tokenB), 200,
  (j) => j.referred === true && j.walletBalance === 600);
check("referral: the friend is credited too", (await balance()) === meA.walletBalance + 100);
await expect("referral: only once", call("POST", "/me/referral", { code: meA.referralCode }, tokenB), 409);
await expect("wallet history shows the referral", call("GET", "/me/wallet"), 200, (j) => j[0].kind === "referral" && j[0].amount === 100);

// Wallet history records payments and refunds
const paidB = (await call("POST", "/bookings", newBooking({ payment: "wallet", amount: 250 }), tokenB)).json;
await call("POST", `/bookings/${paidB.id}/cancel`, null, tokenB);
await expect("wallet history: payment and refund are logged", call("GET", "/me/wallet", null, tokenB), 200,
  (j) => j[0].kind === "refund" && j[0].amount === 250 && j[1].kind === "payment" && j[1].amount === -250 && j[1].bookingId === paidB.id);

// Bookings are private
await expect("GET /bookings/:id", call("GET", `/bookings/${paidB.id}`, null, tokenB), 200, (j) => j.id === paidB.id);
await expect("GET /bookings/:id of another user is 404", call("GET", `/bookings/${paidB.id}`), 404);

// Change number: taken number refused, new number works, then switch back
await expect("change number: someone else's number is refused", call("POST", "/me/phone/otp", { phone: phoneB }), 409);
const phoneC = "8" + String(Date.now()).slice(-9);
await expect("change number: request OTP", call("POST", "/me/phone/otp", { phone: phoneC }), 200, (j) => j.sent === true);
await expect("change number: wrong OTP refused", call("POST", "/me/phone", { phone: phoneC, otp: "0000" }), 400);
await expect("change number", call("POST", "/me/phone", { phone: phoneC, otp: OTP }), 200, (j) => j.phone === `+91 ${phoneC}`);
await expect("change number back", call("POST", "/me/phone", { phone: PHONE, otp: OTP }), 200, (j) => j.phone === `+91 ${PHONE}`);

// Driving licence
await expect("licence: bad number refused", call("PUT", "/me/licence", { number: "ABC", expiry: "2035-01-01" }), 400);
await expect("licence: expired refused", call("PUT", "/me/licence", { number: "TN09 20190001234", expiry: "2020-01-01" }), 400);
await expect("licence: submitted is pending review", call("PUT", "/me/licence", { number: "tn09-2019-0001234", expiry: "2035-01-01" }), 200,
  (j) => j.licence.status === "pending" && j.licence.number === "TN0920190001234");

// Saved places
for (const p of (await call("GET", "/me/places")).json ?? []) await call("DELETE", `/me/places/${p.id}`);
await expect("places: save Home", call("POST", "/me/places", { kind: "home", placeId: "p3" }), 201, (j) => j.length === 1 && j[0].label === "Home" && j[0].place.id === "p3");
await expect("places: saving Home again replaces it", call("POST", "/me/places", { kind: "home", placeId: "p5" }), 201,
  (j) => j.filter((x) => x.kind === "home").length === 1 && j[0].place.id === "p5");
await expect("places: other needs a label", call("POST", "/me/places", { kind: "other", placeId: "p4" }), 400);
await expect("places: unknown place refused", call("POST", "/me/places", { kind: "work", placeId: "nope" }), 400);
const places2 = await expect("places: save Gym", call("POST", "/me/places", { kind: "other", placeId: "p4", label: "Gym" }), 201, (j) => j.length === 2);
await expect("places: delete", call("DELETE", `/me/places/${places2[1].id}`), 200, (j) => j.length === 1);
await expect("places: delete someone else's is 404", call("DELETE", `/me/places/${places2[0].id}`, null, tokenB), 404);

// Travellers
for (const t of (await call("GET", "/me/travellers")).json ?? []) await call("DELETE", `/me/travellers/${t.id}`);
await expect("travellers: bad age refused", call("POST", "/me/travellers", { name: "Kid", age: 0, gender: "male" }), 400);
const trav = await expect("travellers: add", call("POST", "/me/travellers", { name: "Asha Kumar", age: 34, gender: "female" }), 201,
  (j) => j.length === 1 && j[0].name === "Asha Kumar");
await expect("travellers: delete", call("DELETE", `/me/travellers/${trav[0].id}`), 200, (j) => j.length === 0);

// Emergency contacts (max 3)
for (const c of (await call("GET", "/me/contacts")).json ?? []) await call("DELETE", `/me/contacts/${c.id}`);
await expect("contacts: own number refused", call("POST", "/me/contacts", { name: "Me", phone: PHONE }), 400);
for (const n of [1, 2, 3]) await call("POST", "/me/contacts", { name: `Contact ${n}`, phone: `981234567${n}`, relation: "Friend" });
await expect("contacts: a 4th is refused", call("POST", "/me/contacts", { name: "Contact 4", phone: "9812345674" }), 400);
await expect("contacts: list", call("GET", "/me/contacts"), 200, (j) => j.length === 3 && j[0].phone === "+91 9812345671");

// Share a ride (the ride above was cancelled)
const shared = await expect("POST /rides/:id/share", call("POST", `/rides/${ride.id}/share`), 201, (j) => j.token && j.expiresAt);
await expect("sharing again returns the same link", call("POST", `/rides/${ride.id}/share`), 201, (j) => j.token === shared.token);
await expect("GET /share/:token is public", call("GET", `/share/${shared.token}`, null, false), 200,
  (j) => j.riderName === "Smoke" && j.status === "cancelled" && j.driver.plate && !("phone" in j.driver));
await expect("GET /share/:token unknown is 404", call("GET", "/share/nope", null, false), 404);
await expect("sharing someone else's ride is 404", call("POST", `/rides/${ride.id}/share`, null, tokenB), 404);

// Sign out everywhere
const second = (await call("POST", "/auth/verify", { phone: PHONE, otp: OTP })).json.token;
await expect("POST /me/logout-all", call("POST", "/me/logout-all", null, second), 200);
await expect("logout-all ends the other sessions", call("GET", "/auth/me"), 401);
token = (await call("POST", "/auth/verify", { phone: PHONE, otp: OTP })).json.token;

// Delete account: grace period restore, then delete again to clean up
await expect("delete: wrong OTP refused", call("POST", "/me/delete", { otp: "0000" }, tokenB), 400);
await expect("delete account", call("POST", "/me/delete", { otp: OTP }, tokenB), 200, (j) => j.scheduled === true);
await expect("deleted account's session is rejected", call("GET", "/auth/me", null, tokenB), 401);
const back = await expect("signing in within the grace period restores it", call("POST", "/auth/verify", { phone: phoneB, otp: OTP }), 200,
  (j) => j.restored === true && j.isNew === false && j.user.walletBalance === 600);
await call("POST", "/me/delete", { otp: OTP }, back.token);

// Logout last: it ends the session used above.
await expect("POST /auth/logout ends the session", call("POST", "/auth/logout"), 200, (j) => j.signedOut === true);
await expect("token is rejected after logout", call("GET", "/bookings"), 401);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
