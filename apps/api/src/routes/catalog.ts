import { Hono } from "hono";
import { RENTAL_CARS, TOURS, TRAVEL_VEHICLES } from "@quikfly/shared";
import type { AppEnv } from "../env";

export const tours = new Hono<AppEnv>()
  .get("/", (c) => c.json(TOURS));

export const rentals = new Hono<AppEnv>()
  // `city` is accepted for the future; the demo fleet is the same in every city.
  .get("/cars", (c) => c.json(RENTAL_CARS))
  .get("/travel-vehicles", (c) => c.json(TRAVEL_VEHICLES));
