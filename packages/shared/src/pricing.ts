// Prices and simulated inventory, as pure functions. The API is the authority: it runs these
// to quote and to charge. The website's offline demo (mock API) runs the same code so demo
// prices match. Inputs are catalog items and Settings; nothing here reads a database or clock
// except through its arguments.
import { effectiveSurge, gstRate, parseSurgeHours, type Settings } from "./settings";
import type {
  Bus, FareLine, FareQuote, Gender, GroupTrip, Offer, Place, RentalCar, RideOption, Seat, SeatHold, ServiceKey, TourPackage, TravelVehicle,
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
  /** Each bus type has its seat layout and the amenities it comes with (no live tracking or CCTV: nothing backs them yet). */
  types: [
    { type: "A/C Sleeper (2+1)", ac: true, sleeper: true, layout: "sleeper", amenities: ["Water bottle", "Blanket", "Charging point", "Reading light"] },
    { type: "A/C Seater / Sleeper (2+1)", ac: true, sleeper: true, layout: "seaterSleeper", amenities: ["Water bottle", "Blanket", "Charging point"] },
    { type: "Volvo Multi-Axle A/C Seater (2+2)", ac: true, sleeper: false, layout: "seater", amenities: ["Water bottle", "Charging point", "Reclining seats"] },
    { type: "Non A/C Seater (2+2)", ac: false, sleeper: false, layout: "seater", amenities: ["Reclining seats"] },
    { type: "Bharat Benz A/C Sleeper (2+1)", ac: true, sleeper: true, layout: "sleeper", amenities: ["Water bottle", "Blanket", "Pillow", "Charging point", "Reading light"] },
  ],
  /** Up to this much is added per bus so fares vary (₹). */
  randomExtra: 400,
  /** Rows per deck: sleeper berths, and seater rows (seater/sleeper lower deck, 2+2 buses). */
  sleeperRows: 6,
  seaterRows: 10,
  bookedChance: 0.38,
  /** Share of simulated booked seats held by women (redBus Pink Report 2026: 33% of travellers). */
  womenShare: 0.33,
};

export type BusLayout = "sleeper" | "seaterSleeper" | "seater";

/** Limits on what one booking may contain. */
export const BOOKING_LIMITS = {
  busSeats: 6,
  tourTravellers: 12,
  rentMinHours: 4,
  rentMaxDays: 30,
  groupMaxDays: 15,
};

/** Self-drive km plans; their numbers come from Settings (see rentPlanLabel). */
export const RENT_PLANS = { limited: {}, unlimited: {} } as const;

/** "140 km/day" + "₹12/km beyond the limit", from Settings. */
export function rentPlanLabel(plan: keyof typeof RENT_PLANS, settings: Settings): { label: string; sub: string } {
  return plan === "limited"
    ? { label: `${settings.rentLimitedKmPerDay} km/day`, sub: `${inr(settings.rentExtraKmRate)}/km beyond the limit` }
    : { label: "Unlimited km", sub: "Drive as much as you like" };
}

/** Chauffeur night charge applies to each night the booking runs inside this window (local hours). */
export const DRIVER_NIGHT_WINDOW = { fromHour: 22, toHour: 6 };

/** Price line label for the refundable self-drive deposit. The API finds the deposit by it. */
export const DEPOSIT_LINE = "Refundable security deposit";
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

/** Surge multiplier at an hour of the day (India time), never above the cap. */
export function surgeAt(settings: Settings, hour: number) {
  return parseSurgeHours(settings.surgeHours).some(([from, to]) => hour >= from && hour <= to) ? effectiveSurge(settings) : 1;
}

/**
 * Fares for every option of one service from `a` to `b`, through any `stops` in order. Distance
 * is the sum of the legs; each stop adds `rideStopMinutes` of waiting, charged per minute.
 * `hour` is the India-time hour. `waiveSurge` (a QuikFly Pass) prices without the surge and
 * says how much that saved.
 */
