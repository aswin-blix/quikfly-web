// End-to-end check of every endpoint. Usage: node scripts/smoke.mjs [baseUrl] [otp]
// Creates one test user (phone 90000 00001) with one cancelled ride and booking, then signs out.
const BASE = (process.argv[2] || "http://localhost:8787/v1").replace(/\/$/, "");
const OTP = process.argv[3] || "1234";
const PHONE = "9000000001";

let token = "";
/** A travel date well outside every default cancellation tier, so cancelling refunds in full. */
const TRAVEL = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
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
const tours = await expect("GET /tours", call("GET", "/tours"), 200, (j) => j.length > 0 && j[0].itinerary.length > 0);
await expect("GET /tours/:slug", call("GET", `/tours/${tours[0].slug}`), 200, (j) => j.id === tours[0].id);
await expect("GET /tours/:slug unknown is 404", call("GET", "/tours/no-such-trip"), 404);
const cars = await expect("GET /rentals/cars", call("GET", "/rentals/cars?city=Chennai"), 200, (j) => j.length > 0);
await expect("GET /rentals/cars/:id", call("GET", `/rentals/cars/${cars[0].id}`), 200, (j) => j.name === cars[0].name);
const vehicles = await expect("GET /rentals/travel-vehicles", call("GET", "/rentals/travel-vehicles"), 200, (j) => j.length > 0);
const cfg = await expect("GET /config", call("GET", "/config", null, false), 200,
  (j) => j.places.length > 5 && j.rideOptions.length > 0 && j.cities.length > 0 && j.offers.length > 0 && j.faqs.length > 0
    && j.groupDestinations.length > 0 && typeof j.settings.welcomeCredit === "number" && typeof j.settings.surgeHours === "string");

// Buses
const busPath = "/buses?from=Chennai&to=Bengaluru&date=2026-12-01";
const buses = await expect("GET /buses", call("GET", busPath), 200, (j) => j.length === 7 && j[0].operator);
const again = (await call("GET", busPath)).json;
check("GET /buses is stable for the same search", JSON.stringify(buses) === JSON.stringify(again));
await expect("GET /buses needs from/to/date", call("GET", "/buses?from=Chennai"), 400);
const seatPath = (bus) => `/buses/${encodeURIComponent(bus.id)}/seats?from=Chennai&to=Bengaluru&date=2026-12-01`;
const seats = await expect("GET /buses/:id/seats", call("GET", seatPath(buses[0])), 200, (j) => j.length === 36 && j.every((x) => x.price >= buses[0].fare));
await expect("GET /buses/:id/seats needs the route", call("GET", `/buses/${encodeURIComponent(buses[0].id)}/seats?date=2026-12-01`), 400);
await expect("GET /buses/:id/seats unknown bus is 404", call("GET", "/buses/nope/seats?from=Chennai&to=Bengaluru&date=2026-12-01"), 404);

// Quotes: the API prices every booking
const free = seats.filter((x) => !x.booked).slice(0, 2);
const busQuoteBody = { service: "bus", busId: buses[0].id, from: "Chennai", to: "Bengaluru", date: "2026-12-01", seatIds: free.map((x) => x.id) };
const busQuote = await expect("POST /quotes (bus)", call("POST", "/quotes", busQuoteBody, false), 201,
  (j) => j.id && j.service === "bus" && j.total === j.lines.reduce((a, l) => a + l.amount, 0) && j.lines[0].amount === free[0].price + free[1].price);
const taken = seats.find((x) => x.booked);
if (taken) await expect("POST /quotes refuses a booked seat", call("POST", "/quotes", { ...busQuoteBody, seatIds: [taken.id] }), 409);
await expect("POST /quotes refuses too many seats", call("POST", "/quotes", { ...busQuoteBody, seatIds: seats.slice(0, 7).map((x) => x.id) }), 400);
const tourQuote = await expect("POST /quotes (tour)", call("POST", "/quotes", { service: "tours", tourId: tours[0].id, adults: 2, kids: 1, start: TRAVEL }), 201,
  (j) => j.lines[0].amount === tours[0].price * 2 && j.lines[1].amount === Math.round((tours[0].price * cfg.settings.tourChildPercent) / 100));
