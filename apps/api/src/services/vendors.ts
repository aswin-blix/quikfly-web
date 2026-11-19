// Vendor (partner) registration for the QuikFly Partner app: step 1 is an application of
// six sections, each saved on its own and reviewed by staff (services/admin/vendors.ts);
// step 2 is onboarding (joining fee, agreement, sticker & paint). Document photos go to
// R2 (binding DOCS) under vendors/<vendorId>/; the tables keep only their keys.
import {
  AUDIT_SLOTS, FUEL_TYPES, VENDOR_AGREEMENT_VERSION, VENDOR_RULES, VENDOR_SECTIONS, VENDOR_VEHICLE_TYPES,
  normaliseRegNumber, readyToSubmit, vehicleAgeYears,
  type AuditSlot, type SectionState, type VendorApplication, type VendorDocument, type VendorSection, type VendorStatus, type VendorVehicle,
} from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { matches, oneOf, text } from "../lib/validate";
import { visible } from "./catalog";
import { getSettings } from "./settings";

type Json = Record<string, unknown>;
type Sections = VendorApplication["sections"];

export interface VendorRow {
  id: string; user_id: string; status: VendorStatus; city: string | null; photo_key: string | null;
  bank_holder: string | null; bank_ifsc: string | null; bank_account: string | null; sections: string;
  joining_fee: number; paid_at: string | null; agreement_at: string | null; agreement_name: string | null;
  sticker_requested_at: string | null; sticker_done_at: string | null; submitted_at: string | null;
  reviewed_at: string | null; note: string | null; created_at: string; updated_at: string;
  name: string; phone: string;
}
export interface VehicleRow {
  id: string; vendor_id: string; type: VendorVehicle["type"]; fuel: VendorVehicle["fuel"]; reg_number: string; purchase_date: string;
  rc_owner: string | null; rc_valid_till: string | null; rc_key: string | null;
  insurer: string | null; insurance_number: string | null; insurance_valid_till: string | null; insurance_key: string | null;
  audit_date: string | null; audit_slot: AuditSlot | null;
  audit_result: "booked" | "passed" | "failed" | null; audit_note: string | null; status: VendorVehicle["status"]; created_at: string;
  review_note: string | null; blocked_reason: string | null; docs_pending: number; submitted_at: string | null;
}

export const emptySections = (): Sections =>
  Object.fromEntries(VENDOR_SECTIONS.map((s) => [s, { state: "pending" as SectionState, note: null }])) as Sections;

export function parseSections(json: string): Sections {
  const saved = JSON.parse(json || "{}") as Partial<Sections>;
  return { ...emptySections(), ...saved };
}

export const toVehicle = (r: VehicleRow, driverId: string | null = null): VendorVehicle => ({
  id: r.id, type: r.type, fuel: r.fuel, regNumber: r.reg_number, purchaseDate: r.purchase_date,
  rc: r.rc_owner && r.rc_valid_till ? { ownerName: r.rc_owner, validTill: r.rc_valid_till, hasPhoto: !!r.rc_key } : null,
  insurance: r.insurer && r.insurance_number && r.insurance_valid_till
    ? { insurer: r.insurer, policyNumber: r.insurance_number, validTill: r.insurance_valid_till, hasPhoto: !!r.insurance_key } : null,
  audit: r.audit_date && r.audit_slot ? { date: r.audit_date, slot: r.audit_slot, result: r.audit_result ?? "booked", note: r.audit_note } : null,
  status: r.status, reviewNote: r.review_note ?? null, blockedReason: r.blocked_reason ?? null, docsPending: !!r.docs_pending, driverId,
});

export const toApplication = (v: VendorRow, vehicle: VehicleRow | null): VendorApplication => ({
  id: v.id, status: v.status, name: v.name, phone: v.phone, city: v.city, hasPhoto: !!v.photo_key,
  bank: v.bank_holder && v.bank_ifsc && v.bank_account ? { holder: v.bank_holder, ifsc: v.bank_ifsc, accountLast4: v.bank_account.slice(-4) } : null,
  vehicle: vehicle ? toVehicle(vehicle) : null,
  sections: parseSections(v.sections),
  onboarding: {
    fee: v.joining_fee, paidAt: v.paid_at, agreementAt: v.agreement_at, agreementName: v.agreement_name,
    stickerRequestedAt: v.sticker_requested_at, stickerDoneAt: v.sticker_done_at,
  },
  submittedAt: v.submitted_at, reviewedAt: v.reviewed_at, note: v.note,
});