export function rideQuotes(options: RideOption[], a: Place, b: Place, settings: Settings, hour: number, stops: Place[] = [], waiveSurge = false): FareQuote[] {
  const points = [a, ...stops, b];
  const mapUnits = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
  const distanceKm = Math.max(RIDE_SIM.minDistanceKm, Math.round(mapUnits * RIDE_SIM.kmPerMapUnit * 10) / 10);
  const peak = surgeAt(settings, hour);
  const surge = waiveSurge ? 1 : peak;
  return options.map((option, i) => {
    const durationMin = Math.round((distanceKm / RIDE_SIM.speedKmh[option.service]) * 60) + RIDE_SIM.pickupBufferMin + stops.length * settings.rideStopMinutes;
    const raw = option.baseFare + option.perKm * distanceKm + option.perMin * durationMin;
    const fare = Math.round(raw * surge);
    const quote: FareQuote = { option, fare, distanceKm, durationMin, etaMin: 2 + ((i * 3 + Math.round(distanceKm)) % 6), surge };
    if (waiveSurge && peak > 1) quote.passSaving = Math.round(raw * peak) - fare;
    return quote;
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
    // `fare` is the cheapest seat: on seater/sleeper buses that's a seat, and the berths add the sleeper extra.
    const base = (t.ac ? settings.busFareAc : settings.busFareNonAc) + (t.layout === "sleeper" ? settings.busSleeperExtra : 0)
      + Math.floor(rnd() * BUS_SIM.randomExtra);
    const { layout: _layout, ...kind } = t;
    return {
      id: `bus${i}-${from}-${to}`.replace(/\s/g, ""),
      operator: i === 0 || ops.length === 1 ? ops[0] : ops[1 + Math.floor(rnd() * (ops.length - 1))],
      ...kind,
      amenities: [...t.amenities],
      depart: hhmm(dh, dm),
      arrive: hhmm(dh + dur, (dm + 30) % 60),
      duration: `${dur}h 30m`,
      fare: Math.round(base / 10) * 10,
      seatsLeft: 0, // counted from the seat map below
      rating: Math.round((3.8 + rnd() * 1.1) * 10) / 10,
      boardingPoints: [`${from} – Main Bus Stand`, `${from} – Bypass`, `${from} – City Center`],
    };
  });
  // Seats left = free seats on the generated map; the API also subtracts seats held by real bookings.
  for (const bus of list) bus.seatsLeft = generateSeats(bus, date, settings).filter((s) => !s.booked).length;
  return list.sort((x, y) => x.depart.localeCompare(y.depart));
}

/** The seat layout of a generated bus, from its type. */
export const busLayout = (bus: Pick<Bus, "type">): BusLayout =>
  BUS_SIM.types.find((t) => t.type === bus.type)?.layout as BusLayout ?? "sleeper";

/** The seat sharing a pair with this one (cols 0↔1, and 2↔3 on 2+2 buses); null for a single seat. */
export function seatPartner(seats: Seat[], seat: Seat): Seat | null {
  const twin = seat.col === 0 ? 1 : seat.col === 1 ? 0 : seat.col === 2 ? 3 : 2;
  return seats.find((x) => x.deck === seat.deck && x.row === seat.row && x.col === twin) ?? null;
}

/**
 * The seat map of a bus on a date. Simulated bookings come from a seed (same bus and date →
 * same map); `holds` are real bookings stored by the API and always show as booked. Women-
 * first rule: a free seat whose pair is held by a woman is women only (`ladies`).
 */
