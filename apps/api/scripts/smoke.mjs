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

// Partner (vendor) test helpers: a raw image upload and dates relative to today.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(256).fill(7)]);
async function upload(path, bytes, bearer) {
  const res = await fetch(BASE + path, { method: "PUT", headers: { "Content-Type": "image/jpeg", Authorization: `Bearer ${bearer}` }, body: bytes });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const dayOffset = (days) => new Date(Date.now() + 330 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
const randomReg = () => `TN${String(10 + Math.floor(Math.random() * 89))}QF${String(1000 + Math.floor(Math.random() * 8999))}`;

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
// Packages booked by start date; group tours with departures are checked further down.
const anyDate = tours.find((t) => !t.departures?.length) ?? tours[0];
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
const seats = await expect("GET /buses/:id/seats", call("GET", seatPath(buses[0])), 200,
  (j) => [36, 40, 48].includes(j.length) && j.every((x) => x.price >= buses[0].fare) && j.some((x) => x.price === buses[0].fare)
    && j.every((x) => x.booked === (x.bookedGender !== null)));
// Women-first rule: a free seat is women only exactly when its pair (cols 0-1, 2-3) is held by a woman.
const partnerOf = (list, s) => list.find((x) => x.deck === s.deck && x.row === s.row && x.col === [1, 0, 3, 2][s.col]);
const rulesHold = (list) => list.every((s) => s.ladies === (!s.booked && partnerOf(list, s)?.bookedGender === "female"));
check("women-only seats sit next to a woman (and only those)", rulesHold(seats));
const allSeats = await Promise.all(buses.map((b) => call("GET", seatPath(b)).then((r) => r.json)));
check("each bus type has its layout", buses.every((b, i) => allSeats[i].length === (b.type.includes("2+2") ? 40 : b.type.includes("Seater / Sleeper") ? 48 : 36)
  && (b.type.includes("2+2") ? allSeats[i].every((x) => x.deck === "lower" && !x.sleeper) : true)), buses.map((b, i) => `${b.type}:${allSeats[i].length}`).join(", "));
check("seats left matches the seat map", buses.every((b, i) => b.seatsLeft === allSeats[i].filter((x) => !x.booked).length), buses.map((b, i) => `${b.seatsLeft}/${allSeats[i].filter((x) => !x.booked).length}`).join(" "));
check("no bus promises live tracking or CCTV", buses.every((b) => !b.amenities.includes("Live tracking") && !b.amenities.includes("CCTV")));
await expect("GET /buses/:id/seats needs the route", call("GET", `/buses/${encodeURIComponent(buses[0].id)}/seats?date=2026-12-01`), 400);
await expect("GET /buses/:id/seats unknown bus is 404", call("GET", "/buses/nope/seats?from=Chennai&to=Bengaluru&date=2026-12-01"), 404);

// Quotes: the API prices every booking
const free = seats.filter((x) => !x.booked && !x.ladies).slice(0, 2);
const busQuoteBody = { service: "bus", busId: buses[0].id, from: "Chennai", to: "Bengaluru", date: "2026-12-01", seatIds: free.map((x) => x.id) };
const busQuote = await expect("POST /quotes (bus)", call("POST", "/quotes", busQuoteBody, false), 201,
  (j) => j.id && j.service === "bus" && j.total === j.lines.reduce((a, l) => a + l.amount, 0) && j.lines[0].amount === free[0].price + free[1].price);
const taken = seats.find((x) => x.booked);
if (taken) await expect("POST /quotes refuses a booked seat", call("POST", "/quotes", { ...busQuoteBody, seatIds: [taken.id] }), 409);
await expect("POST /quotes refuses genders that don't match the seats", call("POST", "/quotes", { ...busQuoteBody, genders: ["female"] }), 400, (j) => /one entry per seat/.test(j.message));
// A simulated women-only seat, anywhere in this search: refused for a man, fine for a woman.
const ladiesAt = allSeats.findIndex((list) => list.some((x) => x.ladies));
if (ladiesAt >= 0) {
  const seat = allSeats[ladiesAt].find((x) => x.ladies);
  const body = { ...busQuoteBody, busId: buses[ladiesAt].id, seatIds: [seat.id] };
  await expect("women-only seat is refused without a gender", call("POST", "/quotes", body), 400, (j) => /women only/.test(j.message));
  await expect("women-only seat is refused for a man", call("POST", "/quotes", { ...body, genders: ["male"] }), 400, (j) => /women only/.test(j.message));
  await expect("women-only seat is fine for a woman", call("POST", "/quotes", { ...body, genders: ["female"] }), 201);
} else console.log("SKIP  no simulated women-only seat on this route and date");
await expect("POST /quotes refuses too many seats", call("POST", "/quotes", { ...busQuoteBody, seatIds: seats.slice(0, 7).map((x) => x.id) }), 400);
const tourQuote = await expect("POST /quotes (tour)", call("POST", "/quotes", { service: "tours", tourId: anyDate.id, adults: 2, kids: 1, start: TRAVEL }), 201,
  (j) => j.lines[0].amount === anyDate.price * 2 && j.lines[1].amount === Math.round((anyDate.price * cfg.settings.tourChildPercent) / 100));
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
await expect("POST /quotes (tour) needs a start date", call("POST", "/quotes", { service: "tours", tourId: anyDate.id, adults: 1, kids: 0 }), 400, (j) => /start/.test(j.message));
await expect("POST /quotes (group) needs a start date", call("POST", "/quotes", { service: "rentals", vehicleId: vehicles[0].id, trip: "local", days: 1 }), 400, (j) => /start/.test(j.message));
// Outstation cabs: one way and multi-day round trips through the group engine.
const sedan = vehicles.find((v) => v.seats <= 4);
check("an outstation sedan is in the vehicle list", !!sedan, vehicles.map((v) => `${v.name}:${v.seats}`).join(", "));
if (sedan) {
  const near = cfg.groupDestinations.find((d) => d.km < sedan.minKmPerDay) ?? cfg.groupDestinations[0];
  const rate = sedan.perKm * (1 + cfg.settings.groupOneWaySurchargePercent / 100);
  const oneKm = Math.max(near.km, sedan.minKmPerDay);
  await expect("POST /quotes (one way: minimum km, surcharge, one day)", call("POST", "/quotes", { service: "rentals", vehicleId: sedan.id, trip: "oneway", destinationId: near.id, days: 3, start: TRAVEL }), 201,
    (j) => j.lines[0].amount === Math.round(oneKm * rate) && /one way/.test(j.lines[0].label) && j.lines[1].amount === sedan.driverBataPerDay && j.lines.length === 2);
  const far = cfg.groupDestinations.reduce((x, y) => (y.km > x.km ? y : x));
  await expect("POST /quotes (3-day round trip pays 2 night allowances)", call("POST", "/quotes", { service: "rentals", vehicleId: sedan.id, trip: "outstation", destinationId: far.id, days: 3, start: TRAVEL }), 201,
    (j) => j.lines[0].amount === Math.round(Math.max(far.km * 2, sedan.minKmPerDay * 3) * sedan.perKm)
      && (cfg.settings.groupDriverNightAllowance === 0 || j.lines.some((l) => l.label === "Driver night allowance × 2" && l.amount === 2 * cfg.settings.groupDriverNightAllowance)));
  await expect("one way needs a destination", call("POST", "/quotes", { service: "rentals", vehicleId: sedan.id, trip: "oneway", days: 1, start: TRAVEL }), 400);
}
await expect("an unknown trip type is refused", call("POST", "/quotes", { service: "rentals", vehicleId: vehicles[0].id, trip: "cruise", days: 1, start: TRAVEL }), 400);
await expect("POST /quotes refuses an unknown item", call("POST", "/quotes", { service: "tours", tourId: "nope", adults: 1, kids: 0, start: TRAVEL }), 400);
await expect("POST /quotes refuses rides", call("POST", "/quotes", { service: "car" }), 400);

// Rides
const [a, b] = places;
const quotes = await expect("POST /rides/quote", call("POST", "/rides/quote", { service: "car", pickupId: a.id, dropId: b.id }), 200,
  (j) => j.length === 4 && j.every((q) => q.fare > 0 && q.option.service === "car" && q.surge >= 1 && q.surge <= cfg.settings.surgeCap));
await expect("POST /rides/quote rejects an unknown place", call("POST", "/rides/quote", { service: "car", pickupId: "nope", dropId: b.id }), 400);
const rideInput = { optionId: quotes[0].option.id, pickupId: a.id, dropId: b.id, payment: "cash" };
await expect("POST /rides needs sign-in", call("POST", "/rides", rideInput, false), 401);
const ride = await expect("POST /rides", call("POST", "/rides", rideInput), 201,
  (j) => j.id && j.driver.plate && j.otp.length === 4 && quotes[0].option.models.includes(j.driver.vehicle) && !("id" in j.driver));
await expect("POST /rides/:id/cancel", call("POST", `/rides/${ride.id}/cancel`), 200);
await expect("POST /rides/:id/cancel unknown ride", call("POST", "/rides/RDNOPE/cancel"), 404);

// Multi-stop rides: distance through the stops plus a wait per stop; limits enforced.
const stopPlace = places.find((p) => p.id !== a.id && p.id !== b.id);
const direct = quotes[0];
const viaStop = await expect("POST /rides/quote (one stop)", call("POST", "/rides/quote", { service: "car", pickupId: a.id, dropId: b.id, stopIds: [stopPlace.id] }), 200, (j) => j.length === 4);
check("a stop adds distance, its wait and fare", viaStop[0].distanceKm >= direct.distanceKm && viaStop[0].durationMin >= direct.durationMin + cfg.settings.rideStopMinutes && viaStop[0].fare > direct.fare,
  `${direct.distanceKm}km/${direct.durationMin}min/${direct.fare} → ${viaStop[0].distanceKm}km/${viaStop[0].durationMin}min/${viaStop[0].fare}`);
await expect("more than 2 stops is refused", call("POST", "/rides/quote", { service: "car", pickupId: a.id, dropId: b.id, stopIds: [places[3].id, places[4].id, places[5].id] }), 400, (j) => /up to 2/.test(j.message));
await expect("a stop equal to the pickup is refused", call("POST", "/rides/quote", { service: "car", pickupId: a.id, dropId: b.id, stopIds: [a.id] }), 400, (j) => /same as the place before/.test(j.message));
await expect("an unknown stop is refused", call("POST", "/rides/quote", { service: "car", pickupId: a.id, dropId: b.id, stopIds: ["nope"] }), 400);
await expect("stopIds must be a list", call("POST", "/rides/quote", { service: "car", pickupId: a.id, dropId: b.id, stopIds: "p3" }), 400);
const stopRide = await expect("POST /rides (with a stop)", call("POST", "/rides", { ...rideInput, stopIds: [stopPlace.id] }), 201,
  (j) => j.stops.length === 1 && j.stops[0].id === stopPlace.id && j.quote.fare === viaStop.find((q) => q.option.id === rideInput.optionId).fare);
const stopShare = (await call("POST", `/rides/${stopRide.id}/share`)).json;
await expect("the share link shows the stops", call("GET", `/share/${stopShare.token}`, null, false), 200, (j) => j.stops.length === 1 && j.stops[0].name === stopPlace.name);
await call("POST", `/rides/${stopRide.id}/cancel`);

// Scheduled rides: quote and book ahead, start near pickup, cancel free until close to pickup.
/** India-time "YYYY-MM-DDTHH:mm", `minutes` from now (rounded down to the minute). */
const indiaLocal = (minutes) => new Date(Date.now() + (330 + minutes) * 60_000).toISOString().slice(0, 16);
const ahead = indiaLocal(2 * 24 * 60);
await expect("POST /rides/quote (scheduled)", call("POST", "/rides/quote", { service: "car", pickupId: a.id, dropId: b.id, scheduledFor: ahead }), 200,
  (j) => j.length > 0 && j.every((q) => q.surge >= 1 && q.surge <= cfg.settings.surgeCap));
await expect("scheduling too soon is refused", call("POST", "/rides/quote", { service: "car", pickupId: a.id, dropId: b.id, scheduledFor: indiaLocal(1) }), 400, (j) => /at least/.test(j.message));
await expect("scheduling too far ahead is refused", call("POST", "/rides/quote", { service: "car", pickupId: a.id, dropId: b.id, scheduledFor: indiaLocal((cfg.settings.rideScheduleMaxDays + 2) * 1440) }), 400, (j) => /up to/.test(j.message));
await expect("a malformed pickup time is refused", call("POST", "/rides/quote", { service: "car", pickupId: a.id, dropId: b.id, scheduledFor: "tomorrow 9am" }), 400);
const later = await expect("POST /rides (scheduled)", call("POST", "/rides", { ...rideInput, scheduledFor: ahead }), 201, (j) => j.scheduledFor?.startsWith(ahead));
await expect("GET /rides/:id", call("GET", `/rides/${later.id}`), 200, (j) => j.id === later.id && j.scheduledFor === later.scheduledFor);
await expect("GET /rides/:id unknown is 404", call("GET", "/rides/RDNOPE"), 404);
await expect("a scheduled ride can't start days early", call("POST", `/rides/${later.id}/start`), 409, (j) => /assigned/.test(j.message));
await expect("a cancelled ride can't be started", call("POST", `/rides/${ride.id}/start`), 409, (j) => /cancelled/.test(j.message));
const laterBooking = await expect("booking a scheduled ride", call("POST", "/bookings", { service: "car", title: "Smoke scheduled", subtitle: "A → B", payment: "cash", lines: [], rideId: later.id }), 201,
  (j) => j.rideId === later.id && j.startsAt === later.scheduledFor);
await expect("cancelling well before pickup is free", call("POST", `/bookings/${laterBooking.id}/cancel`, {}), 200, (j) => j.cancelFee === 0 && j.refundAmount === laterBooking.amount);

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
  await expect("cancelling with an unknown reason is refused", call("POST", `/bookings/${paid.id}/cancel`, { reason: "bored" }), 400);
  await expect("cancel wallet ride with a valid reason: no fee, full refund", call("POST", `/bookings/${paid.id}/cancel`, { reason: "driver_late" }), 200,
    (j) => j.status === "cancelled" && j.startsAt === null && j.refundAmount === paid.amount && j.cancelFee === 0 && j.cancelReason === "driver_late");
  check("cancelling refunds the wallet", (await balance()) === start);
} else {
  check("smoke user can afford one ride from the wallet", false, `balance is ${start}, fare ${walletRide.quote.fare}`);
}
await expect("a ride booking needs the ride", call("POST", "/bookings", newBooking({ service: "car" })), 400);
await expect("a cancelled ride can't be booked", call("POST", "/bookings", newBooking({ service: "car", rideId: ride.id })), 400);

// Coupons
const tourQuote2 = (await call("POST", "/quotes", { service: "tours", tourId: anyDate.id, adults: 1, kids: 0, start: TRAVEL })).json;
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
const tourToClose = (await call("POST", "/quotes", { service: "tours", tourId: anyDate.id, adults: 1, kids: 0, start: TRAVEL })).json;
const toClose = (await call("POST", "/bookings", newBooking({ service: "tours", quoteId: tourToClose.id, payment: "upi" }))).json;
await expect("customers can't complete a holiday (staff close it)", call("POST", `/bookings/${toClose.id}/complete`), 409, (j) => /staff/.test(j.message));
await call("POST", `/bookings/${toClose.id}/cancel`);

// Trips: a ride joins a holiday's trip; both share the holiday's id as trip id.
const tripTourQ = (await call("POST", "/quotes", { service: "tours", tourId: anyDate.id, adults: 1, kids: 0, start: TRAVEL })).json;
const tripAnchor = await expect("a holiday to start a trip from", call("POST", "/bookings", newBooking({ service: "tours", quoteId: tripTourQ.id, payment: "upi" })), 201, (j) => j.tripId === null);
const legRide = (await call("POST", "/rides", { ...rideInput, payment: "cash" })).json;
const tripLeg = await expect("a ride joins the holiday's trip", call("POST", "/bookings", newBooking({ service: "car", rideId: legRide.id, payment: "cash", tripOf: tripAnchor.id })), 201,
  (j) => j.tripId === tripAnchor.id);
await expect("the holiday now carries the trip id too", call("GET", `/bookings/${tripAnchor.id}`), 200, (j) => j.tripId === tripAnchor.id);
const strayRide = (await call("POST", "/rides", { ...rideInput, payment: "cash" })).json;
await expect("joining an unknown booking's trip is refused", call("POST", "/bookings", newBooking({ service: "car", rideId: strayRide.id, payment: "cash", tripOf: "QFNOPE" })), 404);
await call("POST", `/bookings/${tripLeg.id}/cancel`, { reason: "plans_changed" });
await call("POST", `/bookings/${tripAnchor.id}/cancel`);
await expect("a cancelled booking's trip can't be joined", call("POST", "/bookings", newBooking({ service: "car", rideId: strayRide.id, payment: "cash", tripOf: tripAnchor.id })), 409, (j) => /cancelled/.test(j.message));
await call("POST", `/rides/${strayRide.id}/cancel`);

// Bus seat holds: a seat sells once, a woman's seat makes its pair women only, cancelling frees both.
const pairSeat = seats.find((x) => x.col === 0 && !x.booked && !x.ladies && partnerOf(seats, x) && !partnerOf(seats, x).booked && !partnerOf(seats, x).ladies);
if (pairSeat) {
  const seatA = pairSeat, seatB = partnerOf(seats, pairSeat);
  const q1 = (await call("POST", "/quotes", { ...busQuoteBody, seatIds: [seatB.id], genders: ["male"] })).json;
  const q2 = (await call("POST", "/quotes", { ...busQuoteBody, seatIds: [seatB.id], genders: ["male"] })).json;
  const left0 = (await call("GET", busPath)).json.find((b) => b.id === buses[0].id).seatsLeft;
  const first = await expect("first booking of a seat holds it", call("POST", "/bookings", newBooking({ quoteId: q1.id })), 201);
  check("a held seat lowers seats left", (await call("GET", busPath)).json.find((b) => b.id === buses[0].id).seatsLeft === left0 - 1);
  await expect("a second booking of the same seat is refused", call("POST", "/bookings", newBooking({ quoteId: q2.id })), 409, (j) => /someone else/.test(j.message));
  await expect("a held seat can't be quoted", call("POST", "/quotes", { ...busQuoteBody, seatIds: [seatB.id], genders: ["male"] }), 409);
  await call("POST", `/bookings/${first.id}/cancel`);
  await expect("cancelling frees the seat", call("GET", seatPath(buses[0])), 200, (j) => !j.find((x) => x.id === seatB.id).booked);

  const qa = (await call("POST", "/quotes", { ...busQuoteBody, seatIds: [seatA.id], genders: ["female"] })).json;
  const woman = await expect("a woman books one seat of a pair", call("POST", "/bookings", newBooking({ quoteId: qa.id })), 201);
  await expect("her seat shows as booked by a woman and its pair turns women only", call("GET", seatPath(buses[0])), 200,
    (j) => j.find((x) => x.id === seatA.id).bookedGender === "female" && j.find((x) => x.id === seatB.id).ladies === true && rulesHold(j));
  await expect("the pair is refused for a man", call("POST", "/quotes", { ...busQuoteBody, seatIds: [seatB.id], genders: ["male"] }), 400, (j) => /women only/.test(j.message));
  await expect("the pair is fine for a woman", call("POST", "/quotes", { ...busQuoteBody, seatIds: [seatB.id], genders: ["female"] }), 201);
  await call("POST", `/bookings/${woman.id}/cancel`);
  await expect("cancelling frees her seat and lifts the rule", call("GET", seatPath(buses[0])), 200,
    (j) => !j.find((x) => x.id === seatA.id).booked && !j.find((x) => x.id === seatB.id).ladies);
} else console.log("SKIP  no free seat pair on the first bus");

// Bus changes: cancel one seat of three, move once to another bus, and the public m-ticket.
{
  const bp = `/buses?from=Chennai&to=Bengaluru&date=${TRAVEL}`;
  const list = (await call("GET", bp)).json;
  const sp = (bus) => `/buses/${encodeURIComponent(bus.id)}/seats?from=Chennai&to=Bengaluru&date=${TRAVEL}`;
  const freeSeats = async (bus, n) => (await call("GET", sp(bus))).json.filter((x) => !x.booked && !x.ladies).slice(0, n);
  const three = await freeSeats(list[1], 3);
  const q3 = (await call("POST", "/quotes", { service: "bus", busId: list[1].id, from: "Chennai", to: "Bengaluru", date: TRAVEL, seatIds: three.map((x) => x.id), genders: ["male", "male", "male"] })).json;
  const before = await balance();
  const pay = before >= q3.total ? "wallet" : "upi";
  const tripLines = [["Date", TRAVEL], ["Departure", "21:00 from Koyambedu"], ["Arrival", "05:30 at Majestic"], ["Seats", three.map((x) => x.id).join(", ")], ["Traveller names", "Asha K, Bala R, Chitra S"]];
  const bk = await expect("a bus booking carries its seats (with prices) and an m-ticket token", call("POST", "/bookings",
    { service: "bus", title: "Chennai → Bengaluru", subtitle: "Smoke bus", payment: pay, quoteId: q3.id, lines: tripLines }), 201,
    (j) => j.seats.length === 3 && j.seats.every((x) => x.price > 0 && x.gender === "male") && /^[0-9a-f]{24}$/.test(j.ticketToken) && j.rescheduledAt === null && j.discount === 0);
  await expect("GET /tickets/:token works without sign-in", call("GET", `/tickets/${bk.ticketToken}`, null, false), 200,
    (j) => j.pnr === bk.id && j.status === "valid" && j.seats.length === 3 && j.travellers.join() === "Asha,Bala,Chitra" && j.details.length === 3);
  await expect("GET /tickets/:token unknown is 404", call("GET", "/tickets/nope", null, false), 404);
  await expect("cancelling every seat this way is refused", call("POST", `/bookings/${bk.id}/cancel-seats`, { seatIds: three.map((x) => x.id) }), 400, (j) => /whole booking/.test(j.message));
  await expect("a seat that isn't on the booking is refused", call("POST", `/bookings/${bk.id}/cancel-seats`, { seatIds: ["Z9"] }), 400);
  const mid = three[1];
  const sum = bk.seats.reduce((a, x) => a + x.price, 0);
  const share = Math.floor((bk.amount * bk.seats.find((x) => x.id === mid.id).price) / sum);
  const cut = await expect("POST /bookings/:id/cancel-seats refunds that seat's share", call("POST", `/bookings/${bk.id}/cancel-seats`, { seatIds: [mid.id] }), 200,
    (j) => j.seats.length === 2 && j.amount === bk.amount - share && j.status === "confirmed"
      && j.lines.find(([k]) => k === "Seats")[1] === `${three[0].id}, ${three[2].id}` && j.lines.find(([k]) => k === "Traveller names")[1] === "Asha K, Chitra S"
      && /back to wallet|refund due/.test(j.lines.find(([k]) => k === "Seats cancelled")[1]));
  if (pay === "wallet") check("the seat's share is back in the wallet", (await balance()) === before - bk.amount + share);
  await expect("the cancelled seat is on sale again", call("GET", sp(list[1])), 200, (j) => !j.find((x) => x.id === mid.id).booked && j.find((x) => x.id === three[0].id).booked);
  await expect("the m-ticket shows the two seats left", call("GET", `/tickets/${bk.ticketToken}`, null, false), 200, (j) => j.seats.length === 2 && j.travellers.join() === "Asha,Chitra");

  // Reschedule: same route, same travellers, another bus.
  const two = await freeSeats(list[2], 2);
  const one = (await call("POST", "/quotes", { service: "bus", busId: list[2].id, from: "Chennai", to: "Bengaluru", date: TRAVEL, seatIds: [two[0].id], genders: ["male"] })).json;
  await expect("a change needs one seat per traveller", call("POST", `/bookings/${bk.id}/reschedule`, { quoteId: one.id, subtitle: "x", lines: [] }), 400, (j) => /Pick 2 seats/.test(j.message));
  const qNew = (await call("POST", "/quotes", { service: "bus", busId: list[2].id, from: "Chennai", to: "Bengaluru", date: TRAVEL, seatIds: two.map((x) => x.id), genders: ["male", "male"] })).json;
  const newAmount = qNew.total + cfg.settings.busRescheduleFee;
  const bal1 = await balance();
  const moved = await expect("POST /bookings/:id/reschedule moves it and settles the difference", call("POST", `/bookings/${bk.id}/reschedule`,
    { quoteId: qNew.id, subtitle: "Smoke bus 2", lines: [["Date", TRAVEL], ["Departure", "22:15 from Koyambedu"], ["Seats", "ignored"]] }), 200,
    (j) => j.booking.rescheduledAt && j.booking.amount === newAmount && j.booking.subtitle === "Smoke bus 2"
      && j.booking.seats.map((x) => x.id).join() === two.map((x) => x.id).join()
      && j.charged === Math.max(0, newAmount - cut.amount) && j.refunded === Math.max(0, cut.amount - newAmount)
      && j.booking.lines.find(([k]) => k === "Departure")[1] === "22:15 from Koyambedu" && j.booking.lines.find(([k]) => k === "Seats")[1] === two.map((x) => x.id).join(", ")
      && !!j.booking.lines.find(([k]) => k === "Changed from"));
  if (pay === "wallet" && moved) check("the wallet settles the change", (await balance()) === bal1 + moved.refunded - moved.charged);
  await expect("the old seats are free and the new ones held", call("GET", sp(list[1])), 200, (j) => !j.find((x) => x.id === three[0].id).booked);
  await expect("the new bus holds the seats", call("GET", sp(list[2])), 200, (j) => two.every((s) => j.find((x) => x.id === s.id).booked));
  const qAgain = (await call("POST", "/quotes", { service: "bus", busId: list[3].id, from: "Chennai", to: "Bengaluru", date: TRAVEL, seatIds: (await freeSeats(list[3], 2)).map((x) => x.id), genders: ["male", "male"] })).json;
  await expect("a ticket changes only once", call("POST", `/bookings/${bk.id}/reschedule`, { quoteId: qAgain.id, subtitle: "x", lines: [] }), 409, (j) => /already changed/.test(j.message));
  await expect("another customer can't change it", call("POST", `/bookings/${bk.id}/cancel-seats`, { seatIds: [two[0].id] }, false), 401);
  await call("POST", `/bookings/${bk.id}/cancel`);
  await expect("a cancelled ticket shows as cancelled", call("GET", `/tickets/${bk.ticketToken}`, null, false), 200, (j) => j.status === "cancelled" && j.seats.length === 0);
  await expect("cancelling frees the new seats", call("GET", sp(list[2])), 200, (j) => two.every((s) => !j.find((x) => x.id === s.id).booked));
}

// Holiday group departures: booked by departure (its date and price), seats left go down and come back.
{
  const group = tours.find((t) => t.departures?.some((d) => d.seatsLeft >= 2));
  if (!group) console.log("SKIP  no group departure with seats left");
  else {
    check("packages list departures with seats left", group.departures.every((d) => d.date && d.seatsLeft >= 0 && d.seatsLeft <= d.seats && d.price > 0) && tours.some((t) => !t.departures?.length));
    await expect("a group package needs a departure", call("POST", "/quotes", { service: "tours", tourId: group.id, adults: 1, kids: 0, start: TRAVEL }), 400, (j) => /departures/.test(j.message));
    await expect("an unknown departure is refused", call("POST", "/quotes", { service: "tours", tourId: group.id, adults: 1, kids: 0, start: TRAVEL, departureId: "dpnope" }), 400);
    const dep = group.departures.find((d) => d.seatsLeft >= 2);
    const dq = await expect("a departure quote uses its date and price", call("POST", "/quotes", { service: "tours", tourId: group.id, adults: 2, kids: 0, start: "2030-01-01", departureId: dep.id }), 201,
      (j) => j.lines[0].amount === dep.price * 2);
    const db = await expect("booking a departure starts on its date", call("POST", "/bookings", newBooking({ service: "tours", title: group.title, subtitle: "Smoke departure", lines: [], quoteId: dq.id })), 201,
      (j) => j.startsAt?.startsWith(dep.date));
    const seatsNow = async () => (await call("GET", `/tours/${group.slug}`)).json.departures.find((d) => d.id === dep.id).seatsLeft;
    check("its travellers take seats", (await seatsNow()) === dep.seatsLeft - 2);
    if (dep.seatsLeft - 2 < 10) await expect("more travellers than seats left is refused", call("POST", "/quotes", { service: "tours", tourId: group.id, adults: dep.seatsLeft - 1, kids: 0, start: TRAVEL, departureId: dep.id }), 409, (j) => /left|sold out/.test(j.message));
    await call("POST", `/bookings/${db.id}/cancel`);
    check("cancelling gives the seats back", (await seatsNow()) === dep.seatsLeft);
    await expect("an any-date package refuses a departure", call("POST", "/quotes", { service: "tours", tourId: anyDate.id, adults: 1, kids: 0, start: TRAVEL, departureId: dep.id }), 400);
  }
}

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
  && j.gst?.gstin === "33ABCDE1234F1Z5" && j.autoShareNightRides === true && j.autoShareRides === "night");
