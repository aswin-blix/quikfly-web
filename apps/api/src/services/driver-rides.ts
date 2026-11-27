// QuikFly Captain, the trip (step 2 of docs/driver-app-plan.md): what a captain sees (an offer, their
// ride, their day) and every move they make on a live ride. Each move is one conditional write on the
// phase it read (RIDE_TRANSITIONS in packages/shared/src/driver.ts), so a rider cancelling, staff and the
// captain can't both win. Money moves only through completeBookingRow (bookings.ts), as for any ride.
import {
  CAPTAIN_RELEASE_REASONS, DRIVER_RULES, dailyFeePaise, formatRegNumber, isWomenOnly, mapDistanceKm, onDailyFee, pick, releasePenaltyPaise, tripEarnings,
  type CaptainMoney, type CaptainOffer, type CaptainReleaseReason, type CaptainRide, type CaptainState, type CaptainSummary, type CaptainTrip,
  type CaptainTripDone, type CaptainTripItem, type Driver, type LiveRide, type MapPoint, type PaymentMethod, type Settings,
} from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { ACTIVE, completeBookingRow } from "./bookings";
import { advanceDispatch, advanceSearching, type Wake } from "./dispatch";
import { captainBlocker, dutyOf, type CaptainContext } from "./drivers";
import { parseRide } from "./live-rides";
import { notify } from "./notifications";
import { getSettings } from "./settings";

/** Searches a captain's heartbeat moves forward for riders who stopped polling (each is a few queries). */
const PING_ADVANCES = 2;

/** What this trip is worth to the vehicle, under the earning model in force (commission or the flat daily fee). */
function moneyFor(settings: Settings, ride: LiveRide, booked: { amount: number; discount: number; credits_used: number } | null): CaptainMoney {
  const service = ride.quote.option.service;
  // The partner's share is worked out on the fare before coupons and credits (QuikFly pays for those).
  const gross = booked ? booked.amount + (booked.discount ?? 0) + (booked.credits_used ?? 0) : ride.quote.fare;
  const e = tripEarnings(settings, service, gross);
  return {
    customerPays: booked ? booked.amount : ride.quote.fare,
    farePaise: e.fare, commissionPaise: e.commission, tdsPaise: e.tds, earningPaise: e.earning,
    model: onDailyFee(settings, service) ? "dailyFee" : "commission",
    dailyFeePaise: dailyFeePaise(settings, service),
  };
}

function tripFor(settings: Settings, rideId: string, ride: LiveRide, at: MapPoint | null, payment: PaymentMethod, booked: Parameters<typeof moneyFor>[2]): CaptainTrip {
  return {
    rideId, service: ride.quote.option.service, rideType: ride.quote.option.name, womenOnly: isWomenOnly(ride.quote.option),
    pickup: ride.pickup, drop: ride.drop, stops: ride.stops ?? [], distanceKm: ride.quote.distanceKm, durationMin: ride.quote.durationMin,
    pickupKm: at ? Math.round(mapDistanceKm(at, ride.pickup) * 10) / 10 : null,
    payment, money: moneyFor(settings, ride, booked),
  };
}

interface RideRow {
  id: string; data: string; phase: "arriving" | "arrived" | "ontrip"; otp_tries: number; otp_locked_until: string | null;
  rider_name: string; rider_phone: string;
  b_id: string | null; b_amount: number | null; b_discount: number | null; b_credits: number | null; b_payment: PaymentMethod | null;
}

/** The live ride this captain is on (accepted, not finished), with the rider and the booking once paid. */
const rideOf = (db: D1Database, driverId: string, rideId?: string) => db.prepare(
  `SELECT r.id, r.data, r.phase, r.otp_tries, r.otp_locked_until, u.name AS rider_name, u.phone AS rider_phone,
          b.id AS b_id, b.amount AS b_amount, b.discount AS b_discount, b.credits_used AS b_credits, b.payment AS b_payment
   FROM rides r JOIN users u ON u.id = r.user_id
   LEFT JOIN bookings b ON b.ride_id = r.id AND b.status IN ${ACTIVE}
   WHERE r.vendor_driver_id = ?1 AND r.dispatch = 'live' AND r.status <> 'cancelled' AND r.phase IN ('arriving', 'arrived', 'ontrip')
     AND (?2 IS NULL OR r.id = ?2)
   ORDER BY r.phase_at DESC LIMIT 1`,
).bind(driverId, rideId ?? null).first<RideRow>();

