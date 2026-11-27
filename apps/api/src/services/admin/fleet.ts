// Staff side of partner fleets: review added vehicles (then sticker & paint), approve drivers
// (police verification and training confirmed), check renewed documents, block and unblock.
// Every decision is audited and the partner gets a "vendor.fleet" notification.
import { formatRegNumber, type FleetReviewItem, type Gender, type VehicleDocument } from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { driverLicencePhoto, EXPIRED_PREFIX, vehicleDocument, type DriverRow } from "../fleet";
import { today, type VehicleRow } from "../vendors";
import { notify } from "../notifications";
import { auditStatement } from "./audit";
import { vendorDetail } from "./vendors";

/** Everything waiting for staff on live partners' fleets, oldest first. Deleted accounts are left out. */
export async function fleetQueue(db: D1Database): Promise<FleetReviewItem[]> {
  const { results } = await db.prepare(
    `SELECT * FROM (
       SELECT ve.id AS vendor_id, u.name AS vendor_name,
              CASE WHEN vv.status = 'submitted' THEN 'vehicle' WHEN vv.status = 'approved' THEN 'vehicle_sticker' ELSE 'vehicle_docs' END AS kind,
              vv.id AS id, vv.reg_number AS label, COALESCE(vv.submitted_at, vv.created_at) AS since
       FROM vendor_vehicles vv JOIN vendors ve ON ve.id = vv.vendor_id JOIN users u ON u.id = ve.user_id
       WHERE u.deleted_at IS NULL AND (vv.status IN ('submitted', 'approved') OR vv.docs_pending = 1)
       UNION ALL
       SELECT ve.id, u.name, CASE WHEN d.status = 'submitted' THEN 'driver' ELSE 'driver_docs' END, d.id, d.name, d.updated_at
       FROM vendor_drivers d JOIN vendors ve ON ve.id = d.vendor_id JOIN users u ON u.id = ve.user_id
       WHERE u.deleted_at IS NULL AND (d.status = 'submitted' OR d.docs_pending = 1)
     ) ORDER BY since LIMIT 200`,
  ).all<{ vendor_id: string; vendor_name: string; kind: FleetReviewItem["kind"]; id: string; label: string; since: string }>();
  return results.map((r) => ({
    vendorId: r.vendor_id, vendorName: r.vendor_name, kind: r.kind, id: r.id,
    label: r.kind.startsWith("vehicle") ? formatRegNumber(r.label) : r.label, since: r.since,
  }));
}

async function vehicleOf(db: D1Database, vendorId: string, id: string) {
  const r = await db.prepare(
    "SELECT vv.*, ve.user_id FROM vendor_vehicles vv JOIN vendors ve ON ve.id = vv.vendor_id WHERE vv.id = ? AND vv.vendor_id = ?",
  ).bind(id, vendorId).first<VehicleRow & { user_id: string }>();
  if (!r) throw notFound("Vehicle not found.");
  return r;
}
async function driverOf(db: D1Database, vendorId: string, id: string) {
  const r = await db.prepare(
    "SELECT d.*, ve.user_id FROM vendor_drivers d JOIN vendors ve ON ve.id = d.vendor_id WHERE d.id = ? AND d.vendor_id = ?",
  ).bind(id, vendorId).first<DriverRow & { user_id: string }>();
  if (!r) throw notFound("Driver not found.");
  return r;
}

/** Runs the change with its audit row; fails if a race changed the row first. */
async function apply(db: D1Database, change: D1PreparedStatement, adminId: string, action: string, entityId: string, detail: Record<string, unknown>) {
  const [res] = await db.batch([change, auditStatement(db, { adminId, action, entity: "vendor", entityId, detail })]);
  if (!res.meta.changes) throw conflict("Someone else changed this just now. Reload and try again.");
}