await expect("PATCH /me with null clears a field", call("PATCH", "/me", { gst: null, autoShareNightRides: false }), 200,
  (j) => j.gst === null && j.autoShareNightRides === false);

// Safety Preferences and women-only rides (B8): a woman rider sees Bike Pink and gets a woman captain and her own PIN.
{
  const tokW = (await call("POST", "/auth/verify", { phone: "73" + String(Date.now()).slice(-8), otp: OTP })).json?.token ?? "";
  await call("PATCH", "/me", { name: "Smoke Woman", gender: "female" }, tokW);
  await expect("Safety Preferences: share every ride", call("PATCH", "/me", { autoShareRides: "always" }, tokW), 200, (j) => j.autoShareRides === "always" && j.autoShareNightRides === true);
  await expect("an unknown share mode is refused", call("PATCH", "/me", { autoShareRides: "sometimes" }, tokW), 400);
  await expect("a ride PIN must be 4 digits", call("PATCH", "/me", { ridePin: "12a4" }, tokW), 400, (j) => /4 digits/.test(j.message));
  await expect("set a ride PIN", call("PATCH", "/me", { ridePin: "4826" }, tokW), 200, (j) => j.ridePin === "4826");
  const pink = cfg.rideOptions.find((o) => o.riders === "women");
  const bikeQuote = (auth) => call("POST", "/rides/quote", { service: "bike", pickupId: a.id, dropId: b.id }, auth);
  if (!pink || !cfg.settings.featureWomenOnlyRides) console.log("SKIP  no women-only ride type on sale");
  else {
    await expect("women riders see the women-only ride type", bikeQuote(tokW), 200, (j) => j.some((q) => q.option.id === pink.id));
    await expect("signed-out quotes don't offer it", bikeQuote(false), 200, (j) => j.length > 0 && !j.some((q) => q.option.id === pink.id));
    await expect("other riders don't see it", bikeQuote(true), 200, (j) => !j.some((q) => q.option.id === pink.id));
    await expect("other riders can't book it", call("POST", "/rides", { optionId: pink.id, pickupId: a.id, dropId: b.id, payment: "upi" }), 409, (j) => /women riders/.test(j.message));
    const pinkRide = await expect("a women-only ride gets a woman captain and the rider's own PIN", call("POST", "/rides", { optionId: pink.id, pickupId: a.id, dropId: b.id, payment: "upi" }, tokW), 201,
      (j) => ["Lakshmi R", "Priya S"].includes(j.driver.name) && j.otp === "4826" && j.quote.option.riders === "women");
    if (pinkRide) await call("POST", `/rides/${pinkRide.id}/cancel`, null, tokW);
  }
  await expect("clearing the PIN goes back to a new code each ride", call("PATCH", "/me", { ridePin: null, autoShareRides: "off" }, tokW), 200, (j) => j.ridePin === null && j.autoShareRides === "off" && j.autoShareNightRides === false);
  await call("POST", "/auth/logout", null, tokW);
}

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

