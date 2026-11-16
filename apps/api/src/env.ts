import type { User } from "@quikfly/shared";

/** Bindings and variables declared in wrangler.jsonc. */
export interface Env {
  DB: D1Database;
  DEMO_OTP: string;
  ALLOWED_ORIGINS: string;
}

/** Hono app typing shared by every router. */
export type AppEnv = { Bindings: Env; Variables: { user: User } };
