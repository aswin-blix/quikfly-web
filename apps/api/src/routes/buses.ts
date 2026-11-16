import { Hono } from "hono";
import type { AppEnv } from "../env";
import { query } from "../lib/validate";
import { busSeats, searchBuses } from "../services/buses";

export const buses = new Hono<AppEnv>()
  .get("/", (c) => c.json(searchBuses(query(c, "from"), query(c, "to"), query(c, "date"))))
  .get("/:id/seats", (c) => c.json(busSeats(c.req.param("id"), query(c, "date"))));
