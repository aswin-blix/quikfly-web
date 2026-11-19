// Public support: anyone can ask for a callback (signed-in customers' requests are linked to them).
import { Hono } from "hono";
import { CALLBACK_TIMES, LIMITS, SUPPORT_RULES, SUPPORT_TOPICS } from "@quikfly/shared";
import type { AppEnv } from "../env";
import { jsonBody, oneOf, optStr, text } from "../lib/validate";
import { bearerToken } from "../middleware/auth";
import { normalisePhone, userForToken } from "../services/auth";
import { requestCallback } from "../services/support";

export const support = new Hono<AppEnv>()
  // { name, phone, topic, preferredTime, message?, ref? } → the request (201)
  .post("/callbacks", async (c) => {
    const body = await jsonBody(c);
    const token = bearerToken(c);
    const user = token ? await userForToken(c.env.DB, token) : null;
    const message = optStr(body, "message", SUPPORT_RULES.messageMax);
    return c.json(await requestCallback(c.env.DB, {
      name: text(body, "name", LIMITS.nameMin, LIMITS.nameMax),
      phone: normalisePhone(String(body.phone ?? "")),
      topic: oneOf(body, "topic", SUPPORT_TOPICS),
      preferredTime: oneOf(body, "preferredTime", CALLBACK_TIMES),
      message: message?.trim() ? message : undefined,
      ref: optStr(body, "ref", 120),
    }, user?.id ?? null), 201);
  });
