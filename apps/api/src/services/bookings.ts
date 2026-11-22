import { PARCEL_NOT_CANCELLABLE, PARCEL_RETURN_LOCKED, UPDATE_TO_SEE, isQuickParcel, type ParcelState, type BookingSeat, type Gender, COUPON_LINE, CREDITS_LINE, DEPOSIT_LINE, QUOTE_TTL_MINUTES, cancelPolicyFor, creditsReturned, creditsUsable, rentExcess, switchError, refundAmount, refundPercent, rideCancelFee, rideDiscountRoom, bookingTerms, parseTerms, withTerms, type Booking, type BookingStatus, type FareLine, type NewBooking, type PaymentMethod, type QuoteRequest, type RentalState, type ServiceKey } from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { visibleById } from "./catalog";
import { checkCoupon, findOffer, totalUses } from "./offers";
import { usableQuote } from "./quotes";
import { ownRideWithTime } from "./rides";
import { getSettings } from "./settings";
import { notify } from "./notifications";
import { creditExpiry, earnStatement, earnedNotice, spendPlan } from "./credits";
import { settlementStatements } from "./partner-trips";
import { CANCELLABLE_SQL, cancelParcelStatements, isReturn } from "./parcels/legs";
import { newParcel, parcelStates } from "./parcels/parcels";

export interface BookingRow {
  id: string; user_id: string; service: ServiceKey; title: string; subtitle: string; amount: number;
  status: BookingStatus; payment: PaymentMethod; lines: string; created_at: string;
  quote_id: string | null; ride_id: string | null; coupon_code: string | null; discount: number;
  starts_at: string | null; refund_amount: number | null; deposit: number;
  cancel_reason: string | null; cancel_fee: number; trip_id: string | null; credits_used: number;
  vendor_id: string | null; vendor_vehicle_id: string | null; vendor_driver_id: string | null;
  rescheduled_at: string | null; ticket_token: string | null; terms: string | null;
}
/** `seats`: the bus seats it holds (bookingSeats); left empty where a caller doesn't need them. */
export const toBooking = (r: BookingRow, seats: BookingSeat[] = [], rentalState: RentalState | null = null, parcelState: ParcelState | null = null): Booking => ({
  id: r.id, service: r.service, title: r.title, subtitle: r.subtitle, amount: r.amount,
  status: r.status, payment: r.payment, createdAt: r.created_at, lines: JSON.parse(r.lines),
  startsAt: r.starts_at ?? null, refundAmount: r.refund_amount ?? null, deposit: r.deposit ?? 0,
  cancelReason: r.cancel_reason ?? null, cancelFee: r.cancel_fee ?? 0, rideId: r.ride_id ?? null, tripId: r.trip_id ?? null,
  creditsUsed: r.credits_used ?? 0, discount: r.discount ?? 0, seats,
  ticketToken: r.ticket_token ?? null, rescheduledAt: r.rescheduled_at ?? null, rentalState, parcelState, terms: parseTerms(r.terms),
});

/** Where a rental is, from its row (packages/shared/src/rental.ts). */
export const RENTAL_STATE_SQL = `CASE WHEN settlement IS NOT NULL THEN 'settled' WHEN return_at IS NOT NULL THEN 'returned' WHEN pickup_at IS NOT NULL THEN 'on_trip' ELSE 'booked' END`;

