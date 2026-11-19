import { Hono } from "hono";
import type { AppEnv } from "../env";
import { publicTicket } from "../services/bus-changes";

/** Public: the bus m-ticket's QR code opens this, so a conductor can check it without signing in. */
export const tickets = new Hono<AppEnv>()
  .get("/:token", async (c) => c.json(await publicTicket(c.env.DB, c.req.param("token"))));
