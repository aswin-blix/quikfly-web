// POST /quotes prices a bus, holiday, self-drive, group or parcel booking. POST /offers/check
// tries a coupon against a quote or a ride. Bookings then refer to the quote by id.
import { Hono } from "hono";
import {
  GENDERS, GROUP_TRIPS, PARCEL_CATEGORIES, PARCEL_HANDOVERS, PARCEL_MODES, PARCEL_SIZES, PARCEL_WEIGHT_BANDS, PATTERNS, RENT_KM_PLANS, RENT_PROTECTION,
  type Gender, type QuoteRequest,
} from "@quikfly/shared";
import type { AppEnv } from "../env";
import { badRequest } from "../lib/errors";
import { bool, int, jsonBody, matches, oneOf, optStr, str } from "../lib/validate";
import { requireUser } from "../middleware/auth";
import { checkCoupon } from "../services/offers";
import { createQuote, usableQuote } from "../services/quotes";
import { ownRide } from "../services/rides";

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function parseQuoteRequest(body: Record<string, unknown>): QuoteRequest {
  const service = oneOf(body, "service", ["bus", "tours", "rent", "rentals", "parcel"] as const);
  switch (service) {
    case "parcel": {
      const mode = oneOf(body, "mode", PARCEL_MODES);
      const details = {
        service, category: oneOf(body, "category", PARCEL_CATEGORIES), weightBand: oneOf(body, "weightBand", PARCEL_WEIGHT_BANDS),
        size: oneOf(body, "size", PARCEL_SIZES), declaredValue: int(body, "declaredValue", 1, 10_000_000),
      };
      if (mode === "city") return { ...details, mode, pickupId: str(body, "pickupId", 40), dropId: str(body, "dropId", 40) };
      const departAt = str(body, "departAt", 30);
      if (Number.isNaN(Date.parse(departAt))) throw badRequest('"departAt" must be a date and time.');
      // `plan` is the API's own: built field by field here so a client can't send one.
      return {
        ...details, mode, from: str(body, "from", 60), to: str(body, "to", 60), busId: str(body, "busId", 120), departAt,
        pickup: oneOf(body, "pickup", PARCEL_HANDOVERS), delivery: oneOf(body, "delivery", PARCEL_HANDOVERS),
      };
    }
    case "bus": {
      const seatIds = body.seatIds;
      if (!Array.isArray(seatIds) || seatIds.some((s) => typeof s !== "string" || s.length > 10)) throw badRequest('"seatIds" must be a list of seat ids.');
      const genders = body.genders;
      if (genders !== undefined && (!Array.isArray(genders) || genders.some((g) => !GENDERS.includes(g as Gender)))) {
        throw badRequest(`"genders" must be a list of: ${GENDERS.join(", ")}.`);
      }
      return {
        service, busId: str(body, "busId", 120), from: str(body, "from", 60), to: str(body, "to", 60),
        date: matches(str(body, "date", 10), PATTERNS.isoDate, '"date" must be YYYY-MM-DD.'), seatIds,
        ...(genders ? { genders: genders as Gender[] } : {}),
      };
    }
    case "tours":
      return {
        service, tourId: str(body, "tourId", 40), adults: int(body, "adults", 1, 50), kids: int(body, "kids", 0, 50),
        start: matches(str(body, "start", 10), PATTERNS.isoDate, '"start" must be YYYY-MM-DD.'),
        // A group departure (required when the package has upcoming departures).
        departureId: optStr(body, "departureId", 40),
      };
    case "rent":
      return {
        service, carId: str(body, "carId", 40), mode: oneOf(body, "mode", ["self", "driver"] as const),
        start: matches(str(body, "start", 16), LOCAL_DATETIME, '"start" must be YYYY-MM-DDTHH:mm.'),
        end: matches(str(body, "end", 16), LOCAL_DATETIME, '"end" must be YYYY-MM-DDTHH:mm.'),
        kmPlan: oneOf(body, "kmPlan", RENT_KM_PLANS), protection: oneOf(body, "protection", RENT_PROTECTION), doorstep: bool(body, "doorstep"),
      };
    case "rentals":
      return {
        service, vehicleId: str(body, "vehicleId", 40), trip: oneOf(body, "trip", GROUP_TRIPS),
        destinationId: optStr(body, "destinationId", 40), days: int(body, "days", 1, 60),
        start: matches(str(body, "start", 10), PATTERNS.isoDate, '"start" must be YYYY-MM-DD.'),
      };
  }
}

export const quotes = new Hono<AppEnv>()
  .post("/", async (c) => c.json(await createQuote(c.env.DB, parseQuoteRequest(await jsonBody(c))), 201));

export const offers = new Hono<AppEnv>()
  // { code, quoteId } or { code, rideId } → { code, discount, total }. Needs sign-in for per-customer limits.
  .post("/check", requireUser, async (c) => {
    const body = await jsonBody(c);
    const code = str(body, "code", 20);
    const quoteId = optStr(body, "quoteId", 40);
    const rideId = optStr(body, "rideId", 40);
    if (quoteId) {
      const q = await c.env.DB.prepare("SELECT service FROM quotes WHERE id = ?").bind(quoteId).first<{ service: QuoteRequest["service"] }>();
      if (!q) throw badRequest("That price isn't valid. Please check the price again.");
      const usable = await usableQuote(c.env.DB, quoteId, q.service);
      return c.json(await checkCoupon(c.env.DB, c.var.user.id, code, q.service, usable.total));
    }
    if (rideId) {
      const ride = await ownRide(c.env.DB, c.var.user.id, rideId);
      return c.json(await checkCoupon(c.env.DB, c.var.user.id, code, ride.quote.option.service, ride.quote.fare));
    }
    throw badRequest('Send "quoteId" or "rideId" with the code.');
  });
