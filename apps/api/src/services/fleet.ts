// A live partner's fleet: more vehicles (each reviewed by staff, then stickered), drivers
// (staff confirm police verification and training), renewals of expiring documents, and
// active/inactive. Staff actions are in services/admin/fleet.ts; expiry runs from the cron.
import { PATTERNS, VEHICLE_DOCUMENTS, compactCode, type VehicleDocument, type VendorDriver, type VendorFleet } from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { text } from "../lib/validate";
import {
  futureDate, imageResponse, loadVendor, needBucket, parseAudit, parseInsurance, parseRc, parseVehicleDetails, storeImage, toVehicle,
  type VehicleRow,
} from "./vendors";

type Json = Record<string, unknown>;

export interface DriverRow {
  id: string; vendor_id: string; name: string; phone: string; dl_number: string; dl_valid_till: string; dl_key: string | null; self: number;
  status: VendorDriver["status"]; police_verified_at: string | null; training_done_at: string | null; review_note: string | null;
  blocked_reason: string | null; docs_pending: number; vehicle_id: string | null; created_at: string; updated_at: string;
}

/** Blocks the cron adds start with this, so a checked renewal can lift them. */
export const EXPIRED_PREFIX = "Expired: ";

export const toDriver = (r: DriverRow): VendorDriver => ({
  id: r.id, name: r.name, phone: r.phone, dlNumber: r.dl_number, dlValidTill: r.dl_valid_till, hasDlPhoto: !!r.dl_key, status: r.status,
  policeVerifiedAt: r.police_verified_at, trainingDoneAt: r.training_done_at, reviewNote: r.review_note, blockedReason: r.blocked_reason,
  docsPending: !!r.docs_pending, vehicleId: r.vehicle_id, self: !!r.self,
});

export async function fleetOf(db: D1Database, vendorId: string): Promise<VendorFleet> {
  const [{ results: vehicles }, { results: drivers }] = await db.batch([
    db.prepare("SELECT * FROM vendor_vehicles WHERE vendor_id = ? ORDER BY created_at").bind(vendorId),
    db.prepare("SELECT * FROM vendor_drivers WHERE vendor_id = ? ORDER BY created_at").bind(vendorId),
  ]) as [D1Result<VehicleRow>, D1Result<DriverRow>];
  const driverOf = new Map(drivers.filter((d) => d.vehicle_id).map((d) => [d.vehicle_id!, d.id]));
  return { vehicles: vehicles.map((v) => toVehicle(v, driverOf.get(v.id) ?? null)), drivers: drivers.map(toDriver) };
}

async function vendorOf(db: D1Database, userId: string) {
  const found = await loadVendor(db, { userId });
  if (!found) throw notFound("Start your partner application first.");
  return found.v;
}
/** Fleet changes are for live partners. */
async function liveVendor(db: D1Database, userId: string) {
  const v = await vendorOf(db, userId);
  if (v.status !== "active") throw conflict("Your partner account isn't live yet.");
  return v;
}

export async function myFleet(db: D1Database, userId: string) {
  return fleetOf(db, (await vendorOf(db, userId)).id);
}

async function myVehicle(db: D1Database, vendorId: string, id: string) {
  const r = await db.prepare("SELECT * FROM vendor_vehicles WHERE id = ? AND vendor_id = ?").bind(id, vendorId).first<VehicleRow>();
  if (!r) throw notFound("Vehicle not found.");
  return r;
}
async function myDriver(db: D1Database, vendorId: string, id: string) {
  const r = await db.prepare("SELECT * FROM vendor_drivers WHERE id = ? AND vendor_id = ?").bind(id, vendorId).first<DriverRow>();
  if (!r) throw notFound("Driver not found.");
  return r;
}

/** Live vehicles can renew their RC or insurance; staff then check it. */
const RENEWABLE = new Set(["active", "inactive", "blocked"]);