export function generateSeats(bus: Bus, date: string, settings: Settings, holds: SeatHold[] = []): Seat[] {
  const rnd = seeded(bus.id + date);
  const layout = busLayout(bus);
  const seats: Seat[] = [];
  const deck = (name: "lower" | "upper", rows: number, cols: number, sleeper: boolean, price: number) => {
    const prefix = layout === "seater" ? "S" : name === "lower" ? "L" : "U";
    let n = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        n++;
        const booked = rnd() < BUS_SIM.bookedChance;
        const woman = rnd() < BUS_SIM.womenShare;
        seats.push({
          id: `${prefix}${n}`, label: `${prefix}${n}`, deck: name, row, col, sleeper,
          booked, bookedGender: booked ? (woman ? "female" : "male") : null, ladies: false, price,
        });
      }
    }
  };
  if (layout === "sleeper") {
    deck("lower", BUS_SIM.sleeperRows, 3, true, bus.fare + settings.busLowerDeckExtra);
    deck("upper", BUS_SIM.sleeperRows, 3, true, bus.fare);
  } else if (layout === "seaterSleeper") {
    // Lower deck seats are the fare; upper berths add the sleeper extra.
    deck("lower", BUS_SIM.seaterRows, 3, false, bus.fare);
    deck("upper", BUS_SIM.sleeperRows, 3, true, bus.fare + settings.busSleeperExtra);
  } else {
    deck("lower", BUS_SIM.seaterRows, 4, false, bus.fare);
  }
  for (const h of holds) {
    const seat = seats.find((x) => x.id === h.seatId);
    if (seat) { seat.booked = true; seat.bookedGender = h.gender; }
  }
  for (const seat of seats) seat.ladies = !seat.booked && seatPartner(seats, seat)?.bookedGender === "female";
  return seats;
}

/**
 * Why these travellers can't take these seats, or null when they can. `genders` lines up
 * with `chosen`; a missing gender counts as not female.
 */
