// Staff endpoints under /v1/admin. Every route past login needs an admin token; routes that
// change data check a permission and write an audit row. Bookings, licences, catalog and
// offers routers mount here as they are added.
import { Hono } from "hono";
import { ADMIN_RULES, SETTING_RULES, checkSetting, checkSettings, type Settings } from "@quikfly/shared";
import type { AppEnv } from "../../env";
import { badRequest } from "../../lib/errors";
import { bearerToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { jsonBody, str } from "../../lib/validate";
import { auditStatement, listAudit } from "../../services/admin/audit";
import { adminLogin, endAdminSession } from "../../services/admin/auth";
import { dashboardStats } from "../../services/admin/stats";
import { getSettings, updateSettings } from "../../services/settings";
import { adminAlerts, adminPushDevices } from "./alerts";
import { adminCatalog } from "./catalog";
import { adminCustomers, adminSos, adminTeam } from "./customers";
import { adminParcels } from "./parcels";
import { adminBookings, adminLicences, adminSupport, adminVendors } from "./operations";

/** Positive page number from `?page=`, default 1. */
const pageParam = (v: string | undefined) => Math.max(1, parseInt(v ?? "1", 10) || 1);

/** Accepts only known settings with allowed values (SETTING_RULES in @quikfly/shared). */
function settingsPatch(body: Record<string, unknown>): Partial<Settings> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    const error = checkSetting(key, value);
    if (error) throw badRequest(error);
    patch[key] = typeof value === "string" ? value.trim() : value;
  }
  if (!Object.keys(patch).length) throw badRequest("Nothing to update.");
  return patch as Partial<Settings>;
}

export const admin = new Hono<AppEnv>()
  .post("/auth/login", async (c) => {
    const body = await jsonBody(c);
    return c.json(await adminLogin(c.env.DB, str(body, "email", 200), str(body, "password", ADMIN_RULES.passwordMax)));
  })
  .post("/auth/logout", requireAdmin(), async (c) => {
    await endAdminSession(c.env.DB, bearerToken(c)!);
    return c.json({ signedOut: true });
  })
  .get("/auth/me", requireAdmin(), (c) => c.json(c.var.admin))

  // Dashboard: ?days=1..statsMaxDays (default 7)
  .get("/stats", requireAdmin("dashboard.view"), async (c) => {
    const days = Math.min(ADMIN_RULES.statsMaxDays, Math.max(1, parseInt(c.req.query("days") ?? "7", 10) || 7));
    return c.json(await dashboardStats(c.env.DB, days));
  })

  // Audit log: ?page=&entity=&entityId=&key= (key: one setting's history)
  .get("/audit", requireAdmin("audit.view"), async (c) => {
    const key = c.req.query("key")?.trim() || undefined;
    if (key && !Object.hasOwn(SETTING_RULES, key)) throw badRequest(`"${key}" isn't a setting.`);
    return c.json(await listAudit(c.env.DB, pageParam(c.req.query("page")), c.req.query("entity")?.trim() || undefined, c.req.query("entityId")?.trim() || undefined, key));
  })

  // Settings: any admin can read, owners change.
  .get("/settings", requireAdmin("dashboard.view"), async (c) => c.json(await getSettings(c.env.DB)))
  .patch("/settings", requireAdmin("settings.edit"), async (c) => {
    const patch = settingsPatch(await jsonBody(c));
    const before = await getSettings(c.env.DB);
    const changed = Object.keys(patch) as (keyof Settings)[];
    // Rules between settings (e.g. surge multiplier <= cap), only those touching what is being saved.
    const crossError = checkSettings({ ...before, ...patch }, changed);
    if (crossError) throw badRequest(crossError);
    // The audit row is written in the same batch as the change (AGENTS.md rule 4).
    const after = await updateSettings(c.env.DB, patch, [auditStatement(c.env.DB, {
      adminId: c.var.admin.id, action: "settings.update", entity: "settings",
      detail: { before: Object.fromEntries(changed.map((k) => [k, before[k]])), after: Object.fromEntries(changed.map((k) => [k, patch[k]])) },
    })]);
    return c.json(after);
  })

  .route("/catalog", adminCatalog)
  .route("/bookings", adminBookings)
  .route("/licences", adminLicences)
  .route("/vendors", adminVendors)
  .route("/support", adminSupport)
  .route("/customers", adminCustomers)
  .route("/parcels", adminParcels)
  .route("/sos", adminSos)
  .route("/team", adminTeam)
  .route("/alerts", adminAlerts)
  .route("/push-devices", adminPushDevices);
