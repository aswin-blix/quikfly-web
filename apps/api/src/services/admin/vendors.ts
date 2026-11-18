// Partner (vendor) review queue. Staff approve each application section or send it back
// with a note; then approve the whole application (onboarding opens), send it back for
// changes, or reject it. After the vendor's agreement, staff mark the sticker and paint
// done, which makes the vendor and its vehicle live. Every decision is audited.
import {
  VENDOR_SECTION_LABEL, VENDOR_SECTIONS,
  type AdminVendorDetail, type VendorSection, type VendorStatus, type VendorSummary, type VendorVehicleType,
} from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { documentResponse, loadVendor, parseSections, toApplication } from "../vendors";
import { fleetOf } from "../fleet";
import { balanceOf } from "../partner-trips";
import { getSettings } from "../settings";
import { notify } from "../notifications";
import { auditStatement } from "./audit";

interface SummaryRow {
  id: string; status: VendorStatus; city: string | null; sections: string; submitted_at: string | null; updated_at: string;
  name: string; phone: string; type: VendorVehicleType | null; reg_number: string | null;
}

/** Waiting for review: oldest first. Everything else: most recently changed first. Deleted accounts are left out. */
export async function vendorQueue(db: D1Database, status: VendorStatus): Promise<VendorSummary[]> {
  const order = status === "submitted" ? "v.submitted_at ASC" : "v.updated_at DESC";
  const { results } = await db.prepare(
    `SELECT v.id, v.status, v.city, v.sections, v.submitted_at, v.updated_at, u.name, u.phone,
            (SELECT type FROM vendor_vehicles WHERE vendor_id = v.id ORDER BY created_at LIMIT 1) AS type,
            (SELECT reg_number FROM vendor_vehicles WHERE vendor_id = v.id ORDER BY created_at LIMIT 1) AS reg_number
     FROM vendors v JOIN users u ON u.id = v.user_id WHERE v.status = ? AND u.deleted_at IS NULL ORDER BY ${order} LIMIT 200`,
  ).bind(status).all<SummaryRow>();
  return results.map((r) => {
    const sections = parseSections(r.sections);
    return {
      id: r.id, status: r.status, name: r.name, phone: r.phone, city: r.city,
      vehicle: r.type && r.reg_number ? { type: r.type, regNumber: r.reg_number } : null,
      open: VENDOR_SECTIONS.filter((s) => sections[s].state !== "approved").length,
      submittedAt: r.submitted_at, updatedAt: r.updated_at,
    };
  });
}

async function found(db: D1Database, id: string) {
  const f = await loadVendor(db, { id });
  if (!f) throw notFound("Partner not found.");
  return f;
}

export async function vendorDetail(db: D1Database, id: string): Promise<AdminVendorDetail> {
  const { v, vehicle } = await found(db, id);
  const pending = await db.prepare("SELECT amount_paise FROM vendor_payouts WHERE vendor_id = ? AND status = 'requested'").bind(v.id).first<{ amount_paise: number }>();
  return {
    application: toApplication(v, vehicle), fleet: await fleetOf(db, v.id), bankAccount: v.bank_account, customerId: v.user_id,
    money: { balancePaise: await balanceOf(db, v.id), pendingPayoutPaise: pending?.amount_paise ?? null },
  };
}

export async function vendorDocument(db: D1Database, bucket: R2Bucket | undefined, id: string, kind: "photo" | "rc" | "insurance") {
  const { v, vehicle } = await found(db, id);
  const res = await documentResponse(bucket, v, vehicle, kind);
  if (!res) throw notFound("No photo uploaded for this document.");
  return res;
}

/** Approves one section, or sends it back with a note. The audit section records the audit result. */
export async function reviewSection(db: D1Database, adminId: string, id: string, section: VendorSection, decision: "approve" | "changes", note?: string) {
  const { v, vehicle } = await found(db, id);
  if (v.status !== "submitted") throw conflict("Sections can be reviewed while the application is waiting for review.");
  const sections = parseSections(v.sections);
  if (sections[section].state === "pending") throw conflict("The partner hasn't filled this section in.");
  if (decision === "changes" && !note) throw badRequest("Say what needs changing; the partner sees this note.");
  sections[section] = decision === "approve" ? { state: "approved", note: null } : { state: "changes", note: note! };
  const now = new Date().toISOString();
  const statements = [
    db.prepare("UPDATE vendors SET sections = ?, updated_at = ? WHERE id = ? AND status = 'submitted'").bind(JSON.stringify(sections), now, id),
    auditStatement(db, { adminId, action: `vendor.section.${decision}`, entity: "vendor", entityId: id, detail: { section, ...(note ? { note } : {}) } }),
  ];
  if (section === "audit" && vehicle) {
    statements.push(db.prepare("UPDATE vendor_vehicles SET audit_result = ?, audit_note = ? WHERE id = ?").bind(decision === "approve" ? "passed" : "failed", note ?? null, vehicle.id));
  }
  const [updated] = await db.batch(statements);
  if (!updated.meta.changes) throw conflict("Someone else changed this application just now.");
  return vendorDetail(db, id);
}