// QuikFly Credits: earned on a completed ride, part-pay the next booking, come back on cancel
const st = cfg.settings;
await expect("GET /me/credits needs sign-in", call("GET", "/me/credits", null, false), 401);
await expect("new user: no credits yet", call("GET", "/me/credits", null, tokenB), 200, (j) => j.balance === 0 && j.items.length === 0 && j.nextExpiry === null);
const earnRide = (await call("POST", "/rides", rideInput, tokenB)).json;
const earnBooking = await expect("useCredits with no credits takes nothing", call("POST", "/bookings", newBooking({ service: "car", rideId: earnRide.id, useCredits: true }), tokenB), 201,
  (j) => j.creditsUsed === 0 && j.amount === earnRide.quote.fare);
await call("POST", `/bookings/${earnBooking.id}/complete`, null, tokenB);
const earned = Math.min(st.creditsCap, Math.floor((earnBooking.amount * st.creditsRides) / 100));
await expect("completing a ride earns credits", call("GET", "/me/credits", null, tokenB), 200,
  (j) => earned > 0 && j.balance === earned && j.items[0].kind === "earned" && j.items[0].amount === earned && j.items[0].bookingId === earnBooking.id
    && j.nextExpiry?.amount === earned && Math.abs(Date.parse(j.nextExpiry.expiresAt) - Date.now() - st.creditsExpiryDays * 86_400_000) < 300_000);
