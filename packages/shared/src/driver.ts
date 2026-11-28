// QuikFly Captain: the driver side of a ride (docs/driver-app-plan.md). A captain is a partner's
// approved driver (vendor_drivers) linked to the account that signs in with the driver's number.
// The API enforces everything here; the Captain app, the website and the customer app read it.
import type { Driver, Gender, PaymentMethod, Place, Ride, ServiceKey } from "./types";
import type { VendorVehicleType } from "./vendor";
import type { MapPoint } from "./geo";

/** How often clients ask the API, and how the ride PIN is protected. */
export const DRIVER_RULES = {
  /** An online captain with nothing to do asks this often (seconds); a push wakes the app sooner. */
  pingIdleSeconds: 15,
  /** With an offer on screen or a ride under way. */
  pingBusySeconds: 5,
  /** A customer waiting for a captain. */
  searchPollSeconds: 3,
  /** Wrong ride PINs before the start is locked, and for how long. */
  pinTries: 5,
  pinLockMinutes: 15,
  /** Captains whose distance to the pickup falls in the same band (km) count as equally near: the one waiting longest is asked first. */
  distanceBandKm: 1,
  /** With no captain to ask, a search ends after this long (seconds) instead of the full driverSearchSeconds. */
  noCaptainSeconds: 10,
  /** The most a captain can be charged for giving a ride back without a valid reason (₹); the 2025 guidelines' cap. */
  cancelPenaltyCap: 100,
} as const;

/** A live ride's progress. Simulated rides have none (the customer's app plays them). */
export const RIDE_PHASES = ["searching", "arriving", "arrived", "ontrip", "done", "unmatched"] as const;
export type RidePhaseLive = (typeof RIDE_PHASES)[number];

/** Who may move a live ride. */
export type RideActor = "dispatch" | "captain" | "rider" | "staff";

/** What moves a live ride, from which phases, to which, and who may do it. The one table every writer checks. */
export const RIDE_TRANSITIONS = {
  accept:   { from: ["searching"], to: "arriving", by: ["captain"] },
  arrive:   { from: ["arriving"], to: "arrived", by: ["captain"] },
  start:    { from: ["arrived"], to: "ontrip", by: ["captain"] },
  complete: { from: ["ontrip"], to: "done", by: ["captain", "staff"] },
  /** The captain gives the ride back before it starts: it is offered to someone else. */
  release:  { from: ["arriving", "arrived"], to: "searching", by: ["captain", "staff"] },
  /** Nobody took it. */
  giveUp:   { from: ["searching"], to: "unmatched", by: ["dispatch"] },
} as const satisfies Record<string, { from: readonly RidePhaseLive[]; to: RidePhaseLive; by: readonly RideActor[] }>;
export type RideMove = keyof typeof RIDE_TRANSITIONS;

/** The phase after `move`, or null when it isn't allowed from `phase` for `actor`. */
export function nextRidePhase(phase: RidePhaseLive | null, move: RideMove, actor: RideActor): RidePhaseLive | null {
  const t = RIDE_TRANSITIONS[move];
  return phase && (t.from as readonly string[]).includes(phase) && (t.by as readonly string[]).includes(actor) ? t.to : null;
}

/**
 * Why a captain gives an accepted ride back (shown to staff; the rider pays nothing). `valid` reasons
 * never cost the captain anything; the others can carry Settings.driverCancelPenaltyPercent (0 by default),
 * as the 2025 guidelines allow. Declining an offer is not a cancellation and is always free.
 */
export const CAPTAIN_RELEASE_REASONS = [
  { id: "rider_no_show", label: "Rider didn't show up", valid: true },
  { id: "rider_asked", label: "Rider asked me to cancel", valid: true },
  { id: "vehicle_problem", label: "Vehicle problem", valid: true },
  { id: "wrong_pickup", label: "Can't reach the pickup", valid: true },
  { id: "changed_mind", label: "I can't take this ride", valid: false },
  { id: "other", label: "Something else", valid: false },
] as const;
export type CaptainReleaseReason = (typeof CAPTAIN_RELEASE_REASONS)[number]["id"];

