import { Hono } from "hono";
import { FUEL_EIGHTHS, LIMITS, PARCEL_RULES, PATTERNS, PAYMENT_METHODS, RENTAL_PHOTO_SIDES, RENTAL_RULES, RENTAL_STAGES, RIDE_CANCEL_REASON_KEYS } from "@quikfly/shared";
import { MAX_BOOKING_LINES, SERVICE_KEYS } from "../config";
import type { AppEnv } from "../env";
import { badRequest } from "../lib/errors";
import { int, jsonBody, matches, oneOf, optStr, str, text } from "../lib/validate";
import { requireUser } from "../middleware/auth";
import { normalisePhone } from "../services/auth";
import { myParcel } from "../services/parcels/parcels";
import { cancelBooking, completeBooking, createBooking, getBooking, listBookings } from "../services/bookings";
import { cancelSeats, rescheduleBooking } from "../services/bus-changes";
import { extendRental, extensionQuote, myRental, rentalPhoto, returnRental, startRental, uploadRentalPhoto } from "../services/rentals";

/** :stage and :side of a rental checklist photo. */
const photoParams = (stage: string, side: string) => ({
  stage: oneOf({ stage }, "stage", RENTAL_STAGES),
  side: oneOf({ side }, "side", RENTAL_PHOTO_SIDES),
});
/** { odometerKm, fuel } of a rental checklist. */
const reading = (body: Record<string, unknown>) => ({
  odometerKm: int(body, "odometerKm", 0, RENTAL_RULES.maxOdometerKm),
  fuel: int(body, "fuel", 0, FUEL_EIGHTHS),
});

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

/** What a parcel booking adds: { receiver: { name, phone }, contents, declaration }. */
function parcelFields(body: Record<string, unknown>) {
  const r = body.receiver;
  if (!r || typeof r !== "object" || Array.isArray(r)) throw badRequest('"receiver" must be { name, phone }.');
  const receiver = r as Record<string, unknown>;
  const phone = normalisePhone(str(receiver, "phone", 20));
  matches(phone.replace(/\D/g, "").slice(-10), PATTERNS.phone, "Enter the receiver's 10-digit mobile number.");
  return {
    receiver: { name: text(receiver, "name", LIMITS.nameMin, LIMITS.nameMax), phone },
    contents: text(body, "contents", PARCEL_RULES.contentsMin, PARCEL_RULES.contentsMax),
    declaration: str(body, "declaration", 20),
  };
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
      ...(body.service === "parcel" ? parcelFields(body) : {}),
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
  // The sender's parcel, with the collection code while it's ready.
  .get("/:id/parcel", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(await myParcel(c.env.DB, c.var.user.id, c.req.param("id")));
  })
  // Self-drive rentals: the pickup/return checklist, extensions (packages/shared/src/rental.ts).
  .get("/:id/rental", async (c) => c.json(await myRental(c.env.DB, c.var.user.id, c.req.param("id"))))
  // Raw JPEG/PNG/WebP body (up to 2 MB) → the rental
  .put("/:id/rental/photos/:stage/:side", async (c) => {
    const p = photoParams(c.req.param("stage"), c.req.param("side"));
    return c.json(await uploadRentalPhoto(c.env.DB, c.env.DOCS, c.var.user.id, c.req.param("id"), p.stage, p.side, await c.req.arrayBuffer()));
  })
  .get("/:id/rental/photos/:stage/:side", async (c) => {
    const p = photoParams(c.req.param("stage"), c.req.param("side"));
    return rentalPhoto(c.env.DB, c.env.DOCS, c.var.user.id, c.req.param("id"), p.stage, p.side);
  })
  // { odometerKm, fuel } once the five pickup photos are in → the rental (booking becomes "ongoing")
  .post("/:id/rental/start", async (c) => c.json(await startRental(c.env.DB, c.var.user.id, c.req.param("id"), reading(await jsonBody(c)))))
  // ?hours=N → { lines, total, endsAt } (the price before paying)
  .get("/:id/rental/extension", async (c) => {
    const hours = int({ hours: Number(c.req.query("hours")) }, "hours", 1, 168);
    const { row, lines, total } = await extensionQuote(c.env.DB, c.var.user.id, c.req.param("id"), hours);
    return c.json({ lines, total, endsAt: new Date(Date.parse(`${row.ends_at}:00Z`) + hours * 3_600_000).toISOString().slice(0, 16) });
  })
  // { hours } → { rental, lines, total }; paid like the booking (wallet in the same batch)
  .post("/:id/rental/extend", async (c) => c.json(await extendRental(c.env.DB, c.var.user.id, c.req.param("id"), int(await jsonBody(c), "hours", 1, 168))))
  // { odometerKm, fuel } once the five return photos are in → the rental, waiting for staff to settle
  .post("/:id/rental/return", async (c) => c.json(await returnRental(c.env.DB, c.var.user.id, c.req.param("id"), reading(await jsonBody(c)))))
  // Bus tickets: move once to another bus or date, priced by a new bus quote; { quoteId, subtitle, lines }.
  .post("/:id/reschedule", async (c) => {
    const body = await jsonBody(c);
    return c.json(await rescheduleBooking(c.env.DB, c.var.user.id, c.req.param("id"), str(body, "quoteId", 40), {
      subtitle: str(body, "subtitle", 300),
      lines: parseLines(body.lines ?? []),
    }));
  });
