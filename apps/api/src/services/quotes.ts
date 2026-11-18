// Server-side prices for bus, holiday, self-drive and group bookings. The website shows
// a quote's lines; POST /bookings charges its total. Rides are priced by services/rides.ts.
import {
  BOOKING_LIMITS, QUOTE_TTL_MINUTES, generateSeats, switchError, priceBus, seatRuleError, priceGroup, priceRent, priceTour, quoteStartsAt, rentHours, sumLines,
  type FareLine, type PriceQuote, type QuoteRequest, type Seat, type ServiceKey,
} from "@quikfly/shared";
import { badRequest, conflict } from "../lib/errors";
import { uid } from "../lib/random";
import { findBus, seatHolds } from "./buses";
import { visibleById } from "./catalog";
import { getSettings } from "./settings";

/** The price lines and when the trip starts (for the cancellation policy). */
async function price(db: D1Database, req: QuoteRequest): Promise<{ lines: FareLine[]; startsAt: string }> {
  const settings = await getSettings(db);
  const off = switchError(settings, {
    service: req.service,
    rentMode: req.service === "rent" ? req.mode : undefined,
    groupTrip: req.service === "rentals" ? req.trip : undefined,
  });
  if (off) throw conflict(off);
  switch (req.service) {
    case "bus": {
      if (!req.seatIds.length || req.seatIds.length > BOOKING_LIMITS.busSeats) throw badRequest(`Choose 1 to ${BOOKING_LIMITS.busSeats} seats.`);
      if (new Set(req.seatIds).size !== req.seatIds.length) throw badRequest("A seat is listed twice.");
      if (req.genders && req.genders.length !== req.seatIds.length) throw badRequest('"genders" must have one entry per seat.');
      const bus = await findBus(db, req.from, req.to, req.date, req.busId);
      const seats = generateSeats(bus, req.date, settings, await seatHolds(db, req.busId, req.date));
      const chosen = req.seatIds.map((id) => seats.find((s) => s.id === id) ?? null);
      if (chosen.some((s) => !s)) throw badRequest("One of those seats doesn't exist on this bus.");
      if (chosen.some((s) => s!.booked)) throw conflict("One of those seats was just booked. Please pick another.");
      const ruleError = seatRuleError(chosen as Seat[], req.genders ?? []);
      if (ruleError) throw badRequest(ruleError);
      return { lines: priceBus(chosen as NonNullable<(typeof chosen)[number]>[], settings), startsAt: quoteStartsAt(req, bus.depart) };
    }
    case "tours": {
      const tour = await visibleById(db, "tour", req.tourId);
      if (req.adults < 1 || req.kids < 0 || req.adults + req.kids > BOOKING_LIMITS.tourTravellers) throw badRequest(`Book for 1 to ${BOOKING_LIMITS.tourTravellers} travellers, with at least one adult.`);
      return { lines: priceTour(tour, req.adults, req.kids, settings), startsAt: quoteStartsAt(req) };
    }
    case "rent": {
      const car = await visibleById(db, "rentalCar", req.carId);
      const hours = rentHours(req.start, req.end);
      if (!(Date.parse(`${req.end}:00Z`) > Date.parse(`${req.start}:00Z`))) throw badRequest("Return must be after pickup.");
      if (hours > BOOKING_LIMITS.rentMaxDays * 24) throw badRequest(`Rentals can be at most ${BOOKING_LIMITS.rentMaxDays} days.`);
      return { lines: priceRent(car, req, settings), startsAt: quoteStartsAt(req) };
    }
    case "rentals": {
      const vehicle = await visibleById(db, "travelVehicle", req.vehicleId);
      if (req.days < 1 || req.days > BOOKING_LIMITS.groupMaxDays) throw badRequest(`Trips can be 1 to ${BOOKING_LIMITS.groupMaxDays} days.`);
      const km = req.trip === "local" ? 0 : (await visibleById(db, "groupDestination", req.destinationId ?? "")).km;
      return { lines: priceGroup(vehicle, req.trip, km, req.days, settings), startsAt: quoteStartsAt(req) };
    }
  }
}

export async function createQuote(db: D1Database, req: QuoteRequest): Promise<PriceQuote> {
  const { lines, startsAt } = await price(db, req);
  const quote: PriceQuote = { id: uid("QT"), service: req.service, lines, total: sumLines(lines), expiresAt: new Date(Date.now() + QUOTE_TTL_MINUTES * 60_000).toISOString() };
  await db.prepare("INSERT INTO quotes (id, service, request, lines, total, expires_at, starts_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(quote.id, quote.service, JSON.stringify(req), JSON.stringify(lines), quote.total, Date.parse(quote.expiresAt), startsAt).run();
  return quote;
}

interface QuoteRow { id: string; service: ServiceKey; total: number; expires_at: number; used_at: string | null; starts_at: string | null; lines: string; request: string }

/** A quote that can still be booked: right service, not expired, not used. */
export async function usableQuote(db: D1Database, id: string, service: ServiceKey) {
  const q = await db.prepare("SELECT id, service, total, expires_at, used_at, starts_at, lines, request FROM quotes WHERE id = ?").bind(id).first<QuoteRow>();
  if (!q || q.service !== service) throw badRequest("That price isn't valid. Please go back and check the price again.");
  if (q.used_at) throw conflict("This price was already used for a booking.");
  if (q.expires_at < Date.now()) throw conflict(`Prices are held for ${QUOTE_TTL_MINUTES} minutes and this one has expired. Please check the price again.`);
  return q;
}
