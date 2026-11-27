import type { AdminUser, User } from "@quikfly/shared";
import type { CaptainContext } from "./services/drivers";

/** Bindings and variables declared in wrangler.jsonc. */
export interface Env {
  DB: D1Database;
  DEMO_OTP: string;
  ALLOWED_ORIGINS: string;
  /** Secret (optional): a Firebase service account JSON key. Set it to switch phone push on. */
  FCM_SERVICE_ACCOUNT?: string;
  /**
   * Secrets (optional, all three together): VAPID keys for browser push (website and admin), made once
   * with `node scripts/vapid-keys.mjs`. Missing = browser push switched off.
   */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** `mailto:` or `https:` contact the push services may use, e.g. mailto:ops@quikfly.in. */
  VAPID_SUBJECT?: string;
  /** R2 bucket for partner document photos (wrangler.jsonc → r2_buckets). Missing = uploads switched off. */
  DOCS?: R2Bucket;
}

/** Hono app typing shared by every router. `user` is set by requireUser, `admin` by requireAdmin, `captain` by requireDriver. */
export type AppEnv = { Bindings: Env; Variables: { user: User; admin: AdminUser; captain: CaptainContext } };