const reg = (r: Pick<VehicleRow, "reg_number">) => formatRegNumber(r.reg_number);
const docsValid = (r: Pick<VehicleRow, "rc_valid_till" | "insurance_valid_till">) =>
  (r.rc_valid_till ?? "") >= today() && (r.insurance_valid_till ?? "") >= today();

/** An added vehicle: approve (audit passed; sticker next), send back for changes, or reject. */
export async function reviewVehicle(db: D1Database, adminId: string, vendorId: string, id: string, decision: "approve" | "changes" | "reject", note?: string) {
  const ve = await vehicleOf(db, vendorId, id);
  if (ve.status !== "submitted") throw conflict("This vehicle isn't waiting for review.");
  if (decision !== "approve" && !note) throw badRequest("Add a note; the partner sees it.");
  const status = decision === "approve" ? "approved" : decision === "changes" ? "draft" : "rejected";
  await apply(db,
    db.prepare(`UPDATE vendor_vehicles SET status = ?, review_note = ?, audit_result = CASE WHEN ? = 'approved' THEN 'passed' ELSE audit_result END WHERE id = ? AND status = 'submitted'`)
      .bind(status, note ?? null, status, id),
    adminId, `vendor.vehicle.${decision}`, vendorId, { vehicle: ve.reg_number, ...(note ? { note } : {}) });
  await notify(db, ve.user_id, {
    kind: "vendor.fleet", ref: `${id}:${decision}:${Date.now()}`,
    title: decision === "approve" ? `${reg(ve)} approved` : decision === "changes" ? `${reg(ve)} needs changes` : `${reg(ve)} not accepted`,
    body: decision === "approve" ? "Book the sticker and paint with QuikFly; it goes live after that." : note!,
  });
  return vendorDetail(db, vendorId);
}

/** Sticker & paint done on an approved vehicle: it goes live. */
export async function stickerVehicle(db: D1Database, adminId: string, vendorId: string, id: string) {
  const ve = await vehicleOf(db, vendorId, id);
  if (ve.status !== "approved") throw conflict("Approve the vehicle first.");
  await apply(db, db.prepare("UPDATE vendor_vehicles SET status = 'active' WHERE id = ? AND status = 'approved'").bind(id), adminId, "vendor.vehicle.activate", vendorId, { vehicle: ve.reg_number });
  await notify(db, ve.user_id, { kind: "vendor.fleet", ref: `${id}:active`, title: `${reg(ve)} is live`, body: "It can now take QuikFly trips. Assign a driver in the Partner app." });
  return vendorDetail(db, vendorId);
}

/** A renewed RC or insurance: accept it (lifting an expiry block when everything is valid again) or ask for it again. */
export async function reviewVehicleDocs(db: D1Database, adminId: string, vendorId: string, id: string, decision: "approve" | "changes", note?: string) {
  const ve = await vehicleOf(db, vendorId, id);
  if (!ve.docs_pending) throw conflict("No renewed document to check on this vehicle.");
  if (decision === "changes" && !note) throw badRequest("Add a note; the partner sees it.");
  const unblock = decision === "approve" && ve.status === "blocked" && (ve.blocked_reason ?? "").startsWith(EXPIRED_PREFIX) && docsValid(ve);
  await apply(db,
    db.prepare(`UPDATE vendor_vehicles SET docs_pending = 0, review_note = ?, status = CASE WHEN ? THEN 'active' ELSE status END,
        blocked_reason = CASE WHEN ? THEN NULL ELSE blocked_reason END WHERE id = ? AND docs_pending = 1`)
      .bind(decision === "changes" ? note! : null, unblock ? 1 : 0, unblock ? 1 : 0, id),
    adminId, `vendor.vehicle.docs.${decision}`, vendorId, { vehicle: ve.reg_number, ...(note ? { note } : {}) });
  await notify(db, ve.user_id, {
    kind: "vendor.fleet", ref: `${id}:docs:${Date.now()}`,
    title: decision === "approve" ? `${reg(ve)}: renewed document accepted` : `${reg(ve)}: please upload the document again`,
    body: decision === "approve" ? (unblock ? "The vehicle is live again." : "Thanks for keeping it up to date.") : note!,
  });
  return vendorDetail(db, vendorId);
}

