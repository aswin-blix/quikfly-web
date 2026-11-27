import { Hono } from "hono";
import { PAYMENT_METHODS, acceptsLiveRides } from "@quikfly/shared";
import type { AppEnv } from "../env";
import { badRequest } from "../lib/errors";
import { jsonBody, matches, oneOf, optStr, str } from "../lib/validate";
import { bearerToken, requireUser } from "../middleware/auth";
import { userForToken } from "../services/auth";
import { bookRide, cancelRide, getRide, quoteRides, startRide } from "../services/rides";
import { shareRide } from "../services/share";
import { advanceDispatch } from "../services/dispatch";
import { newWake, wakeUp } from "../lib/wake";

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
/** Optional pickup time for a ride booked ahead: local "YYYY-MM-DDTHH:mm", India. */
const scheduledFor = (body: Record<string, unknown>) => {
  const v = optStr(body, "scheduledFor", 16);
  return v ? matches(v, LOCAL_DATETIME, '"scheduledFor" must be YYYY-MM-DDTHH:mm.') : undefined;
};

/** Optional stops between pickup and drop: a list of place ids, in order. */
const stopIds = (body: Record<string, unknown>) => {
  const v = body.stopIds;
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((s) => typeof s !== "string" || !s || s.length > 40)) throw badRequest('"stopIds" must be a list of place ids.');
  return v as string[];
};

export const rides = new Hono<AppEnv>()
  // Open to everyone; a signed-in rider with a QuikFly Pass sees fares without the surge.
  .post("/quote", async (c) => {
    const body = await jsonBody(c);
    const token = bearerToken(c);
    const user = token ? await userForToken(c.env.DB, token) : null;
    return c.json(await quoteRides(c.env.DB, oneOf(body, "service", ["bike", "car"] as const), str(body, "pickupId"), str(body, "dropId"), scheduledFor(body), stopIds(body), user?.id));
  })
  // A live ride (client declares `rides=live`) moves its search forward on each poll and carries `live`.
  .get("/:id", requireUser, async (c) => {
    const wake = newWake();
    const ride = await getRide(c.env.DB, c.var.user.id, c.req.param("id"), acceptsLiveRides(c.req.header("Accept")), wake);
    wakeUp(c, wake);
    c.header("Cache-Control", "no-store");
    return c.json(ride);
  })
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
      stopIds: stopIds(body),
    }, acceptsLiveRides(c.req.header("Accept")));
    // A live ride is offered to the nearest captain straight away, not at the rider's first poll.
    if (ride.driver === null) {
      const wake = newWake();
      await advanceDispatch(c.env.DB, ride.id, wake);
      wakeUp(c, wake);
    }
    return c.json(ride, 201);
  })
  .post("/:id/cancel", requireUser, async (c) => {
    await cancelRide(c.env.DB, c.var.user.id, c.req.param("id"));
    return c.json({ cancelled: true });
  })
  // A link anyone can open to follow the ride (safety: share trip).
  .post("/:id/share", requireUser, async (c) => c.json(await shareRide(c.env.DB, c.var.user.id, c.req.param("id")), 201));