/** Rental states of these bookings (self-drive ones only), by booking id. */
export async function rentalStates(db: D1Database, ids: string[]): Promise<Map<string, RentalState>> {
  const map = new Map<string, RentalState>();
  if (!ids.length) return map;
  const { results } = await db.prepare(`SELECT booking_id, ${RENTAL_STATE_SQL} AS state FROM rentals WHERE booking_id IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(ids)).all<{ booking_id: string; state: RentalState }>();
  for (const r of results) map.set(r.booking_id, r.state);
  return map;
}

/** The bus seats held by these bookings, by booking id. */
export async function bookingSeats(db: D1Database, ids: string[]): Promise<Map<string, BookingSeat[]>> {
  const map = new Map<string, BookingSeat[]>();
  if (!ids.length) return map;
  const { results } = await db.prepare(
    "SELECT booking_id, seat_id, price, gender FROM bus_seat_holds WHERE booking_id IN (SELECT value FROM json_each(?)) ORDER BY rowid",
  ).bind(JSON.stringify(ids)).all<{ booking_id: string; seat_id: string; price: number; gender: Gender }>();
  for (const r of results) map.set(r.booking_id, [...(map.get(r.booking_id) ?? []), { id: r.seat_id, price: r.price ?? 0, gender: r.gender }]);
  return map;
}

/** A bus m-ticket's token: unguessable, opened by its QR code (GET /tickets/:token). */
export const ticketToken = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Statuses a booking can still be cancelled or completed from. */
export const ACTIVE = "('confirmed', 'ongoing')";


/** `hidden`: services the asking client can't show (hiddenServices in packages/shared). */
export async function listBookings(db: D1Database, userId: string, hidden: ServiceKey[]) {
  const { results } = await db.prepare("SELECT * FROM bookings WHERE user_id = ?1 AND service NOT IN (SELECT value FROM json_each(?2)) ORDER BY created_at DESC")
    .bind(userId, JSON.stringify(hidden)).all<BookingRow>();
  const seats = await bookingSeats(db, results.filter((r) => r.service === "bus" && r.status !== "cancelled").map((r) => r.id));
  const rentals = await rentalStates(db, results.filter((r) => r.service === "rent").map((r) => r.id));
  const parcels = await parcelStates(db, results.filter((r) => r.service === "parcel").map((r) => r.id));
  return results.map((r) => toBooking(r, seats.get(r.id), rentals.get(r.id) ?? null, parcels.get(r.id) ?? null));
}

/** Refuses a booking, and everything under it, to a client that can't show its service. */
export async function assertShown(db: D1Database, userId: string, id: string, hidden: ServiceKey[]) {
  if (!hidden.length) return;
  const row = await db.prepare("SELECT service FROM bookings WHERE id = ? AND user_id = ?").bind(id, userId).first<{ service: ServiceKey }>();
  if (row && hidden.includes(row.service)) throw notFound(UPDATE_TO_SEE);
}

export async function getBooking(db: D1Database, userId: string, id: string): Promise<Booking> {
  const row = await db.prepare("SELECT * FROM bookings WHERE id = ? AND user_id = ?").bind(id, userId).first<BookingRow>();
  if (!row) throw notFound("Booking not found.");
  const rental = row.service === "rent" ? (await rentalStates(db, [id])).get(id) ?? null : null;
  const parcel = row.service === "parcel" ? (await parcelStates(db, [id])).get(id) ?? null : null;
  return toBooking(row, (await bookingSeats(db, [id])).get(id), rental, parcel);
}

/** What a booking costs before any coupon (the ride's fare, or the quote's total) and when it starts. */
async function grossPrice(db: D1Database, userId: string, input: NewBooking) {
  if (input.service === "bike" || input.service === "car") {
    if (!input.rideId) throw badRequest('"rideId" is required for ride bookings.');
    const { ride, createdAt } = await ownRideWithTime(db, userId, input.rideId);
    // A ride's fare is held like a quote: an unbooked ride can't be booked later at an old (e.g. off-peak) fare.
    if (Date.now() - Date.parse(createdAt) > QUOTE_TTL_MINUTES * 60_000) throw conflict(`Fares are held for ${QUOTE_TTL_MINUTES} minutes and this one has expired. Please check the fare again.`);
    if (ride.quote.option.service !== input.service) throw badRequest("That ride is for a different service.");
    return { gross: ride.quote.fare, quoteId: null, rideId: ride.id, startsAt: ride.scheduledFor ?? null, deposit: 0, seatHolds: null, departure: null, rental: null, parcel: null };
  }
  if (!input.quoteId) throw badRequest('"quoteId" is required. Get a price from POST /quotes first.');
  const q = await usableQuote(db, input.quoteId, input.service);
  const deposit = (JSON.parse(q.lines) as FareLine[]).find((l) => l.label === DEPOSIT_LINE)?.amount ?? 0;
  const req = JSON.parse(q.request) as QuoteRequest;
  // Bus seats to hold with the booking (gender per seat; "other" when the quote didn't say).
  const seatHolds = req.service === "bus"
    ? { busId: req.busId, date: req.date, seats: req.seatIds.map((seat, i) => ({ seat, gender: req.genders?.[i] ?? "other", price: req.seatPrices?.[i] ?? 0 })) }
    : null;
  // A holiday departure: its seats are checked again inside the booking batch, so it can't be oversold.
  const departure = req.service === "tours" && req.departureId
    ? { id: req.departureId, travellers: req.adults + req.kids, seats: (await visibleById(db, "departure", req.departureId)).seats }
    : null;
  // A self-drive car gets a rental (pickup/return checklist), priced as booked for extensions and late fees.
  let rental: { start: string; end: string; kmPlan: string; hourlyRate: number; protectionPerDay: number; damageExcess: number } | null = null;
  if (req.service === "rent" && req.mode === "self") {
    const [car, settings] = await Promise.all([visibleById(db, "rentalCar", req.carId), getSettings(db)]);
    const uplift = req.kmPlan === "unlimited" ? 1 + settings.rentUnlimitedKmExtraPercent / 100 : 1;
    rental = {
      start: req.start, end: req.end, kmPlan: req.kmPlan, hourlyRate: Math.round(car.pricePerHour * uplift),
      protectionPerDay: req.protection === "peace" ? settings.rentProtectionPeacePerDay : settings.rentProtectionStandardPerDay,
      damageExcess: rentExcess(settings, req.protection),
    };
  }
  const parcel = req.service === "parcel" ? await newParcel(db, userId, req, input) : null;
  return { gross: q.total, quoteId: q.id, rideId: null, startsAt: q.starts_at, deposit, seatHolds, departure, rental, parcel };
}

/**
 * Saves a booking priced by the API. In one transaction it claims the quote (once only),
 * applies the coupon, spends QuikFly Credits (soonest expiry first) and takes a wallet payment;
 * if the wallet or the credits fall short none of it happens.
 */
export async function createBooking(db: D1Database, userId: string, input: NewBooking): Promise<Booking> {
  // A quote or ride made before a switch went off can't be booked after it.
  const settings = await getSettings(db);
  const off = switchError(settings, { service: input.service, tripOf: input.tripOf });
  if (off) throw conflict(off);
  const { gross, quoteId, rideId, startsAt, deposit: quotedDeposit, seatHolds, departure, rental, parcel } = await grossPrice(db, userId, input);
  // Joining a trip: the other booking must be the customer's own and not cancelled.
  let tripId: string | null = null;
  if (input.tripOf) {
    const anchor = await db.prepare("SELECT id, status, trip_id FROM bookings WHERE id = ? AND user_id = ?").bind(input.tripOf, userId)
      .first<{ id: string; status: BookingStatus; trip_id: string | null }>();
    if (!anchor) throw notFound("The booking to add this to wasn't found.");
    if (anchor.status === "cancelled") throw conflict("That booking was cancelled, so this can't join its trip.");
    tripId = anchor.trip_id ?? anchor.id;
  }
  const coupon = input.couponCode ? await checkCoupon(db, userId, input.couponCode, input.service, gross) : null;
  const afterCoupon = gross - (coupon?.discount ?? 0);
  // Credits pay up to creditsMaxRedeemPercent of the rest (never the refundable deposit).
  let creditsUsed = 0;
  let plan: { id: string; take: number }[] = [];
  if (input.useCredits) {
    const credits = await spendPlan(db, userId);
    // A ride keeps at least its discount floor: credits get only the room the coupon left.
    const room = rideDiscountRoom(settings, input.service, gross) - (coupon?.discount ?? 0);
    creditsUsed = creditsUsable(settings, credits.balance, afterCoupon, Math.min(quotedDeposit, afterCoupon), room);
    plan = credits.plan(creditsUsed);
  }
  const amount = afterCoupon - creditsUsed;
  // A coupon can't make the deposit larger than what was paid.
  const deposit = Math.min(quotedDeposit, amount);

  const id = uid("QF");
  const createdAt = new Date().toISOString();
  // The cancellation policy, fees, GST rate and rental rates it's sold under (terms.ts).
  const terms = bookingTerms(settings, input.service, parcel?.mode);
  // A ride on a partner's vehicle carries that partner (and earns them money on completion).
  const partner = rideId
    ? await db.prepare("SELECT r.vendor_vehicle_id, r.vendor_driver_id, vv.vendor_id FROM rides r LEFT JOIN vendor_vehicles vv ON vv.id = r.vendor_vehicle_id WHERE r.id = ?")
      .bind(rideId).first<{ vendor_vehicle_id: string | null; vendor_driver_id: string | null; vendor_id: string | null }>()
    : null;
  const lines: [string, string][] = [
    ...(parcel?.lines ?? input.lines).filter(([k]) => k !== COUPON_LINE && k !== CREDITS_LINE),
    ...(coupon ? [[COUPON_LINE, `${coupon.code} (−₹${coupon.discount.toLocaleString("en-IN")})`] as [string, string]] : []),
    ...(creditsUsed ? [[CREDITS_LINE, `−₹${creditsUsed.toLocaleString("en-IN")}`] as [string, string]] : []),
  ];
  const booking: Booking = { id, service: input.service, title: parcel?.title ?? input.title, subtitle: parcel?.subtitle ?? input.subtitle, amount, status: "confirmed", payment: input.payment, lines, createdAt, startsAt, refundAmount: null, deposit, cancelReason: null, cancelFee: 0, rideId, tripId, creditsUsed,
    discount: coupon?.discount ?? 0, seats: seatHolds?.seats.map((x) => ({ id: x.seat, price: x.price, gender: x.gender })) ?? [],
    ticketToken: seatHolds ? ticketToken() : null, rescheduledAt: null, rentalState: rental ? "booked" : null, parcelState: parcel ? "booked" : null, terms };
  const wallet = input.payment === "wallet";

  const conditions: string[] = [];
  const condParams: unknown[] = [];
  if (quoteId) { conditions.push("(SELECT used_at FROM quotes WHERE id = ?) = ?"); condParams.push(quoteId, id); }
  if (wallet) { conditions.push("(SELECT wallet_balance FROM users WHERE id = ?) >= ?"); condParams.push(userId, amount); }
  // An offer with a total-uses limit is re-checked inside the batch, so two bookings can't take its last use.
  const maxUses = coupon ? (await findOffer(db, coupon.code)).maxUses : null;
  if (coupon && maxUses != null) { conditions.push("(SELECT COUNT(*) FROM bookings WHERE coupon_code = ? AND status <> 'cancelled') < ?"); condParams.push(coupon.code, maxUses); }
  if (departure) {
    conditions.push("(SELECT COALESCE(SUM(travellers), 0) FROM bookings WHERE departure_id = ? AND status <> 'cancelled') + ? <= ?");
    condParams.push(departure.id, departure.travellers, departure.seats);
  }
  // Every planned credit must still be there, unexpired, with enough left.
  const planJson = JSON.stringify(plan);
  if (plan.length) {
    conditions.push(`(SELECT COUNT(*) FROM json_each(?) j JOIN credits c ON c.id = json_extract(j.value, '$.id')
      WHERE c.user_id = ? AND c.remaining >= json_extract(j.value, '$.take') AND c.expires_at > ?) = ?`);
    condParams.push(planJson, userId, createdAt, plan.length);
  }

  const statements: D1PreparedStatement[] = [];
  // Claim the quote with this booking's id, so only one booking can use it.
  if (quoteId) statements.push(db.prepare("UPDATE quotes SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(id, quoteId));
  statements.push(db.prepare(
    `INSERT INTO bookings (id, user_id, service, title, subtitle, amount, status, payment, lines, created_at, quote_id, ride_id, coupon_code, discount, starts_at, deposit, trip_id, credits_used, vendor_id, vendor_vehicle_id, vendor_driver_id, ticket_token, departure_id, travellers, terms)
     SELECT ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}`,
  ).bind(id, userId, booking.service, booking.title, booking.subtitle, amount, booking.payment, JSON.stringify(lines), createdAt,
    quoteId, rideId, coupon?.code ?? null, coupon?.discount ?? 0, startsAt, deposit, tripId, creditsUsed,
    partner?.vendor_id ?? null, partner?.vendor_vehicle_id ?? null, partner?.vendor_driver_id ?? null, booking.ticketToken, departure?.id ?? null, departure?.travellers ?? 0, JSON.stringify(terms), ...condParams));
  if (plan.length) {
    statements.push(
      db.prepare(
        `UPDATE credits SET remaining = remaining - (SELECT json_extract(j.value, '$.take') FROM json_each(?1) j WHERE json_extract(j.value, '$.id') = credits.id)
         WHERE id IN (SELECT json_extract(value, '$.id') FROM json_each(?1)) AND EXISTS (SELECT 1 FROM bookings WHERE id = ?2)`,
      ).bind(planJson, id),
      db.prepare(
        `INSERT INTO credits (id, user_id, kind, amount, remaining, expires_at, booking_id, note, created_at)
         SELECT ?1, ?2, 'spent', ?3, 0, NULL, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ?4)`,
      ).bind(uid("CR"), userId, -creditsUsed, id, `Used · ${booking.title}`, createdAt),
    );
  }
  if (wallet) {
    statements.push(
      db.prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ? AND EXISTS (SELECT 1 FROM bookings WHERE id = ?)").bind(amount, userId, id),
      db.prepare(
        `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
         SELECT ?, ?, 'payment', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ?)`,
      ).bind(uid("WT"), userId, -amount, `Paid · ${booking.title}`, id, createdAt, id),
    );
  }
  // Hold the bus seats; the primary key fails the whole batch if someone took one meanwhile.
  if (seatHolds) {
    statements.push(db.prepare(
      `INSERT INTO bus_seat_holds (bus_id, date, seat_id, booking_id, gender, price)
       SELECT ?1, ?2, json_extract(j.value, '$.seat'), ?3, json_extract(j.value, '$.gender'), json_extract(j.value, '$.price') FROM json_each(?4) j
       WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ?3)`,
    ).bind(seatHolds.busId, seatHolds.date, id, JSON.stringify(seatHolds.seats)));
  }
  if (rental) {
    statements.push(db.prepare(
      `INSERT INTO rentals (booking_id, start_local, ends_at, km_plan, hourly_rate, protection_per_day, damage_excess, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ?)`,
    ).bind(id, rental.start, rental.end, rental.kmPlan, rental.hourlyRate, rental.protectionPerDay, rental.damageExcess, createdAt, id));
  }
  if (parcel) statements.push(...parcel.statements(id, createdAt));
  // The booking the trip started from joins it too (only if this booking went in).
  if (input.tripOf) {
    statements.push(db.prepare("UPDATE bookings SET trip_id = COALESCE(trip_id, id) WHERE id = ? AND user_id = ? AND EXISTS (SELECT 1 FROM bookings WHERE id = ?)")
      .bind(input.tripOf, userId, id));
  }
  // If the booking didn't go in (e.g. wallet too low), give the quote back.
  if (quoteId) statements.push(db.prepare("UPDATE quotes SET used_at = NULL WHERE id = ? AND used_at = ? AND NOT EXISTS (SELECT 1 FROM bookings WHERE id = ?)").bind(quoteId, id, id));

  let results: D1Result[];
  try {
    results = await db.batch(statements);
  } catch (e) {
    if (String(e).includes("bus_seat_holds")) throw conflict("One of those seats was just booked by someone else. Please pick another.");
    if (String(e).includes("bookings_ride_once") || String(e).includes("UNIQUE")) throw conflict("This ride is already booked.");
    throw e;
  }
  const inserted = results[quoteId ? 1 : 0];
  if (!inserted.meta.changes) {
    if (quoteId && !results[0].meta.changes) throw conflict("This price was already used for a booking.");
    if (departure) {
      const taken = await db.prepare("SELECT COALESCE(SUM(travellers), 0) AS n FROM bookings WHERE departure_id = ? AND status <> 'cancelled'").bind(departure.id).first<{ n: number }>();
      if ((taken?.n ?? 0) + departure.travellers > departure.seats) throw conflict("Those seats on this departure were just taken. Please check the seats left again.");
    }
    if (coupon && maxUses != null && (await totalUses(db, coupon.code)) >= maxUses) throw conflict(`${coupon.code} has just been fully used. Remove it to book without the discount.`);
    if (plan.length && !wallet) throw conflict("Your QuikFly Credits just changed. Please try again.");
    throw badRequest("Not enough wallet balance. Choose another payment method.");
  }
  // Ride-now riders are watching the trip; everything else (and rides booked ahead) gets a notification.
  if (rideId === null || startsAt) {
    await notify(db, userId, { kind: "booking.confirmed", ref: id, bookingId: id, title: `Booking confirmed · ${booking.title}`,
      body: `${booking.subtitle}. ₹${amount.toLocaleString("en-IN")}${startsAt ? `, ${new Date(startsAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}` : ""}.` });
  }
  return booking;
}

/** Explains why an active-only update matched nothing. */
async function notActive(db: D1Database, userId: string, id: string): Promise<never> {
  const row = await db.prepare("SELECT service, status FROM bookings WHERE id = ? AND user_id = ?").bind(id, userId)
    .first<{ service: ServiceKey; status: BookingStatus }>();
  if (!row) throw notFound("Booking not found.");
  if (row.service === "parcel" && (row.status === "confirmed" || row.status === "ongoing") && (await isReturn(db, id))) throw conflict(PARCEL_RETURN_LOCKED);
  if (row.service === "parcel" && row.status === "ongoing") throw conflict(PARCEL_NOT_CANCELLABLE);
  throw conflict(`This booking is already ${row.status}.`);
}

/** One line about what a cancellation gave back (for notifications). */
export function refundText(row: Pick<BookingRow, "service" | "payment" | "refund_amount" | "cancel_fee">): string {
  const back = row.refund_amount ?? 0;
  const fee = row.cancel_fee ? ` (cancellation fee ₹${row.cancel_fee.toLocaleString("en-IN")})` : "";
  if (row.service === "parcel" && row.payment === "cash") return `Nothing was paid, so there's nothing to refund${fee}.`;
  if (!back) return `No refund under the cancellation policy${fee}.`;
  return row.payment === "wallet" ? `₹${back.toLocaleString("en-IN")} is back in your QuikFly wallet${fee}.` : `Refund due: ₹${back.toLocaleString("en-IN")}${fee}.`;
}