await expect("GET /auth/me carries the credit balance", call("GET", "/auth/me", null, tokenB), 200, (j) => j.creditBalance === earned);
await expect("the customer is told about credits earned", call("GET", "/me/notifications", null, tokenB), 200,
  (j) => j.items.some((n) => n.kind === "credits.earned" && n.bookingId === earnBooking.id));
await expect("completing again earns nothing more", call("POST", `/bookings/${earnBooking.id}/complete`, null, tokenB), 409);
const spendRide = (await call("POST", "/rides", rideInput, tokenB)).json;
const usable = Math.min(earned, Math.floor((spendRide.quote.fare * st.creditsMaxRedeemPercent) / 100));
const spent = await expect("useCredits pays part of a booking (the API decides how much)", call("POST", "/bookings",
  newBooking({ service: "car", rideId: spendRide.id, useCredits: true, lines: [["QuikFly Credits", "fake"]] }), tokenB), 201,
  (j) => j.creditsUsed === usable && j.amount === spendRide.quote.fare - usable && j.lines.filter(([k]) => k === "QuikFly Credits").length === 1);
await expect("spending is logged and lowers the balance", call("GET", "/me/credits", null, tokenB), 200,
  (j) => j.balance === earned - usable && j.items[0].kind === "spent" && j.items[0].amount === -usable && j.items[0].bookingId === spent.id);