export async function blockVehicle(db: D1Database, adminId: string, vendorId: string, id: string, block: boolean, reason?: string) {
  const ve = await vehicleOf(db, vendorId, id);
  if (block) {
    if (ve.status !== "active" && ve.status !== "inactive") throw conflict("Only a live vehicle can be blocked.");
    if (!reason) throw badRequest("Give a reason; the partner sees it.");
    await apply(db, db.prepare("UPDATE vendor_vehicles SET status = 'blocked', blocked_reason = ? WHERE id = ? AND status IN ('active', 'inactive')").bind(reason, id),
      adminId, "vendor.vehicle.block", vendorId, { vehicle: ve.reg_number, reason });
  } else {
    if (ve.status !== "blocked") throw conflict("This vehicle isn't blocked.");
    if (!docsValid(ve)) throw conflict("Its RC or insurance has expired. Ask the partner to upload the renewal and accept it.");
    await apply(db, db.prepare("UPDATE vendor_vehicles SET status = 'active', blocked_reason = NULL WHERE id = ? AND status = 'blocked'").bind(id),
      adminId, "vendor.vehicle.unblock", vendorId, { vehicle: ve.reg_number });
  }
  await notify(db, ve.user_id, { kind: "vendor.fleet", ref: `${id}:${block ? "block" : "unblock"}:${Date.now()}`,
    title: block ? `${reg(ve)} blocked by QuikFly` : `${reg(ve)} unblocked`, body: block ? reason! : "It can take QuikFly trips again." });
  return vendorDetail(db, vendorId);
}

/** A new driver: approve once police verification and training are confirmed, or reject with a reason. */
export async function reviewDriver(db: D1Database, adminId: string, vendorId: string, id: string, decision: "approve" | "reject", opts: { note?: string; policeVerified?: boolean; trainingDone?: boolean; gender?: Gender }) {
  const d = await driverOf(db, vendorId, id);
  if (d.status !== "submitted") throw conflict("This driver isn't waiting for review.");
  if (decision === "approve" && !(opts.policeVerified && opts.trainingDone)) throw badRequest("Confirm police verification and training before approving (2025 aggregator guidelines).");
  if (decision === "reject" && !opts.note) throw badRequest("Give a reason; the partner sees it.");
  if (decision === "approve" && !d.dl_key) throw conflict("The licence photo hasn't been uploaded yet.");
  const now = new Date().toISOString();
  await apply(db,
    decision === "approve"
      ? db.prepare("UPDATE vendor_drivers SET status = 'active', police_verified_at = COALESCE(police_verified_at, ?), training_done_at = COALESCE(training_done_at, ?), review_note = NULL, gender = COALESCE(?, gender), updated_at = ? WHERE id = ? AND status = 'submitted'").bind(now, now, opts.gender ?? null, now, id)
      : db.prepare("UPDATE vendor_drivers SET status = 'rejected', review_note = ?, updated_at = ? WHERE id = ? AND status = 'submitted'").bind(opts.note!, now, id),
    adminId, `vendor.driver.${decision}`, vendorId, { driver: d.name, licence: d.dl_number, ...(opts.note ? { note: opts.note } : {}) });
  await notify(db, d.user_id, { kind: "vendor.fleet", ref: `${id}:${decision}:${Date.now()}`,
    title: decision === "approve" ? `${d.name} approved as a driver` : `${d.name} not approved as a driver`,
    body: decision === "approve" ? "Assign them to a vehicle in the Partner app." : `${opts.note} Fix the licence details to send again.` });
  return vendorDetail(db, vendorId);
}

