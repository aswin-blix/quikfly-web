// Catalog editing for staff: /v1/admin/catalog/:kind. Each kind needs its own permission
// (CATALOG_DEFS[kind].permission); every change is audited by services/catalog.ts.
import { Hono, type Context } from "hono";
import { CATALOG_DEFS, CATALOG_KINDS, can } from "@quikfly/shared";
import type { AppEnv } from "../../env";
import { badRequest, forbidden } from "../../lib/errors";
import { jsonBody } from "../../lib/validate";
import { requireAdmin } from "../../middleware/admin";
import { createItem, deleteItem, ensureSeeded, listAll, parseKind, resetCatalog, updateItem, type ItemInput } from "../../services/catalog";

/** The kind from the URL, after checking this admin may edit it. */
function kindFor(c: Context<AppEnv>) {
  const kind = parseKind(c.req.param("kind") ?? "");
  if (!can(c.var.admin.role, CATALOG_DEFS[kind].permission)) throw forbidden();
  return kind;
}

function itemInput(body: Record<string, unknown>, requireData: boolean): ItemInput {
  if (requireData && body.data === undefined) throw badRequest('"data" is required.');
  if (body.active !== undefined && typeof body.active !== "boolean") throw badRequest('"active" must be true or false.');
  if (body.sort !== undefined && (typeof body.sort !== "number" || !Number.isInteger(body.sort) || body.sort < 0 || body.sort > 1_000_000)) throw badRequest('"sort" must be a whole number from 0.');
  if (!requireData && body.data === undefined && body.active === undefined && body.sort === undefined) throw badRequest("Nothing to update.");
  return { data: body.data, active: body.active as boolean | undefined, sort: body.sort as number | undefined };
}

export const adminCatalog = new Hono<AppEnv>()
  // Which kinds exist and how many items each has (all roles that edit any catalog).
  .get("/", requireAdmin("dashboard.view"), async (c) => {
    await ensureSeeded(c.env.DB);
    const { results } = await c.env.DB.prepare("SELECT kind, COUNT(*) AS total, SUM(active) AS visible FROM catalog_items GROUP BY kind").all<{ kind: string; total: number; visible: number }>();
    const counts = new Map(results.map((r) => [r.kind, r]));
    return c.json(CATALOG_KINDS.map((kind) => ({ kind, total: counts.get(kind)?.total ?? 0, visible: counts.get(kind)?.visible ?? 0, canEdit: can(c.var.admin.role, CATALOG_DEFS[kind].permission) })));
  })
  // Restore the whole catalog to the seed. Owners only (same as settings).
  .post("/reset", requireAdmin("settings.edit"), async (c) => {
    await resetCatalog(c.env.DB, c.var.admin.id);
    return c.json({ reset: true });
  })
  .get("/:kind", requireAdmin(), async (c) => c.json(await listAll(c.env.DB, kindFor(c))))
  .post("/:kind", requireAdmin(), async (c) => {
    const kind = kindFor(c);
    return c.json(await createItem(c.env.DB, c.var.admin.id, kind, itemInput(await jsonBody(c), true)), 201);
  })
  .put("/:kind/:id", requireAdmin(), async (c) => {
    const kind = kindFor(c);
    return c.json(await updateItem(c.env.DB, c.var.admin.id, kind, c.req.param("id"), itemInput(await jsonBody(c), false)));
  })
  .delete("/:kind/:id", requireAdmin(), async (c) => {
    const kind = kindFor(c);
    await deleteItem(c.env.DB, c.var.admin.id, kind, c.req.param("id"));
    return c.json({ deleted: true });
  });