const VENDOR_SELECT = "SELECT v.*, u.name, u.phone FROM vendors v JOIN users u ON u.id = v.user_id";

/** The vendor row and its (first) vehicle, by vendor id or by the signed-in user. */
export async function loadVendor(db: D1Database, by: { userId: string } | { id: string }) {
  const v = "userId" in by
    ? await db.prepare(`${VENDOR_SELECT} WHERE v.user_id = ?`).bind(by.userId).first<VendorRow>()
    : await db.prepare(`${VENDOR_SELECT} WHERE v.id = ?`).bind(by.id).first<VendorRow>();
  if (!v) return null;
  const vehicle = await db.prepare("SELECT * FROM vendor_vehicles WHERE vendor_id = ? ORDER BY created_at LIMIT 1").bind(v.id).first<VehicleRow>();
  return { v, vehicle };
}

async function mine(db: D1Database, userId: string) {
  const found = await loadVendor(db, { userId });
  if (!found) throw notFound("Start your partner application first.");
  return found;
}

/** Step 1 sections can only change while the application is a draft. */
function editable(v: VendorRow) {
  if (v.status === "submitted") throw conflict("Your application is with QuikFly for review. You'll be told if anything needs changing.");
  if (v.status !== "draft") throw conflict("Your application has already been reviewed.");
}

export async function getApplication(db: D1Database, userId: string): Promise<VendorApplication | null> {
  const found = await loadVendor(db, { userId });
  return found ? toApplication(found.v, found.vehicle) : null;
}