export function seatRuleError(chosen: Seat[], genders: (Gender | undefined)[]): string | null {
  const i = chosen.findIndex((seat, k) => seat.ladies && genders[k] !== "female");
  return i === -1 ? null : `Seat ${chosen[i].label} is next to a woman traveller, so it's for women only. Pick another seat or mark the traveller as female.`;
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

/** Child price: a share of the adult price (the package's, or a departure's own price). */
export const childPrice = (tour: Pick<TourPackage, "price">, settings: Settings, adultPrice = tour.price) => Math.round((adultPrice * settings.tourChildPercent) / 100);

/** `adultPrice`: a departure's own price per adult (defaults to the package price). */
export function priceTour(tour: TourPackage, adults: number, kids: number, settings: Settings, adultPrice = tour.price): FareLine[] {
  const kid = childPrice(tour, settings, adultPrice);
  const lines: FareLine[] = [{ label: `${adults} adult × ${inr(adultPrice)}`, amount: adultPrice * adults }];
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
  const nights = self ? 0 : driverNights(c.start, c.end);
  const days = Math.max(1, Math.ceil(hours / 24));
  const mult = self && c.kmPlan === "unlimited" ? 1 + settings.rentUnlimitedKmExtraPercent / 100 : 1;
  const protectionPerDay = c.protection === "peace" ? settings.rentProtectionPeacePerDay : settings.rentProtectionStandardPerDay;
  return [
    { label: `Rental (${hours} hrs${self ? `, ${rentPlanLabel(c.kmPlan, settings).label}` : ""})`, amount: Math.round(car.pricePerHour * hours * mult) },
    ...(self
      ? [{ label: `${RENT_PROTECTION_LABEL[c.protection]} protection`, amount: protectionPerDay * days }]
      : [{ label: `Driver (${days} day${days > 1 ? "s" : ""})`, amount: car.driverPerDay * days }]),
    ...(!self && nights && settings.rentDriverNightCharge
      ? [{ label: `Driver night charge (${nights} night${nights > 1 ? "s" : ""})`, amount: nights * settings.rentDriverNightCharge }]
      : []),
    ...(c.doorstep ? [{ label: "Doorstep delivery & pickup", amount: settings.rentDoorstepFee }] : []),
    ...(self && settings.rentDeposit ? [{ label: DEPOSIT_LINE, amount: settings.rentDeposit }] : []),
  ];
}

/**
 * Nights a booking runs into the driver night window (10 PM–6 AM): one per window it
 * overlaps. Local date-times "YYYY-MM-DDTHH:mm" are compared as plain clock times.
 */
export function driverNights(start: string, end: string): number {
  const s = Date.parse(`${start}:00Z`), e = Date.parse(`${end}:00Z`);
  if (!(e > s)) return 0;
  const { fromHour, toHour } = DRIVER_NIGHT_WINDOW;
  const day = 86_400_000;
  // Windows start at fromHour on each calendar day, from the day before pickup to the return day.
  let n = 0;
  for (let d = Math.floor(s / day) * day - day; d <= e; d += day) {
    const ws = d + fromHour * 3_600_000, we = d + day + toHour * 3_600_000;
    if (s < we && e > ws) n++;
  }
  return n;
}

/* ───────────── Group travel ───────────── */

/** Kilometres billed: the local allowance, or the round trip with each day's minimum. */
/** Days a trip is billed for: one way is always a single day. */
export const groupDays = (trip: GroupTrip, days: number) => (trip === "oneway" ? 1 : days);

/**
 * Kilometres billed: the local allowance; a round trip's distance or each day's minimum;
 * or one way's distance, at least one day's minimum.
 */
export function groupBillKm(v: TravelVehicle, trip: GroupTrip, oneWayKm: number, days: number, settings: Settings) {
  if (trip === "local") return settings.groupLocalKmPerDay * days;
  if (trip === "oneway") return Math.max(oneWayKm, v.minKmPerDay);
  return Math.max(oneWayKm * 2, v.minKmPerDay * days);
}

export function priceGroup(v: TravelVehicle, trip: GroupTrip, oneWayKm: number, days: number, settings: Settings): FareLine[] {
  if (trip === "local") return [{ label: `Local package × ${days}`, amount: v.localPackage * days }];
  const d = groupDays(trip, days);
  const km = groupBillKm(v, trip, oneWayKm, d, settings);
  const rate = trip === "oneway" ? v.perKm * (1 + settings.groupOneWaySurchargePercent / 100) : v.perKm;
  // A multi-day round trip pays the driver's night allowance for each night away.
  const nights = trip === "outstation" ? d - 1 : 0;
  return [
    { label: `${km} km × ${inr(Math.round(rate * 100) / 100)}${trip === "oneway" ? " (one way)" : ""}`, amount: Math.round(km * rate) },
    { label: `Driver bata × ${d}`, amount: v.driverBataPerDay * d },
    ...(nights > 0 && settings.groupDriverNightAllowance
      ? [{ label: `Driver night allowance × ${nights}`, amount: nights * settings.groupDriverNightAllowance }]
      : []),
  ];
}

/* ───────────── Coupons ───────────── */

/** Is an offer within its dates on `today` (India date, YYYY-MM-DD)? Customers only see offers that are. */
export const offerLive = (offer: Pick<Offer, "validFrom" | "validUntil">, today: string) =>
  (!offer.validFrom || offer.validFrom <= today) && (!offer.validUntil || offer.validUntil >= today);

/**
 * Discount a coupon gives on a total, or why it can't be used. `today` is the
 * India-time date (YYYY-MM-DD); `usedBefore` is how often this customer used it;
 * `usedByAll` is how often everyone used it (for `maxUses`).
 */
export function couponDiscount(offer: Offer, service: ServiceKey, total: number, today: string, usedBefore: number, usedByAll = 0): { discount: number } | { error: string } {
  if (offer.service !== "all" && offer.service !== service) return { error: `${offer.code} works only on ${offer.service === "rent" ? "self-drive" : offer.service === "rentals" ? "group travel" : offer.service === "tours" ? "holiday" : offer.service} bookings.` };
  if (offer.validFrom && today < offer.validFrom) return { error: `${offer.code} starts on ${offer.validFrom}.` };
  if (offer.validUntil && today > offer.validUntil) return { error: `${offer.code} has expired.` };
  if (offer.maxUses != null && usedByAll >= offer.maxUses) return { error: `${offer.code} has been fully used.` };
  if (total < offer.minAmount) return { error: `${offer.code} needs a booking of at least ${inr(offer.minAmount)}.` };
  if (offer.perUserLimit !== null && usedBefore >= offer.perUserLimit) return { error: `You've already used ${offer.code}${offer.perUserLimit > 1 ? ` ${offer.perUserLimit} times` : ""}.` };
  const discount = Math.min(offer.maxDiscount, Math.round((total * offer.percent) / 100), total);
  return { discount };
}