/** Wrong PINs left, counting a lock that has run out as a fresh start. */
function pinState(row: Pick<RideRow, "otp_tries" | "otp_locked_until">, now = Date.now()) {
  const lockedUntil = row.otp_locked_until && Date.parse(row.otp_locked_until) > now ? row.otp_locked_until : null;
  const tries = row.otp_locked_until && !lockedUntil ? 0 : row.otp_tries;
  return { tries, lockedUntil, left: lockedUntil ? 0 : Math.max(0, DRIVER_RULES.pinTries - tries) };
}

/** Where the captain stands: duty, the offer waiting for them, the ride they are on. */
export async function captainState(db: D1Database, c: CaptainContext): Promise<CaptainState> {
  const [duty, settings] = await Promise.all([dutyOf(db, c.id), getSettings(db)]);
  const now = Date.now();
  const offerRow = await db.prepare(
    `SELECT o.ride_id, o.expires_at, r.data FROM ride_offers o JOIN rides r ON r.id = o.ride_id AND r.offer_seq = o.seq
     WHERE o.driver_id = ? AND o.outcome = 'pending' AND o.expires_at > ? AND r.phase = 'searching' AND r.status <> 'cancelled'
     ORDER BY o.offered_at DESC LIMIT 1`,
  ).bind(c.id, new Date(now).toISOString()).first<{ ride_id: string; expires_at: string; data: string }>();
  let offer: CaptainOffer | null = null;
  if (offerRow) {
    const ride = parseRide(offerRow.data);
    offer = {
      ...tripFor(settings, offerRow.ride_id, ride, duty.position, ride.payment, null),
      expiresAt: offerRow.expires_at, secondsLeft: Math.max(0, Math.ceil((Date.parse(offerRow.expires_at) - now) / 1000)),
    };
  }
  const row = await rideOf(db, c.id);
  let ride: CaptainRide | null = null;
  if (row) {
    const data = parseRide(row.data);
    const booked = row.b_id ? { amount: row.b_amount!, discount: row.b_discount ?? 0, credits_used: row.b_credits ?? 0 } : null;
    const payment = row.b_payment ?? data.payment;
    const pin = pinState(row, now);
    ride = {
      ...tripFor(settings, row.id, data, duty.position, payment, booked),
      phase: row.phase,
      riderName: row.rider_name.split(" ")[0],
      // Only to find each other at the pickup: once the trip starts the number is no longer shown.
      riderPhone: row.phase === "ontrip" ? null : row.rider_phone,
      booked: !!row.b_id,
      collectCash: payment === "cash" ? booked?.amount ?? data.quote.fare : null,
      pinTriesLeft: pin.left,
      pinLockedUntil: pin.lockedUntil,
    };
  }
  return { duty, offer, ride };
}

/** The heartbeat's extra work: searches nobody is polling move forward (the captain's own offer may time out). */
export async function pingDispatch(db: D1Database, wake: Wake) {
  await advanceSearching(db, PING_ADVANCES, wake);
}

/** The card the rider sees for a real captain: their name, the vehicle and its plate. */
async function captainCard(db: D1Database, c: CaptainContext, ride: LiveRide): Promise<Driver> {
  const trips = await db.prepare("SELECT COUNT(*) AS n FROM vendor_trips WHERE driver_id = ?").bind(c.id).first<{ n: number }>();
  const option = ride.quote.option;
  return {
    name: c.name, rating: 5, trips: trips?.n ?? 0,
    // Partner vehicles carry no make or model yet: one of the ride type's models, as for a partner cab today.
    vehicle: pick(option.models.length ? option.models : [option.name], Date.now() >> 2),
    plate: formatRegNumber(c.vehicle_reg!), phone: c.phone,
  };
}

