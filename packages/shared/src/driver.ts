// QuikFly Captain: the driver side of a ride (docs/driver-app-plan.md). A captain is a partner's
// approved driver (vendor_drivers) linked to the account that signs in with the driver's number.
// The API enforces everything here; the Captain app, the website and the customer app read it.
import type { Gender } from "./types";
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

/** Why a captain gives a ride back (shown to staff; the rider pays nothing). */
export const CAPTAIN_RELEASE_REASONS = [
  { id: "rider_no_show", label: "Rider didn't show up" },
  { id: "rider_asked", label: "Rider asked me to cancel" },
  { id: "vehicle_problem", label: "Vehicle problem" },
  { id: "wrong_pickup", label: "Can't reach the pickup" },
  { id: "other", label: "Something else" },
] as const;
export type CaptainReleaseReason = (typeof CAPTAIN_RELEASE_REASONS)[number]["id"];

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
  duty: CaptainDuty;
}

/** What a captain's position report looks like: a GPS fix, or (demo location on) a point on the map. */
export type CaptainPosition = { lat: number; lng: number } | { x: number; y: number };

/** POST /driver/ping: the captain's state after their position was recorded. Offers and the ride arrive in step 2. */
export interface CaptainState {
  duty: CaptainDuty;
}

/** What a captain is told when their number has no approved driver record. */
export const NOT_A_CAPTAIN = "This number isn't registered as a QuikFly captain yet. Ask your fleet owner to add you in QuikFly Partner, or register your own vehicle.";