await call("POST", `/bookings/${spent.id}/cancel`, null, tokenB);
await expect("cancelling gives the credits back", call("GET", "/me/credits", null, tokenB), 200,
  (j) => j.balance === earned && j.items[0].kind === "returned" && j.items[0].amount === usable && j.items[0].remaining === usable);
const plainRide = (await call("POST", "/rides", rideInput, tokenB)).json;
await expect("without useCredits nothing is taken", call("POST", "/bookings", newBooking({ service: "car", rideId: plainRide.id }), tokenB), 201,
  (j) => j.creditsUsed === 0 && j.amount === plainRide.quote.fare);

// QuikFly Pass: a fresh customer buys it from the wallet; rides at a surge hour lose the surge.
{
  const peakHour = (st.surgeHours.match(/(\d{1,2})\s*-/) ?? [])[1];
  const passOn = st.featureRidePass && peakHour !== undefined && Math.min(st.surgeMultiplier, st.surgeCap) > 1;
  const phoneP = "8" + String(Date.now() + 7).slice(-9);
  const tokenP = (await call("POST", "/auth/verify", { phone: phoneP, otp: OTP })).json?.token ?? "";
  await call("PATCH", "/me", { name: "Smoke Pass" }, tokenP);
  await expect("POST /me/pass needs sign-in", call("POST", "/me/pass", null, false), 401);
  await expect("a new customer has no pass", call("GET", "/auth/me", null, tokenP), 200, (j) => j.passUntil === null);
  if (!passOn) {
    await expect("no surge to waive: the pass isn't sold", call("POST", "/me/pass", null, tokenP), 409, (j) => !!j.message);
  } else {
    const peakAt = `${dayOffset(2)}T${String(peakHour).padStart(2, "0")}:00`;
    const peakReq = { service: "car", pickupId: a.id, dropId: b.id, scheduledFor: peakAt };
    const anon = (await call("POST", "/rides/quote", peakReq, false)).json;
    check("a surge-hour fare has surge and no saving", anon?.[0]?.surge > 1 && !anon[0].passSaving, JSON.stringify(anon?.[0]));
    const bought = await expect("POST /me/pass buys a pass from the wallet", call("POST", "/me/pass", null, tokenP), 201,
      (j) => Math.abs(Date.parse(j.passUntil) - Date.now() - st.passDays * 86_400_000) < 300_000);
    await expect("GET /auth/me carries passUntil and the lower wallet", call("GET", "/auth/me", null, tokenP), 200,
      (j) => j.passUntil === bought.passUntil && j.walletBalance === st.welcomeCredit - st.passPrice);
    await expect("the pass is in the wallet history", call("GET", "/me/wallet", null, tokenP), 200,
      (j) => j[0].kind === "payment" && j[0].amount === -st.passPrice && /QuikFly Pass/.test(j[0].note) && j[0].bookingId === null);
    const waived = await expect("with the pass, surge-hour fares have no surge", call("POST", "/rides/quote", peakReq, tokenP), 200,
      (j) => j.every((q, i) => q.surge === 1 && q.passSaving > 0 && q.fare + q.passSaving === anon[i].fare));
    await expect("without a token the same quote still has surge", call("POST", "/rides/quote", peakReq, false), 200, (j) => j[0].surge > 1);
    const passRide = await expect("a ride booked with the pass is priced without surge", call("POST", "/rides", { ...rideInput, scheduledFor: peakAt, payment: "upi" }, tokenP), 201,
      (j) => j.quote.surge === 1 && j.quote.fare === waived.find((q) => q.option.id === rideInput.optionId).fare && j.quote.passSaving > 0);
    await call("POST", `/rides/${passRide.id}/cancel`, null, tokenP);
    await expect("buying again adds the days after the running pass", call("POST", "/me/pass", null, tokenP), 201,
      (j) => Date.parse(j.passUntil) - Date.parse(bought.passUntil) === st.passDays * 86_400_000);
    await expect("both passes were paid for", call("GET", "/auth/me", null, tokenP), 200, (j) => j.walletBalance === st.welcomeCredit - 2 * st.passPrice);
  }
  await call("POST", "/auth/logout", null, tokenP);
}

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

