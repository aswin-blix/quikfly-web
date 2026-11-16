import { Hono } from "hono";
import type { AppEnv } from "../env";
import { readShare } from "../services/share";

/** Public: no sign-in, so family can follow a shared ride. */
export const share = new Hono<AppEnv>()
  .get("/:token", async (c) => c.json(await readShare(c.env.DB, c.req.param("token"))));
