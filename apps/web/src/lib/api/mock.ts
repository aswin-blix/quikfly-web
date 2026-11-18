// Demo-mode implementation of the API contract. Simulates latency and keeps data in the
// browser so the client can click through every flow offline. The catalog is the shared
// seed and settings are the defaults; prices use the same @quikfly/shared pricing as the API.
// Storage helpers: ./mock-store.ts. Account endpoints: ./mock-account.ts.
import type { QuikflyApi } from "./contract";
import {
  BUS_OPERATORS, CATALOG_SEED, DEFAULT_SETTINGS, DEPOSIT_LINE, QUOTE_TTL_MINUTES, RIDE_SIM, cancelPolicyFor, couponDiscount, generateBuses, generateSeats, pick,
  priceBus, priceGroup, priceRent, priceTour, quoteStartsAt, refundAmount, refundPercent, rideQuotes, seatRuleError, sumLines,
  type AppConfig, type Booking, type SeatHold, type CouponCheck, type FareLine, type NewBooking, type PriceQuote, type QuoteRequest, type ServiceKey,
} from "@quikfly/shared";
import { mockAccount, mockAuth, mockContacts, mockSavedPlaces, mockTravellers } from "./mock-account";
import { KEYS, currentUser, fail, load, save, uid, wait, walletEntry, type MockRide } from "./mock-store";

export { MOCK_OTP } from "./mock-store";

const settings = DEFAULT_SETTINGS;
const seed = CATALOG_SEED;
const QUOTES_KEY = "quikfly.mockQuotes";
const HOLDS_KEY = "quikfly.mockSeatHolds";
type StoredHold = SeatHold & { busId: string; date: string; bookingId: string };
const holdsStore = () => load<StoredHold[]>(HOLDS_KEY, []);
const holdsFor = (busId: string, date: string) => holdsStore().filter((h) => h.busId === busId && h.date === date);

const bookingsStore = () => load<Booking[]>(KEYS.bookings, []);
const saveBookings = (list: Booking[]) => save(KEYS.bookings, list);
const ridesStore = () => load<Record<string, MockRide>>(KEYS.rides, {});
type StoredQuote = PriceQuote & { used?: boolean; startsAt?: string; request?: QuoteRequest };
const quotesStore = () => load<Record<string, StoredQuote>>(QUOTES_KEY, {});

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
    case "tours": return priceTour(byId(seed.tour, r.tourId, "holiday"), r.adults, r.kids, settings);
    case "rent": return priceRent(byId(seed.rentalCar, r.carId, "car"), r, settings);
    case "rentals": {
      const km = r.trip === "outstation" ? byId(seed.groupDestination, r.destinationId ?? "", "destination").km : 0;
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
    async quote(service, pickupId, dropId) {
      await wait(700);
      return rideQuotes(seed.rideOption.filter((o) => o.service === service), placeById(pickupId), placeById(dropId), settings, new Date().getHours());
    },
    async book({ optionId, pickupId, dropId, payment }) {
      await wait(2600); // "searching for drivers"
      const option = byId(seed.rideOption, optionId, "ride type");
      const quote = (await mockApi.rides.quote(option.service, pickupId, dropId)).find((q) => q.option.id === optionId)!;
      const s = Date.now();
      const { id: _id, ...driver } = pick(seed.driver, s);
      const ride = {
        id: uid("RD"),
        quote,
        pickup: placeById(pickupId),
        drop: placeById(dropId),
        payment,
        otp: String(1000 + (s % 9000)),
        driver: {
          ...driver,
          vehicle: pick(option.models, s >> 2),
          plate: `${pick(RIDE_SIM.plateStates, s >> 3)} ${pick(RIDE_SIM.plateLetters, s >> 5)} ${1000 + (s % 8999)}`,
        },
      };
      save(KEYS.rides, { ...ridesStore(), [ride.id]: { ride, startedAt: new Date().toISOString(), cancelled: false } });
      return ride;
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
        pickup: ride.pickup, drop: ride.drop,
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
    async list() { await wait(300); return seed.tour; },
    async get(slug) { await wait(200); return seed.tour.find((t) => t.slug === slug) ?? fail("That holiday package isn't available."); },
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
      save(QUOTES_KEY, { ...quotesStore(), [q.id]: { ...q, startsAt, request: r } });
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

  bookings: {
    async list() { await wait(200); return bookingsStore(); },
    async get(id) { await wait(200); return bookingsStore().find((b) => b.id === id) ?? fail("Booking not found."); },
    async create(input) {
      await wait(900);
      const total = gross(input);
      const c = input.couponCode ? coupon(input.couponCode, input.service, total) : null;
      const amount = total - (c?.discount ?? 0);
      const quoted = input.quoteId ? quotesStore()[input.quoteId] : undefined;
      const deposit = Math.min(quoted?.lines.find((l) => l.label === DEPOSIT_LINE)?.amount ?? 0, amount);
      const lines: [string, string][] = [
        ...input.lines.filter(([k]) => k !== "Coupon"),
        ...(c ? [["Coupon", `${c.code} (−₹${c.discount.toLocaleString("en-IN")})`] as [string, string]] : []),
      ];
      const b: Booking = {
        id: uid("QF"), service: input.service, title: input.title, subtitle: input.subtitle, payment: input.payment,
        amount, lines, status: "confirmed", createdAt: new Date().toISOString(),
        startsAt: quoted?.startsAt || null, refundAmount: null, deposit,
      };
      if (input.payment === "wallet") {
        if (currentUser().walletBalance < amount) fail("Not enough wallet balance. Choose another payment method.");
        walletEntry("payment", -amount, `Paid · ${input.title}`, b.id);
      }
      if (input.quoteId) {
        const qs = quotesStore();
        qs[input.quoteId] = { ...qs[input.quoteId], used: true };
        save(QUOTES_KEY, qs);
      }
      const req = quoted?.request;
      if (req?.service === "bus") {
        save(HOLDS_KEY, [...holdsStore(), ...req.seatIds.map((seatId, i) => ({ seatId, gender: req.genders?.[i] ?? "other" as const, busId: req.busId, date: req.date, bookingId: b.id }))]);
      }
      saveBookings([b, ...bookingsStore()]);
      return b;
    },
    // Refunds what the service's cancellation policy allows for the notice given, like the API.
    async cancel(id) {
      await wait(500);
      const current = bookingsStore().find((x) => x.id === id) ?? fail("Booking not found.");
      const percent = refundPercent(cancelPolicyFor(settings, current.service), current.startsAt);
      const refund = refundAmount(current.amount, percent, current.deposit ?? 0);
      const b = finishBooking(id, "cancelled", { refundAmount: refund });
      save(HOLDS_KEY, holdsStore().filter((h) => h.bookingId !== id));
      if (b.payment === "wallet" && refund > 0) walletEntry("refund", refund, `Refund${percent < 100 ? ` (${percent}%)` : ""} · ${b.title}`, b.id);
      return b;
    },
    // Like the API: customers complete rides only; staff close everything else.
    async complete(id) {
      await wait(200);
      const b = bookingsStore().find((x) => x.id === id) ?? fail("Booking not found.");
      if (b.service !== "bike" && b.service !== "car" && (b.status === "confirmed" || b.status === "ongoing")) fail("QuikFly staff close this booking once the trip is over.");
      return finishBooking(id, "completed");
    },
  },
};
