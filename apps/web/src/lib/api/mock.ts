// Demo-mode implementation of the API contract. Simulates latency and keeps data in the
// browser so the client can click through every flow offline. The catalog is the shared
// seed and settings are the defaults; prices use the same @quikfly/shared pricing as the API.
// Storage helpers: ./mock-store.ts. Account endpoints: ./mock-account.ts.
import type { QuikflyApi } from "./contract";
import {
  BUS_OPERATORS, CATALOG_SEED, CREDITS_LINE, DEFAULT_SETTINGS, DEPOSIT_LINE, creditsEarned, creditsReturned, creditsUsable, passCovers, QUOTE_TTL_MINUTES, RIDE_MAX_STOPS, RIDE_SCHEDULE, localToIso, minutesUntilStart, scheduleError, RIDE_SIM, cancelPolicyFor, couponDiscount, generateBuses, generateSeats, pick,
  priceBus, priceGroup, priceRent, priceTour, quoteStartsAt, refundAmount, refundPercent, rideCancelFee, rideQuotes, seatRuleError, sumLines,
  BUS_CHANGED_LINE, BUS_TRIP_LINES, SEATS_CANCELLED_LINE, SEATS_LINE, TRAVELLERS_LINE, isWomenOnly, upcomingDepartures, type TourPackage, rescheduleAmounts, rescheduleError, seatCancelError, seatCancelRefund, seatsShare, ticketStatus, travellerNames,
  type AppConfig, type AppNotification, type Booking, type SeatHold, type CouponCheck, type FareLine, type NewBooking, type PriceQuote, type QuoteRequest, type ServiceKey,
} from "@quikfly/shared";
import { mockAccount, mockAuth, mockContacts, mockSavedPlaces, mockTravellers } from "./mock-account";
import { mockVendor } from "./mock-vendor";
import { mockSupport } from "./mock-support";
import { mockRentalFor, mockRental } from "./mock-rental";
import { KEYS, creditBalance, creditEntry, currentUser, fail, load, save, signedInUser, uid, wait, walletEntry, type MockRide } from "./mock-store";

const creditExpiry = () => new Date(Date.now() + settings.creditsExpiryDays * 86_400_000).toISOString();

export { MOCK_OTP } from "./mock-store";

const settings = DEFAULT_SETTINGS;
const seed = CATALOG_SEED;
const QUOTES_KEY = "quikfly.mockQuotes";
const HOLDS_KEY = "quikfly.mockSeatHolds";
const NOTES_KEY = "quikfly.mockNotifications";
const notesStore = () => load<AppNotification[]>(NOTES_KEY, []);
/** Like the API's notify(): one notification per event. */
function mockNotify(n: Omit<AppNotification, "id" | "createdAt" | "readAt">) {
  save(NOTES_KEY, [{ ...n, id: uid("NT"), createdAt: new Date().toISOString(), readAt: null }, ...notesStore()].slice(0, 50));
}
type StoredHold = SeatHold & { busId: string; date: string; bookingId: string };
const holdsStore = () => load<StoredHold[]>(HOLDS_KEY, []);
const holdsFor = (busId: string, date: string) => holdsStore().filter((h) => h.busId === busId && h.date === date);

/** Bookings saved before bus changes existed lack the newer fields. */
/** Travellers each demo booking takes on a holiday departure (by booking id). */
const DEP_SEATS_KEY = "quikfly.mockDepartureSeats";
const depSeats = () => load<Record<string, { departureId: string; travellers: number }>>(DEP_SEATS_KEY, {});
function withDeps(t: TourPackage): TourPackage {
  const active = new Set(load<Booking[]>(KEYS.bookings, []).filter((b) => b.status !== "cancelled").map((b) => b.id));
  const taken: Record<string, number> = {};
  for (const [id, x] of Object.entries(depSeats())) if (active.has(id)) taken[x.departureId] = (taken[x.departureId] ?? 0) + x.travellers;
  return { ...t, departures: upcomingDepartures(seed.departure.filter((d) => d.tourId === t.id), t.price, taken, todayIso()) };
}
const todayIso = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

