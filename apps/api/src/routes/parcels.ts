// GET /parcels/options (departures and the declaration) and the public GET /track/:lr.
// Pricing is POST /quotes; booking is POST /bookings; the sender's parcel is GET /bookings/:id/parcel.
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { query } from "../lib/validate";
import { parcelOptions, trackParcel } from "../services/parcels/parcels";

export const parcels = new Hono<AppEnv>()
  .get("/options", async (c) => c.json(await parcelOptions(c.env.DB, query(c, "from"), query(c, "to"))));

/** Public: whoever has the LR number. First names only (PublicTracking). */
export const track = new Hono<AppEnv>()
  .get("/:lr", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(await trackParcel(c.env.DB, c.req.param("lr")));
  });