/**
 * What cancelling a booking now gives back, under the terms it was sold under (today's
 * settings for bookings made before terms were stored). Bus, holidays and rentals follow their policy
 * and start time; a rider who cancels a ride without a valid reason pays the MVAG
 * cancellation fee (`rider` set). Staff cancels never charge a fee.
 */
export async function refundFor(
  db: D1Database, row: Pick<BookingRow, "service" | "payment" | "starts_at" | "amount" | "deposit" | "created_at"> & { terms?: string | null },
  rider?: { reason: string | null },
) {
  const settings = withTerms(await getSettings(db), parseTerms(row.terms));
  const quick = isQuickParcel({ service: row.service, startsAt: row.starts_at });
  if (quick || row.service === "bike" || row.service === "car") {
    const fee = rider ? rideCancelFee(settings, row.amount, rider.reason, row.created_at, Date.now(), row.starts_at) : 0;
    // Cash for a parcel is paid at pickup, and it can only be cancelled before that.
    return { percent: 100, amount: quick && row.payment === "cash" ? 0 : row.amount - fee, fee };
  }
  const percent = refundPercent(cancelPolicyFor(settings, row.service), row.starts_at);
  return { percent, amount: refundAmount(row.amount, percent, row.deposit ?? 0), fee: 0 };
}

