// Changing a bus booking after it's made (rules in packages/shared/src/bus-changes.ts):
// cancel some seats, move once to another bus or date on the same route, and the public
// m-ticket its QR code opens. Every money change lands in one batch with the booking change.
import {
  BUS_CHANGED_LINE, BUS_TRIP_LINES, SEATS_CANCELLED_LINE, SEATS_LINE, TRAVELLERS_LINE, creditsReturned, rescheduleAmounts, rescheduleError,
  seatCancelError, seatCancelRefund, seatsShare, ticketStatus, travellerNames, type Booking, type PublicTicket, type QuoteRequest,
} from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { bookingSeats, toBooking, type BookingRow } from "./bookings";
import { creditExpiry } from "./credits";
import { notify } from "./notifications";
import { usableQuote } from "./quotes";
import { getSettings } from "./settings";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

async function ownBusBooking(db: D1Database, userId: string, id: string): Promise<{ row: BookingRow; booking: Booking }> {
  const row = await db.prepare("SELECT * FROM bookings WHERE id = ? AND user_id = ?").bind(id, userId).first<BookingRow>();
  if (!row) throw notFound("Booking not found.");
  return { row, booking: toBooking(row, (await bookingSeats(db, [id])).get(id)) };
}

/** Replaces (or adds) one line, keeping the others in place. */
function setLine(lines: [string, string][], key: string, value: string): [string, string][] {
  return lines.some(([k]) => k === key) ? lines.map(([k, v]) => (k === key ? [k, value] : [k, v])) : [...lines, [key, value]];
}

/**
 * Cancels some seats of a bus booking. Their share of what was paid (by seat price) comes back
 * at the bus policy's rate for the notice given, with the same share of credits; the seats go
 * back on sale. The traveller names line drops the names that sat in them.
 */
export async function cancelSeats(db: D1Database, userId: string, id: string, seatIds: string[]): Promise<Booking> {
  const { row, booking } = await ownBusBooking(db, userId, id);
  const err = seatCancelError(booking, seatIds);
  if (err) throw (booking.status !== "confirmed" ? conflict(err) : badRequest(err));
  const settings = await getSettings(db);
  const { share, percent, refund } = seatCancelRefund(settings, booking, seatIds);
  const creditsShare = seatsShare(row.credits_used ?? 0, booking.seats, seatIds);
  const discountShare = seatsShare(row.discount ?? 0, booking.seats, seatIds);
  const creditsBack = creditsReturned(creditsShare, percent);
  const credit = row.payment === "wallet" ? refund : 0;

  // Seats and traveller names are in the same order (the checkout writes them that way).
  const keep = booking.seats.map((s) => !seatIds.includes(s.id));
  const names = (booking.lines.find(([k]) => k === TRAVELLERS_LINE)?.[1] ?? "").split(", ");
  let lines = setLine(booking.lines, SEATS_LINE, booking.seats.filter((_, i) => keep[i]).map((s) => s.id).join(", "));
  if (names.length === booking.seats.length) lines = setLine(lines, TRAVELLERS_LINE, names.filter((_, i) => keep[i]).join(", "));
  const what = `${seatIds.join(", ")} · ${refund ? `${inr(refund)}${row.payment === "wallet" ? " back to wallet" : " refund due"}` : "no refund"}`;
  const earlier = booking.lines.find(([k]) => k === SEATS_CANCELLED_LINE)?.[1];
  lines = setLine(lines, SEATS_CANCELLED_LINE, earlier ? `${earlier}; ${what}` : what);
  const linesJson = JSON.stringify(lines);
  const now = new Date().toISOString();
  // Later statements run only if the booking update went in (its new lines are the marker).
  const done = "EXISTS (SELECT 1 FROM bookings WHERE id = ?1 AND lines = ?2)";

  const results = await db.batch([
    db.prepare(
      `UPDATE bookings SET amount = amount - ?3, credits_used = credits_used - ?4, discount = discount - ?5, lines = ?2
       WHERE id = ?1 AND user_id = ?6 AND status = 'confirmed' AND amount = ?7 AND credits_used = ?8 AND lines = ?9 RETURNING *`,
    ).bind(id, linesJson, share, creditsShare, discountShare, userId, row.amount, row.credits_used ?? 0, row.lines),
    db.prepare(`DELETE FROM bus_seat_holds WHERE booking_id = ?1 AND seat_id IN (SELECT value FROM json_each(?3)) AND ${done}`)
      .bind(id, linesJson, JSON.stringify(seatIds)),
    db.prepare(`UPDATE users SET wallet_balance = wallet_balance + ?3 WHERE id = ?4 AND ?3 > 0 AND ${done}`).bind(id, linesJson, credit, userId),
    db.prepare(
      `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
       SELECT ?3, ?4, 'refund', ?5, ?6, ?1, ?7 WHERE ?5 > 0 AND ${done}`,
    ).bind(id, linesJson, uid("WT"), userId, credit, `Refund (seats ${seatIds.join(", ")}${percent < 100 ? `, ${percent}%` : ""}) · ${row.title}`, now),
    db.prepare(
      `INSERT INTO credits (id, user_id, kind, amount, remaining, expires_at, booking_id, note, created_at)
       SELECT ?3, ?4, 'returned', ?5, ?5, ?6, ?1, ?7, ?8 WHERE ?5 > 0 AND ${done}`,
    ).bind(id, linesJson, uid("CR"), userId, creditsBack, creditExpiry(settings), `Returned (seats ${seatIds.join(", ")}) · ${row.title}`, now),
  ]);
  const updated = (results[0].results as BookingRow[])[0];
  if (!updated) throw conflict("This booking just changed. Please refresh and try again.");
  await notify(db, userId, {
    kind: "booking.changed", ref: `${id}:seats:${seatIds.join(",")}`, bookingId: id, title: `Seats cancelled · ${row.title}`,
    body: `Seat${seatIds.length > 1 ? "s" : ""} ${seatIds.join(", ")} cancelled. ${refund ? (row.payment === "wallet" ? `${inr(refund)} is back in your QuikFly wallet.` : `Refund due: ${inr(refund)}.`) : "No refund under the cancellation policy."}`,
  });
  return toBooking(updated, (await bookingSeats(db, [id])).get(id));
}

