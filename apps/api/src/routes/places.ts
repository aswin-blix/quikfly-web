import { Hono } from "hono";
import type { AppEnv } from "../env";
import { searchPlaces } from "../services/places";

export const places = new Hono<AppEnv>()
  .get("/", (c) => c.json(searchPlaces(c.req.query("q") ?? "")));