/**
 * Cancels an active booking and, in the same transaction, refunds a wallet payment: the
 * part the cancellation policy allows for the notice given (all of it when there is no
 * policy or no start time). `userId` null = any customer's booking (admin); the refund
 * goes to the booking's owner. Returns null when the booking isn't active (or isn't theirs), or
 * is a parcel already on its way. `refusal`: staff refused a parcel on sight, so all of it comes back.
 */
export async function cancelBookingRow(
  db: D1Database, userId: string | null, id: string, refundNote = "Refund", reason: string | null = null,
  refusal?: { adminId: string; note: string }, retried = false,
): Promise<BookingRow | null> {
  // ?1 = booking id, ?2 = owner, or null for staff (any customer's booking)
  const owner = "AND (?2 IS NULL OR user_id = ?2)";
  const ids = [id, userId];
  // Still cancellable: active and, for a parcel, not on the bus.
  const cancellable = `status IN ${ACTIVE} AND ${CANCELLABLE_SQL}`;
  const row = await db.prepare(`SELECT * FROM bookings WHERE id = ?1 ${owner} AND ${cancellable}`).bind(...ids).first<BookingRow>();
  if (!row) return null;
  // The refund below is worked out from this amount, so every statement needs it unchanged.
  const open = `${cancellable} AND amount = ${Math.trunc(Number(row.amount))}`;
  // A customer cancelling a ride may owe the cancellation fee; staff never charge one.
  const refund = refusal
    ? { percent: 100, amount: row.service === "parcel" && row.payment === "cash" ? 0 : row.amount, fee: 0 }
    : await refundFor(db, row, userId === null ? undefined : { reason });
  const credit = row.payment === "wallet" ? refund.amount : 0;
  const detail = refund.fee ? ` (less ₹${refund.fee} cancellation fee)` : refund.percent < 100 ? ` (${refund.percent}%${row.deposit ? ", deposit in full" : ""})` : "";
  const note = `${refundNote}${detail} · ${row.title}`;
  // Credits paid come back in the same share as the refund, with a fresh expiry.
  const creditsBack = creditsReturned(row.credits_used ?? 0, refund.percent);
  const creditsExpire = creditExpiry(await getSettings(db));
  const parcelClose = row.service === "parcel" ? cancelParcelStatements(db, id, refusal) : [];
  // Every statement re-checks that the booking is still active, so a race can't pay twice.
  const results = await db.batch([
    db.prepare(
      `UPDATE users SET wallet_balance = wallet_balance + ?3
       WHERE id = ?4 AND ?3 > 0 AND EXISTS (SELECT 1 FROM bookings WHERE id = ?1 ${owner} AND ${open})`,
    ).bind(...ids, credit, row.user_id),
    db.prepare(
      `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
       SELECT ?3, ?4, 'refund', ?5, ?6, ?1, ?7 WHERE ?5 > 0 AND EXISTS (SELECT 1 FROM bookings WHERE id = ?1 ${owner} AND ${open})`,
    ).bind(...ids, uid("WT"), row.user_id, credit, note, new Date().toISOString()),
    db.prepare(
      `INSERT INTO credits (id, user_id, kind, amount, remaining, expires_at, booking_id, note, created_at)
       SELECT ?3, ?4, 'returned', ?5, ?5, ?6, ?1, ?7, ?8 WHERE ?5 > 0 AND EXISTS (SELECT 1 FROM bookings WHERE id = ?1 ${owner} AND ${open})`,
    ).bind(...ids, uid("CR"), row.user_id, creditsBack, creditsExpire, `Returned · ${row.title}`, new Date().toISOString()),
    // Release any bus seats so they can be sold again.
    db.prepare(`DELETE FROM bus_seat_holds WHERE booking_id = ?1 AND EXISTS (SELECT 1 FROM bookings WHERE id = ?1 ${owner} AND ${open})`).bind(...ids),
    db.prepare(`UPDATE bookings SET status = 'cancelled', refund_amount = ?3, cancel_reason = ?4, cancel_fee = ?5 WHERE id = ?1 ${owner} AND ${open} RETURNING *`)
      .bind(...ids, refund.amount, reason, refund.fee),
    // After the booking's update: a parcel is closed only if the booking was.
    ...parcelClose,
  ]);
  const cancelled = (results[results.length - 1 - parcelClose.length].results as BookingRow[])[0];
  if (cancelled) return cancelled;
  // The amount changed meanwhile: once more, from the new one.
  return retried ? null : cancelBookingRow(db, userId, id, refundNote, reason, refusal, true);
}

