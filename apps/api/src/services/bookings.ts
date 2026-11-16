import type { Booking, BookingStatus, PaymentMethod, ServiceKey } from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";

interface BookingRow {
  id: string; service: ServiceKey; title: string; subtitle: string; amount: number;
  status: BookingStatus; payment: PaymentMethod; lines: string; created_at: string;
}
const toBooking = (r: BookingRow): Booking => ({
  id: r.id, service: r.service, title: r.title, subtitle: r.subtitle, amount: r.amount,
  status: r.status, payment: r.payment, createdAt: r.created_at, lines: JSON.parse(r.lines),
});

/** Statuses a booking can still be cancelled or completed from. */
const ACTIVE = "('confirmed', 'ongoing')";

export type NewBooking = Pick<Booking, "service" | "title" | "subtitle" | "amount" | "payment" | "lines">;

export async function listBookings(db: D1Database, userId: string) {
  const { results } = await db.prepare("SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC")
    .bind(userId).all<BookingRow>();
  return results.map(toBooking);
}

/**
 * Saves a booking. A wallet payment is taken in the same transaction:
 * if the balance is too low, neither the booking nor the debit happens.
 */
export async function createBooking(db: D1Database, userId: string, input: NewBooking): Promise<Booking> {
  const booking: Booking = { ...input, id: uid("QF"), status: "confirmed", createdAt: new Date().toISOString() };
  const values = [booking.id, userId, booking.service, booking.title, booking.subtitle, booking.amount,
    booking.status, booking.payment, JSON.stringify(booking.lines), booking.createdAt];
  const columns = "id, user_id, service, title, subtitle, amount, status, payment, lines, created_at";

  if (booking.payment !== "wallet") {
    await db.prepare(`INSERT INTO bookings (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values).run();
    return booking;
  }

  const [inserted] = await db.batch([
    db.prepare(
      `INSERT INTO bookings (${columns}) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT wallet_balance FROM users WHERE id = ?) >= ?`,
    ).bind(...values, userId, booking.amount),
    db.prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ? AND wallet_balance >= ?")
      .bind(booking.amount, userId, booking.amount),
  ]);
  if (!inserted.meta.changes) throw badRequest("Not enough wallet balance. Choose another payment method.");
  return booking;
}

/** Explains why an active-only update matched nothing. */
async function notActive(db: D1Database, userId: string, id: string): Promise<never> {
  const row = await db.prepare("SELECT status FROM bookings WHERE id = ? AND user_id = ?").bind(id, userId)
    .first<{ status: BookingStatus }>();
  if (!row) throw notFound("Booking not found.");
  throw conflict(`This booking is already ${row.status}.`);
}

/** Cancels a booking and, in the same transaction, refunds a wallet payment. */
export async function cancelBooking(db: D1Database, userId: string, id: string): Promise<Booking> {
  const [, cancelled] = await db.batch([
    db.prepare(
      `UPDATE users SET wallet_balance = wallet_balance + COALESCE((
         SELECT amount FROM bookings WHERE id = ?1 AND user_id = ?2 AND status IN ${ACTIVE} AND payment = 'wallet'
       ), 0) WHERE id = ?2`,
    ).bind(id, userId),
    db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status IN ${ACTIVE} RETURNING *`)
      .bind(id, userId),
  ]);
  const row = (cancelled.results as BookingRow[])[0];
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