// Notification inbox: the bus booking and its cancellation from earlier are in it.
await expect("GET /me/notifications needs sign-in", call("GET", "/me/notifications", null, false), 401);
await expect("GET /me/notifications lists booking events", call("GET", "/me/notifications"), 200,
  (j) => Array.isArray(j.items) && typeof j.unread === "number"
    && j.items.some((n) => n.kind === "booking.confirmed" && n.bookingId === booking.id)
    && j.items.some((n) => n.kind === "booking.cancelled" && n.bookingId === booking.id && /refund/i.test(n.body)));
await expect("marking read needs a list of ids", call("POST", "/me/notifications/read", { ids: "all" }), 400);
const someId = (await call("GET", "/me/notifications")).json.items[0].id;
await expect("mark one notification read", call("POST", "/me/notifications/read", { ids: [someId] }), 200, (j) => typeof j.unread === "number");
await expect("mark all notifications read", call("POST", "/me/notifications/read", {}), 200, (j) => j.unread === 0);

// Partner registration (QuikFly Partner app), with a fresh account
const vPhone = "8" + String(Date.now()).slice(-9);
const V = (await call("POST", "/auth/verify", { phone: vPhone, otp: OTP })).json?.token ?? "";
await call("PATCH", "/me", { name: "Smoke Partner" }, V);
await expect("GET /vendor needs sign-in", call("GET", "/vendor", null, false), 401);
await expect("no partner application yet", call("GET", "/vendor", null, V), 200, (j) => j.application === null);
await expect("saving before starting is 404", call("PUT", "/vendor/sections/bank", { holder: "A", account: "1", ifsc: "X" }, V), 404);
await expect("POST /vendor starts an application", call("POST", "/vendor", null, V), 201,
  (j) => j.status === "draft" && Object.values(j.sections).every((s) => s.state === "pending") && j.vehicle === null);