export async function cancelBooking(db: D1Database, userId: string, id: string, reason: string | null = null): Promise<Booking> {
  const picked = await db.prepare("SELECT 1 AS ok FROM rentals WHERE booking_id = ? AND pickup_at IS NOT NULL").bind(id).first();
  if (picked) throw conflict("You've already started this rental. End it from My trips instead of cancelling.");
  const row = await cancelBookingRow(db, userId, id, "Refund", reason);
  if (!row) return notActive(db, userId, id);
  await notify(db, userId, { kind: "booking.cancelled", ref: id, bookingId: id, title: `Cancelled · ${row.title}`, body: refundText(row) });
  return toBooking(row, [], null, row.service === "parcel" ? "cancelled" : null);
}

/**
 * Marks a ride as done. Called by the website and the app when a simulated ride ends;
 * the driver app will own this once it exists. Other services are closed by staff, who
 * confirm the return before a deposit goes back (see completeBookingRow).
 */
export async function completeBooking(db: D1Database, userId: string, id: string): Promise<Booking> {
  const active = await db.prepare(`SELECT * FROM bookings WHERE id = ? AND user_id = ? AND service IN ('bike', 'car') AND status IN ${ACTIVE}`)
    .bind(id, userId).first<BookingRow>();
  if (active) {
    const settings = await getSettings(db);
    const earn = earnStatement(db, settings, active);
    const [done, earned] = await db.batch([
      db.prepare(`UPDATE bookings SET status = 'completed' WHERE id = ? AND user_id = ? AND status IN ${ACTIVE} RETURNING *`).bind(id, userId),
      ...(earn ? [earn.statement] : []),
      // A partner's trip settles in the same batch (after the status change, so it sees 'completed'),
      // at the GST rate the ride was sold under.
      ...settlementStatements(db, withTerms(settings, parseTerms(active.terms)), active),
    ]);
    const row = (done.results as BookingRow[])[0];
    if (row) {
      if (earn && earned?.meta.changes) await notify(db, userId, { ...earnedNotice(earn.earn, row.title, settings), ref: id, bookingId: id });
      return toBooking(row);
    }
  }
  const current = await db.prepare("SELECT service, status FROM bookings WHERE id = ? AND user_id = ?").bind(id, userId).first<{ service: ServiceKey; status: BookingStatus }>();
  if (current && current.service !== "bike" && current.service !== "car" && (current.status === "confirmed" || current.status === "ongoing")) {
    throw conflict("QuikFly staff close this booking once the trip is over.");
  }
  return notActive(db, userId, id);
}

