import { ADMIN_RULES, type AuditEntry, type Page } from "@quikfly/shared";
import { uid } from "../../lib/random";

export interface AuditEvent {
  /** NULL for scripts. */
  adminId: string | null;
  /** "entity.verb", e.g. "settings.update", "booking.cancel", "licence.approve". */
  action: string;
  entity: string;
  entityId?: string | null;
  /** Usually `{ before, after }` or the request's key fields. Never secrets. */
  detail?: unknown;
}

/** A prepared audit row, so it can join the `db.batch()` of the change it records. */
export function auditStatement(db: D1Database, e: AuditEvent) {
  return db.prepare("INSERT INTO audit_log (id, admin_id, action, entity, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(uid("AU"), e.adminId, e.action, e.entity, e.entityId ?? null, JSON.stringify(e.detail ?? {}), new Date().toISOString());
}

export const audit = (db: D1Database, e: AuditEvent) => auditStatement(db, e).run();

interface AuditRow {
  id: string; admin_id: string | null; admin_name: string | null; action: string; entity: string;
  entity_id: string | null; detail: string; created_at: string;
}

export async function listAudit(db: D1Database, page: number, entity?: string, entityId?: string): Promise<Page<AuditEntry>> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (entity) { where.push("a.entity = ?"); params.push(entity); }
  if (entityId) { where.push("a.entity_id = ?"); params.push(entityId); }
  const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pageSize = ADMIN_RULES.pageSize;

  const [count, rows] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM audit_log a ${filter}`).bind(...params),
    db.prepare(
      `SELECT a.*, u.name AS admin_name FROM audit_log a LEFT JOIN admin_users u ON u.id = a.admin_id
       ${filter} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    ).bind(...params, pageSize, (page - 1) * pageSize),
  ]);
  const items = (rows.results as AuditRow[]).map((r): AuditEntry => ({
    id: r.id,
    admin: r.admin_id ? { id: r.admin_id, name: r.admin_name ?? "Removed admin" } : null,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    detail: JSON.parse(r.detail),
    createdAt: r.created_at,
  }));
  return { items, total: (count.results[0] as { n: number }).n, page, pageSize };
}
