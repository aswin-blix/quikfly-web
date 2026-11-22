// Parcels (docs/parcel-service-plan.md): what can be sent, the declaration, and the one set of
// rules that moves a parcel along its journey. A journey is an ordered list of legs; the parcel's
// state is derived from them. The API (staff and the simulated carrier alike), the admin panel
// and the demo mock all move parcels through planLegMove(), so no screen can offer a move the
// API refuses. Prices and departures are in pricing.ts.

export const PARCEL_MODES = ["city", "intercity"] as const;
export type ParcelMode = (typeof PARCEL_MODES)[number];

export const PARCEL_CATEGORIES = ["documents", "clothes", "food", "electronics", "medicines", "gifts", "other"] as const;
export type ParcelCategory = (typeof PARCEL_CATEGORIES)[number];

/** A band's key is its heaviest weight in kg. */
export const PARCEL_WEIGHT_BANDS = ["2", "5", "10", "20"] as const;
export type ParcelWeightBand = (typeof PARCEL_WEIGHT_BANDS)[number];
export const parcelBandLabel = (band: ParcelWeightBand) => `up to ${band} kg`;

export const PARCEL_SIZES = ["backpack", "box"] as const;
export type ParcelSize = (typeof PARCEL_SIZES)[number];

/** How a bus parcel starts and ends: at a counter, or with a Quick parcel leg (step 4). */
export const PARCEL_HANDOVERS = ["counter", "door"] as const;
export type ParcelHandover = (typeof PARCEL_HANDOVERS)[number];

export const PARCEL_RULES = {
  contentsMin: 3,
  contentsMax: 80,
  /** Departures are offered for today and the following days, this many dates in all. */
  bookingDays: 7,
  /** Goods worth ₹50,000 or more need a GST e-way bill, so the declared-value setting stays below that. */
  declaredValueCeiling: 49_999,
  collectOtpDigits: 6,
  /** Wrong collection codes in a row before the code locks for `otpLockMinutes`. */
  otpMaxTries: 5,
  otpLockMinutes: 15,
  noteMin: 5,
  noteMax: 200,
} as const;

/**
 * What the sender agrees to. A parcel stores the version, so bump it whenever the list or the
 * meaning changes. Apps show the copy the API serves (GET /parcels/options) and send its version
 * back, so a stored version is always the text the sender really saw.
 */
export const PARCEL_DECLARATION = {
  version: "2026-11-22",
  text: "I've described the contents truthfully and none of these items are inside. QuikFly may refuse a parcel on sight. Parcels are not insured.",
  prohibited: [
    "Cash and currency",
    "Jewellery and precious metals",
    "Alcohol",
    "Drugs and narcotics",
    "Weapons and ammunition",
    "Explosives and fireworks",
    "Flammable liquids and gas cylinders",
    "Loose batteries",
    "Perishables without proper packing",
    "Live animals and plants",
    "Hazardous chemicals",
    "Counterfeit goods",
    "Pornographic material",
    "Maps with incorrect boundaries of India",
  ],
} as const;

/** The most QuikFly pays for a lost or damaged parcel: the lower of its value and the cap. */
export const parcelLiability = (declaredValue: number, cap: number) => Math.min(declaredValue, cap);

/** City codes inside LR numbers; a city not listed uses its first three letters. */
const CITY_CODES: Record<string, string> = {
  chennai: "MAA", bengaluru: "BLR", coimbatore: "CBE", madurai: "IXM", hyderabad: "HYD", pondicherry: "PNY", trichy: "TRZ", kochi: "COK",
};
export const parcelCityCode = (city: string) =>
  CITY_CODES[city.trim().toLowerCase()] ?? city.toUpperCase().replace(/[^A-Z]/g, "").padEnd(3, "X").slice(0, 3);

/**
 * LR numbers open the public tracking page, so the random part is long enough that nobody can
 * guess one (32^8, about a trillion per route). No 0/O or 1/I.
 */
