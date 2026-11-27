// /v1/driver: QuikFly Captain. A captain signs in with the same phone login as everyone else; their
// number is matched to a partner's driver record (services/drivers.ts). Offers and the trip are in
// services/driver-rides.ts. docs/driver-app-plan.md.
import { Hono } from "hono";
import { CAPTAIN_RELEASE_REASONS, NOT_A_CAPTAIN } from "@quikfly/shared";
import type { AppEnv } from "../env";
import { jsonBody, oneOf, str } from "../lib/validate";
import { newWake, wakeUp } from "../lib/wake";
import { requireUser } from "../middleware/auth";
import { requireDriver } from "../middleware/driver";
import { captainFor, captainProfile, ping, setDuty } from "../services/drivers";
import {
  acceptOffer, captainState, captainSummary, completeTrip, declineOffer, markArrived, pingDispatch, releaseRide, startTrip,
} from "../services/driver-rides";

const RELEASE_REASON_IDS = CAPTAIN_RELEASE_REASONS.map((r) => r.id);

export const driver = new Hono<AppEnv>()
  .use(requireUser)
  // Never cached: every answer here is the captain's state at this moment.
  .use(async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  })
  // { captain } — null (with `reason`) when this number has no driver record, so the app can explain instead of failing.
  .get("/", async (c) => {
    const captain = await captainFor(c.env.DB, c.var.user);
    return c.json(captain ? { captain: await captainProfile(c.env.DB, captain) } : { captain: null, reason: NOT_A_CAPTAIN });
  })
  // { online, position?: { lat, lng } | { x, y } } → state. A map point is a demo location (setting driverDemoLocation).
  .post("/duty", requireDriver, async (c) => {
    await setDuty(c.env.DB, c.var.captain, await jsonBody(c));
    return c.json(await captainState(c.env.DB, c.var.captain));
  })
  // { position? } → state { duty, offer, ride }. The heartbeat (DRIVER_RULES.pingIdleSeconds, pingBusySeconds).
  .post("/ping", requireDriver, async (c) => {
    await ping(c.env.DB, c.var.captain, await jsonBody(c));
    const wake = newWake();
    await pingDispatch(c.env.DB, wake);
    wakeUp(c, wake);
    return c.json(await captainState(c.env.DB, c.var.captain));
  })
  .get("/summary", requireDriver, async (c) => c.json(await captainSummary(c.env.DB, c.var.captain)))
  .post("/offers/:rideId/accept", requireDriver, async (c) => c.json(await acceptOffer(c.env.DB, c.var.captain, c.req.param("rideId"))))
  .post("/offers/:rideId/decline", requireDriver, async (c) => {
    const wake = newWake();
    const state = await declineOffer(c.env.DB, c.var.captain, c.req.param("rideId"), wake);
    wakeUp(c, wake);
    return c.json(state);
  })
  .post("/rides/:id/arrived", requireDriver, async (c) => c.json(await markArrived(c.env.DB, c.var.captain, c.req.param("id"))))
  // { otp }: the rider's ride PIN.
  .post("/rides/:id/start", requireDriver, async (c) => c.json(await startTrip(c.env.DB, c.var.captain, c.req.param("id"), str(await jsonBody(c), "otp", 12))))
  .post("/rides/:id/complete", requireDriver, async (c) => c.json(await completeTrip(c.env.DB, c.var.captain, c.req.param("id"))))
  // { reason } (CAPTAIN_RELEASE_REASONS): gives the ride back before the trip starts.
  .post("/rides/:id/cancel", requireDriver, async (c) => {
    const reason = oneOf(await jsonBody(c), "reason", RELEASE_REASON_IDS);
    const wake = newWake();
    const state = await releaseRide(c.env.DB, c.var.captain, c.req.param("id"), reason, wake);
    wakeUp(c, wake);
    return c.json(state);
  });
