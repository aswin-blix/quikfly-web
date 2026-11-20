// Public catalog reads: start-up config, holidays and rental cars. Hidden items never appear.
import { withDepartures } from "../services/departures";
import { Hono } from "hono";
import { offerLive, type AppConfig } from "@quikfly/shared";
import { businessDate } from "../config";
import type { AppEnv } from "../env";
import { notFound } from "../lib/errors";
import { visible } from "../services/catalog";
import { getSettings } from "../services/settings";

export const config = new Hono<AppEnv>()
  // Everything the website and the app load once at start-up.
  .get("/", async (c) => {
    const db = c.env.DB;
    const [settings, places, rideOptions, cities, busOperators, popularRoutes, groupDestinations, offers, faqs, surgeRules] = await Promise.all([
      getSettings(db), visible(db, "place"), visible(db, "rideOption"), visible(db, "city"), visible(db, "busOperator"), visible(db, "popularRoute"),
      visible(db, "groupDestination"), visible(db, "offer"), visible(db, "faq"), visible(db, "surgeRule"),
    ]);
    // Only offers within their dates are shown (an expired or not-yet-started code can't be used).
    const today = businessDate();
    const body: AppConfig = { settings, places, rideOptions, cities, busOperators, popularRoutes, groupDestinations, offers: offers.filter((o) => offerLive(o, today)), faqs, surgeRules };
    return c.json(body);
  });

// Packages carry their upcoming group departures (with seats left); none = start any date.
export const tours = new Hono<AppEnv>()
  .get("/", async (c) => c.json(await withDepartures(c.env.DB, await visible(c.env.DB, "tour"))))
  .get("/:slug", async (c) => {
    const tour = (await visible(c.env.DB, "tour")).find((t) => t.slug === c.req.param("slug"));
    if (!tour) throw notFound("That holiday package isn't available.");
    return c.json((await withDepartures(c.env.DB, [tour]))[0]);
  });

export const rentals = new Hono<AppEnv>()
  // `city` is accepted for the future; the fleet is the same in every city for now.
  .get("/cars", async (c) => c.json(await visible(c.env.DB, "rentalCar")))
  .get("/cars/:id", async (c) => {
    const car = (await visible(c.env.DB, "rentalCar")).find((x) => x.id === c.req.param("id"));
    if (!car) throw notFound("That car isn't available.");
    return c.json(car);
  })
  .get("/travel-vehicles", async (c) => c.json(await visible(c.env.DB, "travelVehicle")));