/**
 * Moves a bus booking to the bus and seats of `quoteId` (same route, same number of seats and
 * travellers). Allowed once, until busRescheduleHours before departure. The fare difference
 * plus the change fee is paid now (from the wallet for wallet bookings), or what's left over
 * comes back. `trip` replaces the Date/Departure/Arrival/Seats lines and the subtitle.
 */
export async function rescheduleBooking(
  db: D1Database, userId: string, id: string, quoteId: string, trip: { subtitle: string; lines: [string, string][] },
): Promise<{ booking: Booking; charged: number; refunded: number }> {
  const { row, booking } = await ownBusBooking(db, userId, id);
  const settings = await getSettings(db);
  const err = rescheduleError(settings, booking);
  if (err) throw conflict(err);
  const oldReq = row.quote_id
    ? JSON.parse((await db.prepare("SELECT request FROM quotes WHERE id = ?").bind(row.quote_id).first<{ request: string }>())?.request ?? "null") as QuoteRequest | null
    : null;
  if (!oldReq || oldReq.service !== "bus") throw conflict("This ticket can't be changed online. Please contact support.");
  const q = await usableQuote(db, quoteId, "bus");
  const req = JSON.parse(q.request) as Extract<QuoteRequest, { service: "bus" }>;
  if (req.from !== oldReq.from || req.to !== oldReq.to) throw badRequest(`Pick a bus from ${oldReq.from} to ${oldReq.to}.`);
  if (req.busId === oldReq.busId && req.date === oldReq.date) throw badRequest("Pick a different bus or date.");
  if (req.seatIds.length !== booking.seats.length) throw badRequest(`Pick ${booking.seats.length} seat${booking.seats.length > 1 ? "s" : ""}, one for each traveller.`);
  const genders = (g: string[]) => [...g].sort().join();
  if (genders(req.genders ?? []) !== genders(booking.seats.map((s) => s.gender))) throw badRequest("The new seats must be for the same travellers.");

  const { newAmount, charge, refund, fee } = rescheduleAmounts(settings, booking, q.total);
  const wallet = row.payment === "wallet";
  const now = new Date().toISOString();
  const was = [booking.lines.find(([k]) => k === "Date")?.[1], booking.lines.find(([k]) => k === "Departure")?.[1]].filter(Boolean).join(", ");
  let lines = booking.lines;
  for (const key of BUS_TRIP_LINES) {
    const value = trip.lines.find(([k]) => k === key)?.[1];
    if (value) lines = setLine(lines, key, value);
  }
  lines = setLine(lines, SEATS_LINE, req.seatIds.join(", "));
  lines = setLine(lines, BUS_CHANGED_LINE, `${was || "the earlier bus"}${fee ? ` (fee ${inr(fee)})` : ""}${charge ? ` · paid ${inr(charge)} more` : refund ? ` · ${inr(refund)} ${wallet ? "back to wallet" : "refund due"}` : ""}`);
  const holds = req.seatIds.map((seat, i) => ({ seat, gender: req.genders?.[i] ?? "other", price: req.seatPrices?.[i] ?? 0 }));
  const moved = "EXISTS (SELECT 1 FROM bookings WHERE id = ?1 AND rescheduled_at = ?2)";

  let results: D1Result[];
  try {
    results = await db.batch([
      db.prepare("UPDATE quotes SET used_at = ?1 WHERE id = ?2 AND used_at IS NULL").bind(id, quoteId),
      db.prepare(
        `UPDATE bookings SET quote_id = ?3, amount = ?4, starts_at = ?5, subtitle = ?6, lines = ?7, rescheduled_at = ?2
         WHERE id = ?1 AND user_id = ?8 AND status = 'confirmed' AND rescheduled_at IS NULL AND amount = ?9
           AND (SELECT used_at FROM quotes WHERE id = ?3) = ?1
           AND (?10 = 0 OR (SELECT wallet_balance FROM users WHERE id = ?8) >= ?10)`,
      ).bind(id, now, quoteId, newAmount, q.starts_at, trip.subtitle, JSON.stringify(lines), userId, row.amount, wallet ? charge : 0),
      db.prepare(`DELETE FROM bus_seat_holds WHERE booking_id = ?1 AND ${moved}`).bind(id, now),
      // The primary key fails the whole batch if someone took one of the new seats meanwhile.
      db.prepare(
        `INSERT INTO bus_seat_holds (bus_id, date, seat_id, booking_id, gender, price)
         SELECT ?3, ?4, json_extract(j.value, '$.seat'), ?1, json_extract(j.value, '$.gender'), json_extract(j.value, '$.price') FROM json_each(?5) j WHERE ${moved}`,
      ).bind(id, now, req.busId, req.date, JSON.stringify(holds)),
      ...(wallet && (charge || refund) ? [
        db.prepare(`UPDATE users SET wallet_balance = wallet_balance + ?3 WHERE id = ?4 AND ${moved}`).bind(id, now, refund - charge, userId),
        db.prepare(
          `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
           SELECT ?3, ?4, ?5, ?6, ?7, ?1, ?2 WHERE ${moved}`,
        ).bind(id, now, uid("WT"), userId, charge ? "payment" : "refund", refund - charge, `${charge ? "Bus change" : "Bus change refund"} · ${row.title}`),
      ] : []),
      // Give the new quote back if the booking didn't move.
      db.prepare(`UPDATE quotes SET used_at = NULL WHERE id = ?3 AND used_at = ?1 AND NOT ${moved}`).bind(id, now, quoteId),
    ]);
  } catch (e) {
    if (String(e).includes("bus_seat_holds")) throw conflict("One of those seats was just booked by someone else. Please pick another.");
    throw e;
  }
  if (!results[1].meta.changes) {
    if (!results[0].meta.changes) throw conflict("This price was already used for a booking.");
    if (wallet && charge) throw badRequest(`The new bus costs ${inr(charge)} more and your wallet is short. Add money or pick another bus.`);
    throw conflict("This booking just changed. Please refresh and try again.");
  }
  const after = await ownBusBooking(db, userId, id);
  await notify(db, userId, {
    kind: "booking.changed", ref: `${id}:moved`, bookingId: id, title: `Bus changed · ${row.title}`,
    body: `${trip.subtitle}. ${charge ? `Paid ${inr(charge)} more.` : refund ? (wallet ? `${inr(refund)} is back in your QuikFly wallet.` : `Refund due: ${inr(refund)}.`) : "Same price."}`,
  });
  return { booking: after.booking, charged: charge, refunded: refund };
}

/** What the m-ticket's QR code shows: public, so a conductor can check it without signing in. */
export async function publicTicket(db: D1Database, token: string): Promise<PublicTicket> {
  const row = await db.prepare("SELECT * FROM bookings WHERE ticket_token = ?").bind(token).first<BookingRow>();
  if (!row) throw notFound("Ticket not found.");
  const b = toBooking(row);
  const line = (k: string) => b.lines.find(([key]) => key === k)?.[1];
  return {
    pnr: b.id,
    status: ticketStatus(b),
    title: b.title,
    subtitle: b.subtitle,
    startsAt: b.startsAt,
    seats: b.status === "cancelled" ? [] : (line(SEATS_LINE) ?? "").split(", ").filter(Boolean),
    details: (["Date", "Departure", "Arrival"] as const).flatMap((k) => (line(k) ? [[k, line(k)!] as [string, string]] : [])),
    // First names only: enough to match a traveller to a seat.
    travellers: travellerNames(b.lines).map((n) => n.split(/\s+/)[0]),
  };
}
