import { COUPON_LINE, DEPOSIT_LINE, cancelPolicyFor, refundAmount, refundPercent, rideCancelFee, type Booking, type BookingStatus, type FareLine, type NewBooking, type PaymentMethod, type QuoteRequest, type ServiceKey } from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { checkCoupon } from "./offers";
import { usableQuote } from "./quotes";
import { ownRide } from "./rides";
import { getSettings } from "./settings";
import { notify } from "./notifications";

export interface BookingRow {
  id: string; user_id: string; service: ServiceKey; title: string; subtitle: string; amount: number;
  status: BookingStatus; payment: PaymentMethod; lines: string; created_at: string;
  quote_id: string | null; ride_id: string | null; coupon_code: string | null; discount: number;
  starts_at: string | null; refund_amount: number | null; deposit: number;
  cancel_reason: string | null; cancel_fee: number; trip_id: string | null;
}
export const toBooking = (r: BookingRow): Booking => ({
  id: r.id, service: r.service, title: r.title, subtitle: r.subtitle, amount: r.amount,
  status: r.status, payment: r.payment, createdAt: r.created_at, lines: JSON.parse(r.lines),
  startsAt: r.starts_at ?? null, refundAmount: r.refund_amount ?? null, deposit: r.deposit ?? 0,
  cancelReason: r.cancel_reason ?? null, cancelFee: r.cancel_fee ?? 0, rideId: r.ride_id ?? null, tripId: r.trip_id ?? null,
});

/** Statuses a booking can still be cancelled or completed from. */
export const ACTIVE = "('confirmed', 'ongoing')";


export async function listBookings(db: D1Database, userId: string) {
  const { results } = await db.prepare("SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC")
    .bind(userId).all<BookingRow>();
  return results.map(toBooking);
}

export async function getBooking(db: D1Database, userId: string, id: string): Promise<Booking> {
  const row = await db.prepare("SELECT * FROM bookings WHERE id = ? AND user_id = ?").bind(id, userId).first<BookingRow>();
  if (!row) throw notFound("Booking not found.");
  return toBooking(row);
}

/** What a booking costs before any coupon (the ride's fare, or the quote's total) and when it starts. */
async function grossPrice(db: D1Database, userId: string, input: NewBooking) {
  if (input.service === "bike" || input.service === "car") {
    if (!input.rideId) throw badRequest('"rideId" is required for ride bookings.');
    const ride = await ownRide(db, userId, input.rideId);
    if (ride.quote.option.service !== input.service) throw badRequest("That ride is for a different service.");
    return { gross: ride.quote.fare, quoteId: null, rideId: ride.id, startsAt: ride.scheduledFor ?? null, deposit: 0, seatHolds: null };
  }
  if (!input.quoteId) throw badRequest('"quoteId" is required. Get a price from POST /quotes first.');
  const q = await usableQuote(db, input.quoteId, input.service);
  const deposit = (JSON.parse(q.lines) as FareLine[]).find((l) => l.label === DEPOSIT_LINE)?.amount ?? 0;
  const req = JSON.parse(q.request) as QuoteRequest;
  // Bus seats to hold with the booking (gender per seat; "other" when the quote didn't say).
  const seatHolds = req.service === "bus" ? { busId: req.busId, date: req.date, seats: req.seatIds.map((seat, i) => ({ seat, gender: req.genders?.[i] ?? "other" })) } : null;
  return { gross: q.total, quoteId: q.id, rideId: null, startsAt: q.starts_at, deposit, seatHolds };
}

/**
 * Saves a booking priced by the API. In one transaction it claims the quote (once only),
 * applies the coupon, and takes a wallet payment; if the balance is too low none of it happens.
 */