await expect("POST /quotes (self-drive)", call("POST", "/quotes", { service: "rent", carId: cars[0].id, mode: "self", start: "2026-12-01T10:00", end: "2026-12-02T10:00", kmPlan: "limited", protection: "standard", doorstep: false }), 201,
  (j) => j.lines[0].amount === cars[0].pricePerHour * 24 && j.lines.at(-1).amount === cfg.settings.rentDeposit);
const chauffeur = await expect("POST /quotes (chauffeur across a night)", call("POST", "/quotes", { service: "rent", carId: cars[0].id, mode: "driver", start: "2026-12-01T10:00", end: "2026-12-02T10:00", kmPlan: "limited", protection: "standard", doorstep: false }), 201,
  (j) => !j.lines.some((l) => /deposit/i.test(l.label)));
check("chauffeur night charge follows the setting",
  cfg.settings.rentDriverNightCharge > 0
    ? chauffeur.lines.some((l) => l.label === "Driver night charge (1 night)" && l.amount === cfg.settings.rentDriverNightCharge)
    : !chauffeur.lines.some((l) => /night/i.test(l.label)), JSON.stringify(chauffeur.lines));
await expect("POST /quotes refuses a return before pickup", call("POST", "/quotes", { service: "rent", carId: cars[0].id, mode: "driver", start: "2026-12-02T10:00", end: "2026-12-01T10:00", kmPlan: "limited", protection: "standard", doorstep: false }), 400);
await expect("POST /quotes (group travel)", call("POST", "/quotes", { service: "rentals", vehicleId: vehicles[0].id, trip: "outstation", destinationId: cfg.groupDestinations[0].id, days: 1, start: TRAVEL }), 201,
  (j) => j.lines[0].label.includes("km") && j.total > 0);
await expect("POST /quotes (tour) needs a start date", call("POST", "/quotes", { service: "tours", tourId: tours[0].id, adults: 1, kids: 0 }), 400, (j) => /start/.test(j.message));
await expect("POST /quotes (group) needs a start date", call("POST", "/quotes", { service: "rentals", vehicleId: vehicles[0].id, trip: "local", days: 1 }), 400, (j) => /start/.test(j.message));
await expect("POST /quotes refuses an unknown item", call("POST", "/quotes", { service: "tours", tourId: "nope", adults: 1, kids: 0, start: TRAVEL }), 400);
await expect("POST /quotes refuses rides", call("POST", "/quotes", { service: "car" }), 400);

// Rides
const [a, b] = places;
const quotes = await expect("POST /rides/quote", call("POST", "/rides/quote", { service: "car", pickupId: a.id, dropId: b.id }), 200,
  (j) => j.length === 4 && j.every((q) => q.fare > 0 && q.option.service === "car"));
await expect("POST /rides/quote rejects an unknown place", call("POST", "/rides/quote", { service: "car", pickupId: "nope", dropId: b.id }), 400);
const rideInput = { optionId: quotes[0].option.id, pickupId: a.id, dropId: b.id, payment: "cash" };
await expect("POST /rides needs sign-in", call("POST", "/rides", rideInput, false), 401);
const ride = await expect("POST /rides", call("POST", "/rides", rideInput), 201,
  (j) => j.id && j.driver.plate && j.otp.length === 4 && quotes[0].option.models.includes(j.driver.vehicle) && !("id" in j.driver));
await expect("POST /rides/:id/cancel", call("POST", `/rides/${ride.id}/cancel`), 200);
await expect("POST /rides/:id/cancel unknown ride", call("POST", "/rides/RDNOPE/cancel"), 404);

// Bookings: priced by a quote or a ride, never by the client
await expect("GET /bookings needs sign-in", call("GET", "/bookings", null, false), 401);
const newBooking = (extra) => ({ service: "bus", title: "Chennai → Bengaluru", subtitle: "Smoke test", payment: "upi", lines: [["Seats", "L1"]], ...extra });
await expect("POST /bookings needs a quote", call("POST", "/bookings", newBooking({ amount: 1 })), 400, (j) => /quote/i.test(j.message));
const booking = await expect("POST /bookings charges the quote, not the client", call("POST", "/bookings", newBooking({ quoteId: busQuote.id, amount: 1 })), 201,
  (j) => j.id && j.status === "confirmed" && j.amount === busQuote.total && j.lines[0][1] === "L1" && j.startsAt?.startsWith("2026-12-01T") && j.refundAmount === null);
