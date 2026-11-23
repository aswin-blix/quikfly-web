// Staff alerts (the admin bell) and staff push devices: /v1/admin/alerts, /v1/admin/push-devices.
// Both need `alerts.view` (owner, operations). Reading and marking one's own alerts, and registering
// one's own browser, change nothing about customers or money, so they write no audit row
// (docs/decisions.md, 2026-11-23).
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { PUSH_TOKEN_MAX } from "../../config";
import { badRequest } from "../../lib/errors";
import { jsonBody, oneOf, str } from "../../lib/validate";
import { requireAdmin } from "../../middleware/admin";
import { listStaffAlerts, markStaffAlertsRead, registerAdminDevice, removeAdminDevice } from "../../services/admin/alerts";
import { vapidKeys } from "../../services/webpush";

export const adminAlerts = new Hono<AppEnv>()
  // { items, unread, push }: the newest alerts this role can act on; `push` = the VAPID key, or null when browser push is off.
  .get("/", requireAdmin("alerts.view"), async (c) => {
    const vapid = vapidKeys(c.env);
    return c.json({ ...(await listStaffAlerts(c.env.DB, c.var.admin)), push: vapid ? { vapidPublicKey: vapid.publicKey } : null });
  })
  // { ids: [...] } marks those read for this admin; {} marks everything it can see.
  .post("/read", requireAdmin("alerts.view"), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const ids = body.ids;
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || ids.some((x) => typeof x !== "string"))) throw badRequest('"ids" must be a list of alert ids.');
    return c.json(await markStaffAlertsRead(c.env.DB, c.var.admin, (ids as string[] | undefined) ?? null));
  });

export const adminPushDevices = new Hono<AppEnv>()
  // { token, platform: web | android | ios }: this browser's PushSubscription JSON (or a phone's FCM token).
  .post("/", requireAdmin("alerts.view"), async (c) => {
    const body = await jsonBody(c);
    return c.json(await registerAdminDevice(c.env.DB, c.var.admin.id, str(body, "token", PUSH_TOKEN_MAX), oneOf(body, "platform", ["android", "ios", "web"] as const)), 201);
  })
  .delete("/:token", requireAdmin("alerts.view"), async (c) => c.json(await removeAdminDevice(c.env.DB, c.var.admin.id, c.req.param("token"))));
