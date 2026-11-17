// The live catalog (places, ride types, tours, cars, offers...) in D1. Customers only ever see
// active items. The first read on a fresh database copies in the seed from @quikfly/shared.
import {
  CATALOG_DEFS, CATALOG_KINDS, CATALOG_SEED, isCatalogKind, validateCatalogData,
  type CatalogItem, type CatalogItemMap, type CatalogKind,
} from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { auditStatement } from "./admin/audit";

/** How long an isolate reuses a kind's visible items. Admin edits clear this isolate's cache at once. */
export const CATALOG_CACHE_MS = 30_000;
const SEEDED_KEY = "catalog.seededAt";

interface Row { kind: CatalogKind; id: string; data: string; active: number; sort: number; updated_at: string }
const toItem = (r: Row): CatalogItem => ({ kind: r.kind, id: r.id, data: JSON.parse(r.data), active: !!r.active, sort: r.sort, updatedAt: r.updated_at });

let seededChecked = false;
const cache = new Map<CatalogKind, { at: number; items: unknown[] }>();

/**
 * The whole seed as ONE statement (rows passed as a JSON array and expanded by json_each),
 * because the free plan allows only 50 D1 queries per request and the seed has ~100 items.
 */
function seedStatements(db: D1Database, now: string) {
  const rows = CATALOG_KINDS.flatMap((kind) => (CATALOG_SEED[kind] as { id: string }[]).map((item, i) => ({ kind, id: item.id, data: JSON.stringify(item), sort: (i + 1) * 10 })));
  return [db.prepare(
    `INSERT OR IGNORE INTO catalog_items (kind, id, data, active, sort, updated_at)
     SELECT json_extract(value, '$.kind'), json_extract(value, '$.id'), json_extract(value, '$.data'), 1, json_extract(value, '$.sort'), ?2
     FROM json_each(?1)`,
  ).bind(JSON.stringify(rows), now)];
}

/** Copies the seed in once per database. Safe to call on every request. */
export async function ensureSeeded(db: D1Database) {
  if (seededChecked) return;
  const done = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(SEEDED_KEY).first();
  if (!done) {
    const now = new Date().toISOString();
    await db.batch([...seedStatements(db, now), db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)").bind(SEEDED_KEY, now)]);
  }
  seededChecked = true;
}

/** Active items of a kind, in display order. Cached briefly per isolate. */
export async function visible<K extends CatalogKind>(db: D1Database, kind: K): Promise<CatalogItemMap[K][]> {
  const hit = cache.get(kind);
  if (hit && Date.now() - hit.at < CATALOG_CACHE_MS) return hit.items as CatalogItemMap[K][];
  await ensureSeeded(db);
  const { results } = await db.prepare("SELECT data FROM catalog_items WHERE kind = ? AND active = 1 ORDER BY sort, id").bind(kind).all<{ data: string }>();
  const items = results.map((r) => JSON.parse(r.data) as CatalogItemMap[K]);
  cache.set(kind, { at: Date.now(), items });
  return items;
}

/** One active item, or 400 with the kind's name. */
export async function visibleById<K extends CatalogKind>(db: D1Database, kind: K, id: string): Promise<CatalogItemMap[K]> {
  const item = (await visible(db, kind)).find((x) => (x as { id: string }).id === id);
  if (!item) throw badRequest(`Unknown ${CATALOG_DEFS[kind].singular}.`);
  return item;
}

/* ───────────── Admin ───────────── */

export function parseKind(kind: string): CatalogKind {
  if (!isCatalogKind(kind)) throw notFound("Unknown catalog section.");
  return kind;
}

export async function listAll(db: D1Database, kind: CatalogKind): Promise<CatalogItem[]> {
  await ensureSeeded(db);
  const { results } = await db.prepare("SELECT * FROM catalog_items WHERE kind = ? ORDER BY sort, id").bind(kind).all<Row>();
  return results.map(toItem);
}

async function getRow(db: D1Database, kind: CatalogKind, id: string) {
  const row = await db.prepare("SELECT * FROM catalog_items WHERE kind = ? AND id = ?").bind(kind, id).first<Row>();
  if (!row) throw notFound(`That ${CATALOG_DEFS[kind].singular} doesn't exist.`);
  return row;
}

async function assertUnique(db: D1Database, kind: CatalogKind, data: Record<string, unknown>, id: string) {
  const field = CATALOG_DEFS[kind].unique;
  if (!field) return;
  const value = String(data[field]).toLowerCase();
  const { results } = await db.prepare("SELECT id, data FROM catalog_items WHERE kind = ? AND id <> ?").bind(kind, id).all<{ id: string; data: string }>();
  if (results.some((r) => String(JSON.parse(r.data)[field]).toLowerCase() === value)) {
    const label = CATALOG_DEFS[kind].fields.find((f) => f.key === field)?.label ?? field;
    throw conflict(`Another ${CATALOG_DEFS[kind].singular} already uses that ${label.toLowerCase()}.`);
  }
}

export interface ItemInput { data: unknown; active?: boolean; sort?: number }

function clean(kind: CatalogKind, input: unknown, id: string) {
  const r = validateCatalogData(kind, input, id);
  if ("error" in r) throw badRequest(r.error);
  return r.data;
}

export async function createItem(db: D1Database, adminId: string, kind: CatalogKind, input: ItemInput): Promise<CatalogItem> {
  await ensureSeeded(db);
  const id = uid(CATALOG_DEFS[kind].idPrefix.toUpperCase()).toLowerCase();
  const data = clean(kind, input.data, id);
  await assertUnique(db, kind, data, id);
  const sort = input.sort ?? ((await db.prepare("SELECT COALESCE(MAX(sort), 0) + 10 AS s FROM catalog_items WHERE kind = ?").bind(kind).first<{ s: number }>())!.s);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO catalog_items (kind, id, data, active, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(kind, id, JSON.stringify(data), input.active === false ? 0 : 1, sort, now),
    auditStatement(db, { adminId, action: "catalog.create", entity: "catalog", entityId: `${kind}/${id}`, detail: { kind, after: data } }),
  ]);
  cache.delete(kind);
  return toItem(await getRow(db, kind, id));
}