/** Takes the ride offered to this captain, if the offer is still theirs and still open. */
export async function acceptOffer(db: D1Database, c: CaptainContext, rideId: string): Promise<CaptainState> {
  const blocker = captainBlocker(c);
  if (blocker) throw conflict(blocker);
  const row = await db.prepare(
    `SELECT r.data FROM ride_offers o JOIN rides r ON r.id = o.ride_id AND r.offer_seq = o.seq
     WHERE o.ride_id = ? AND o.driver_id = ? AND o.outcome = 'pending' AND o.expires_at > ? AND r.phase = 'searching' AND r.status <> 'cancelled'`,
  ).bind(rideId, c.id, new Date().toISOString()).first<{ data: string }>();
  if (!row) throw conflict("This ride is no longer yours to take: the time ran out or the rider cancelled.");
  const ride = parseRide(row.data);
  const card = await captainCard(db, c, ride);
  const now = new Date().toISOString();
  // ?1 ride, ?2 driver, ?3 now. Every statement after the first runs only if this captain's offer was the one accepted.
  const accepted = "EXISTS (SELECT 1 FROM ride_offers WHERE ride_id = ?1 AND driver_id = ?2 AND outcome = 'accepted' AND decided_at = ?3)";
  const [taken] = await db.batch([
    db.prepare(
      `UPDATE ride_offers SET outcome = 'accepted', decided_at = ?3
       WHERE ride_id = ?1 AND driver_id = ?2 AND outcome = 'pending' AND expires_at > ?3
         AND seq = (SELECT offer_seq FROM rides WHERE id = ?1 AND phase = 'searching' AND dispatch = 'live' AND status <> 'cancelled')
         AND EXISTS (SELECT 1 FROM driver_state WHERE driver_id = ?2 AND online = 1 AND ride_id IS NULL)`,
    ).bind(rideId, c.id, now),
    db.prepare(
      `UPDATE rides SET phase = 'arriving', phase_at = ?3, vendor_vehicle_id = ?4, vendor_driver_id = ?2, otp_tries = 0, otp_locked_until = NULL,
         data = json_set(data, '$.driver', json(?5))
       WHERE id = ?1 AND phase = 'searching' AND ${accepted}`,
    ).bind(rideId, c.id, now, c.vehicle_id, JSON.stringify(card)),
    db.prepare(`UPDATE driver_state SET ride_id = ?1 WHERE driver_id = ?2 AND ride_id IS NULL AND ${accepted}`).bind(rideId, c.id, now),
    // A rider who already paid (their first captain gave the ride back): the trip now earns for this vehicle.
    db.prepare(`UPDATE bookings SET vendor_id = ?4, vendor_vehicle_id = ?5, vendor_driver_id = ?2 WHERE ride_id = ?1 AND status IN ${ACTIVE} AND ${accepted}`)
      .bind(rideId, c.id, now, c.vendor_id, c.vehicle_id),
  ]);
  if (!taken.meta.changes) throw conflict("This ride is no longer yours to take: the time ran out or the rider cancelled.");
  return captainState(db, c);
}

/** Says no to an offer. Always free: no score, no penalty. The ride goes to the next captain. */
export async function declineOffer(db: D1Database, c: CaptainContext, rideId: string, wake: Wake): Promise<CaptainState> {
  const res = await db.prepare("UPDATE ride_offers SET outcome = 'declined', decided_at = ?3 WHERE ride_id = ?1 AND driver_id = ?2 AND outcome = 'pending'")
    .bind(rideId, c.id, new Date().toISOString()).run();
  if (res.meta.changes) await advanceDispatch(db, rideId, wake);
  return captainState(db, c);
}

/** The captain's ride by id, or 404/409 explaining why it isn't theirs to move. */
async function myRide(db: D1Database, c: CaptainContext, rideId: string) {
  const row = await rideOf(db, c.id, rideId);
  if (!row) throw notFound("This ride isn't yours, or it has ended.");
  return row;
}

/** At the pickup. Within driverArrivedRadiusKm of it (0 = no check), so a waiting clock can't start from far away. */
export async function markArrived(db: D1Database, c: CaptainContext, rideId: string): Promise<CaptainState> {
  const row = await myRide(db, c, rideId);
  if (row.phase !== "arriving") throw conflict(row.phase === "arrived" ? "You've already said you're at the pickup." : "The trip has already started.");
  const settings = await getSettings(db);
  const radius = settings.driverArrivedRadiusKm ?? 0;
  if (radius > 0) {
    const at = (await dutyOf(db, c.id)).position;
    const ride = parseRide(row.data);
    if (!at) throw conflict("Your location isn't known yet. Turn on location and try again.");
    const km = mapDistanceKm(at, ride.pickup);
    if (km > radius) throw conflict(`You're ${km.toFixed(1)} km from the pickup. Mark that you've arrived when you're there.`);
  }
  const res = await db.prepare("UPDATE rides SET phase = 'arrived', phase_at = ?3 WHERE id = ?1 AND vendor_driver_id = ?2 AND phase = 'arriving' AND status <> 'cancelled'")
    .bind(rideId, c.id, new Date().toISOString()).run();
  if (!res.meta.changes) throw conflict("This ride changed meanwhile. Please check it again.");
  return captainState(db, c);
}

/**
 * Starts the trip once the rider tells the captain their PIN. DRIVER_RULES.pinTries wrong PINs lock the start
 * for pinLockMinutes. The rider must have paid (booked) first; the booking becomes "ongoing".
 */