const bookingsStore = () => load<Booking[]>(KEYS.bookings, []).map((b): Booking => ({ ...b, discount: b.discount ?? 0, seats: b.seats ?? [], ticketToken: b.ticketToken ?? null, rescheduledAt: b.rescheduledAt ?? null, rentalState: b.rentalState ?? null }));
const saveBookings = (list: Booking[]) => save(KEYS.bookings, list);
const ridesStore = () => load<Record<string, MockRide>>(KEYS.rides, {});
type StoredQuote = PriceQuote & { used?: boolean; startsAt?: string; request?: QuoteRequest };
const quotesStore = () => load<Record<string, StoredQuote>>(QUOTES_KEY, {});

/** Replaces (or adds) one booking line, keeping the others in place. */
const setLine = (lines: [string, string][], k: string, v: string): [string, string][] =>
  lines.some(([x]) => x === k) ? lines.map(([x, y]) => [x, x === k ? v : y] as [string, string]) : [...lines, [k, v]];

/** Updates an active booking; refuses ones already cancelled or completed (409 on the API). */
function finishBooking(id: string, status: "cancelled" | "completed", patch: Partial<Booking> = {}) {
  const list = bookingsStore();
  const b = list.find((x) => x.id === id) ?? fail("Booking not found.");
  if (b.status !== "confirmed" && b.status !== "ongoing") fail(`This booking is already ${b.status}.`);
  Object.assign(b, patch, { status });
  saveBookings(list);
  return b;
}

const placeById = (id: string) => seed.place.find((x) => x.id === id) ?? fail("Unknown place.");
const byId = <T extends { id: string }>(list: T[], id: string, what: string) => list.find((x) => x.id === id) ?? fail(`Unknown ${what}.`);
const busFor = (from: string, to: string, date: string, id: string) =>
  generateBuses(BUS_OPERATORS.map((o) => o.name), settings, from, to, date).find((b) => b.id === id) ?? fail("That bus isn't running on this route and date.");

function priceLines(r: QuoteRequest): FareLine[] {
  switch (r.service) {
    case "bus": {
      const seats = generateSeats(busFor(r.from, r.to, r.date, r.busId), r.date, settings, holdsFor(r.busId, r.date));
      const chosen = r.seatIds.map((id) => seats.find((s) => s.id === id) ?? fail("Unknown seat."));
      if (chosen.some((s) => s.booked)) fail("One of those seats was just booked. Please pick another.");
      const ruleError = seatRuleError(chosen, r.genders ?? []);
      if (ruleError) fail(ruleError);
      return priceBus(chosen, settings);
    }
    case "tours": {
      // Like the API: a package with upcoming departures is priced on one of them, seats permitting.
      const tour = byId(seed.tour, r.tourId, "holiday");
      const deps = withDeps(tour).departures ?? [];
      if (!deps.length) return priceTour(tour, r.adults, r.kids, settings);
      const dep = deps.find((d) => d.id === r.departureId) ?? fail("Pick one of this package's departures.");
      if (dep.seatsLeft < r.adults + r.kids) fail(dep.seatsLeft ? `Only ${dep.seatsLeft} seats are left on this departure.` : "This departure is sold out. Please pick another date.");
      r.start = dep.date;
      return priceTour(tour, r.adults, r.kids, settings, dep.price);
    }
    case "rent": return priceRent(byId(seed.rentalCar, r.carId, "car"), r, settings);
    case "rentals": {
      const km = r.trip === "local" ? 0 : byId(seed.groupDestination, r.destinationId ?? "", "destination").km;
      return priceGroup(byId(seed.travelVehicle, r.vehicleId, "vehicle"), r.trip, km, r.days, settings);
    }
  }
}

/** Gross price of a booking (quote total or ride fare), like the API. */
function gross(input: Pick<NewBooking, "service" | "quoteId" | "rideId">): number {
  if (input.service === "bike" || input.service === "car") {
    const r = ridesStore()[input.rideId ?? ""] ?? fail("Ride not found.");
    return r.ride.quote.fare;
  }
  const q = quotesStore()[input.quoteId ?? ""] ?? fail("That price isn't valid. Please check the price again.");
  if (q.used) fail("This price was already used for a booking.");
  if (Date.parse(q.expiresAt) < Date.now()) fail("This price has expired. Please check the price again.");
  return q.total;
}

function coupon(code: string, service: ServiceKey, total: number): CouponCheck {
  const offer = seed.offer.find((o) => o.code === code.trim().toUpperCase()) ?? fail("That coupon code isn't valid.");
  const used = bookingsStore().filter((b) => b.status !== "cancelled" && b.lines.some(([k, v]) => k === "Coupon" && v.startsWith(offer.code))).length;
  const r = couponDiscount(offer, service, total, new Date().toISOString().slice(0, 10), used);
  if ("error" in r) fail(r.error);
  return { code: offer.code, discount: (r as { discount: number }).discount, total: total - (r as { discount: number }).discount };
}