export async function addVehicle(db: D1Database, userId: string, body: Json) {
  const v = await liveVendor(db, userId);
  const d = await parseVehicleDetails(db, body, null);
  await db.prepare("INSERT INTO vendor_vehicles (id, vendor_id, type, fuel, reg_number, purchase_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)")
    .bind(uid("VV"), v.id, d.type, d.fuel, d.reg, d.purchase, new Date().toISOString()).run();
  return fleetOf(db, v.id);
}

/** Saves one part of an added vehicle (details, rc, insurance, audit), or renews rc/insurance on a live one. */
export async function saveVehicle(db: D1Database, userId: string, id: string, part: "details" | "rc" | "insurance" | "audit", body: Json) {
  const v = await liveVendor(db, userId);
  const ve = await myVehicle(db, v.id, id);
  const draft = ve.status === "draft";
  const renewal = (part === "rc" || part === "insurance") && RENEWABLE.has(ve.status);
  if (!draft && !renewal) throw conflict(ve.status === "submitted" ? "This vehicle is with QuikFly for review." : "This part can't be changed now.");
  const pending = renewal ? 1 : 0;
  switch (part) {
    case "details": {
      const d = await parseVehicleDetails(db, body, ve.id);
      await db.prepare("UPDATE vendor_vehicles SET type = ?, fuel = ?, reg_number = ?, purchase_date = ? WHERE id = ?").bind(d.type, d.fuel, d.reg, d.purchase, ve.id).run();
      break;
    }
    case "rc": {
      const rc = parseRc(body);
      await db.prepare("UPDATE vendor_vehicles SET rc_owner = ?, rc_valid_till = ?, docs_pending = MAX(docs_pending, ?) WHERE id = ?").bind(rc.owner, rc.validTill, pending, ve.id).run();
      break;
    }
    case "insurance": {
      const ins = parseInsurance(body);
      await db.prepare("UPDATE vendor_vehicles SET insurer = ?, insurance_number = ?, insurance_valid_till = ?, docs_pending = MAX(docs_pending, ?) WHERE id = ?")
        .bind(ins.insurer, ins.policy, ins.validTill, pending, ve.id).run();
      break;
    }
    case "audit": {
      const a = parseAudit(body);
      await db.prepare("UPDATE vendor_vehicles SET audit_date = ?, audit_slot = ?, audit_result = 'booked', audit_note = NULL WHERE id = ?").bind(a.day, a.slot, ve.id).run();
      break;
    }
  }
  return fleetOf(db, v.id);
}

export async function uploadVehicleDocument(db: D1Database, bucket: R2Bucket | undefined, userId: string, id: string, kind: VehicleDocument, body: ArrayBuffer) {
  const docs = needBucket(bucket);
  const v = await liveVendor(db, userId);
  const ve = await myVehicle(db, v.id, id);
  const renewal = RENEWABLE.has(ve.status);
  if (ve.status !== "draft" && !renewal) throw conflict("This vehicle's photos can't be changed now.");
  const key = await storeImage(docs, v.id, `${ve.id}-${kind}`, body);
  const col = kind === "rc" ? "rc_key" : "insurance_key";
  await db.prepare(`UPDATE vendor_vehicles SET ${col} = ?, docs_pending = MAX(docs_pending, ?) WHERE id = ?`).bind(key, renewal ? 1 : 0, ve.id).run();
  const old = kind === "rc" ? ve.rc_key : ve.insurance_key;
  if (old) await docs.delete(old).catch(() => undefined);
  return fleetOf(db, v.id);
}

export async function vehicleDocument(db: D1Database, bucket: R2Bucket | undefined, vendorId: string, id: string, kind: VehicleDocument) {
  const ve = await myVehicle(db, vendorId, id);
  const res = await imageResponse(bucket, kind === "rc" ? ve.rc_key : ve.insurance_key);
  if (!res) throw notFound("No photo uploaded yet.");
  return res;
}
export async function myVehicleDocument(db: D1Database, bucket: R2Bucket | undefined, userId: string, id: string, kind: VehicleDocument) {
  return vehicleDocument(db, bucket, (await vendorOf(db, userId)).id, id, kind);
}