/** What giving a ride back costs the vehicle's owner, in paise: nothing for a valid reason or while the setting is 0. */
export function releasePenaltyPaise(percent: number | undefined, reason: CaptainReleaseReason, fareRupees: number): number {
  const valid = CAPTAIN_RELEASE_REASONS.find((r) => r.id === reason)?.valid ?? false;
  if (valid || !percent || percent <= 0) return 0;
  return Math.min(Math.round(fareRupees * percent), DRIVER_RULES.cancelPenaltyCap * 100);
}

/** Where a captain is and whether they take rides. */
export interface CaptainDuty {
  online: boolean;
  /** On the demo city map; null until the first position. */
  position: MapPoint | null;
  /** True when the position is a demo location the captain picked, not GPS. */
  demo: boolean;
  seenAt: string | null;
}

/** GET /driver: who the signed-in person is to Captain. */
export interface CaptainProfile {
  driver: { id: string; name: string; phone: string; gender: Gender | null; self: boolean };
  /** The vehicle they are assigned to, if any. */
  vehicle: { id: string; type: VendorVehicleType; regNumber: string } | null;
  /** The fleet owner (the captain themselves when `driver.self`). */
  owner: { name: string };
  /** Null when they can go online; otherwise what stops them, in words for the captain. */
  blocker: string | null;
  /** The captains' privacy notice (GET /privacy/captain): the current version and when they agreed to it (null: not yet, so they can't go online). */
  notice: { version: string; agreedAt: string | null };
  duty: CaptainDuty;
  /** The live rules, for the app's "How it works" page (never typed into the app by hand). */
  rules: CaptainRules;
}

/** How taking rides works right now, from Settings and DRIVER_RULES. A rule change reaches captains without an app release. */
export interface CaptainRules {
  offerSeconds: number;
  pingIdleSeconds: number;
  pingBusySeconds: number;
  searchRadiusKm: number;
  /** "Arrived" works only this near the pickup (km); 0 = anywhere. */
  arrivedRadiusKm: number;
  pinTries: number;
  pinLockMinutes: number;
  /** Charged to the vehicle's owner for giving an accepted ride back without a valid reason (% of the fare); 0 = never. */
  cancelPenaltyPercent: number;
  /** The most that penalty can be (₹). */
  cancelPenaltyCap: number;
  releaseReasons: { id: CaptainReleaseReason; label: string; valid: boolean }[];
  /** How QuikFly earns from a city ride: a share of each trip, or a fee once a day. */
  model: "commission" | "dailyFee";
  commissionPercent: number;
  dailyFeePaise: number;
  /** Captains may use a pretend position (Settings.driverDemoLocation). */
  demoLocation: boolean;
}

/** GET /driver/trips: one of the captain's completed trips. Paise. */
export interface CaptainTripItem {
  bookingId: string;
  completedAt: string;
  title: string;
  subtitle: string;
  payment: PaymentMethod;
  /** What the rider paid after coupons and credits (the cash a captain collected on a cash ride). */
  paidPaise: number;
  earningPaise: number;
}

/** What a captain's position report looks like: a GPS fix, or (demo location on) a point on the map. */
export type CaptainPosition = { lat: number; lng: number } | { x: number; y: number };

/** What a trip is worth to the vehicle, shown on every offer and trip. Paise, except `customerPays` (₹). */
export interface CaptainMoney {
  /** What the rider pays, GST included (₹). */
  customerPays: number;
  /** GST in the fare before coupons and credits (QuikFly pays it as the e-commerce operator). */
  gstPaise: number;
  /** The fare without GST. */
  farePaise: number;
  /** QuikFly's commission; 0 on the flat daily fee. */
  commissionPaise: number;
  tdsPaise: number;
  /** What the vehicle earns from this trip. */
  earningPaise: number;
  /** "commission": a share of each trip. "dailyFee": no share; `dailyFeePaise` once on the day's first completed ride. */
  model: "commission" | "dailyFee";
  dailyFeePaise: number;
}

