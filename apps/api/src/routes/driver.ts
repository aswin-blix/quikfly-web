// /v1/driver: QuikFly Captain. A captain signs in with the same phone login as everyone else; their
// number is matched to a partner's driver record (services/drivers.ts). docs/driver-app-plan.md.
import { Hono } from "hono";
import { NOT_A_CAPTAIN } from "@quikfly/shared";
import type { AppEnv } from "../env";
import { jsonBody } from "../lib/validate";
import { requireUser } from "../middleware/auth";
import { requireDriver } from "../middleware/driver";
import { captainFor, captainProfile, ping, setDuty } from "../services/drivers";

export const driver = new Hono<AppEnv>()
  .use(requireUser)
  // { captain } — null (with `reason`) when this number has no driver record, so the app can explain instead of failing.
  .get("/", async (c) => {
    const captain = await captainFor(c.env.DB, c.var.user);
    return c.json(captain ? { captain: await captainProfile(c.env.DB, captain) } : { captain: null, reason: NOT_A_CAPTAIN });
  })
  // { online, position?: { lat, lng } | { x, y } } → { duty }. A map point is a demo location (setting driverDemoLocation).
  .post("/duty", requireDriver, async (c) => c.json(await setDuty(c.env.DB, c.var.captain, await jsonBody(c))))
  // { position? } → { duty }. The heartbeat while online (DRIVER_RULES.pingIdleSeconds).
  .post("/ping", requireDriver, async (c) => c.json(await ping(c.env.DB, c.var.captain, await jsonBody(c))));
