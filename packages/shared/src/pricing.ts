// Prices and simulated inventory, as pure functions. The API is the authority: it runs these
// to quote and to charge. The website's offline demo (mock API) runs the same code so demo
// prices match. Inputs are catalog items and Settings; nothing here reads a database or clock
// except through its arguments.
import { gstRate, parseSurgeHours, type Settings } from "./settings";
import type {
  Bus, FareLine, FareQuote, Offer, Place, RentalCar, RideOption, Seat, ServiceKey, TourPackage, TravelVehicle,
} from "./types";

/** Ride simulation: map distance → km, speeds, number plates. */
export const RIDE_SIM = {
  minDistanceKm: 1.5,
  /** Converts demo-map units (0–100) to kilometres. */
  kmPerMapUnit: 0.32,
  speedKmh: { bike: 24, car: 20 },
  pickupBufferMin: 3,
  plateStates: ["TN 09", "TN 07", "TN 22", "TN 10"],
  plateLetters: ["AB", "CK", "BZ", "DM", "EQ"],
};

/** Bus timetable generator: layout and variation. Base fares come from Settings. */
export const BUS_SIM = {
  resultsPerSearch: 7,
  firstDepartureHour: 16,
  types: [
    { type: "A/C Sleeper (2+1)", ac: true, sleeper: true },
    { type: "A/C Seater / Sleeper (2+1)", ac: true, sleeper: true },
    { type: "Volvo Multi-Axle A/C Seater (2+2)", ac: true, sleeper: false },
    { type: "Non A/C Seater (2+2)", ac: false, sleeper: false },
    { type: "Bharat Benz A/C Sleeper (2+1)", ac: true, sleeper: true },
  ],
  amenities: ["Water bottle", "Charging point", "Blanket", "Reading light", "Live tracking", "CCTV"],
  /** Up to this much is added per bus so fares vary (₹). */
  randomExtra: 400,
  seatRowsPerDeck: 6,
  seatColsPerRow: 3,
  bookedChance: 0.38,
  ladiesChance: 0.08,
};

/** Limits on what one booking may contain. */
export const BOOKING_LIMITS = {
  busSeats: 6,
  tourTravellers: 12,
  rentMinHours: 4,
  rentMaxDays: 30,
  groupMaxDays: 15,
};

/** Self-drive plan labels (prices come from Settings). */
export const RENT_PLANS = {
  limited: { label: "140 km/day", sub: "₹12/km beyond limit" },
  unlimited: { label: "Unlimited km", sub: "Drive as much as you like" },
} as const;
export const RENT_PROTECTION_LABEL = { standard: "Standard", peace: "Peace of mind" } as const;

/** How long a price quote stays valid. */
export const QUOTE_TTL_MINUTES = 30;