export async function startApplication(db: D1Database, userId: string): Promise<VendorApplication> {
  const now = new Date().toISOString();
  await db.prepare("INSERT OR IGNORE INTO vendors (id, user_id, sections, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(uid("VN"), userId, JSON.stringify(emptySections()), now, now).run();
  return (await getApplication(db, userId))!;
}

/** Is this section complete with what's saved? */
function complete(section: VendorSection, v: VendorRow, vehicle: VehicleRow | null): boolean {
  switch (section) {
    case "vehicle": return !!v.city && !!vehicle;
    case "photo": return !!v.photo_key;
    case "bank": return !!(v.bank_holder && v.bank_ifsc && v.bank_account);
    case "rc": return !!(vehicle?.rc_owner && vehicle.rc_valid_till && vehicle.rc_key);
    case "insurance": return !!(vehicle?.insurer && vehicle.insurance_number && vehicle.insurance_valid_till && vehicle.insurance_key);
    case "audit": return !!(vehicle?.audit_date && vehicle.audit_slot);
  }
}

/** Re-reads the vendor and marks a changed section filled (needs review) or still pending. */
async function refreshSection(db: D1Database, userId: string, section: VendorSection) {
  const { v, vehicle } = await mine(db, userId);
  const sections = parseSections(v.sections);
  sections[section] = { state: complete(section, v, vehicle) ? "filled" : "pending", note: null };
  await db.prepare("UPDATE vendors SET sections = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(sections), new Date().toISOString(), v.id).run();
  return toApplication({ ...v, sections: JSON.stringify(sections) }, vehicle);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10); // India date
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function date(body: Json, key: string, label: string) {
  const v = body[key];
  if (typeof v !== "string" || !ISO_DATE.test(v) || Number.isNaN(Date.parse(v))) throw badRequest(`${label} must be a date (YYYY-MM-DD).`);
  return v;
}
export function futureDate(body: Json, key: string, label: string) {
  const v = date(body, key, label);
  if (v < today()) throw badRequest(`${label} has passed. Renew it first, then add the new date.`);
  return v;
}
export const personName = (body: Json, key: string) => text(body, key, VENDOR_RULES.nameMin, VENDOR_RULES.nameMax);

/** Checks a vehicle's type, fuel, registration number (unique across partners) and age. */
export async function parseVehicleDetails(db: D1Database, body: Json, vehicleId: string | null) {
  const settings = await getSettings(db);
  const type = oneOf(body, "type", VENDOR_VEHICLE_TYPES);
  const fuel = oneOf(body, "fuel", FUEL_TYPES);
  const reg = matches(normaliseRegNumber(text(body, "regNumber", 6, 16)), VENDOR_RULES.regNumber, "Enter the registration number as on the RC, e.g. TN57AX9979.");
  const purchase = date(body, "purchaseDate", "Purchase date");
  if (purchase > today()) throw badRequest("Purchase date can't be in the future.");
  if (vehicleAgeYears(purchase, today()) >= settings.vendorMaxVehicleAgeYears) throw badRequest(`Vehicles older than ${settings.vendorMaxVehicleAgeYears} years can't join QuikFly.`);
  const taken = await db.prepare("SELECT 1 FROM vendor_vehicles WHERE reg_number = ? AND id <> ?").bind(reg, vehicleId ?? "").first();
  if (taken) throw conflict("This vehicle is already registered with QuikFly.");
  return { type, fuel, reg, purchase };
}

/** RC details: owner name and a validity date that hasn't passed. */
export const parseRc = (body: Json) => ({ owner: personName(body, "ownerName"), validTill: futureDate(body, "validTill", "Registration validity") });
/** Insurance details: insurer, policy number and a validity date that hasn't passed. */
export const parseInsurance = (body: Json) => ({
  insurer: text(body, "insurer", 2, 60),
  policy: matches(String(body.policyNumber ?? "").trim().toUpperCase().replace(/\s/g, ""), VENDOR_RULES.policyNumber, "Enter the policy number as on the insurance certificate."),
  validTill: futureDate(body, "validTill", "Insurance validity"),
});
/** An audit day from tomorrow up to auditMaxDays ahead, and a slot. */
export function parseAudit(body: Json) {
  const day = date(body, "date", "Audit date");
  if (day <= today() || day > addDays(today(), VENDOR_RULES.auditMaxDays)) throw badRequest(`Pick a day from tomorrow up to ${VENDOR_RULES.auditMaxDays} days ahead.`);
  return { day, slot: oneOf(body, "slot", AUDIT_SLOTS) };
}

/** Saves one step-1 section (photos are uploaded separately, see uploadDocument). */
export async function saveSection(db: D1Database, userId: string, section: VendorSection, body: Json): Promise<VendorApplication> {
  const { v, vehicle } = await mine(db, userId);
  editable(v);
  const now = new Date().toISOString();
  const needVehicle = () => vehicle ?? (() => { throw conflict("Add your city and vehicle details first."); })();
  switch (section) {
    case "vehicle": {
      const city = text(body, "city", 2, 60);
      const cities = (await visible(db, "city")).map((c) => c.name);
      if (!cities.includes(city)) throw badRequest("QuikFly doesn't take partners in that city yet.");
      const { type, fuel, reg, purchase } = await parseVehicleDetails(db, body, vehicle?.id ?? null);
      await db.batch([
        db.prepare("UPDATE vendors SET city = ?, updated_at = ? WHERE id = ?").bind(city, now, v.id),
        vehicle
          ? db.prepare("UPDATE vendor_vehicles SET type = ?, fuel = ?, reg_number = ?, purchase_date = ? WHERE id = ?").bind(type, fuel, reg, purchase, vehicle.id)
          : db.prepare("INSERT INTO vendor_vehicles (id, vendor_id, type, fuel, reg_number, purchase_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(uid("VV"), v.id, type, fuel, reg, purchase, now),
      ]);
      break;
    }
    case "bank": {
      const holder = personName(body, "holder");
      const account = matches(String(body.account ?? "").replace(/\s/g, ""), VENDOR_RULES.account, "Enter the account number (9 to 18 digits).");
      const ifsc = matches(String(body.ifsc ?? "").trim().toUpperCase(), VENDOR_RULES.ifsc, "Enter the 11-character IFSC, e.g. SBIN0001234.");
      await db.prepare("UPDATE vendors SET bank_holder = ?, bank_account = ?, bank_ifsc = ?, updated_at = ? WHERE id = ?").bind(holder, account, ifsc, now, v.id).run();
      break;
    }
    case "rc": {
      const ve = needVehicle();
      const rc = parseRc(body);
      await db.prepare("UPDATE vendor_vehicles SET rc_owner = ?, rc_valid_till = ? WHERE id = ?").bind(rc.owner, rc.validTill, ve.id).run();
      break;
    }
    case "insurance": {
      const ve = needVehicle();
      const ins = parseInsurance(body);
      await db.prepare("UPDATE vendor_vehicles SET insurer = ?, insurance_number = ?, insurance_valid_till = ? WHERE id = ?").bind(ins.insurer, ins.policy, ins.validTill, ve.id).run();
      break;
    }
    case "audit": {
      const ve = needVehicle();
      const audit = parseAudit(body);
      await db.prepare("UPDATE vendor_vehicles SET audit_date = ?, audit_slot = ?, audit_result = 'booked', audit_note = NULL WHERE id = ?").bind(audit.day, audit.slot, ve.id).run();
      break;
    }
    case "photo":
      throw badRequest("Upload your photo with PUT /vendor/documents/photo.");
  }
  return refreshSection(db, userId, section);
}

/** Checks the first bytes so a renamed file can't pass as a photo. */
function sniff(bytes: Uint8Array): "jpg" | "png" | "webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  return null;
}
const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
const SECTION_OF: Record<VendorDocument, VendorSection> = { photo: "photo", rc: "rc", insurance: "insurance" };

/** Checks and stores an image under vendors/<vendorId>/; returns its key. */
export const storeImage = (docs: R2Bucket, vendorId: string, kind: string, body: ArrayBuffer) => storeImageIn(docs, `vendors/${vendorId}`, kind, body);

/** Checks an uploaded photo (size, JPEG/PNG/WebP) and stores it under `folder`; returns its key. */
export async function storeImageIn(docs: R2Bucket, folder: string, kind: string, body: ArrayBuffer) {
  if (!body.byteLength) throw badRequest("Choose a photo to upload.");
  if (body.byteLength > VENDOR_RULES.maxPhotoBytes) throw badRequest(`Photos can be up to ${VENDOR_RULES.maxPhotoBytes / 1024 / 1024} MB.`);
  const ext = sniff(new Uint8Array(body.slice(0, 12)));
  if (!ext) throw badRequest("Upload a JPEG, PNG or WebP photo.");
  const key = `${folder}/${kind}-${crypto.randomUUID()}.${ext}`;
  await docs.put(key, body, { httpMetadata: { contentType: MIME[ext] } });
  return key;
}

/** A stored image as a private, uncached response; null when missing. */
export async function imageResponse(bucket: R2Bucket | undefined, key: string | null | undefined) {
  if (!key) return null;
  const obj = await needBucket(bucket).get(key);
  if (!obj) return null;
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType ?? "image/jpeg", "cache-control": "private, no-store" } });
}

