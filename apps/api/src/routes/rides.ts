import { Hono } from "hono";
import { PAYMENT_METHODS } from "@quikfly/shared";
import type { AppEnv } from "../env";
import { jsonBody, oneOf, str } from "../lib/validate";
import { requireUser } from "../middleware/auth";
import { bookRide, cancelRide, quoteRides } from "../services/rides";

export const rides = new Hono<AppEnv>()
  .post("/quote", async (c) => {
    const body = await jsonBody(c);
    return c.json(quoteRides(oneOf(body, "service", ["bike", "car"] as const), str(body, "pickupId"), str(body, "dropId")));
  })
  .post("/", requireUser, async (c) => {
    const body = await jsonBody(c);
    const ride = await bookRide(c.env.DB, c.var.user.id, {
      optionId: str(body, "optionId"),
      pickupId: str(body, "pickupId"),
      dropId: str(body, "dropId"),
      payment: oneOf(body, "payment", PAYMENT_METHODS),
    });
    return c.json(ride, 201);
  })
  .post("/:id/cancel", requireUser, async (c) => {
    await cancelRide(c.env.DB, c.var.user.id, c.req.param("id"));
    return c.json({ cancelled: true });
  });
