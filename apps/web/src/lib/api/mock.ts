// Demo-mode implementation of the API contract. Simulates latency and keeps
// data in the browser so the client can click through every flow offline.
// Storage helpers: ./mock-store.ts. Account endpoints: ./mock-account.ts.
import type { QuikflyApi } from "./contract";
import type { Booking, Bus, FareQuote, Seat } from "@quikfly/shared";
import { BUS_OPERATORS, DRIVERS, PLACES, RENTAL_CARS, RIDE_OPTIONS, TOURS, TRAVEL_VEHICLES, VEHICLES } from "@quikfly/shared";
import { mockAccount, mockAuth, mockContacts, mockSavedPlaces, mockTravellers } from "./mock-account";
import { KEYS, currentUser, fail, load, save, uid, wait, walletEntry, type MockRide } from "./mock-store";

export { MOCK_OTP } from "./mock-store";

const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];

// Deterministic pseudo-random so the same search shows the same results.
function seeded(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const bookingsStore = () => load<Booking[]>(KEYS.bookings, []);
const saveBookings = (list: Booking[]) => save(KEYS.bookings, list);
const ridesStore = () => load<Record<string, MockRide>>(KEYS.rides, {});

/** Updates an active booking; refuses ones already cancelled or completed (409 on the API). */
function finishBooking(id: string, status: "cancelled" | "completed") {
  const list = bookingsStore();
  const b = list.find((x) => x.id === id) ?? fail("Booking not found.");
  if (b.status !== "confirmed" && b.status !== "ongoing") fail(`This booking is already ${b.status}.`);
  b.status = status;
  saveBookings(list);
  return b;
}

function placeById(id: string) {
  return PLACES.find((x) => x.id === id) ?? fail("Unknown place");
}

export const mockApi: QuikflyApi = {
  auth: mockAuth,
  account: mockAccount,
  savedPlaces: mockSavedPlaces,
  travellers: mockTravellers,
  contacts: mockContacts,

  places: {
    async search(q) {
      const s = q.trim().toLowerCase();
      if (!s) return PLACES;
      return PLACES.filter((p) => `${p.name} ${p.area}`.toLowerCase().includes(s));
    },
  },

  rides: {
    async quote(service, pickupId, dropId) {
      await wait(700);
      const a = placeById(pickupId), b = placeById(dropId);
      const distanceKm = Math.max(1.5, Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 0.32 * 10) / 10);
      const hour = new Date().getHours();
      const surge = hour >= 8 && hour <= 10 || hour >= 17 && hour <= 20 ? 1.2 : 1;
      return RIDE_OPTIONS.filter((o) => o.service === service).map<FareQuote>((option, i) => {
        const speed = option.service === "bike" ? 24 : 20; // km/h city average
        const durationMin = Math.round((distanceKm / speed) * 60) + 3;
        const fare = Math.round((option.baseFare + option.perKm * distanceKm + option.perMin * durationMin) * surge);
        return { option, fare, distanceKm, durationMin, etaMin: 2 + ((i * 3 + Math.round(distanceKm)) % 6) };
      });
    },
    async book({ optionId, pickupId, dropId, payment }) {
      await wait(2600); // "searching for drivers"
      const quotes = await mockApi.rides.quote(RIDE_OPTIONS.find((o) => o.id === optionId)!.service, pickupId, dropId);
      const quote = quotes.find((q) => q.option.id === optionId)!;
      const seed = Date.now();
      const d = pick(DRIVERS, seed);
      const state = pick(["TN 09", "TN 07", "TN 22", "TN 10"], seed >> 3);
      const letters = pick(["AB", "CK", "BZ", "DM", "EQ"], seed >> 5);
      const ride = {
        id: uid("RD"),
        quote,
        pickup: placeById(pickupId),
        drop: placeById(dropId),
        payment,
        otp: String(1000 + (seed % 9000)),
        driver: { ...d, vehicle: pick(VEHICLES[optionId], seed >> 2), plate: `${state} ${letters} ${1000 + (seed % 8999)}` },
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
      const rnd = seeded(`${from}-${to}-${date}`);
      const types = [
        { type: "A/C Sleeper (2+1)", ac: true, sleeper: true },
        { type: "A/C Seater / Sleeper (2+1)", ac: true, sleeper: true },
        { type: "Volvo Multi-Axle A/C Seater (2+2)", ac: true, sleeper: false },
        { type: "Non A/C Seater (2+2)", ac: false, sleeper: false },
        { type: "Bharat Benz A/C Sleeper (2+1)", ac: true, sleeper: true },
      ];
      const hours = 5 + Math.floor(rnd() * 5);
      const list: Bus[] = Array.from({ length: 7 }, (_, i) => {
        const t = types[Math.floor(rnd() * types.length)];
        const dh = 16 + i + Math.floor(rnd() * 2);
        const dm = [0, 15, 30, 45][Math.floor(rnd() * 4)];
        const dur = hours + Math.floor(rnd() * 3);
        const ah = (dh + dur) % 24;
        const fmt = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        const base = (t.ac ? 650 : 420) + (t.sleeper ? 250 : 0) + Math.floor(rnd() * 400);
        return {
          id: `bus${i}-${from}-${to}`.replace(/\s/g, ""),
          operator: i === 0 ? "QuikFly Travels" : BUS_OPERATORS[1 + Math.floor(rnd() * (BUS_OPERATORS.length - 1))],
          ...t,
          depart: fmt(dh, dm),
          arrive: fmt(ah, (dm + 30) % 60),
          duration: `${dur}h 30m`,
          fare: Math.round(base / 10) * 10,
          seatsLeft: 4 + Math.floor(rnd() * 28),
          rating: Math.round((3.8 + rnd() * 1.1) * 10) / 10,
          amenities: ["Water bottle", "Charging point", "Blanket", "Reading light", "Live tracking", "CCTV"].filter(() => rnd() > 0.35),
          boardingPoints: [`${from} – Main Bus Stand`, `${from} – Bypass`, `${from} – City Center`],
        };
      });
      return list.sort((a, b) => a.depart.localeCompare(b.depart));
    },
    async seats(busId, date) {
      await wait(500);
      const rnd = seeded(busId + date);
      const sleeper = true; // demo layout is a 2+1 sleeper for every bus
      const seats: Seat[] = [];
      // 2+1 layout: cols 0,1 (double) | aisle | col 2 (single), 6 rows per deck
      (["lower", "upper"] as const).forEach((deck) => {
        for (let row = 0; row < 6; row++) {
          for (let col = 0; col < 3; col++) {
            const n = seats.length + 1;
            seats.push({
              id: `${deck[0].toUpperCase()}${n}`,
              label: `${deck === "lower" ? "L" : "U"}${row * 3 + col + 1}`,
              deck, row, col, sleeper,
              booked: rnd() < 0.38,
              ladies: rnd() < 0.08,
              price: 0,
            });
          }
        }
      });
      return seats;
    },
  },

  tours: { async list() { await wait(300); return TOURS; } },

  rentals: {
    async cars() { await wait(400); return RENTAL_CARS; },
    async travelVehicles() { await wait(300); return TRAVEL_VEHICLES; },
  },

  bookings: {
    async list() { await wait(200); return bookingsStore(); },
    async get(id) { await wait(200); return bookingsStore().find((b) => b.id === id) ?? fail("Booking not found."); },
    async create(input) {
      await wait(900);
      const b: Booking = { ...input, id: uid("QF"), status: "confirmed", createdAt: new Date().toISOString() };
      if (input.payment === "wallet") {
        if (currentUser().walletBalance < input.amount) fail("Not enough wallet balance. Choose another payment method.");
        walletEntry("payment", -input.amount, `Paid · ${input.title}`, b.id);
      }
      saveBookings([b, ...bookingsStore()]);
      return b;
    },
    async cancel(id) {
      await wait(500);
      const b = finishBooking(id, "cancelled");
      if (b.payment === "wallet") walletEntry("refund", b.amount, `Refund · ${b.title}`, b.id);
      return b;
    },
    async complete(id) { await wait(200); return finishBooking(id, "completed"); },
  },
};
