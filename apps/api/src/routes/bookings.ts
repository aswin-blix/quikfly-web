import { Hono } from "hono";
import { PAYMENT_METHODS, RIDE_CANCEL_REASON_KEYS } from "@quikfly/shared";
import { MAX_BOOKING_LINES, SERVICE_KEYS } from "../config";
import type { AppEnv } from "../env";
import { badRequest } from "../lib/errors";
import { jsonBody, oneOf, optStr, str } from "../lib/validate";
import { requireUser } from "../middleware/auth";
import { cancelBooking, completeBooking, createBooking, getBooking, listBookings } from "../services/bookings";
import { cancelSeats, rescheduleBooking } from "../services/bus-changes";

/** Seat ids for a bus change: a short list of short strings. */
function seatIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10 || value.some((s) => typeof s !== "string" || !s || s.length > 10)) throw badRequest('"seatIds" must be a list of seat ids.');
  return value as string[];
}

function parseLines(value: unknown): [string, string][] {
  const ok = Array.isArray(value) && value.length <= MAX_BOOKING_LINES
    && value.every((l) => Array.isArray(l) && l.length === 2 && l.every((s) => typeof s === "string" && s.length <= 300));
  if (!ok) throw badRequest('"lines" must be a list of [label, value] pairs.');
  return value as [string, string][];
}

export const bookings = new Hono<AppEnv>()
  .use(requireUser)
  .get("/", async (c) => c.json(await listBookings(c.env.DB, c.var.user.id)))
  // The price comes from `quoteId` (POST /quotes) or `rideId` (POST /rides); any "amount" sent is ignored.
  .post("/", async (c) => {
    const body = await jsonBody(c);
    const booking = await createBooking(c.env.DB, c.var.user.id, {
      service: oneOf(body, "service", SERVICE_KEYS),
      title: str(body, "title"),
      subtitle: str(body, "subtitle", 300),
      payment: oneOf(body, "payment", PAYMENT_METHODS),
      lines: parseLines(body.lines ?? []),
      quoteId: optStr(body, "quoteId", 40),
      rideId: optStr(body, "rideId", 40),
      couponCode: optStr(body, "couponCode", 20),
      tripOf: optStr(body, "tripOf", 40),
      useCredits: body.useCredits === true,
    });
    return c.json(booking, 201);
  })
  .get("/:id", async (c) => c.json(await getBooking(c.env.DB, c.var.user.id, c.req.param("id"))))
  // Optional body { reason } (a RIDE_CANCEL_REASONS key): a valid reason waives the ride cancellation fee.
  .post("/:id/cancel", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const reason = body && body.reason !== undefined ? oneOf(body, "reason", RIDE_CANCEL_REASON_KEYS) : null;
    return c.json(await cancelBooking(c.env.DB, c.var.user.id, c.req.param("id"), reason));
  })
  .post("/:id/complete", async (c) => c.json(await completeBooking(c.env.DB, c.var.user.id, c.req.param("id"))))
  // Bus tickets: cancel some seats (their share comes back per the bus policy).
  .post("/:id/cancel-seats", async (c) => c.json(await cancelSeats(c.env.DB, c.var.user.id, c.req.param("id"), seatIds((await jsonBody(c)).seatIds))))
  // Bus tickets: move once to another bus or date, priced by a new bus quote; { quoteId, subtitle, lines }.
  .post("/:id/reschedule", async (c) => {
    const body = await jsonBody(c);
    return c.json(await rescheduleBooking(c.env.DB, c.var.user.id, c.req.param("id"), str(body, "quoteId", 40), {
      subtitle: str(body, "subtitle", 300),
      lines: parseLines(body.lines ?? []),
    }));
  });