export function needBucket(bucket: R2Bucket | undefined): R2Bucket {
  if (!bucket) throw conflict("Document uploads aren't switched on yet. Please try again later.");
  return bucket;
}

/** Stores a document photo (replacing the old one) and updates its section. */
export async function uploadDocument(db: D1Database, bucket: R2Bucket | undefined, userId: string, kind: VendorDocument, body: ArrayBuffer): Promise<VendorApplication> {
  const docs = needBucket(bucket);
  const { v, vehicle } = await mine(db, userId);
  editable(v);
  if (kind !== "photo" && !vehicle) throw conflict("Add your city and vehicle details first.");
  const key = await storeImage(docs, v.id, kind, body);
  const old = kind === "photo" ? v.photo_key : kind === "rc" ? vehicle!.rc_key : vehicle!.insurance_key;
  if (kind === "photo") await db.prepare("UPDATE vendors SET photo_key = ? WHERE id = ?").bind(key, v.id).run();
  else await db.prepare(`UPDATE vendor_vehicles SET ${kind === "rc" ? "rc_key" : "insurance_key"} = ? WHERE id = ?`).bind(key, vehicle!.id).run();
  if (old) await docs.delete(old).catch(() => undefined);
  return refreshSection(db, userId, SECTION_OF[kind]);
}

/** The stored photo for a document, as a private, uncached response. Null when none. */
export async function documentResponse(bucket: R2Bucket | undefined, v: Pick<VendorRow, "photo_key">, vehicle: Pick<VehicleRow, "rc_key" | "insurance_key"> | null, kind: VendorDocument) {
  const key = kind === "photo" ? v.photo_key : kind === "rc" ? vehicle?.rc_key : vehicle?.insurance_key;
  if (!key) return null;
  const obj = await needBucket(bucket).get(key);
  if (!obj) return null;
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType ?? "image/jpeg", "cache-control": "private, no-store" } });
}

