import { notFound } from "../lib/errors";
import { uid } from "../lib/random";
import type { Booking, BookingStatus, ServiceKey } from "@quikfly/shared";

interface BookingRow {
  id: string; service: ServiceKey; title: string; subtitle: string;
  amount: number; status: BookingStatus; lines: string; created_at: string;
}
const toBooking = (r: BookingRow): Booking => ({
  id: r.id, service: r.service, title: r.title, subtitle: r.subtitle,
  amount: r.amount, status: r.status, createdAt: r.created_at, lines: JSON.parse(r.lines),
});

export type NewBooking = Pick<Booking, "service" | "title" | "subtitle" | "amount" | "lines">;

export async function listBookings(db: D1Database, userId: string) {
  const { results } = await db.prepare("SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC")
    .bind(userId).all<BookingRow>();
  return results.map(toBooking);
}

export async function createBooking(db: D1Database, userId: string, input: NewBooking): Promise<Booking> {
  const booking: Booking = { ...input, id: uid("QF"), status: "confirmed", createdAt: new Date().toISOString() };
  await db.prepare(
    "INSERT INTO bookings (id, user_id, service, title, subtitle, amount, status, lines, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(booking.id, userId, booking.service, booking.title, booking.subtitle, booking.amount, booking.status,
    JSON.stringify(booking.lines), booking.createdAt).run();
  return booking;
}

export async function cancelBooking(db: D1Database, userId: string, id: string): Promise<Booking> {
  const row = await db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND user_id = ? RETURNING *")
    .bind(id, userId).first<BookingRow>();
  if (!row) throw notFound("Booking not found.");
  return toBooking(row);
}
