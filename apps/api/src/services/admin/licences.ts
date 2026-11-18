// Driving-licence review queue. Customers submit (PUT /me/licence → pending); staff approve
// or reject with a reason the customer sees. Each decision is audited with the licence number.
import type { LicenceQueueStatus, LicenceReview } from "@quikfly/shared";
import { conflict, notFound } from "../../lib/errors";
import { auditStatement } from "./audit";
import { notify } from "../notifications";

interface Row {
  id: string; name: string; phone: string; licence_status: LicenceQueueStatus; licence_number: string; licence_expiry: string;
  licence_submitted_at: string; licence_reviewed_at: string | null; licence_note: string | null;
}

const toReview = (r: Row): LicenceReview => ({
  customer: { id: r.id, name: r.name, phone: r.phone },
  status: r.licence_status, number: r.licence_number, expiry: r.licence_expiry,
  submittedAt: r.licence_submitted_at, reviewedAt: r.licence_reviewed_at, note: r.licence_note,
});

/** Pending: oldest first (first come, first served). Others: most recently reviewed first. */
export async function licenceQueue(db: D1Database, status: LicenceQueueStatus): Promise<LicenceReview[]> {
  const order = status === "pending" ? "licence_submitted_at ASC" : "licence_reviewed_at DESC";
  const { results } = await db.prepare(
    `SELECT id, name, phone, licence_status, licence_number, licence_expiry, licence_submitted_at, licence_reviewed_at, licence_note
     FROM users WHERE licence_status = ? AND licence_number IS NOT NULL AND deleted_at IS NULL ORDER BY ${order} LIMIT 200`,
  ).bind(status).all<Row>();
  return results.map(toReview);
}

/** Approves or rejects a pending licence. */
export async function reviewLicence(db: D1Database, adminId: string, userId: string, decision: "approve" | "reject", reason?: string) {
  const user = await db.prepare("SELECT licence_status, licence_number FROM users WHERE id = ? AND deleted_at IS NULL").bind(userId).first<{ licence_status: string; licence_number: string | null }>();
  if (!user || !user.licence_number) throw notFound("No licence to review for this customer.");
  if (user.licence_status !== "pending") throw conflict(`This licence is already ${user.licence_status}.`);
  const now = new Date().toISOString();
  const status = decision === "approve" ? "verified" : "rejected";
  const [updated] = await db.batch([
    db.prepare("UPDATE users SET licence_status = ?, licence_note = ?, licence_reviewed_at = ? WHERE id = ? AND licence_status = 'pending'")
      .bind(status, decision === "reject" ? reason ?? null : null, now, userId),
    auditStatement(db, { adminId, action: `licence.${decision}`, entity: "licence", entityId: userId, detail: { number: user.licence_number, ...(reason ? { reason } : {}) } }),
  ]);
  if (!updated.meta.changes) throw conflict("Someone else reviewed this licence just now.");
  // Keyed by the review time, so a resubmitted licence gets its own notification.
  await notify(db, userId, decision === "approve"
    ? { kind: "licence.approved", ref: now, title: "Driving licence verified", body: "You can book self-drive cars now." }
    : { kind: "licence.rejected", ref: now, title: "Driving licence not accepted", body: `${reason ?? "Please check the details"}. Fix it in Account → Driving licence and send it again.` });
}
