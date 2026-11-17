import { Hono } from "hono";
import type { AppEnv } from "../env";
import { query } from "../lib/validate";
import { busSeats, searchBuses } from "../services/buses";

export const buses = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await searchBuses(c.env.DB, query(c, "from"), query(c, "to"), query(c, "date"))))
  // The bus is regenerated from its route and date, so seat prices match the search.
  .get("/:id/seats", async (c) => c.json(await busSeats(c.env.DB, query(c, "from"), query(c, "to"), query(c, "date"), c.req.param("id"))));
