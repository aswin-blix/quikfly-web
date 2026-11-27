import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../env";
import { needCaptain } from "../services/drivers";

/**
 * Requires the signed-in person to be a captain (use after requireUser) and exposes them as `c.var.captain`.
 * Someone whose number has no driver record gets 403 with what to do; whether they may go online is the
 * service's question (captainBlocker), not this one's.
 */
export const requireDriver = createMiddleware<AppEnv>(async (c, next) => {
  c.set("captain", await needCaptain(c.env.DB, c.var.user));
  await next();
});