export const PARCEL_LR = { alphabet: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", randomLength: 8, pattern: /^QFP-[A-Z]{3}-[A-Z]{3}-[A-HJ-NP-Z2-9]{8}$/ } as const;
/** `bytes`: PARCEL_LR.randomLength random bytes. */
export const parcelLr = (from: string, to: string, bytes: Uint8Array) =>
  `QFP-${parcelCityCode(from)}-${parcelCityCode(to)}-${[...bytes].map((b) => PARCEL_LR.alphabet[b % PARCEL_LR.alphabet.length]).join("")}`;

/** "2:0, 5:10, 10:25, 20:50": ₹ added to a Quick parcel fare per weight band. Null when malformed. */
export function parseBandExtras(text: string): Record<ParcelWeightBand, number> | null {
  const pairs = text.split(",").map((p) => /^\s*(\d+)\s*:\s*(\d{1,4})\s*$/.exec(p));
  if (pairs.length !== PARCEL_WEIGHT_BANDS.length || pairs.some((m, i) => m?.[1] !== PARCEL_WEIGHT_BANDS[i])) return null;
  const amounts = pairs.map((m) => Number(m![2]));
  if (amounts.some((n, i) => i > 0 && n < amounts[i - 1])) return null;
  return Object.fromEntries(PARCEL_WEIGHT_BANDS.map((b, i) => [b, amounts[i]])) as Record<ParcelWeightBand, number>;
}
export const BAND_EXTRAS_HINT = 'One amount per weight band, never less for a heavier one, like "2:0, 5:10, 10:25, 20:50" (kg : ₹).';

/* ───────────── Catalog and API shapes ───────────── */

/** A counter where parcels are handed in and collected (catalog kind "parcelCounter"). */
export interface ParcelCounter {
  id: string;
  /** A busOperator id. */
  operatorId: string;
  city: string;
  name: string;
  address: string;
  hours: string;
  phone: string;
}

/** An operator's tariff for a route, either direction (catalog kind "parcelRate"). Unlisted routes use the per-kg setting. */
export interface ParcelRate {
  id: string;
  operatorId: string;
  from: string;
  to: string;
  /** ₹ per weight band, before handling and GST. */
  price2: number;
  price5: number;
  price10: number;
  price20: number;
  /** Null = the bus's own journey time. */
  transitHours?: number | null;
  /** Null = Settings.parcelCutoffMinutes. */
  cutoffMinutes?: number | null;
}

/** A bus a parcel can be booked on. */
export interface ParcelDeparture {
  busId: string;
  /** India date, YYYY-MM-DD. */
  date: string;
  operatorId: string;
  operator: string;
  from: string;
  to: string;
  departAt: string;
  /** Hand it in by then. */
  cutoffAt: string;
  /** Expected at the destination counter. */
  readyAt: string;
  fromCounter: ParcelCounter;
  toCounter: ParcelCounter;
}

/** GET /parcels/options */
export interface ParcelOptions {
  departures: ParcelDeparture[];
  declaration: { version: string; text: string; prohibited: readonly string[] };
}

/** What a parcel quote says besides the price. */
export interface ParcelQuoteInfo {
  liability: number;
  /** Bus parcels; null for a Quick parcel. */
  departure: ParcelDeparture | null;
}

export type ParcelLegKind = "bike" | "bus" | "counter";
export type ParcelLegState = "pending" | "active" | "done" | "failed";

export interface ParcelLeg {
  seq: number;
  kind: ParcelLegKind;
  state: ParcelLegState;
  operatorId: string | null;
  counterId: string | null;
  busId: string | null;
  busDate: string | null;
  departAt: string | null;
  /** When the simulated carrier starts this leg. */
  plannedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

export const PARCEL_STATES = ["booked", "at_counter", "on_bus", "reached", "ready", "collected", "unclaimed", "cancelled"] as const;
export type ParcelState = (typeof PARCEL_STATES)[number];
export const PARCEL_STATE_LABEL: Record<ParcelState, string> = {
  booked: "Booked",
  at_counter: "At the counter",
  on_bus: "On the bus",
  reached: "Reached the destination",
  ready: "Ready for collection",
  collected: "Collected",
  unclaimed: "Unclaimed",
  cancelled: "Cancelled",
};

/** States a booking can still be cancelled from: not yet on the bus. */
export const PARCEL_CANCELLABLE: readonly ParcelState[] = ["booked", "at_counter"];
export const PARCEL_NOT_CANCELLABLE = "This parcel is already on its way, so it can't be cancelled. Contact support if something is wrong.";

export interface ParcelEvent {
  state: ParcelState;
  at: string;
  note: string | null;
}

/** A parcel as its sender sees it (GET /bookings/:id/parcel) and, without the code, as staff do. */
export interface Parcel {
  bookingId: string;
  lr: string;
  mode: ParcelMode;
  state: ParcelState;
  from: string;
  to: string;
  departAt: string | null;
  readyAt: string | null;
  fromCounter: ParcelCounter | null;
  toCounter: ParcelCounter | null;
  category: ParcelCategory;
  weightBand: ParcelWeightBand;
  size: ParcelSize;
  declaredValue: number;
  liability: number;
  contents: string;
  receiver: { name: string; phone: string };
  declarationVersion: string;
  holdUntil: string | null;
  legs: ParcelLeg[];
  events: ParcelEvent[];
  /**
   * The collection code, for the sender only, while the parcel is ready: they pass it to the
   * receiver (demo: no SMS sent). Never sent to the receiver's inbox, staff or the tracking page.
   */
  collectOtp: string | null;
  /** True while the demo moves parcels by itself: say "demo: simulated transit". */
  simulated: boolean;
}

/** GET /track/:lr: no phone numbers, contents, value or staff notes. */
export interface PublicTracking {
  lr: string;
  state: ParcelState;
  from: string;
  to: string;
  departAt: string | null;
  readyAt: string | null;
  holdUntil: string | null;
  /** First names; null once the person's data was erased. */
  sender: string | null;
  receiver: string | null;
  collectAt: Pick<ParcelCounter, "name" | "address" | "hours"> | null;
  events: { state: ParcelState; at: string }[];
  simulated: boolean;
}

const indiaTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * A parcel booking's title, subtitle and lines. The API writes them rather than the client, so no
 * name, number or contents end up in a row that erasure keeps for tax law.
 */
export function parcelBookingText(d: ParcelDeparture, band: ParcelWeightBand, lr: string, liability: number): { title: string; subtitle: string; lines: [string, string][] } {
  return {
    title: `${d.from} → ${d.to}`,
    subtitle: `Bus parcel · ${parcelBandLabel(band)}`,
    lines: [
      ["LR number", lr],
      ["Hand in at", `${d.fromCounter.name}, by ${indiaTime(d.cutoffAt)}`],
      ["Departs", `${indiaTime(d.departAt)} · ${d.operator}`],
      ["Collect at", `${d.toCounter.name}, from ${indiaTime(d.readyAt)}`],
      ["Liability", `Up to ₹${liability.toLocaleString("en-IN")}, not insured`],
    ],
  };
}

/* ───────────── The journey ───────────── */

/** Who moves a leg. An operator's API or a driver app would be added here. */
export type ParcelActor = "staff" | "simulated";

interface Transition {
  kind: ParcelLegKind;
  from: ParcelLegState;
  to: ParcelLegState;
  /** Only the journey's first or last leg. */
  only?: "first" | "last";
  by: readonly ParcelActor[];
  /** Needs the receiver's collection code. */
  otp?: true;
  /** Cancels the booking with a full refund and needs a reason (refused on sight). */
  refuses?: true;
  /** Only once the hold period is over. */
  afterHold?: true;
}

/**
 * Every move that exists. Starting a leg also ends the counter leg before it (the hand-off), so a
 * counter in mid-journey has no "done" of its own. Bike legs get theirs with Quick parcel (step 3).
 */
export const PARCEL_TRANSITIONS: readonly Transition[] = [
  { kind: "counter", from: "pending", to: "active", by: ["staff", "simulated"] },
  { kind: "counter", from: "active", to: "done", only: "last", by: ["staff"], otp: true },
  { kind: "counter", from: "active", to: "failed", only: "last", by: ["staff", "simulated"], afterHold: true },
  { kind: "counter", from: "pending", to: "failed", only: "first", by: ["staff"], refuses: true },
  { kind: "counter", from: "active", to: "failed", only: "first", by: ["staff"], refuses: true },
  { kind: "bus", from: "pending", to: "active", by: ["staff", "simulated"] },
  { kind: "bus", from: "active", to: "done", by: ["staff", "simulated"] },
];

/** Counter → bus → counter for a departure. */
export function planLegs(d: ParcelDeparture): ParcelLeg[] {
  const leg = (seq: number, kind: ParcelLegKind, plannedAt: string, extra: Partial<ParcelLeg>): ParcelLeg => ({
    seq, kind, state: "pending", operatorId: d.operatorId, counterId: null, busId: null, busDate: null, departAt: null,
    plannedAt, startedAt: null, endedAt: null, ...extra,
  });
  return [
    leg(0, "counter", d.cutoffAt, { counterId: d.fromCounter.id }),
    leg(1, "bus", d.departAt, { busId: d.busId, busDate: d.date, departAt: d.departAt }),
    leg(2, "counter", d.readyAt, { counterId: d.toCounter.id }),
  ];
}

/** The state a journey is in. (A cancelled booking sets "cancelled" itself.) */
export function parcelState(legs: ParcelLeg[]): ParcelState {
  const last = legs.length - 1;
  const failed = legs.findIndex((l) => l.state === "failed");
  if (failed >= 0) return failed === last ? "unclaimed" : "cancelled";
  if (legs.every((l) => l.state === "done")) return "collected";
  const active = legs.findIndex((l) => l.state === "active");
  if (active >= 0) return legs[active].kind === "bus" ? "on_bus" : active === last ? "ready" : "at_counter";
  return legs.some((l) => l.state === "done") ? "reached" : "booked";
}

/** When the simulated carrier next has something to do; null = never. */
export function nextMoveAt(legs: ParcelLeg[], holdUntil: string | null): string | null {
  if (legs.some((l) => l.state === "failed")) return null;
  const pending = legs.find((l) => l.state === "pending");
  if (pending) return pending.plannedAt;
  return legs.some((l) => l.state === "active") ? holdUntil : null;
}

/** The move the simulated carrier makes when `nextMoveAt` has come. */
export function simulatedMove(legs: ParcelLeg[]): { seq: number; to: ParcelLegState } | null {
  const active = legs.find((l) => l.state === "active");
  const pending = legs.find((l) => l.state === "pending");
  if (active?.kind === "bus") return { seq: active.seq, to: "done" };
  if (pending) return { seq: pending.seq, to: "active" };
  return active ? { seq: active.seq, to: "failed" } : null;
}

export interface LegMove {
  legs: ParcelLeg[];
  state: ParcelState;
  holdUntil: string | null;
  nextAt: string | null;
  needsOtp: boolean;
  refuses: boolean;
}

/** The one function that moves a leg: the parcel afterwards, or why it can't move. */
export function planLegMove(
  parcel: { legs: ParcelLeg[]; holdUntil: string | null; holdDays: number },
  seq: number, to: ParcelLegState, by: ParcelActor, now = Date.now(),
): LegMove | { error: string } {
  const { legs } = parcel;
  const index = legs.findIndex((l) => l.seq === seq);
  if (index < 0) return { error: "This parcel has no such leg." };
  const last = legs.length - 1;
  const leg = legs[index];
  const stale = { error: `That move isn't possible now: the parcel is "${PARCEL_STATE_LABEL[parcelState(legs)]}".` };
  if (legs.some((l) => l.state === "failed")) return stale;
  const rule = PARCEL_TRANSITIONS.find((t) =>
    t.kind === leg.kind && t.from === leg.state && t.to === to && t.by.includes(by) &&
    (!t.only || index === (t.only === "first" ? 0 : last)));
  if (!rule) return stale;

  const before = index > 0 ? legs[index - 1] : null;
  const handsOff = to === "active" && before?.kind === "counter" && before.state === "active";
  if (to === "active" && before && before.state !== "done" && !handsOff) return stale;
  if (rule.afterHold && (!parcel.holdUntil || Date.parse(parcel.holdUntil) > now)) {
    return { error: "A parcel can be marked unclaimed only after its hold period ends." };
  }

  const at = new Date(now).toISOString();
  const next = legs.map((l, i): ParcelLeg =>
    i === index ? { ...l, state: to, ...(to === "active" ? { startedAt: at } : { endedAt: at }) }
      : handsOff && i === index - 1 ? { ...l, state: "done", endedAt: at }
        : l);
  const state = parcelState(next);
  const holdUntil = state === "ready" ? new Date(now + parcel.holdDays * 86_400_000).toISOString() : parcel.holdUntil;
  return { legs: next, state, holdUntil, nextAt: nextMoveAt(next, holdUntil), needsOtp: !!rule.otp, refuses: !!rule.refuses };
}

/** What the sender is told after a move; null = nothing (cancelling has its own notification). */
export function parcelNotice(state: ParcelState, lr: string): { kind: "parcel.moved" | "parcel.ready" | "parcel.collected" | "parcel.unclaimed"; title: string; body: string } | null {
  const title = `${PARCEL_STATE_LABEL[state]} · ${lr}`;
  switch (state) {
    case "at_counter": return { kind: "parcel.moved", title, body: "Your parcel is at the counter, waiting for its bus." };
    case "on_bus": return { kind: "parcel.moved", title, body: "Your parcel has left on the bus." };
    case "reached": return { kind: "parcel.moved", title, body: "Your parcel reached the destination city." };
    // No code here: notifications are pushed to lock screens.
    case "ready": return { kind: "parcel.ready", title, body: "Open the parcel to see the collection code and give it to the receiver (demo: no SMS sent)." };
    case "collected": return { kind: "parcel.collected", title, body: "The receiver collected your parcel." };
    case "unclaimed": return { kind: "parcel.unclaimed", title, body: "Nobody collected your parcel within the hold period. Contact support to get it back." };
    default: return null;
  }
}