await expect("starting again keeps the same application", call("POST", "/vendor", null, V), 201, (j) => j.status === "draft");
await expect("RC needs the vehicle first", call("PUT", "/vendor/sections/rc", { ownerName: "Smoke Partner", validTill: dayOffset(365) }, V), 409);
await expect("bad registration number is refused", call("PUT", "/vendor/sections/vehicle", { city: "Chennai", type: "car", fuel: "petrol_diesel", regNumber: "12345", purchaseDate: dayOffset(-700) }, V), 400);
await expect("too old a vehicle is refused", call("PUT", "/vendor/sections/vehicle", { city: "Chennai", type: "car", fuel: "petrol_diesel", regNumber: randomReg(), purchaseDate: dayOffset(-365 * 12) }, V), 400, (j) => /older than/.test(j.message));
await expect("unknown city is refused", call("PUT", "/vendor/sections/vehicle", { city: "Atlantis", type: "car", fuel: "petrol_diesel", regNumber: randomReg(), purchaseDate: dayOffset(-700) }, V), 400);
const vReg = randomReg();
await expect("save city and vehicle (spaces in the number are fine)", call("PUT", "/vendor/sections/vehicle", { city: "Chennai", type: "car", fuel: "cng_lpg", regNumber: vReg.replace(/^(..)(..)/, "$1 $2 "), purchaseDate: dayOffset(-700) }, V), 200,
  (j) => j.city === "Chennai" && j.vehicle.regNumber === vReg && j.vehicle.fuel === "cng_lpg" && j.sections.vehicle.state === "filled");
