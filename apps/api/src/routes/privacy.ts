// The privacy notice (public): the apps render it and ask for consent against its version.
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getNotice } from "../services/privacy";

export const privacy = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await getNotice(c.env.DB)));