export async function startTrip(db: D1Database, c: CaptainContext, rideId: string, otp: string): Promise<CaptainState> {
  const row = await myRide(db, c, rideId);
  if (row.phase === "arriving") throw conflict("Mark that you've arrived at the pickup first.");
  if (row.phase === "ontrip") throw conflict("The trip has already started.");
  if (!row.b_id) throw conflict("The rider hasn't confirmed the booking yet. Ask them to finish paying in their app.");
  const pin = pinState(row);
  if (pin.lockedUntil) {
    const mins = Math.max(1, Math.ceil((Date.parse(pin.lockedUntil) - Date.now()) / 60_000));
    throw conflict(`Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or call QuikFly support.`);
  }
  const ride = parseRide(row.data);
  if (otp.trim() !== ride.otp) {
    const tries = pin.tries + 1;
    const lock = tries >= DRIVER_RULES.pinTries ? new Date(Date.now() + DRIVER_RULES.pinLockMinutes * 60_000).toISOString() : null;
    // Applies only to the count read, so two wrong guesses at once can't both count as one.
    await db.prepare("UPDATE rides SET otp_tries = ?3, otp_locked_until = ?4 WHERE id = ?1 AND vendor_driver_id = ?2 AND otp_tries = ?5 AND COALESCE(otp_locked_until, '') = ?6")
      .bind(rideId, c.id, tries, lock, row.otp_tries, row.otp_locked_until ?? "").run();
    const left = DRIVER_RULES.pinTries - tries;
    throw badRequest(lock ? `Wrong PIN. The start is locked for ${DRIVER_RULES.pinLockMinutes} minutes.` : `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left.`);
  }
  const now = new Date().toISOString();
  const [started] = await db.batch([
    db.prepare(
      `UPDATE rides SET phase = 'ontrip', phase_at = ?3, started_at = ?3, otp_tries = 0, otp_locked_until = NULL
       WHERE id = ?1 AND vendor_driver_id = ?2 AND phase = 'arrived' AND status <> 'cancelled'
         AND EXISTS (SELECT 1 FROM bookings WHERE ride_id = ?1 AND status IN ${ACTIVE})`,
    ).bind(rideId, c.id, now),
    db.prepare("UPDATE bookings SET status = 'ongoing' WHERE ride_id = ?1 AND status = 'confirmed' AND EXISTS (SELECT 1 FROM rides WHERE id = ?1 AND phase = 'ontrip' AND phase_at = ?2)")
      .bind(rideId, now),
  ]);
  if (!started.meta.changes) throw conflict("This ride changed meanwhile. Please check it again.");
  return captainState(db, c);
}

/** Ends the trip at the drop: the booking completes and the vehicle's earning is settled in the same batch. */
export async function completeTrip(db: D1Database, c: CaptainContext, rideId: string): Promise<CaptainTripDone> {
  const row = await myRide(db, c, rideId);
  if (row.phase !== "ontrip") throw conflict("Start the trip with the rider's PIN first.");
  if (!row.b_id) throw conflict("This ride has no booking to complete. Call QuikFly support.");
  // Completing the booking also finishes the live ride and frees the captain (finishLiveRide).
  const done = await completeBookingRow(db, row.b_id);
  if (!done) throw conflict("This booking was closed meanwhile. Call QuikFly support if that's wrong.");
  const trip = await db.prepare("SELECT earning_paise FROM vendor_trips WHERE booking_id = ?").bind(row.b_id).first<{ earning_paise: number }>();
  return {
    ...(await captainState(db, c)),
    done: { rideId, earningPaise: trip?.earning_paise ?? 0, collectCash: done.payment === "cash" ? done.amount : null },
  };
}

/**
 * Gives an accepted ride back before the trip starts. The rider pays nothing and the ride is offered to
 * the next captain. Without a valid reason the vehicle's owner may be charged driverCancelPenaltyPercent.
 */