await expect("a quote works only once", call("POST", "/bookings", newBooking({ quoteId: busQuote.id })), 409);
await expect("a quote is for one service", call("POST", "/bookings", newBooking({ service: "tours", quoteId: busQuote.id })), 400);
await expect("POST /bookings rejects a bad service", call("POST", "/bookings", newBooking({ service: "x" })), 400);
await expect("POST /bookings needs a payment method", call("POST", "/bookings", newBooking({ payment: undefined })), 400);
await expect("GET /bookings lists it first", call("GET", "/bookings"), 200, (j) => j[0].id === booking.id);
await expect("POST /bookings/:id/cancel (well before departure: full refund)", call("POST", `/bookings/${booking.id}/cancel`), 200, (j) => j.status === "cancelled" && j.refundAmount === booking.amount);
await expect("POST /bookings/:id/cancel twice is refused", call("POST", `/bookings/${booking.id}/cancel`), 409, (j) => !!j.message);
await expect("POST /bookings/:id/cancel unknown booking", call("POST", "/bookings/QFNOPE/cancel"), 404);

// Wallet: debit on booking, refuse an overdraft (and give the quote back), refund on cancel.
// Relative to the current balance, because this test user is reused across runs.
const me = await expect("GET /auth/me", call("GET", "/auth/me"), 200, (j) => j.phone === `+91 ${PHONE}` && typeof j.walletBalance === "number");
const balance = () => call("GET", "/auth/me").then((r) => r.json.walletBalance);
const start = me.walletBalance;
await expect("GET /auth/me needs sign-in", call("GET", "/auth/me", null, false), 401);
if (tourQuote.total > start) {
  await expect("wallet booking over the balance is refused", call("POST", "/bookings", newBooking({ service: "tours", quoteId: tourQuote.id, payment: "wallet" })), 400, (j) => /wallet/i.test(j.message));
  check("refused wallet booking leaves the balance alone", (await balance()) === start);
  await expect("the refused booking gave the quote back", call("POST", "/bookings", newBooking({ service: "tours", quoteId: tourQuote.id, payment: "upi" })), 201, (j) => j.amount === tourQuote.total);
} else {
  check("smoke user's wallet is below a holiday price", false, `balance is ${start}`);
}
const walletRide = (await call("POST", "/rides", { ...rideInput, payment: "wallet" })).json;
if (start >= walletRide.quote.fare) {
  const paid = await expect("wallet ride booking", call("POST", "/bookings", newBooking({ service: "car", rideId: walletRide.id, payment: "wallet" })), 201,
    (j) => j.payment === "wallet" && j.amount === walletRide.quote.fare);
  check("wallet booking deducts the fare", (await balance()) === start - walletRide.quote.fare);
  await expect("a ride is booked only once", call("POST", "/bookings", newBooking({ service: "car", rideId: walletRide.id })), 409);
  await expect("cancel wallet booking (rides have no policy: full refund)", call("POST", `/bookings/${paid.id}/cancel`), 200, (j) => j.status === "cancelled" && j.startsAt === null && j.refundAmount === paid.amount);
  check("cancelling refunds the wallet", (await balance()) === start);
} else {
  check("smoke user can afford one ride from the wallet", false, `balance is ${start}, fare ${walletRide.quote.fare}`);
}
await expect("a ride booking needs the ride", call("POST", "/bookings", newBooking({ service: "car" })), 400);
await expect("a cancelled ride can't be booked", call("POST", "/bookings", newBooking({ service: "car", rideId: ride.id })), 400);

// Coupons
const tourQuote2 = (await call("POST", "/quotes", { service: "tours", tourId: tours[0].id, adults: 1, kids: 0, start: TRAVEL })).json;
const holiday = cfg.offers.find((o) => o.code === "HOLIDAY10");
const expected = Math.min(holiday.maxDiscount, Math.round((tourQuote2.total * holiday.percent) / 100));
await expect("POST /offers/check needs sign-in", call("POST", "/offers/check", { code: "HOLIDAY10", quoteId: tourQuote2.id }, false), 401);
await expect("POST /offers/check", call("POST", "/offers/check", { code: "holiday10", quoteId: tourQuote2.id }), 200,
  (j) => j.code === "HOLIDAY10" && j.discount === expected && j.total === tourQuote2.total - expected);