export const mockApi: QuikflyApi = {
  config: {
    async get() {
      await wait(250);
      const config: AppConfig = {
        settings, places: seed.place, rideOptions: seed.rideOption, cities: seed.city, busOperators: seed.busOperator, popularRoutes: seed.popularRoute,
        groupDestinations: seed.groupDestination, offers: seed.offer, faqs: seed.faq,
      };
      return config;
    },
  },
  auth: mockAuth,
  account: mockAccount,
  savedPlaces: mockSavedPlaces,
  travellers: mockTravellers,
  contacts: mockContacts,

  places: {
    async search(q) {
      const s = q.trim().toLowerCase();
      return s ? seed.place.filter((p) => `${p.name} ${p.area}`.toLowerCase().includes(s)) : seed.place;
    },
  },

  rides: {
    async quote(service, pickupId, dropId, scheduledFor, stopIds = []) {
      await wait(700);
      if (stopIds.length > RIDE_MAX_STOPS) fail(`Add up to ${RIDE_MAX_STOPS} stops.`);
      const route = [pickupId, ...stopIds, dropId];
      if (route.some((id, i) => i > 0 && id === route[i - 1])) fail("A stop can't be the same as the place before it.");
      if (scheduledFor) { const err = scheduleError(settings, scheduledFor); if (err) fail(err); }
      const hour = scheduledFor ? parseInt(scheduledFor.slice(11, 13), 10) : new Date().getHours();
      // A signed-in rider whose QuikFly Pass covers the pickup time pays no surge (like the API).
      const waive = passCovers(signedInUser()?.passUntil, scheduledFor ? Date.parse(localToIso(scheduledFor)) : Date.now());
      // Women-only ride types only for signed-in women riders (like the API).
      const woman = settings.featureWomenOnlyRides && signedInUser()?.gender === "female";
      const options = seed.rideOption.filter((o) => o.service === service && (woman || !isWomenOnly(o)));
      return rideQuotes(options, placeById(pickupId), placeById(dropId), settings, hour, stopIds.map(placeById), waive);
    },
    async book({ optionId, pickupId, dropId, payment, scheduledFor, stopIds = [] }) {
      await wait(scheduledFor ? 900 : 2600); // "searching for drivers" only for ride-now
      const option = byId(seed.rideOption, optionId, "ride type");
      const rider = currentUser();
      if (isWomenOnly(option) && rider.gender !== "female") fail("This ride type is for women riders. Set your gender in your profile, or pick another ride type.");
      const quote = (await mockApi.rides.quote(option.service, pickupId, dropId, scheduledFor, stopIds)).find((q) => q.option.id === optionId)!;
      const s = Date.now();
      const roster = isWomenOnly(option) ? seed.driver.filter((d) => d.gender === "female") : seed.driver;
      const { id: _id, gender: _gender, ...driver } = pick(roster, s);
      const ride = {
        id: uid("RD"),
        quote,
        pickup: placeById(pickupId),
        drop: placeById(dropId),
        payment,
        otp: rider.ridePin ?? String(1000 + (s % 9000)),
        driver: {
          ...driver,
          vehicle: pick(option.models, s >> 2),
          plate: `${pick(RIDE_SIM.plateStates, s >> 3)} ${pick(RIDE_SIM.plateLetters, s >> 5)} ${1000 + (s % 8999)}`,
        },
        scheduledFor: scheduledFor ? localToIso(scheduledFor) : null,
        stops: stopIds.map(placeById),
      };
      save(KEYS.rides, { ...ridesStore(), [ride.id]: { ride, startedAt: new Date().toISOString(), cancelled: false } });
      return ride;
    },
    async get(id) {
      await wait(200);
      return (ridesStore()[id] ?? fail("Ride not found.")).ride;
    },
    async start(id) {
      await wait(300);
      const rides = ridesStore();
      const r = rides[id] ?? fail("Ride not found.");
      if (r.cancelled) fail("This ride was cancelled.");
      const at = r.ride.scheduledFor ?? fail("Only scheduled rides are started this way.");
      const wait_ = minutesUntilStart(at, RIDE_SCHEDULE.startWindowMinutes);
      if (wait_ > 0) fail(`Your driver is assigned ${RIDE_SCHEDULE.startWindowMinutes} minutes before pickup. Start the ride in ${wait_} minute${wait_ === 1 ? "" : "s"}.`);
      r.startedAt = new Date().toISOString();
      save(KEYS.rides, rides);
      return r.ride;
    },
    async cancel(id) {
      await wait(400);
      const rides = ridesStore();
      if (rides[id]) { rides[id].cancelled = true; save(KEYS.rides, rides); }
    },
    // Demo links only open in this browser, since the data lives in localStorage.
    async share(id) {
      await wait(300);
      if (!ridesStore()[id]) fail("Ride not found.");
      return { token: `demo-${id}`, expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
    },
    async shared(token) {
      await wait(300);
      const r = ridesStore()[token.replace(/^demo-/, "")] ?? fail("This trip link has expired or doesn't exist.");
      const { ride } = r;
      return {
        riderName: load<{ name: string } | null>(KEYS.user, null)?.name.split(" ")[0] ?? "Rider",
        service: ride.quote.option.service,
        status: r.cancelled ? "cancelled" : "active",
        startedAt: r.startedAt,
        pickup: ride.pickup, drop: ride.drop, stops: ride.stops ?? [],
        distanceKm: ride.quote.distanceKm, durationMin: ride.quote.durationMin, etaMin: ride.quote.etaMin,
        driver: { name: ride.driver.name, rating: ride.driver.rating, vehicle: ride.driver.vehicle, plate: ride.driver.plate },
      };
    },
  },

  buses: {
    async search(from, to, date) {
      await wait(800);
      return generateBuses(BUS_OPERATORS.map((o) => o.name), settings, from, to, date).map((b) => ({ ...b, seatsLeft: Math.max(0, b.seatsLeft - holdsFor(b.id, date).length) }));
    },
    async seats(bus, date) {
      await wait(500);
      return generateSeats(busFor(bus.from, bus.to, date, bus.id), date, settings, holdsFor(bus.id, date));
    },
  },

  tours: {
    async list() { await wait(300); return seed.tour.map(withDeps); },
    async get(slug) { await wait(200); return withDeps(seed.tour.find((t) => t.slug === slug) ?? fail("That holiday package isn't available.")); },
  },

  rentals: {
    async cars() { await wait(400); return seed.rentalCar; },
    async car(id) { await wait(200); return byId(seed.rentalCar, id, "car"); },
    async travelVehicles() { await wait(300); return seed.travelVehicle; },
  },

  quotes: {
    async create(r) {
      await wait(350);
      const lines = priceLines(r);
      const q: PriceQuote = { id: uid("QT"), service: r.service, lines, total: sumLines(lines), expiresAt: new Date(Date.now() + QUOTE_TTL_MINUTES * 60_000).toISOString() };
      const startsAt = quoteStartsAt(r, r.service === "bus" ? busFor(r.from, r.to, r.date, r.busId).depart : undefined);
      // Bus quotes remember each seat's price, so a seat's share can be refunded later (like the API).
      const seatPrices = r.service === "bus"
        ? r.seatIds.map((id) => generateSeats(busFor(r.from, r.to, r.date, r.busId), r.date, settings, holdsFor(r.busId, r.date)).find((s) => s.id === id)?.price ?? 0)
        : undefined;
      save(QUOTES_KEY, { ...quotesStore(), [q.id]: { ...q, startsAt, request: r.service === "bus" ? { ...r, seatPrices } : r } });
      return q;
    },
  },

  offers: {
    async check(code, ref) {
      await wait(400);
      currentUser();
      if ("rideId" in ref) {
        const r = ridesStore()[ref.rideId] ?? fail("Ride not found.");
        return coupon(code, r.ride.quote.option.service, r.ride.quote.fare);
      }
      const q = quotesStore()[ref.quoteId] ?? fail("That price isn't valid.");
      return coupon(code, q.service, q.total);
    },
  },

  notifications: {
    async list() {
      await wait(200);
      const items = notesStore();
      return { items, unread: items.filter((n) => !n.readAt).length };
    },
    async markRead(ids) {
      await wait(150);
      const now = new Date().toISOString();
      const items = notesStore().map((n) => (!n.readAt && (!ids || ids.includes(n.id)) ? { ...n, readAt: now } : n));
      save(NOTES_KEY, items);
      return { unread: items.filter((n) => !n.readAt).length };
    },
  },

  bookings: {
    async list() { await wait(200); return bookingsStore(); },
    async get(id) { await wait(200); return bookingsStore().find((b) => b.id === id) ?? fail("Booking not found."); },
    async create(input) {
      await wait(900);
      const total = gross(input);
      const c = input.couponCode ? coupon(input.couponCode, input.service, total) : null;
      const afterCoupon = total - (c?.discount ?? 0);
      // Joining a trip: the other booking must exist and not be cancelled (like the API).
      let tripId: string | null = null;
      if (input.tripOf) {
        const anchor = bookingsStore().find((x) => x.id === input.tripOf) ?? fail("The booking to add this to wasn't found.");
        if (anchor.status === "cancelled") fail("That booking was cancelled, so this can't join its trip.");
        tripId = anchor.tripId ?? anchor.id;
      }
      const quoted = input.quoteId ? quotesStore()[input.quoteId] : undefined;
      const quotedDeposit = quoted?.lines.find((l) => l.label === DEPOSIT_LINE)?.amount ?? 0;
      const busReq = quoted?.request?.service === "bus" ? quoted.request : null;
      const creditsUsed = input.useCredits ? creditsUsable(settings, creditBalance(), afterCoupon, Math.min(quotedDeposit, afterCoupon)) : 0;
      const amount = afterCoupon - creditsUsed;
      const deposit = Math.min(quotedDeposit, amount);
      const lines: [string, string][] = [
        ...input.lines.filter(([k]) => k !== "Coupon" && k !== CREDITS_LINE),
        ...(c ? [["Coupon", `${c.code} (−₹${c.discount.toLocaleString("en-IN")})`] as [string, string]] : []),
        ...(creditsUsed ? [[CREDITS_LINE, `−₹${creditsUsed.toLocaleString("en-IN")}`] as [string, string]] : []),
      ];
      const b: Booking = {
        id: uid("QF"), service: input.service, title: input.title, subtitle: input.subtitle, payment: input.payment,
        amount, lines, status: "confirmed", createdAt: new Date().toISOString(),
        startsAt: quoted?.startsAt || (input.rideId ? ridesStore()[input.rideId]?.ride.scheduledFor : null) || null, refundAmount: null, deposit, cancelReason: null, cancelFee: 0,
        rideId: input.rideId ?? null, tripId, creditsUsed, discount: c?.discount ?? 0,
        seats: busReq ? busReq.seatIds.map((id, i) => ({ id, price: busReq.seatPrices?.[i] ?? 0, gender: busReq.genders?.[i] ?? "other" })) : [],
        ticketToken: input.service === "bus" ? uid("TK").toLowerCase() : null, rescheduledAt: null, rentalState: null,
      };
      if (quoted?.request) b.rentalState = mockRentalFor(b.id, quoted.request, deposit);
      if (input.payment === "wallet") {
        if (currentUser().walletBalance < amount) fail("Not enough wallet balance. Choose another payment method.");
        walletEntry("payment", -amount, `Paid · ${input.title}`, b.id);
      }
      if (creditsUsed) creditEntry("spent", -creditsUsed, `Used · ${input.title}`, b.id);
      if (input.quoteId) {
        const qs = quotesStore();
        qs[input.quoteId] = { ...qs[input.quoteId], used: true };
        save(QUOTES_KEY, qs);
      }
      const req = quoted?.request;
      if (req?.service === "tours" && req.departureId) save(DEP_SEATS_KEY, { ...depSeats(), [b.id]: { departureId: req.departureId, travellers: req.adults + req.kids } });
      if (req?.service === "bus") {
        save(HOLDS_KEY, [...holdsStore(), ...req.seatIds.map((seatId, i) => ({ seatId, gender: req.genders?.[i] ?? "other" as const, busId: req.busId, date: req.date, bookingId: b.id }))]);
      }
      saveBookings([b, ...bookingsStore().map((x) => (x.id === input.tripOf && !x.tripId ? { ...x, tripId } : x))]);
      if (!b.rideId || b.startsAt) mockNotify({ kind: "booking.confirmed", title: `Booking confirmed · ${b.title}`, body: `${b.subtitle}. ₹${amount.toLocaleString("en-IN")}.`, bookingId: b.id });
      return b;
    },
    // Refunds what the service's cancellation policy allows for the notice given, like the API.
    async cancel(id, reason) {
      await wait(500);
      const current = bookingsStore().find((x) => x.id === id) ?? fail("Booking not found.");
      const ride = current.service === "bike" || current.service === "car";
      const fee = ride ? rideCancelFee(settings, current.amount, reason, current.createdAt, Date.now(), current.startsAt) : 0;
      const percent = ride ? 100 : refundPercent(cancelPolicyFor(settings, current.service), current.startsAt);
      const refund = ride ? current.amount - fee : refundAmount(current.amount, percent, current.deposit ?? 0);
      const b = finishBooking(id, "cancelled", { refundAmount: refund, cancelReason: reason ?? null, cancelFee: fee, seats: [] });
      save(HOLDS_KEY, holdsStore().filter((h) => h.bookingId !== id));
      mockNotify({ kind: "booking.cancelled", title: `Cancelled · ${b.title}`, bookingId: b.id,
        body: refund ? (b.payment === "wallet" ? `₹${refund.toLocaleString("en-IN")} is back in your QuikFly wallet.` : `Refund due: ₹${refund.toLocaleString("en-IN")}.`) : "No refund under the cancellation policy." });
      if (b.payment === "wallet" && refund > 0) walletEntry("refund", refund, `Refund${percent < 100 ? ` (${percent}%)` : ""} · ${b.title}`, b.id);
      const creditsBack = creditsReturned(b.creditsUsed ?? 0, percent);
      if (creditsBack) creditEntry("returned", creditsBack, `Returned · ${b.title}`, b.id, creditExpiry());
      return b;
    },
    // Like the API: customers complete rides only; staff close everything else.
    async complete(id) {
      await wait(200);
      const b = bookingsStore().find((x) => x.id === id) ?? fail("Booking not found.");
      if (b.service !== "bike" && b.service !== "car" && (b.status === "confirmed" || b.status === "ongoing")) fail("QuikFly staff close this booking once the trip is over.");
      const done = finishBooking(id, "completed");
      const earn = creditsEarned(settings, done.service, done.amount, done.deposit ?? 0);
      if (earn) {
        creditEntry("earned", earn, `Earned · ${done.title}`, done.id, creditExpiry());
        mockNotify({ kind: "credits.earned", title: `You earned ₹${earn.toLocaleString("en-IN")} QuikFly Credits`, body: `For ${done.title}. Use them on your next booking within ${settings.creditsExpiryDays} days.`, bookingId: done.id });
      }
      return done;
    },
    // Bus changes, with the API's rules (packages/shared/src/bus-changes.ts).
    async cancelSeats(id, seatIds) {
      await wait(500);
      const list = bookingsStore();
      const b = list.find((x) => x.id === id) ?? fail("Booking not found.");
      const err = seatCancelError(b, seatIds);
      if (err) fail(err);
      const { share, percent, refund } = seatCancelRefund(settings, b, seatIds);
      const creditsShare = seatsShare(b.creditsUsed, b.seats, seatIds);
      const keep = b.seats.map((s) => !seatIds.includes(s.id));
      const names = (b.lines.find(([k]) => k === TRAVELLERS_LINE)?.[1] ?? "").split(", ");
      const what = `${seatIds.join(", ")} · ${refund ? `₹${refund.toLocaleString("en-IN")}${b.payment === "wallet" ? " back to wallet" : " refund due"}` : "no refund"}`;
      const earlier = b.lines.find(([k]) => k === SEATS_CANCELLED_LINE)?.[1];
      let lines = setLine(b.lines, SEATS_LINE, b.seats.filter((_, i) => keep[i]).map((s) => s.id).join(", "));
      if (names.length === b.seats.length) lines = setLine(lines, TRAVELLERS_LINE, names.filter((_, i) => keep[i]).join(", "));
      lines = setLine(lines, SEATS_CANCELLED_LINE, earlier ? `${earlier}; ${what}` : what);
      const discountShare = seatsShare(b.discount, b.seats, seatIds);
      Object.assign(b, { amount: b.amount - share, creditsUsed: b.creditsUsed - creditsShare, discount: b.discount - discountShare, seats: b.seats.filter((_, i) => keep[i]), lines });
      saveBookings(list);
      save(HOLDS_KEY, holdsStore().filter((h) => !(h.bookingId === id && seatIds.includes(h.seatId))));
      if (b.payment === "wallet" && refund > 0) walletEntry("refund", refund, `Refund (seats ${seatIds.join(", ")}${percent < 100 ? `, ${percent}%` : ""}) · ${b.title}`, b.id);
      const creditsBack = creditsReturned(creditsShare, percent);
      if (creditsBack) creditEntry("returned", creditsBack, `Returned (seats ${seatIds.join(", ")}) · ${b.title}`, b.id, creditExpiry());
      mockNotify({ kind: "booking.changed", title: `Seats cancelled · ${b.title}`, bookingId: b.id, body: `Seat ${seatIds.join(", ")} cancelled.` });
      return b;
    },
    async reschedule(id, change) {
      await wait(700);
      const list = bookingsStore();
      const b = list.find((x) => x.id === id) ?? fail("Booking not found.");
      const err = rescheduleError(settings, b);
      if (err) fail(err);
      const q = quotesStore()[change.quoteId] ?? fail("That price isn't valid. Please check the price again.");
      if (q.used) fail("This price was already used for a booking.");
      const req = q.request;
      if (req?.service !== "bus") return fail("That price isn't for a bus.");
      if (req.seatIds.length !== b.seats.length) fail(`Pick ${b.seats.length} seat${b.seats.length > 1 ? "s" : ""}, one for each traveller.`);
      const { newAmount, charge, refund, fee } = rescheduleAmounts(settings, b, q.total);
      if (b.payment === "wallet" && charge > currentUser().walletBalance) fail(`The new bus costs ₹${charge.toLocaleString("en-IN")} more and your wallet is short. Add money or pick another bus.`);
      const was = [b.lines.find(([k]) => k === "Date")?.[1], b.lines.find(([k]) => k === "Departure")?.[1]].filter(Boolean).join(", ");
      let lines = b.lines;
      for (const key of BUS_TRIP_LINES) { const v = change.lines.find(([k]) => k === key)?.[1]; if (v) lines = setLine(lines, key, v); }
      lines = setLine(lines, SEATS_LINE, req.seatIds.join(", "));
      lines = setLine(lines, BUS_CHANGED_LINE, `${was || "the earlier bus"}${fee ? ` (fee ₹${fee})` : ""}${charge ? ` · paid ₹${charge} more` : refund ? ` · ₹${refund} ${b.payment === "wallet" ? "back to wallet" : "refund due"}` : ""}`);
      Object.assign(b, {
        amount: newAmount, startsAt: q.startsAt ?? b.startsAt, subtitle: change.subtitle, lines, rescheduledAt: new Date().toISOString(),
        seats: req.seatIds.map((sid, i) => ({ id: sid, price: req.seatPrices?.[i] ?? 0, gender: req.genders?.[i] ?? "other" })),
      });
      saveBookings(list);
      save(QUOTES_KEY, { ...quotesStore(), [change.quoteId]: { ...q, used: true } });
      save(HOLDS_KEY, [...holdsStore().filter((h) => h.bookingId !== id), ...req.seatIds.map((seatId, i) => ({ seatId, gender: req.genders?.[i] ?? ("other" as const), busId: req.busId, date: req.date, bookingId: id }))]);
      if (b.payment === "wallet" && (charge || refund)) walletEntry(charge ? "payment" : "refund", refund - charge, `${charge ? "Bus change" : "Bus change refund"} · ${b.title}`, b.id);
      mockNotify({ kind: "booking.changed", title: `Bus changed · ${b.title}`, bookingId: b.id, body: `${change.subtitle}.` });
      return { booking: b, charged: charge, refunded: refund };
    },
  },

  vendor: mockVendor,
  support: mockSupport,
  rental: mockRental,

  tickets: {
    async get(token) {
      await wait(250);
      const b = bookingsStore().find((x) => x.ticketToken === token) ?? fail("Ticket not found.");
      const line = (k: string) => b.lines.find(([key]) => key === k)?.[1];
      return {
        pnr: b.id, status: ticketStatus(b),
        title: b.title, subtitle: b.subtitle, startsAt: b.startsAt,
        seats: b.status === "cancelled" ? [] : (line(SEATS_LINE) ?? "").split(", ").filter(Boolean),
        details: (["Date", "Departure", "Arrival"] as const).flatMap((k) => (line(k) ? [[k, line(k)!] as [string, string]] : [])),
        travellers: travellerNames(b.lines).map((n) => n.split(/\s+/)[0]),
      };
    },
  },
};