export async function updateItem(db: D1Database, adminId: string, kind: CatalogKind, id: string, input: ItemInput): Promise<CatalogItem> {
  const before = await getRow(db, kind, id);
  const data = input.data === undefined ? JSON.parse(before.data) : clean(kind, input.data, id);
  if (input.data !== undefined) await assertUnique(db, kind, data, id);
  const active = input.active === undefined ? before.active : input.active ? 1 : 0;
  const sort = input.sort ?? before.sort;
  await db.batch([
    db.prepare("UPDATE catalog_items SET data = ?, active = ?, sort = ?, updated_at = ? WHERE kind = ? AND id = ?")
      .bind(JSON.stringify(data), active, sort, new Date().toISOString(), kind, id),
    auditStatement(db, {
      adminId, action: input.data === undefined && input.active !== undefined ? (active ? "catalog.show" : "catalog.hide") : "catalog.update",
      entity: "catalog", entityId: `${kind}/${id}`,
      detail: { kind, before: { ...JSON.parse(before.data), active: !!before.active, sort: before.sort }, after: { ...data, active: !!active, sort } },
    }),
  ]);
  cache.delete(kind);
  return toItem(await getRow(db, kind, id));
}

export async function deleteItem(db: D1Database, adminId: string, kind: CatalogKind, id: string) {
  const before = await getRow(db, kind, id);
  await db.batch([
    db.prepare("DELETE FROM catalog_items WHERE kind = ? AND id = ?").bind(kind, id),
    auditStatement(db, { adminId, action: "catalog.delete", entity: "catalog", entityId: `${kind}/${id}`, detail: { kind, before: JSON.parse(before.data) } }),
  ]);
  cache.delete(kind);
}

/** Replaces the catalog with the seed (demo reset). Bookings keep their own copies of what they bought. */
export async function resetCatalog(db: D1Database, adminId: string) {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM catalog_items"),
    ...seedStatements(db, now),
    db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(SEEDED_KEY, now),
    auditStatement(db, { adminId, action: "catalog.reset", entity: "catalog", detail: { kinds: CATALOG_KINDS } }),
  ]);
  cache.clear();
}