/**
 * Staff close an active booking. A refundable deposit paid from the wallet goes back in
 * the same transaction (it is recorded as `refund_amount` either way). Null when not active.
 */
export async function completeBookingRow(
  db: D1Database, id: string,
  /** A rental settlement: how much of the deposit goes back, the wallet note, and statements to run with it.
   *  `stillActive` is SQL that uses ?1 for the booking id, so those statements must bind the booking id as ?1. */
  settle?: { depositBack: number; note: string; statements: (stillActive: string) => D1PreparedStatement[] },
): Promise<BookingRow | null> {
  const row = await db.prepare(`SELECT * FROM bookings WHERE id = ?1 AND status IN ${ACTIVE}`).bind(id).first<BookingRow>();
  // A parcel is completed only by its hand-over (parcels/carriers.ts), never around the collection code.
  if (!row || row.service === "parcel") return null;
  const deposit = settle ? Math.min(settle.depositBack, row.deposit ?? 0) : row.deposit ?? 0;
  const credit = row.payment === "wallet" ? deposit : 0;
  const stillActive = `EXISTS (SELECT 1 FROM bookings WHERE id = ?1 AND status IN ${ACTIVE})`;
  const settings = await getSettings(db);
  const earn = earnStatement(db, settings, row);
  const extra = settle ? settle.statements(stillActive) : [];
  const results = await db.batch([
    db.prepare(`UPDATE users SET wallet_balance = wallet_balance + ?2 WHERE id = ?3 AND ?2 > 0 AND ${stillActive}`).bind(id, credit, row.user_id),
    db.prepare(
      `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
       SELECT ?2, ?3, 'refund', ?4, ?5, ?1, ?6 WHERE ?4 > 0 AND ${stillActive}`,
    ).bind(id, uid("WT"), row.user_id, credit, settle?.note ?? `Deposit returned · ${row.title}`, new Date().toISOString()),
    // Settlement statements run before the status changes, so they still see the booking as active.
    ...extra,
    db.prepare(`UPDATE bookings SET status = 'completed', refund_amount = CASE WHEN ?2 > 0 OR ?3 THEN ?2 ELSE refund_amount END WHERE id = ?1 AND status IN ${ACTIVE} RETURNING *`)
      .bind(id, deposit, settle ? 1 : 0),
    // Credits for the completed trip (runs after the status change, so it sees 'completed').
    ...(earn ? [earn.statement] : []),
    ...settlementStatements(db, withTerms(settings, parseTerms(row.terms)), row),
  ]);
  const done = results[2 + extra.length], earned = earn ? results[3 + extra.length] : undefined;
  const finished = (done.results as BookingRow[])[0] ?? null;
  if (finished && earn && earned?.meta.changes) await notify(db, row.user_id, { ...earnedNotice(earn.earn, row.title, settings), ref: id, bookingId: id });
  return finished;
}