/** Sends an added vehicle for review once every part (and both photos) is in. */
export async function submitVehicle(db: D1Database, userId: string, id: string) {
  const v = await liveVendor(db, userId);
  const ve = await myVehicle(db, v.id, id);
  if (ve.status !== "draft") throw conflict("Only a vehicle being filled in can be sent.");
  const missing = [
    !(ve.rc_owner && ve.rc_valid_till && ve.rc_key) && "RC",
    !(ve.insurer && ve.insurance_number && ve.insurance_valid_till && ve.insurance_key) && "insurance",
    !(ve.audit_date && ve.audit_slot) && "audit day",
  ].filter(Boolean);
  if (missing.length) throw badRequest(`Add the ${missing.join(", ")} first.`);
  await db.prepare("UPDATE vendor_vehicles SET status = 'submitted', submitted_at = ?, review_note = NULL WHERE id = ? AND status = 'draft'").bind(new Date().toISOString(), ve.id).run();
  return fleetOf(db, v.id);
}

/** The partner takes a vehicle off duty or back on. */
export async function setVehicleActive(db: D1Database, userId: string, id: string, active: boolean) {
  const v = await liveVendor(db, userId);
  const ve = await myVehicle(db, v.id, id);
  if (ve.status !== "active" && ve.status !== "inactive") throw conflict(ve.status === "blocked" ? "QuikFly has blocked this vehicle; see the reason." : "This vehicle isn't live yet.");
  await db.prepare("UPDATE vendor_vehicles SET status = ? WHERE id = ?").bind(active ? "active" : "inactive", ve.id).run();
  return fleetOf(db, v.id);
}

/** Removes a vehicle that never went live (photos too). */
export async function deleteVehicle(db: D1Database, bucket: R2Bucket | undefined, userId: string, id: string) {
  const v = await liveVendor(db, userId);
  const ve = await myVehicle(db, v.id, id);
  if (ve.status !== "draft" && ve.status !== "rejected") throw conflict("Only a vehicle that isn't live can be removed. Take it off duty instead.");
  await db.prepare("DELETE FROM vendor_vehicles WHERE id = ?").bind(ve.id).run();
  const keys = [ve.rc_key, ve.insurance_key].filter((k): k is string => !!k);
  if (bucket && keys.length) await bucket.delete(keys).catch(() => undefined);
  return fleetOf(db, v.id);
}

// ── Drivers ──

function parseLicence(body: Json) {
  const dl = compactCode(String(body.dlNumber ?? ""));
  if (!PATTERNS.licence.test(dl)) throw badRequest("Enter the driving licence number, e.g. TN0920190001234.");
  return { dl, validTill: futureDate(body, "dlValidTill", "Licence validity") };
}

