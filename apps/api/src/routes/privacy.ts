// The privacy notice (public): the apps render it and ask for consent against its version.
import { Hono } from "hono";
import { DRIVER_RULES, captainNotice } from "@quikfly/shared";
import type { AppEnv } from "../env";
import { getNotice } from "../services/privacy";

export const privacy = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await getNotice(c.env.DB)))
  // QuikFly Captain's own notice (drivers' location and trips); captains agree with POST /driver/notice.
  .get("/captain", (c) => c.json(captainNotice({ busySeconds: DRIVER_RULES.pingBusySeconds, idleSeconds: DRIVER_RULES.pingIdleSeconds })));
