import { Hono } from "hono";
import type { AppEnv } from "../env";
import { jsonBody, optStr, str } from "../lib/validate";
import { bearerToken } from "../middleware/auth";
import { endSession, normalisePhone, verifyOtp } from "../services/auth";

export const auth = new Hono<AppEnv>()
  // No SMS is sent yet: every number signs in with the DEMO_OTP code.
  .post("/otp", async (c) => {
    normalisePhone(str(await jsonBody(c), "phone", 20));
    return c.json({ sent: true });
  })
  .post("/verify", async (c) => {
    const body = await jsonBody(c);
    return c.json(await verifyOtp(c.env.DB, c.env.DEMO_OTP, str(body, "phone", 20), str(body, "otp", 10), optStr(body, "name", 60)));
  })
  // Idempotent: signing out twice, or with an expired token, still succeeds.
  .post("/logout", async (c) => {
    const token = bearerToken(c);
    if (token) await endSession(c.env.DB, token);
    return c.json({ signedOut: true });
  });