/** A trip as a captain sees it before and during the ride. Never carries the ride PIN. */
export interface CaptainTrip {
  rideId: string;
  service: ServiceKey;
  /** The ride type's name ("Auto", "Mini"…). */
  rideType: string;
  womenOnly: boolean;
  pickup: Place;
  drop: Place;
  stops: Place[];
  distanceKm: number;
  durationMin: number;
  /** From where the captain is now to the pickup; null without a position. */
  pickupKm: number | null;
  payment: PaymentMethod;
  money: CaptainMoney;
}

/** A ride being offered to this captain. */
export interface CaptainOffer extends CaptainTrip {
  expiresAt: string;
  /** Seconds left to answer, by the server's clock. */
  secondsLeft: number;
}

/** The ride a captain is on. */
export interface CaptainRide extends CaptainTrip {
  phase: "arriving" | "arrived" | "ontrip";
  /** The rider's first name. */
  riderName: string;
  /** The rider's number, only until the trip starts (to find each other at the pickup). */
  riderPhone: string | null;
  /** False until the rider's booking exists: the trip can't start before that. */
  booked: boolean;
  /** Cash to collect at the end (₹); null when the rider paid another way. */
  collectCash: number | null;
  /** Wrong PINs left before the start is locked. */
  pinTriesLeft: number;
  pinLockedUntil: string | null;
}

/** POST /driver/ping and every captain action: where they stand now. */
export interface CaptainState {
  duty: CaptainDuty;
  offer: CaptainOffer | null;
  ride: CaptainRide | null;
}

/** POST /driver/rides/:id/complete: the state, plus what the trip that just ended came to. */
export interface CaptainTripDone extends CaptainState {
  done: { rideId: string; earningPaise: number; collectCash: number | null };
}

/** GET /driver/summary: the captain's India day so far. Paise. */
export interface CaptainSummary {
  day: string;
  trips: number;
  earningPaise: number;
  /** Cash the captain collected today and holds for the vehicle's owner. */
  cashPaise: number;
}

/** A live ride as its rider sees it (GET /rides/:id for clients that declare `rides=live`). */
export interface RideLive {
  phase: RidePhaseLive | "cancelled";
  /** Where the captain is on the city map, from acceptance to the end of the trip. */
  captain: MapPoint | null;
  /** Minutes until the captain reaches the pickup (arriving) or the trip ends (ontrip). */
  etaMin: number | null;
}

/** A ride whose progress the server owns. `driver` is null until a captain accepts. */
export type LiveRide = Omit<Ride, "driver"> & { driver: Driver | null; live: RideLive };

/** True for a ride whose progress the server owns (POST /rides and GET /rides/:id for a client that declared `rides=live`). */
export const isLiveRide = (r: Ride | LiveRide): r is LiveRide => "live" in r && !!(r as LiveRide).live;

/**
 * Where a captain stands for staff and fleet owners: on a ride; online (heard from within driverStaleSeconds);
 * silent (marked online but not heard from: dispatch skips them, the next read sets them offline); offline.
 */
export type CaptainLiveStatus = "onRide" | "online" | "silent" | "offline";

export const CAPTAIN_STATUS_LABEL: Record<CaptainLiveStatus, string> = {
  onRide: "On a ride", online: "Online", silent: "Not heard from", offline: "Offline",
};

export function captainLiveStatus(s: { online: boolean | number; rideId: string | null; seenAt: string | null } | null, staleSeconds: number, now = Date.now()): CaptainLiveStatus {
  if (!s) return "offline";
  if (s.rideId) return "onRide";
  if (!s.online) return "offline";
  return s.seenAt && now - Date.parse(s.seenAt) <= staleSeconds * 1000 ? "online" : "silent";
}

/** What riders are told when nobody could take their ride. */
export const NO_CAPTAIN = "No captain is free near you right now. You haven't been charged. Please try again in a few minutes.";

/** What a captain is told when their number has no approved driver record. */
/** captainBlocker's words when a captain hasn't agreed to the current captains' notice (CAPTAIN_NOTICE). */
export const CAPTAIN_NOTICE_NEEDED = "Read and agree to the QuikFly Captain privacy notice to go online.";

export const NOT_A_CAPTAIN = "This number isn't registered as a QuikFly captain yet. Ask your fleet owner to add you in QuikFly Partner with this number.";