/** Finishes a review: approve (onboarding opens), send back for changes, or reject. */
export async function finishReview(db: D1Database, adminId: string, id: string, decision: "approve" | "changes" | "reject", note?: string) {
  const { v, vehicle } = await found(db, id);
  if (v.status !== "submitted") throw conflict("Only an application waiting for review can be decided.");
  const sections = parseSections(v.sections);
  const now = new Date().toISOString();
  let status: VendorStatus;
  let extra = "";
  const binds: unknown[] = [];
  if (decision === "approve") {
    const open = VENDOR_SECTIONS.filter((s) => sections[s].state !== "approved");
    if (open.length) throw conflict(`Approve every section first (${open.map((s) => VENDOR_SECTION_LABEL[s]).join(", ")}).`);
    const fee = (await getSettings(db)).vendorJoiningFee;
    status = "onboarding";
    // The fee is fixed at approval; with no fee the payment step is already done.
    extra = ", joining_fee = ?, paid_at = CASE WHEN ? = 0 THEN ? ELSE paid_at END";
    binds.push(fee, fee, now);
  } else if (decision === "changes") {
    if (!VENDOR_SECTIONS.some((s) => sections[s].state === "changes")) throw conflict("Send at least one section back with a note first.");
    status = "draft";
  } else {
    if (!note) throw badRequest("Give a reason; the partner sees it.");
    status = "rejected";
  }
  const [updated] = await db.batch([
    db.prepare(`UPDATE vendors SET status = ?, reviewed_at = ?, note = ?, updated_at = ?${extra} WHERE id = ? AND status = 'submitted'`)
      .bind(status, now, decision === "reject" ? note! : null, now, ...binds, id),
    auditStatement(db, { adminId, action: `vendor.${decision}`, entity: "vendor", entityId: id, detail: { regNumber: vehicle?.reg_number ?? null, ...(note ? { note } : {}) } }),
  ]);
  if (!updated.meta.changes) throw conflict("Someone else decided this application just now.");
  const fix = VENDOR_SECTIONS.filter((s) => sections[s].state === "changes").map((s) => VENDOR_SECTION_LABEL[s]);
  await notify(db, v.user_id, decision === "approve"
    ? { kind: "vendor.approved", ref: now, title: "Partner application approved", body: "Open the QuikFly Partner app to finish onboarding." }
    : decision === "changes"
      ? { kind: "vendor.changes", ref: now, title: "Your partner application needs changes", body: `Please update: ${fix.join(", ")}. Then send it again.` }
      : { kind: "vendor.rejected", ref: now, title: "Partner application not accepted", body: note! });
  return vendorDetail(db, id);
}

/** Sticker and paint done: the vendor and its vehicle go live. */
export async function markSticker(db: D1Database, adminId: string, id: string) {
  const { v, vehicle } = await found(db, id);
  if (v.status !== "onboarding") throw conflict("This partner isn't in onboarding.");
  if (!v.agreement_at) throw conflict("The partner hasn't accepted the agreement yet.");
  const now = new Date().toISOString();
  const [updated] = await db.batch([
    db.prepare("UPDATE vendors SET status = 'active', sticker_done_at = ?, updated_at = ? WHERE id = ? AND status = 'onboarding'").bind(now, now, id),
    db.prepare("UPDATE vendor_vehicles SET status = 'active' WHERE vendor_id = ? AND status = 'pending'").bind(id),
    auditStatement(db, { adminId, action: "vendor.activate", entity: "vendor", entityId: id, detail: { regNumber: vehicle?.reg_number ?? null } }),
  ]);
  if (!updated.meta.changes) throw conflict("Someone else changed this partner just now.");
  await notify(db, v.user_id, { kind: "vendor.active", ref: now, title: "You're live on QuikFly", body: `${vehicle?.reg_number ?? "Your vehicle"} can now take QuikFly trips.` });
  return vendorDetail(db, id);
}