export const sumLines = (lines: FareLine[]) => lines.reduce((a, l) => a + l.amount, 0);
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Deterministic pseudo-random generator, so the same search gives the same results. */
export function seeded(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(arr: readonly T[], seed: number) => arr[Math.abs(seed) % arr.length];

/* ───────────── Rides ───────────── */

/** Surge multiplier at an hour of the day (India time). */
export function surgeAt(settings: Settings, hour: number) {
  return parseSurgeHours(settings.surgeHours).some(([from, to]) => hour >= from && hour <= to) ? settings.surgeMultiplier : 1;
}

/** Fares for every option of one service between two places. `hour` is the India-time hour. */
export function rideQuotes(options: RideOption[], a: Place, b: Place, settings: Settings, hour: number): FareQuote[] {
  const distanceKm = Math.max(RIDE_SIM.minDistanceKm, Math.round(Math.hypot(a.x - b.x, a.y - b.y) * RIDE_SIM.kmPerMapUnit * 10) / 10);
  const surge = surgeAt(settings, hour);
  return options.map((option, i) => {
    const durationMin = Math.round((distanceKm / RIDE_SIM.speedKmh[option.service]) * 60) + RIDE_SIM.pickupBufferMin;
    const fare = Math.round((option.baseFare + option.perKm * distanceKm + option.perMin * durationMin) * surge);
    return { option, fare, distanceKm, durationMin, etaMin: 2 + ((i * 3 + Math.round(distanceKm)) % 6) };
  });
}

/* ───────────── Bus ───────────── */

const hhmm = (h: number, m: number) => `${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/** Generated timetable: the same route, date, operators and fares always give the same buses. */
export function generateBuses(operators: string[], settings: Settings, from: string, to: string, date: string): Bus[] {
  const rnd = seeded(`${from}-${to}-${date}`);
  const ops = operators.length ? operators : ["QuikFly Travels"];
  const hours = 5 + Math.floor(rnd() * 5);
  const list = Array.from({ length: BUS_SIM.resultsPerSearch }, (_, i): Bus => {
    const t = BUS_SIM.types[Math.floor(rnd() * BUS_SIM.types.length)];
    const dh = BUS_SIM.firstDepartureHour + i + Math.floor(rnd() * 2);
    const dm = [0, 15, 30, 45][Math.floor(rnd() * 4)];
    const dur = hours + Math.floor(rnd() * 3);
    const base = (t.ac ? settings.busFareAc : settings.busFareNonAc) + (t.sleeper ? settings.busSleeperExtra : 0)
      + Math.floor(rnd() * BUS_SIM.randomExtra);
    return {
      id: `bus${i}-${from}-${to}`.replace(/\s/g, ""),
      operator: i === 0 || ops.length === 1 ? ops[0] : ops[1 + Math.floor(rnd() * (ops.length - 1))],
      ...t,
      depart: hhmm(dh, dm),
      arrive: hhmm(dh + dur, (dm + 30) % 60),
      duration: `${dur}h 30m`,
      fare: Math.round(base / 10) * 10,
      seatsLeft: 4 + Math.floor(rnd() * 28),
      rating: Math.round((3.8 + rnd() * 1.1) * 10) / 10,
      amenities: BUS_SIM.amenities.filter(() => rnd() > 0.35),
      boardingPoints: [`${from} – Main Bus Stand`, `${from} – Bypass`, `${from} – City Center`],
    };
  });
  return list.sort((x, y) => x.depart.localeCompare(y.depart));
}

/** 2+1 sleeper layout on two decks: columns 0 and 1 are the double side, column 2 the single. */
export function generateSeats(bus: Bus, date: string, settings: Settings): Seat[] {
  const rnd = seeded(bus.id + date);
  const seats: Seat[] = [];
  for (const deck of ["lower", "upper"] as const) {
    const prefix = deck === "lower" ? "L" : "U";
    for (let row = 0; row < BUS_SIM.seatRowsPerDeck; row++) {
      for (let col = 0; col < BUS_SIM.seatColsPerRow; col++) {
        seats.push({
          id: `${prefix}${seats.length + 1}`,
          label: `${prefix}${row * BUS_SIM.seatColsPerRow + col + 1}`,
          deck, row, col, sleeper: true,
          booked: rnd() < BUS_SIM.bookedChance,
          ladies: rnd() < BUS_SIM.ladiesChance,
          price: bus.fare + (deck === "lower" ? settings.busLowerDeckExtra : 0),
        });
      }
    }
  }
  return seats;
}

/** GST line added on top of a subtotal, e.g. "GST (5%)". */
function gstLine(settings: Settings, service: ServiceKey, subtotal: number): FareLine[] {
  const rate = gstRate(settings, service);
  return rate ? [{ label: `GST (${rate}%)`, amount: Math.round((subtotal * rate) / 100) }] : [];
}

export function priceBus(seats: Seat[], settings: Settings): FareLine[] {
  const total = seats.reduce((a, s) => a + s.price, 0);
  return [{ label: `Base fare (${seats.length} seat${seats.length > 1 ? "s" : ""})`, amount: total }, ...gstLine(settings, "bus", total)];
}

/* ───────────── Holidays ───────────── */

export const childPrice = (tour: TourPackage, settings: Settings) => Math.round((tour.price * settings.tourChildPercent) / 100);

export function priceTour(tour: TourPackage, adults: number, kids: number, settings: Settings): FareLine[] {
  const kid = childPrice(tour, settings);
  const lines: FareLine[] = [{ label: `${adults} adult × ${inr(tour.price)}`, amount: tour.price * adults }];
  if (kids) lines.push({ label: `${kids} child × ${inr(kid)}`, amount: kid * kids });
  return [...lines, ...gstLine(settings, "tours", sumLines(lines))];
}

/* ───────────── Self-drive and chauffeur cars ───────────── */

/** Billable hours between two local date-times ("YYYY-MM-DDTHH:mm"), at least BOOKING_LIMITS.rentMinHours. */
export const rentHours = (start: string, end: string) =>
  Math.max(BOOKING_LIMITS.rentMinHours, Math.ceil((Date.parse(`${end}:00Z`) - Date.parse(`${start}:00Z`)) / 3_600_000) || 0);

export interface RentChoice {
  mode: "self" | "driver";
  start: string;
  end: string;
  kmPlan: keyof typeof RENT_PLANS;
  protection: keyof typeof RENT_PROTECTION_LABEL;
  doorstep: boolean;
}

export function priceRent(car: RentalCar, c: RentChoice, settings: Settings): FareLine[] {
  const self = c.mode === "self";
  const hours = rentHours(c.start, c.end);
  const days = Math.max(1, Math.ceil(hours / 24));
  const mult = self && c.kmPlan === "unlimited" ? 1 + settings.rentUnlimitedKmExtraPercent / 100 : 1;
  const protectionPerDay = c.protection === "peace" ? settings.rentProtectionPeacePerDay : settings.rentProtectionStandardPerDay;
  return [
    { label: `Rental (${hours} hrs${self ? `, ${RENT_PLANS[c.kmPlan].label}` : ""})`, amount: Math.round(car.pricePerHour * hours * mult) },
    ...(self
      ? [{ label: `${RENT_PROTECTION_LABEL[c.protection]} protection`, amount: protectionPerDay * days }]
      : [{ label: `Driver (${days} day${days > 1 ? "s" : ""})`, amount: car.driverPerDay * days }]),
    ...(c.doorstep ? [{ label: "Doorstep delivery & pickup", amount: settings.rentDoorstepFee }] : []),
    ...(self && settings.rentDeposit ? [{ label: "Refundable security deposit", amount: settings.rentDeposit }] : []),
  ];
}

/* ───────────── Group travel ───────────── */

/** Kilometres billed: the local allowance, or the round trip with each day's minimum. */
export function groupBillKm(v: TravelVehicle, trip: "local" | "outstation", oneWayKm: number, days: number, settings: Settings) {
  return trip === "local" ? settings.groupLocalKmPerDay * days : Math.max(oneWayKm * 2, v.minKmPerDay * days);
}

export function priceGroup(v: TravelVehicle, trip: "local" | "outstation", oneWayKm: number, days: number, settings: Settings): FareLine[] {
  if (trip === "local") return [{ label: `Local package × ${days}`, amount: v.localPackage * days }];
  const km = groupBillKm(v, trip, oneWayKm, days, settings);
  return [
    { label: `${km} km × ${inr(v.perKm)}`, amount: Math.round(km * v.perKm) },
    { label: `Driver bata × ${days}`, amount: v.driverBataPerDay * days },
  ];
}

/* ───────────── Coupons ───────────── */

/**
 * Discount a coupon gives on a total, or why it can't be used. `today` is the
 * India-time date (YYYY-MM-DD); `usedBefore` is how often this customer used it.
 */
export function couponDiscount(offer: Offer, service: ServiceKey, total: number, today: string, usedBefore: number): { discount: number } | { error: string } {
  if (offer.service !== "all" && offer.service !== service) return { error: `${offer.code} works only on ${offer.service === "rent" ? "self-drive" : offer.service === "rentals" ? "group travel" : offer.service === "tours" ? "holiday" : offer.service} bookings.` };
  if (offer.validUntil && today > offer.validUntil) return { error: `${offer.code} has expired.` };
  if (total < offer.minAmount) return { error: `${offer.code} needs a booking of at least ${inr(offer.minAmount)}.` };
  if (offer.perUserLimit !== null && usedBefore >= offer.perUserLimit) return { error: `You've already used ${offer.code}${offer.perUserLimit > 1 ? ` ${offer.perUserLimit} times` : ""}.` };
  const discount = Math.min(offer.maxDiscount, Math.round((total * offer.percent) / 100), total);
  return { discount };
}
