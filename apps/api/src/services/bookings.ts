import { COUPON_LINE, type Booking, type BookingStatus, type NewBooking, type PaymentMethod, type ServiceKey } from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { checkCoupon } from "./offers";
import { usableQuote } from "./quotes";
import { ownRide } from "./rides";

export interface BookingRow {
  id: string; user_id: string; service: ServiceKey; title: string; subtitle: string; amount: number;
  status: BookingStatus; payment: PaymentMethod; lines: string; created_at: string;
  quote_id: string | null; ride_id: string | null; coupon_code: string | null; discount: number;
}
export const toBooking = (r: BookingRow): Booking => ({
  id: r.id, service: r.service, title: r.title, subtitle: r.subtitle, amount: r.amount,
  status: r.status, payment: r.payment, createdAt: r.created_at, lines: JSON.parse(r.lines),
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

/** What a booking costs before any coupon: the ride's fare, or the quote's total. */
async function grossPrice(db: D1Database, userId: string, input: NewBooking) {
  if (input.service === "bike" || input.service === "car") {
    if (!input.rideId) throw badRequest('"rideId" is required for ride bookings.');
    const ride = await ownRide(db, userId, input.rideId);
    if (ride.quote.option.service !== input.service) throw badRequest("That ride is for a different service.");
    return { gross: ride.quote.fare, quoteId: null, rideId: ride.id };
  }
  if (!input.quoteId) throw badRequest('"quoteId" is required. Get a price from POST /quotes first.');
  const q = await usableQuote(db, input.quoteId, input.service);
  return { gross: q.total, quoteId: q.id, rideId: null };
}

/**
 * Saves a booking priced by the API. In one transaction it claims the quote (once only),
 * applies the coupon, and takes a wallet payment; if the balance is too low none of it happens.
 */
export async function createBooking(db: D1Database, userId: string, input: NewBooking): Promise<Booking> {
  const { gross, quoteId, rideId } = await grossPrice(db, userId, input);
  const coupon = input.couponCode ? await checkCoupon(db, userId, input.couponCode, input.service, gross) : null;
  const amount = gross - (coupon?.discount ?? 0);

  const id = uid("QF");
  const createdAt = new Date().toISOString();
  const lines: [string, string][] = [
    ...input.lines.filter(([k]) => k !== COUPON_LINE),
    ...(coupon ? [[COUPON_LINE, `${coupon.code} (−₹${coupon.discount.toLocaleString("en-IN")})`] as [string, string]] : []),
  ];
  const booking: Booking = { id, service: input.service, title: input.title, subtitle: input.subtitle, amount, status: "confirmed", payment: input.payment, lines, createdAt };
  const wallet = input.payment === "wallet";

  const conditions: string[] = [];
  const condParams: unknown[] = [];
  if (quoteId) { conditions.push("(SELECT used_at FROM quotes WHERE id = ?) = ?"); condParams.push(quoteId, id); }
  if (wallet) { conditions.push("(SELECT wallet_balance FROM users WHERE id = ?) >= ?"); condParams.push(userId, amount); }

  const statements: D1PreparedStatement[] = [];
  // Claim the quote with this booking's id, so only one booking can use it.
  if (quoteId) statements.push(db.prepare("UPDATE quotes SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(id, quoteId));
  statements.push(db.prepare(
    `INSERT INTO bookings (id, user_id, service, title, subtitle, amount, status, payment, lines, created_at, quote_id, ride_id, coupon_code, discount)
     SELECT ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ? ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}`,
  ).bind(id, userId, booking.service, booking.title, booking.subtitle, amount, booking.payment, JSON.stringify(lines), createdAt,
    quoteId, rideId, coupon?.code ?? null, coupon?.discount ?? 0, ...condParams));
  if (wallet) {
    statements.push(
      db.prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ? AND EXISTS (SELECT 1 FROM bookings WHERE id = ?)").bind(amount, userId, id),
      db.prepare(
        `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
         SELECT ?, ?, 'payment', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ?)`,
      ).bind(uid("WT"), userId, -amount, `Paid · ${booking.title}`, id, createdAt, id),
    );
  }
  // If the booking didn't go in (e.g. wallet too low), give the quote back.
  if (quoteId) statements.push(db.prepare("UPDATE quotes SET used_at = NULL WHERE id = ? AND used_at = ? AND NOT EXISTS (SELECT 1 FROM bookings WHERE id = ?)").bind(quoteId, id, id));

  let results: D1Result[];
  try {
    results = await db.batch(statements);
  } catch (e) {
    if (String(e).includes("bookings_ride_once") || String(e).includes("UNIQUE")) throw conflict("This ride is already booked.");
    throw e;
  }
  const inserted = results[quoteId ? 1 : 0];
  if (!inserted.meta.changes) {
    if (quoteId && !results[0].meta.changes) throw conflict("This price was already used for a booking.");
    throw badRequest("Not enough wallet balance. Choose another payment method.");
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

/**
 * Cancels an active booking and, in the same transaction, refunds a wallet payment.
 * `userId` null = any customer's booking (admin); the refund goes to the booking's owner.
 */
export async function cancelBookingRow(db: D1Database, userId: string | null, id: string, refundNote = "Refund"): Promise<BookingRow | null> {
  const owner = userId === null ? "" : "AND user_id = ?2";
  const [, , cancelled] = await db.batch([
    db.prepare(
      `UPDATE users SET wallet_balance = wallet_balance + COALESCE((
         SELECT amount FROM bookings WHERE id = ?1 ${owner} AND status IN ${ACTIVE} AND payment = 'wallet'
       ), 0) WHERE id = (SELECT user_id FROM bookings WHERE id = ?1 ${owner})`,
    ).bind(...(userId === null ? [id] : [id, userId])),
    db.prepare(
      `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
       SELECT ?3, user_id, 'refund', amount, ?5 || ' · ' || title, id, ?4
       FROM bookings WHERE id = ?1 ${owner} AND status IN ${ACTIVE} AND payment = 'wallet'`,
    ).bind(...(userId === null ? [id, null] : [id, userId]), uid("WT"), new Date().toISOString(), refundNote),
    db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?1 ${owner} AND status IN ${ACTIVE} RETURNING *`)
      .bind(...(userId === null ? [id] : [id, userId])),
  ]);
  return (cancelled.results as BookingRow[])[0] ?? null;
}

export async function cancelBooking(db: D1Database, userId: string, id: string): Promise<Booking> {
  const row = await cancelBookingRow(db, userId, id);
  return row ? toBooking(row) : notActive(db, userId, id);
}

/**
 * Marks a trip as done. Called by the website when a simulated ride ends;
 * the driver app will own this once it exists.
 */
export async function completeBooking(db: D1Database, userId: string, id: string): Promise<Booking> {
  const row = await db.prepare(`UPDATE bookings SET status = 'completed' WHERE id = ? AND user_id = ? AND status IN ${ACTIVE} RETURNING *`)
    .bind(id, userId).first<BookingRow>();
  return row ? toBooking(row) : notActive(db, userId, id);
}
