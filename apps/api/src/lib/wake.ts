// A ride offer has seconds to answer, so a request that made one pushes it now instead of waiting for
// the minute cron. The push runs after the response (executionCtx.waitUntil); the poll is the guarantee.
import type { Context } from "hono";
import type { AppEnv } from "../env";
import { pushSoon } from "../scheduled";
import type { Wake } from "../services/dispatch";

/** A fresh flag for one request. */
export const newWake = (): Wake => ({ push: false });

/** Pushes what the request wrote, if it wrote something worth waking a phone for. */
export function wakeUp(c: Context<AppEnv>, wake: Wake) {
  if (!wake.push) return;
  try {
    c.executionCtx.waitUntil(pushSoon(c.env).catch((e) => console.error("push soon", e)));
  } catch {
    // No execution context (tests): the cron pushes it within a minute.
  }
}