export async function myDocument(db: D1Database, bucket: R2Bucket | undefined, userId: string, kind: VendorDocument) {
  const { v, vehicle } = await mine(db, userId);
  const res = await documentResponse(bucket, v, vehicle, kind);
  if (!res) throw notFound("No photo uploaded yet.");
  return res;
}

/** Clears a draft that hasn't been sent yet (Red Taxi's "Reset"), photos included. */
export async function resetApplication(db: D1Database, bucket: R2Bucket | undefined, userId: string): Promise<VendorApplication> {
  const { v, vehicle } = await mine(db, userId);
  editable(v);
  if (v.submitted_at) throw conflict("Your application has already been sent. Change single sections instead.");
  const keys = [v.photo_key, vehicle?.rc_key, vehicle?.insurance_key].filter((k): k is string => !!k);
  await db.batch([
    db.prepare("DELETE FROM vendor_vehicles WHERE vendor_id = ?").bind(v.id),
    db.prepare("UPDATE vendors SET city = NULL, photo_key = NULL, bank_holder = NULL, bank_ifsc = NULL, bank_account = NULL, sections = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(emptySections()), new Date().toISOString(), v.id),
  ]);
  if (bucket && keys.length) await bucket.delete(keys).catch(() => undefined);
  return (await getApplication(db, userId))!;
}

export async function submitApplication(db: D1Database, userId: string): Promise<VendorApplication> {
  const { v, vehicle } = await mine(db, userId);
  editable(v);
  const app = toApplication(v, vehicle);
  if (!readyToSubmit(app)) throw badRequest("Fill in every section before sending your application.");
  const now = new Date().toISOString();
  await db.prepare("UPDATE vendors SET status = 'submitted', submitted_at = ?, updated_at = ?, note = NULL WHERE id = ? AND status = 'draft'").bind(now, now, v.id).run();
  return (await getApplication(db, userId))!;
}

/** Step 2: the joining fee. Demo: no payment gateway, so nothing is collected (labelled in the app). */
export async function payJoiningFee(db: D1Database, userId: string): Promise<VendorApplication> {
  const { v } = await mine(db, userId);
  if (v.status !== "onboarding") throw conflict("Onboarding opens once your application is approved.");
  if (!v.paid_at) await db.prepare("UPDATE vendors SET paid_at = ?, updated_at = ? WHERE id = ? AND paid_at IS NULL").bind(new Date().toISOString(), new Date().toISOString(), v.id).run();
  return (await getApplication(db, userId))!;
}

export async function acceptAgreement(db: D1Database, userId: string, body: Json): Promise<VendorApplication> {
  const { v } = await mine(db, userId);
  if (v.status !== "onboarding") throw conflict("Onboarding opens once your application is approved.");
  if (!v.paid_at) throw conflict("The agreement opens after the joining fee.");
  const name = personName(body, "name");
  if (body.accept !== true) throw badRequest("Tick the box to accept the agreement.");
  const now = new Date().toISOString();
  await db.prepare("UPDATE vendors SET agreement_at = ?, agreement_name = ?, agreement_version = ?, updated_at = ? WHERE id = ? AND agreement_at IS NULL")
    .bind(now, name, VENDOR_AGREEMENT_VERSION, now, v.id).run();
  return (await getApplication(db, userId))!;
}

/** Asks for the QuikFly sticker and paint; staff mark it done, which makes the vendor live. */
export async function requestSticker(db: D1Database, userId: string): Promise<VendorApplication> {
  const { v } = await mine(db, userId);
  if (v.status !== "onboarding") throw conflict("Onboarding opens once your application is approved.");
  if (!v.agreement_at) throw conflict("Sticker and paint open after you accept the agreement.");
  const now = new Date().toISOString();
  await db.prepare("UPDATE vendors SET sticker_requested_at = COALESCE(sticker_requested_at, ?), updated_at = ? WHERE id = ?").bind(now, now, v.id).run();
  return (await getApplication(db, userId))!;
}