await expect("coupon for another service is refused", call("POST", "/offers/check", { code: "EBIKE", quoteId: tourQuote2.id }), 400, (j) => /only on/.test(j.message));
await expect("unknown coupon is refused", call("POST", "/offers/check", { code: "NOPE123", quoteId: tourQuote2.id }), 400);
const busMin = cfg.offers.find((o) => o.code === "BUS150");
const cheapBus = (await call("POST", "/quotes", { ...busQuoteBody, seatIds: [free[0].id] })).json;
if (cheapBus.total < busMin.minAmount) await expect("coupon below its minimum is refused", call("POST", "/offers/check", { code: "BUS150", quoteId: cheapBus.id }), 400, (j) => /at least/.test(j.message));
const discounted = await expect("booking with a coupon", call("POST", "/bookings", newBooking({ service: "tours", quoteId: tourQuote2.id, couponCode: "HOLIDAY10", lines: [["Coupon", "fake"]] })), 201,
  (j) => j.amount === tourQuote2.total - expected && j.lines.filter(([k]) => k === "Coupon").length === 1 && j.lines.find(([k]) => k === "Coupon")[1].startsWith("HOLIDAY10"));
await call("POST", `/bookings/${discounted.id}/cancel`);

// Completing a trip
const tripRide = (await call("POST", "/rides", rideInput)).json;
const trip = await expect("POST /bookings (trip)", call("POST", "/bookings", newBooking({ service: "car", rideId: tripRide.id, payment: "cash" })), 201);
await expect("POST /bookings/:id/complete", call("POST", `/bookings/${trip.id}/complete`), 200, (j) => j.status === "completed");
await expect("completed booking can't be cancelled", call("POST", `/bookings/${trip.id}/cancel`), 409);
await expect("POST /bookings/:id/complete unknown booking", call("POST", "/bookings/QFNOPE/complete"), 404);
const tourToClose = (await call("POST", "/quotes", { service: "tours", tourId: tours[0].id, adults: 1, kids: 0, start: TRAVEL })).json;
const toClose = (await call("POST", "/bookings", newBooking({ service: "tours", quoteId: tourToClose.id, payment: "upi" }))).json;
await expect("customers can't complete a holiday (staff close it)", call("POST", `/bookings/${toClose.id}/complete`), 409, (j) => /staff/.test(j.message));
await call("POST", `/bookings/${toClose.id}/cancel`);

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
const rideB = (await call("POST", "/rides", { ...rideInput, payment: "wallet" }, tokenB)).json;
const fareB = rideB.quote.fare;
const paidB = (await call("POST", "/bookings", newBooking({ service: "car", rideId: rideB.id, payment: "wallet" }), tokenB)).json;
await call("POST", `/bookings/${paidB.id}/cancel`, null, tokenB);
await expect("wallet history: payment and refund are logged", call("GET", "/me/wallet", null, tokenB), 200,
  (j) => j[0].kind === "refund" && j[0].amount === fareB && j[1].kind === "payment" && j[1].amount === -fareB && j[1].bookingId === paidB.id);
await expect("another user's ride can't be booked", call("POST", "/bookings", newBooking({ service: "car", rideId: rideB.id })), 404);

// Coupon limits per customer: QUIKFLY50 works 3 times for a cab, then stops
const limited = cfg.offers.find((o) => o.code === "QUIKFLY50");
for (let i = 1; i <= limited.perUserLimit; i++) {
  const r = (await call("POST", "/rides", rideInput, tokenB)).json;
  await expect(`QUIKFLY50 use ${i} of ${limited.perUserLimit}`, call("POST", "/bookings", newBooking({ service: "car", rideId: r.id, couponCode: "QUIKFLY50" }), tokenB), 201,
    (j) => j.amount === r.quote.fare - Math.min(limited.maxDiscount, Math.round((r.quote.fare * limited.percent) / 100)));
}
const extraRide = (await call("POST", "/rides", rideInput, tokenB)).json;
await expect("QUIKFLY50 is refused after its per-customer limit", call("POST", "/offers/check", { code: "QUIKFLY50", rideId: extraRide.id }, tokenB), 400, (j) => /already used/.test(j.message));

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
  (j) => j.riderName === "Smoke" && j.service === "car" && j.status === "cancelled" && j.driver.plate && !("phone" in j.driver));
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