/** Registers a driver (or the partner themselves, `self: true`); staff review before they can drive. */
export async function addDriver(db: D1Database, userId: string, body: Json) {
  const v = await liveVendor(db, userId);
  const self = body.self === true;
  const name = self ? v.name : text(body, "name", 2, 60);
  const phone = self ? v.phone : (() => {
    const digits = String(body.phone ?? "").replace(/\D/g, "").slice(-10);
    if (digits.length !== 10) throw badRequest("Enter the driver's 10-digit mobile number.");
    return `+91 ${digits}`;
  })();
  if (self && await db.prepare("SELECT 1 FROM vendor_drivers WHERE vendor_id = ? AND self = 1").bind(v.id).first()) throw conflict("You're already registered as a driver.");
  const { dl, validTill } = parseLicence(body);
  if (await db.prepare("SELECT 1 FROM vendor_drivers WHERE dl_number = ?").bind(dl).first()) throw conflict("A driver with this licence is already registered with QuikFly.");
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO vendor_drivers (id, vendor_id, name, phone, dl_number, dl_valid_till, self, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(uid("VD"), v.id, name, phone, dl, validTill, self ? 1 : 0, now, now).run();
  return fleetOf(db, v.id);
}

/** Corrects or renews a licence: a submitted or rejected driver goes back for review; a live one is checked as a renewal. */
export async function saveDriverLicence(db: D1Database, userId: string, id: string, body: Json) {
  const v = await liveVendor(db, userId);
  const d = await myDriver(db, v.id, id);
  const { dl, validTill } = parseLicence(body);
  if (dl !== d.dl_number && await db.prepare("SELECT 1 FROM vendor_drivers WHERE dl_number = ? AND id <> ?").bind(dl, d.id).first()) throw conflict("A driver with this licence is already registered with QuikFly.");
  const live = d.status === "active" || d.status === "blocked";
  await db.prepare(
    `UPDATE vendor_drivers SET dl_number = ?, dl_valid_till = ?, updated_at = ?,
       status = CASE WHEN ? THEN status ELSE 'submitted' END, review_note = CASE WHEN ? THEN review_note ELSE NULL END,
       docs_pending = CASE WHEN ? THEN 1 ELSE 0 END WHERE id = ?`,
  ).bind(dl, validTill, new Date().toISOString(), live ? 1 : 0, live ? 1 : 0, live ? 1 : 0, d.id).run();
  return fleetOf(db, v.id);
}

export async function uploadDriverLicence(db: D1Database, bucket: R2Bucket | undefined, userId: string, id: string, body: ArrayBuffer) {
  const docs = needBucket(bucket);
  const v = await liveVendor(db, userId);
  const d = await myDriver(db, v.id, id);
  const key = await storeImage(docs, v.id, `${d.id}-dl`, body);
  const live = d.status === "active" || d.status === "blocked";
  await db.prepare(`UPDATE vendor_drivers SET dl_key = ?, updated_at = ?, docs_pending = CASE WHEN ? THEN 1 ELSE docs_pending END,
      status = CASE WHEN status = 'rejected' THEN 'submitted' ELSE status END WHERE id = ?`).bind(key, new Date().toISOString(), live ? 1 : 0, d.id).run();
  if (d.dl_key) await docs.delete(d.dl_key).catch(() => undefined);
  return fleetOf(db, v.id);
}

export async function driverLicencePhoto(db: D1Database, bucket: R2Bucket | undefined, vendorId: string, id: string) {
  const d = await myDriver(db, vendorId, id);
  const res = await imageResponse(bucket, d.dl_key);
  if (!res) throw notFound("No licence photo uploaded yet.");
  return res;
}
export async function myDriverLicencePhoto(db: D1Database, bucket: R2Bucket | undefined, userId: string, id: string) {
  return driverLicencePhoto(db, bucket, (await vendorOf(db, userId)).id, id);
}

/** Puts an approved driver on a live vehicle (taking any other driver off it), or off any vehicle with null. */
export async function assignDriver(db: D1Database, userId: string, id: string, vehicleId: string | null) {
  const v = await liveVendor(db, userId);
  const d = await myDriver(db, v.id, id);
  if (vehicleId === null) {
    await db.prepare("UPDATE vendor_drivers SET vehicle_id = NULL, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), d.id).run();
    return fleetOf(db, v.id);
  }
  if (d.status !== "active") throw conflict("Only an approved driver can be assigned to a vehicle.");
  const ve = await myVehicle(db, v.id, vehicleId);
  if (ve.status !== "active" && ve.status !== "inactive") throw conflict("Drivers can be assigned to live vehicles only.");
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE vendor_drivers SET vehicle_id = NULL, updated_at = ? WHERE vehicle_id = ? AND id <> ?").bind(now, ve.id, d.id),
    db.prepare("UPDATE vendor_drivers SET vehicle_id = ?, updated_at = ? WHERE id = ?").bind(ve.id, now, d.id),
  ]);
  return fleetOf(db, v.id);
}

export async function removeDriver(db: D1Database, bucket: R2Bucket | undefined, userId: string, id: string) {
  const v = await liveVendor(db, userId);
  const d = await myDriver(db, v.id, id);
  await db.prepare("DELETE FROM vendor_drivers WHERE id = ?").bind(d.id).run();
  if (bucket && d.dl_key) await bucket.delete(d.dl_key).catch(() => undefined);
  return fleetOf(db, v.id);
}

export const isVehicleDocument = (s: string): s is VehicleDocument => (VEHICLE_DOCUMENTS as readonly string[]).includes(s);