export async function createBooking(db: D1Database, userId: string, input: NewBooking): Promise<Booking> {
  const { gross, quoteId, rideId, startsAt, deposit: quotedDeposit, seatHolds } = await grossPrice(db, userId, input);
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
  const amount = gross - (coupon?.discount ?? 0);
  // A coupon can't make the deposit larger than what was paid.
  const deposit = Math.min(quotedDeposit, amount);

  const id = uid("QF");
  const createdAt = new Date().toISOString();
  const lines: [string, string][] = [
    ...input.lines.filter(([k]) => k !== COUPON_LINE),
    ...(coupon ? [[COUPON_LINE, `${coupon.code} (−₹${coupon.discount.toLocaleString("en-IN")})`] as [string, string]] : []),
  ];
  const booking: Booking = { id, service: input.service, title: input.title, subtitle: input.subtitle, amount, status: "confirmed", payment: input.payment, lines, createdAt, startsAt, refundAmount: null, deposit, cancelReason: null, cancelFee: 0, rideId, tripId };
  const wallet = input.payment === "wallet";

  const conditions: string[] = [];
  const condParams: unknown[] = [];
  if (quoteId) { conditions.push("(SELECT used_at FROM quotes WHERE id = ?) = ?"); condParams.push(quoteId, id); }
  if (wallet) { conditions.push("(SELECT wallet_balance FROM users WHERE id = ?) >= ?"); condParams.push(userId, amount); }

  const statements: D1PreparedStatement[] = [];
  // Claim the quote with this booking's id, so only one booking can use it.
  if (quoteId) statements.push(db.prepare("UPDATE quotes SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(id, quoteId));
  statements.push(db.prepare(
    `INSERT INTO bookings (id, user_id, service, title, subtitle, amount, status, payment, lines, created_at, quote_id, ride_id, coupon_code, discount, starts_at, deposit, trip_id)
     SELECT ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}`,
  ).bind(id, userId, booking.service, booking.title, booking.subtitle, amount, booking.payment, JSON.stringify(lines), createdAt,
    quoteId, rideId, coupon?.code ?? null, coupon?.discount ?? 0, startsAt, deposit, tripId, ...condParams));
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
      `INSERT INTO bus_seat_holds (bus_id, date, seat_id, booking_id, gender)
       SELECT ?1, ?2, json_extract(j.value, '$.seat'), ?3, json_extract(j.value, '$.gender') FROM json_each(?4) j
       WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ?3)`,
    ).bind(seatHolds.busId, seatHolds.date, id, JSON.stringify(seatHolds.seats)));
  }
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
  const row = await db.prepare("SELECT status FROM bookings WHERE id = ? AND user_id = ?").bind(id, userId)
    .first<{ status: BookingStatus }>();
  if (!row) throw notFound("Booking not found.");
  throw conflict(`This booking is already ${row.status}.`);
}

/** One line about what a cancellation gave back (for notifications). */
export function refundText(row: Pick<BookingRow, "payment" | "refund_amount" | "cancel_fee">): string {
  const back = row.refund_amount ?? 0;
  const fee = row.cancel_fee ? ` (cancellation fee ₹${row.cancel_fee.toLocaleString("en-IN")})` : "";
  if (!back) return `No refund under the cancellation policy${fee}.`;
  return row.payment === "wallet" ? `₹${back.toLocaleString("en-IN")} is back in your QuikFly wallet${fee}.` : `Refund due: ₹${back.toLocaleString("en-IN")}${fee}.`;
}

/** What cancelling a booking now gives back, per its service's policy and start time. */
/**
 * What cancelling a booking now gives back. Bus, holidays and rentals follow their policy
 * and start time; a rider who cancels a ride without a valid reason pays the MVAG
 * cancellation fee (`rider` set). Staff cancels never charge a fee.
 */
export async function refundFor(
  db: D1Database, row: Pick<BookingRow, "service" | "starts_at" | "amount" | "deposit" | "created_at">,
  rider?: { reason: string | null },
) {
  const settings = await getSettings(db);
  if (row.service === "bike" || row.service === "car") {
    const fee = rider ? rideCancelFee(settings, row.amount, rider.reason, row.created_at, Date.now(), row.starts_at) : 0;
    return { percent: 100, amount: row.amount - fee, fee };
  }
  const percent = refundPercent(cancelPolicyFor(settings, row.service), row.starts_at);
  return { percent, amount: refundAmount(row.amount, percent, row.deposit ?? 0), fee: 0 };
}

/**
 * Cancels an active booking and, in the same transaction, refunds a wallet payment: the
 * part the cancellation policy allows for the notice given (all of it when there is no
 * policy or no start time). `userId` null = any customer's booking (admin); the refund
 * goes to the booking's owner. Returns null when the booking isn't active (or isn't theirs).
 */