await expect("bad IFSC is refused", call("PUT", "/vendor/sections/bank", { holder: "Smoke Partner", account: "123456789012", ifsc: "SBIN123" }, V), 400);
await expect("save bank details (shown masked)", call("PUT", "/vendor/sections/bank", { holder: "Smoke Partner", account: "1234 5678 9012", ifsc: "sbin0001234" }, V), 200,
  (j) => j.bank.accountLast4 === "9012" && j.bank.ifsc === "SBIN0001234" && !JSON.stringify(j).includes("123456789012"));
await expect("an expired RC is refused", call("PUT", "/vendor/sections/rc", { ownerName: "Smoke Partner", validTill: dayOffset(-1) }, V), 400);
await expect("RC details without the photo stay pending", call("PUT", "/vendor/sections/rc", { ownerName: "Smoke Partner", validTill: dayOffset(365) }, V), 200, (j) => j.sections.rc.state === "pending");
await expect("save insurance", call("PUT", "/vendor/sections/insurance", { insurer: "Smoke General", policyNumber: "pol/2026-001", validTill: dayOffset(200) }, V), 200, (j) => j.vehicle.insurance.policyNumber === "POL/2026-001");
await expect("audit too far ahead is refused", call("PUT", "/vendor/sections/audit", { date: dayOffset(60), slot: "morning" }, V), 400);
await expect("book the vehicle audit", call("PUT", "/vendor/sections/audit", { date: dayOffset(3), slot: "afternoon" }, V), 200, (j) => j.vehicle.audit.result === "booked" && j.sections.audit.state === "filled");
await expect("can't send with sections missing", call("POST", "/vendor/submit", null, V), 400);
const up = await upload("/vendor/documents/photo", JPEG, V);
if (up.status === 409) {
  console.log("SKIP  document uploads (R2 not switched on for this API)");
} else {
  check("upload a profile photo", up.status === 200 && up.json.hasPhoto && up.json.sections.photo.state === "filled", `${up.status} ${JSON.stringify(up.json)?.slice(0, 160)}`);
  const fake = await upload("/vendor/documents/rc", new TextEncoder().encode("not a picture at all"), V);
  check("a non-image upload is refused", fake.status === 400, String(fake.status));
  const rcUp = await upload("/vendor/documents/rc", JPEG, V);
  check("RC photo completes the RC section", rcUp.status === 200 && rcUp.json.sections.rc.state === "filled", String(rcUp.status));
  const insUp = await upload("/vendor/documents/insurance", JPEG, V);
  check("insurance photo completes insurance", insUp.status === 200 && insUp.json.sections.insurance.state === "filled", String(insUp.status));
  const got = await fetch(BASE + "/vendor/documents/photo", { headers: { Authorization: `Bearer ${V}` } });
  check("the partner can open their own photo", got.status === 200 && got.headers.get("content-type") === "image/jpeg" && (await got.arrayBuffer()).byteLength === JPEG.length, String(got.status));
  const other = await fetch(BASE + "/vendor/documents/photo", { headers: { Authorization: `Bearer ${token}` } });
  check("someone without an application can't open documents", other.status === 404, String(other.status));
  await expect("send the application", call("POST", "/vendor/submit", null, V), 200, (j) => j.status === "submitted" && !!j.submittedAt);
  await expect("sections are locked while under review", call("PUT", "/vendor/sections/bank", { holder: "Someone Else", account: "123456789012", ifsc: "SBIN0001234" }, V), 409);
  await expect("reset is refused once sent", call("POST", "/vendor/reset", null, V), 409);
}
await expect("onboarding waits for approval", call("POST", "/vendor/onboarding/payment", null, V), 409);
const vPhone2 = "8" + String(Date.now() + 7).slice(-9);
const V2 = (await call("POST", "/auth/verify", { phone: vPhone2, otp: OTP })).json?.token ?? "";
await call("POST", "/vendor", null, V2);
await expect("the same vehicle can't be registered twice", call("PUT", "/vendor/sections/vehicle", { city: "Chennai", type: "car", fuel: "petrol_diesel", regNumber: vReg, purchaseDate: dayOffset(-700) }, V2), 409);
await call("PUT", "/vendor/sections/vehicle", { city: "Chennai", type: "auto", fuel: "cng_lpg", regNumber: randomReg(), purchaseDate: dayOffset(-300) }, V2);
await expect("reset clears a draft", call("POST", "/vendor/reset", null, V2), 200, (j) => j.vehicle === null && j.city === null && j.sections.vehicle.state === "pending");
await call("POST", "/me/delete", { otp: OTP }, V);
await call("POST", "/me/delete", { otp: OTP }, V2);
// Push devices (Firebase tokens from the app)
await expect("register a push device", call("POST", "/me/push-devices", { token: "smoke-token-123", platform: "android" }), 201, (j) => j.registered === true);
await expect("a push device needs a known platform", call("POST", "/me/push-devices", { token: "smoke-token-123", platform: "fridge" }), 400);
await expect("remove a push device", call("DELETE", "/me/push-devices/smoke-token-123"), 200, (j) => j.removed === true);

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