/** Records (or clears) a driver's gender as staff saw it on their documents: women-only rides go only to women captains. */
export async function setDriverGender(db: D1Database, adminId: string, vendorId: string, id: string, gender: Gender | null) {
  const d = await driverOf(db, vendorId, id);
  await apply(db, db.prepare("UPDATE vendor_drivers SET gender = ?, updated_at = ? WHERE id = ?").bind(gender, new Date().toISOString(), id),
    adminId, "vendor.driver.gender", vendorId, { driver: d.name, gender: gender ?? "not set" });
  return vendorDetail(db, vendorId);
}

export async function reviewDriverDocs(db: D1Database, adminId: string, vendorId: string, id: string, decision: "approve" | "changes", note?: string) {
  const d = await driverOf(db, vendorId, id);
  if (!d.docs_pending) throw conflict("No renewed licence to check for this driver.");
  if (decision === "changes" && !note) throw badRequest("Add a note; the partner sees it.");
  const unblock = decision === "approve" && d.status === "blocked" && (d.blocked_reason ?? "").startsWith(EXPIRED_PREFIX) && d.dl_valid_till >= today();
  await apply(db,
    db.prepare(`UPDATE vendor_drivers SET docs_pending = 0, review_note = ?, status = CASE WHEN ? THEN 'active' ELSE status END,
        blocked_reason = CASE WHEN ? THEN NULL ELSE blocked_reason END, updated_at = ? WHERE id = ? AND docs_pending = 1`)
      .bind(decision === "changes" ? note! : null, unblock ? 1 : 0, unblock ? 1 : 0, new Date().toISOString(), id),
    adminId, `vendor.driver.docs.${decision}`, vendorId, { driver: d.name, ...(note ? { note } : {}) });
  await notify(db, d.user_id, { kind: "vendor.fleet", ref: `${id}:docs:${Date.now()}`,
    title: decision === "approve" ? `${d.name}: renewed licence accepted` : `${d.name}: please upload the licence again`,
    body: decision === "approve" ? (unblock ? "They can drive again." : "Thanks for keeping it up to date.") : note! });
  return vendorDetail(db, vendorId);
}

export async function blockDriver(db: D1Database, adminId: string, vendorId: string, id: string, block: boolean, reason?: string) {
  const d = await driverOf(db, vendorId, id);
  const now = new Date().toISOString();
  if (block) {
    if (d.status !== "active") throw conflict("Only an approved driver can be blocked.");
    if (!reason) throw badRequest("Give a reason; the partner sees it.");
    await apply(db, db.prepare("UPDATE vendor_drivers SET status = 'blocked', blocked_reason = ?, vehicle_id = NULL, updated_at = ? WHERE id = ? AND status = 'active'").bind(reason, now, id),
      adminId, "vendor.driver.block", vendorId, { driver: d.name, reason });
  } else {
    if (d.status !== "blocked") throw conflict("This driver isn't blocked.");
    if (d.dl_valid_till < today()) throw conflict("Their licence has expired. Ask the partner to upload the renewal and accept it.");
    await apply(db, db.prepare("UPDATE vendor_drivers SET status = 'active', blocked_reason = NULL, updated_at = ? WHERE id = ? AND status = 'blocked'").bind(now, id),
      adminId, "vendor.driver.unblock", vendorId, { driver: d.name });
  }
  await notify(db, d.user_id, { kind: "vendor.fleet", ref: `${id}:${block ? "block" : "unblock"}:${Date.now()}`,
    title: block ? `${d.name} blocked by QuikFly` : `${d.name} unblocked`, body: block ? reason! : "They can drive QuikFly trips again." });
  return vendorDetail(db, vendorId);
}

export async function adminVehicleDocument(db: D1Database, bucket: R2Bucket | undefined, vendorId: string, id: string, kind: VehicleDocument) {
  return vehicleDocument(db, bucket, vendorId, id, kind);
}
export async function adminDriverLicence(db: D1Database, bucket: R2Bucket | undefined, vendorId: string, id: string) {
  return driverLicencePhoto(db, bucket, vendorId, id);
}