export async function cancelBookingRow(db: D1Database, userId: string | null, id: string, refundNote = "Refund", reason: string | null = null): Promise<BookingRow | null> {
  // ?1 = booking id, ?2 = owner, or null for staff (any customer's booking)
  const owner = "AND (?2 IS NULL OR user_id = ?2)";
  const ids = [id, userId];
  const row = await db.prepare(`SELECT * FROM bookings WHERE id = ?1 ${owner} AND status IN ${ACTIVE}`).bind(...ids).first<BookingRow>();
  if (!row) return null;
  // A customer cancelling a ride may owe the cancellation fee; staff never charge one.
  const refund = await refundFor(db, row, userId === null ? undefined : { reason });
  const credit = row.payment === "wallet" ? refund.amount : 0;
  const detail = refund.fee ? ` (less ₹${refund.fee} cancellation fee)` : refund.percent < 100 ? ` (${refund.percent}%${row.deposit ? ", deposit in full" : ""})` : "";
  const note = `${refundNote}${detail} · ${row.title}`;
  // Every statement re-checks that the booking is still active, so a race can't pay twice.
  const results = await db.batch([
    db.prepare(
      `UPDATE users SET wallet_balance = wallet_balance + ?3
       WHERE id = ?4 AND ?3 > 0 AND EXISTS (SELECT 1 FROM bookings WHERE id = ?1 ${owner} AND status IN ${ACTIVE})`,
    ).bind(...ids, credit, row.user_id),
    db.prepare(
      `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
       SELECT ?3, ?4, 'refund', ?5, ?6, ?1, ?7 WHERE ?5 > 0 AND EXISTS (SELECT 1 FROM bookings WHERE id = ?1 ${owner} AND status IN ${ACTIVE})`,
    ).bind(...ids, uid("WT"), row.user_id, credit, note, new Date().toISOString()),
    // Release any bus seats so they can be sold again.
    db.prepare(`DELETE FROM bus_seat_holds WHERE booking_id = ?1 AND EXISTS (SELECT 1 FROM bookings WHERE id = ?1 ${owner} AND status IN ${ACTIVE})`).bind(...ids),
    db.prepare(`UPDATE bookings SET status = 'cancelled', refund_amount = ?3, cancel_reason = ?4, cancel_fee = ?5 WHERE id = ?1 ${owner} AND status IN ${ACTIVE} RETURNING *`)
      .bind(...ids, refund.amount, reason, refund.fee),
  ]);
  return (results[results.length - 1].results as BookingRow[])[0] ?? null;
}

export async function cancelBooking(db: D1Database, userId: string, id: string, reason: string | null = null): Promise<Booking> {
  const row = await cancelBookingRow(db, userId, id, "Refund", reason);
  if (!row) return notActive(db, userId, id);
  await notify(db, userId, { kind: "booking.cancelled", ref: id, bookingId: id, title: `Cancelled · ${row.title}`, body: refundText(row) });
  return toBooking(row);
}

/**
 * Marks a ride as done. Called by the website and the app when a simulated ride ends;
 * the driver app will own this once it exists. Other services are closed by staff, who
 * confirm the return before a deposit goes back (see completeBookingRow).
 */
export async function completeBooking(db: D1Database, userId: string, id: string): Promise<Booking> {
  const row = await db.prepare(`UPDATE bookings SET status = 'completed' WHERE id = ? AND user_id = ? AND service IN ('bike', 'car') AND status IN ${ACTIVE} RETURNING *`)
    .bind(id, userId).first<BookingRow>();
  if (row) return toBooking(row);
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
export async function completeBookingRow(db: D1Database, id: string): Promise<BookingRow | null> {
  const row = await db.prepare(`SELECT * FROM bookings WHERE id = ?1 AND status IN ${ACTIVE}`).bind(id).first<BookingRow>();
  if (!row) return null;
  const deposit = row.deposit ?? 0;
  const credit = row.payment === "wallet" ? deposit : 0;
  const stillActive = `EXISTS (SELECT 1 FROM bookings WHERE id = ?1 AND status IN ${ACTIVE})`;
  const [, , done] = await db.batch([
    db.prepare(`UPDATE users SET wallet_balance = wallet_balance + ?2 WHERE id = ?3 AND ?2 > 0 AND ${stillActive}`).bind(id, credit, row.user_id),
    db.prepare(
      `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
       SELECT ?2, ?3, 'refund', ?4, ?5, ?1, ?6 WHERE ?4 > 0 AND ${stillActive}`,
    ).bind(id, uid("WT"), row.user_id, credit, `Deposit returned · ${row.title}`, new Date().toISOString()),
    db.prepare(`UPDATE bookings SET status = 'completed', refund_amount = CASE WHEN ?2 > 0 THEN ?2 ELSE refund_amount END WHERE id = ?1 AND status IN ${ACTIVE} RETURNING *`)
      .bind(id, deposit),
  ]);
  return (done.results as BookingRow[])[0] ?? null;
}
