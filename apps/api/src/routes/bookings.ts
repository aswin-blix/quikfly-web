import { Hono } from "hono";
import { MAX_BOOKING_LINES, SERVICE_KEYS } from "../config";
import type { AppEnv } from "../env";
import { badRequest } from "../lib/errors";
import { jsonBody, oneOf, str } from "../lib/validate";
import { requireUser } from "../middleware/auth";
import { cancelBooking, createBooking, listBookings } from "../services/bookings";

function parseLines(value: unknown): [string, string][] {
  const ok = Array.isArray(value) && value.length <= MAX_BOOKING_LINES
    && value.every((l) => Array.isArray(l) && l.length === 2 && l.every((s) => typeof s === "string" && s.length <= 300));
  if (!ok) throw badRequest('"lines" must be a list of [label, value] pairs.');
  return value as [string, string][];
}

export const bookings = new Hono<AppEnv>()
  .use(requireUser)
  .get("/", async (c) => c.json(await listBookings(c.env.DB, c.var.user.id)))
  .post("/", async (c) => {
    const body = await jsonBody(c);
    const amount = body.amount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) throw badRequest('"amount" must be zero or more.');
    const booking = await createBooking(c.env.DB, c.var.user.id, {
      service: oneOf(body, "service", SERVICE_KEYS),
      title: str(body, "title"),
      subtitle: str(body, "subtitle", 300),
      amount: Math.round(amount),
      lines: parseLines(body.lines ?? []),
    });
    return c.json(booking, 201);
  })
  .post("/:id/cancel", async (c) => c.json(await cancelBooking(c.env.DB, c.var.user.id, c.req.param("id"))));