export async function releaseRide(db: D1Database, c: CaptainContext, rideId: string, reason: CaptainReleaseReason, wake: Wake): Promise<CaptainState> {
  const row = await myRide(db, c, rideId);
  if (row.phase === "ontrip") throw conflict("The trip has started, so it can't be given back. End it at the drop, or call QuikFly support.");
  const ride = parseRide(row.data);
  const settings = await getSettings(db);
  const penalty = releasePenaltyPaise(settings.driverCancelPenaltyPercent, reason, ride.quote.fare);
  const now = new Date().toISOString();
  const released = "EXISTS (SELECT 1 FROM ride_offers WHERE ride_id = ?1 AND driver_id = ?2 AND outcome = 'released' AND decided_at = ?3)";
  const label = CAPTAIN_RELEASE_REASONS.find((r) => r.id === reason)!.label;
  const [gaveBack] = await db.batch([
    db.prepare(
      `UPDATE ride_offers SET outcome = 'released', reason = ?4, decided_at = ?3
       WHERE ride_id = ?1 AND driver_id = ?2 AND outcome = 'accepted'
         AND EXISTS (SELECT 1 FROM rides WHERE id = ?1 AND vendor_driver_id = ?2 AND phase IN ('arriving', 'arrived') AND status <> 'cancelled')`,
    ).bind(rideId, c.id, now, reason),
    // The search starts again (its clock too); the next captain is asked straight away below.
    db.prepare(
      `UPDATE rides SET phase = 'searching', phase_at = ?3, vendor_vehicle_id = NULL, vendor_driver_id = NULL, otp_tries = 0, otp_locked_until = NULL,
         data = json_set(data, '$.driver', NULL)
       WHERE id = ?1 AND vendor_driver_id = ?2 AND ${released}`,
    ).bind(rideId, c.id, now),
    db.prepare(`UPDATE driver_state SET ride_id = NULL, idle_since = ?3 WHERE driver_id = ?2 AND ride_id = ?1 AND ${released}`).bind(rideId, c.id, now),
    db.prepare(`UPDATE bookings SET vendor_id = NULL, vendor_vehicle_id = NULL, vendor_driver_id = NULL WHERE ride_id = ?1 AND status IN ${ACTIVE} AND ${released}`).bind(rideId, c.id, now),
    // Not tied to the booking: the same booking could be given back more than once.
    db.prepare(
      `INSERT INTO vendor_ledger (id, vendor_id, kind, amount_paise, booking_id, note, created_at)
       SELECT ?4, ?5, 'penalty', ?6, NULL, ?7, ?3 WHERE ?6 < 0 AND ${released}`,
    ).bind(rideId, c.id, now, uid("VL"), c.vendor_id, -penalty, `Ride given back (${label}) · ${ride.pickup.name} to ${ride.drop.name}`),
  ]);
  if (!gaveBack.meta.changes) throw conflict("This ride changed meanwhile. Please check it again.");
  const rider = await db.prepare("SELECT user_id FROM rides WHERE id = ?").bind(rideId).first<{ user_id: string }>();
  if (rider) {
    await notify(db, rider.user_id, {
      kind: "ride.captain", ref: `${rideId}:released:${now}`, bookingId: row.b_id,
      title: "Finding you another captain", body: `Your captain couldn't make it to ${ride.pickup.name}. We're asking the next nearest captain now; you pay nothing extra.`,
    });
  }
  await advanceDispatch(db, rideId, wake);
  return captainState(db, c);
}

/** The captain's India day so far: trips completed, what they earned for the vehicle, the cash they hold. */
export async function captainSummary(db: D1Database, c: CaptainContext): Promise<CaptainSummary> {
  const day = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const from = new Date(Date.parse(`${day}T00:00:00+05:30`)).toISOString();
  const r = await db.prepare(
    `SELECT COUNT(*) AS trips, COALESCE(SUM(earning_paise), 0) AS earning,
            COALESCE(SUM(CASE WHEN payment = 'cash' THEN gross_paise - discount_paise ELSE 0 END), 0) AS cash
     FROM vendor_trips WHERE driver_id = ? AND completed_at >= ?`,
  ).bind(c.id, from).first<{ trips: number; earning: number; cash: number }>();
  return { day, trips: r?.trips ?? 0, earningPaise: r?.earning ?? 0, cashPaise: r?.cash ?? 0 };
}

/** Trips to show on the list. */
const TRIPS_PAGE = 50;

/** The captain's completed trips, newest first (TRIPS_PAGE of them). */
export async function captainTrips(db: D1Database, c: CaptainContext): Promise<CaptainTripItem[]> {
  const { results } = await db.prepare(
    `SELECT t.booking_id, t.completed_at, b.title, b.subtitle, t.payment, t.gross_paise - t.discount_paise AS paid, t.earning_paise
     FROM vendor_trips t JOIN bookings b ON b.id = t.booking_id
     WHERE t.driver_id = ? ORDER BY t.completed_at DESC LIMIT ?`,
  ).bind(c.id, TRIPS_PAGE).all<{ booking_id: string; completed_at: string; title: string; subtitle: string; payment: PaymentMethod; paid: number; earning_paise: number }>();
  return results.map((t) => ({
    bookingId: t.booking_id, completedAt: t.completed_at, title: t.title, subtitle: t.subtitle, payment: t.payment, paidPaise: t.paid, earningPaise: t.earning_paise,
  }));
}
