import { Hono } from "hono";
import { PAYMENT_METHODS } from "@quikfly/shared";
import type { AppEnv } from "../env";
import { jsonBody, matches, oneOf, optStr, str } from "../lib/validate";
import { requireUser } from "../middleware/auth";
import { bookRide, cancelRide, getRide, quoteRides, startRide } from "../services/rides";
import { shareRide } from "../services/share";

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
/** Optional pickup time for a ride booked ahead: local "YYYY-MM-DDTHH:mm", India. */
const scheduledFor = (body: Record<string, unknown>) => {
  const v = optStr(body, "scheduledFor", 16);
  return v ? matches(v, LOCAL_DATETIME, '"scheduledFor" must be YYYY-MM-DDTHH:mm.') : undefined;
};

export const rides = new Hono<AppEnv>()
  .post("/quote", async (c) => {
    const body = await jsonBody(c);
    return c.json(await quoteRides(c.env.DB, oneOf(body, "service", ["bike", "car"] as const), str(body, "pickupId"), str(body, "dropId"), scheduledFor(body)));
  })
  .get("/:id", requireUser, async (c) => c.json(await getRide(c.env.DB, c.var.user.id, c.req.param("id"))))
  // Scheduled rides: start near pickup time (driver assigned, live trip begins).
  .post("/:id/start", requireUser, async (c) => c.json(await startRide(c.env.DB, c.var.user.id, c.req.param("id"))))
  .post("/", requireUser, async (c) => {
    const body = await jsonBody(c);
    const ride = await bookRide(c.env.DB, c.var.user.id, {
      optionId: str(body, "optionId"),
      pickupId: str(body, "pickupId"),
      dropId: str(body, "dropId"),
      payment: oneOf(body, "payment", PAYMENT_METHODS),
      scheduledFor: scheduledFor(body),
    });
    return c.json(ride, 201);
  })
  .post("/:id/cancel", requireUser, async (c) => {
    await cancelRide(c.env.DB, c.var.user.id, c.req.param("id"));
    return c.json({ cancelled: true });
  })
  // A link anyone can open to follow the ride (safety: share trip).
  .post("/:id/share", requireUser, async (c) => c.json(await shareRide(c.env.DB, c.var.user.id, c.req.param("id")), 201));
