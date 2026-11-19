// Mock (demo mode) partner application: the same section rules as the API, stored in this
// browser. Demo mode has no staff, so a sent application is approved, and a sticker request
// done, after MOCK_LICENCE_REVIEW_SECONDS (labelled on the page).
import {
  CATALOG_SEED, DEFAULT_SETTINGS, FUEL_TYPES, VENDOR_RULES, VENDOR_SECTIONS, VENDOR_VEHICLE_TYPES, normaliseRegNumber, readyToSubmit, vehicleAgeYears,
  type FuelType, type VendorApplication, type VendorSection, type VendorVehicleType,
} from "@quikfly/shared";
import type { QuikflyApi } from "./contract";
import { MOCK_LICENCE_REVIEW_SECONDS, currentUser, fail, load, save, uid, wait } from "./mock-store";

const KEY = "quikfly.mockVendor";
const PHOTOS = "quikfly.mockVendorPhotos";
type Stored = VendorApplication & { reviewAt?: number; stickerAt?: number };

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const name = (v: unknown, msg: string) => {
  const s = String(v ?? "").trim();
  return s.length >= VENDOR_RULES.nameMin && s.length <= VENDOR_RULES.nameMax ? s : fail(msg);
};

/** Moves a demo application along on its own: approval after submit, live after the sticker request. */
function advance(a: Stored | null): Stored | null {
  if (!a) return a;
  const now = Date.now();
  if (a.status === "submitted" && a.reviewAt && now >= a.reviewAt) {
    a.status = "onboarding";
    a.reviewedAt = new Date().toISOString();
    for (const s of VENDOR_SECTIONS) a.sections[s] = { state: "approved", note: null };
    if (a.vehicle?.audit) a.vehicle.audit = { ...a.vehicle.audit, result: "passed" };
    save(KEY, a);
  }
  if (a.status === "onboarding" && a.stickerAt && now >= a.stickerAt) {
    a.status = "active";
    a.onboarding.stickerDoneAt = new Date().toISOString();
    if (a.vehicle) a.vehicle.status = "active";
    save(KEY, a);
  }
  return a;
}

const mine = () => advance(load<Stored | null>(KEY, null)) ?? fail("Start your application first.");
function editable(a: Stored) {
  if (a.status !== "draft") fail(a.status === "submitted" ? "Your application is with QuikFly for review." : "This application can't be changed now.");
}
/** Marks a section filled when its details are complete (and it isn't approved). */
function refresh(a: Stored, section: VendorSection) {
  const v = a.vehicle;
  const done: Record<VendorSection, boolean> = {
    vehicle: !!a.city && !!v,
    photo: a.hasPhoto,
    bank: !!a.bank,
    rc: !!v?.rc?.hasPhoto && !!v.rc.ownerName,
    insurance: !!v?.insurance?.hasPhoto && !!v.insurance.policyNumber,
    audit: !!v?.audit,
  };
  if (a.sections[section].state !== "approved") a.sections[section] = { state: done[section] ? "filled" : "pending", note: null };
  save(KEY, a);
  return a;
}

/** Reads a photo into a data URL (the page already shrank it). */
const dataUrl = (image: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error("Couldn't read the photo."));
  r.readAsDataURL(image);
});

export const mockVendor: QuikflyApi["vendor"] = {
  async get() { await wait(250); currentUser(); return advance(load<Stored | null>(KEY, null)); },
  async start() {
    await wait(300);
    const u = currentUser();
    const existing = load<Stored | null>(KEY, null);
    if (existing) return existing;
    const a: Stored = {
      id: uid("VN"), status: "draft", name: u.name, phone: u.phone, city: null, hasPhoto: false, bank: null, vehicle: null,
      sections: Object.fromEntries(VENDOR_SECTIONS.map((s) => [s, { state: "pending", note: null }])) as Stored["sections"],
      onboarding: { fee: DEFAULT_SETTINGS.vendorJoiningFee, paidAt: null, agreementAt: null, agreementName: null, stickerRequestedAt: null, stickerDoneAt: null },
      submittedAt: null, reviewedAt: null, note: null,
    };
    save(KEY, a);
    return a;
  },
  async saveSection(section, body) {
    await wait(400);
    const a = mine();
    editable(a);
    const v = a.vehicle;
    const needVehicle = () => v ?? fail("Add your city and vehicle details first.");
    switch (section) {
      case "vehicle": {
        const city = String(body.city ?? "");
        if (!CATALOG_SEED.city.some((c) => c.name === city)) fail("QuikFly doesn't take partners in that city yet.");
        if (!VENDOR_VEHICLE_TYPES.includes(body.type as VendorVehicleType)) fail("Choose the vehicle type.");
        if (!FUEL_TYPES.includes(body.fuel as FuelType)) fail("Choose the fuel type.");
        const reg = normaliseRegNumber(String(body.regNumber ?? ""));
        if (!VENDOR_RULES.regNumber.test(reg)) fail("Enter the registration number as on the RC, e.g. TN57AX9979.");
        const purchase = isDate(body.purchaseDate) ? body.purchaseDate : fail("Pick the purchase date.");
        if (purchase > today()) fail("Purchase date can't be in the future.");
        if (vehicleAgeYears(purchase, today()) >= DEFAULT_SETTINGS.vendorMaxVehicleAgeYears) fail(`Vehicles older than ${DEFAULT_SETTINGS.vendorMaxVehicleAgeYears} years can't join QuikFly.`);
        a.city = city;
        a.vehicle = {
          ...(v ?? { id: uid("VV"), rc: null, insurance: null, audit: null, status: "pending", reviewNote: null, blockedReason: null, docsPending: false, driverId: null }),
          type: body.type as VendorVehicleType, fuel: body.fuel as FuelType, regNumber: reg, purchaseDate: purchase,
        };
        break;
      }
      case "bank": {
        const account = String(body.account ?? "").replace(/\s/g, "");
        const ifsc = String(body.ifsc ?? "").trim().toUpperCase();
        if (!VENDOR_RULES.account.test(account)) fail("Enter the account number (9 to 18 digits).");
        if (!VENDOR_RULES.ifsc.test(ifsc)) fail("Enter the 11-character IFSC, e.g. SBIN0001234.");
        a.bank = { holder: name(body.holder, "Enter the account holder's name."), ifsc, accountLast4: account.slice(-4) };
        break;
      }
      case "rc": {
        const ve = needVehicle();
        const validTill = isDate(body.validTill) && body.validTill > today() ? body.validTill : fail("Registration validity must be a future date.");
        ve.rc = { ownerName: name(body.ownerName, "Enter the owner's name as on the RC."), validTill, hasPhoto: ve.rc?.hasPhoto ?? false };
        break;
      }
      case "insurance": {
        const ve = needVehicle();
        const policy = String(body.policyNumber ?? "").trim().toUpperCase().replace(/\s/g, "");
        if (!VENDOR_RULES.policyNumber.test(policy)) fail("Enter the policy number as on the certificate.");
        const validTill = isDate(body.validTill) && body.validTill > today() ? body.validTill : fail("Insurance validity must be a future date.");
        ve.insurance = { insurer: name(body.insurer, "Enter the insurance company."), policyNumber: policy, validTill, hasPhoto: ve.insurance?.hasPhoto ?? false };
        break;
      }
      case "audit": {
        const ve = needVehicle();
        const day = isDate(body.date) ? body.date : fail("Pick a day for the audit.");
        if (day <= today() || day > addDays(today(), VENDOR_RULES.auditMaxDays)) fail(`Pick a day from tomorrow up to ${VENDOR_RULES.auditMaxDays} days ahead.`);
        if (body.slot !== "morning" && body.slot !== "afternoon") fail("Pick a time slot.");
        ve.audit = { date: day, slot: body.slot as "morning" | "afternoon", result: "booked", note: null };
        break;
      }
    }
    return refresh(a, section);
  },
  async uploadDocument(kind, image) {
    await wait(500);
    const a = mine();
    editable(a);
    if (image.size > VENDOR_RULES.maxPhotoBytes) fail(`Photos can be up to ${VENDOR_RULES.maxPhotoBytes / 1024 / 1024} MB.`);
    if (!(VENDOR_RULES.photoTypes as readonly string[]).includes(image.type)) fail("Upload a JPEG, PNG or WebP photo.");
    if (kind !== "photo" && !a.vehicle) fail("Add your city and vehicle details first.");
    try {
      save(PHOTOS, { ...load<Record<string, string>>(PHOTOS, {}), [kind]: await dataUrl(image) });
    } catch {
      fail("This browser is out of space for demo photos. Try a smaller photo.");
    }
    if (kind === "photo") a.hasPhoto = true;
    else if (kind === "rc") a.vehicle!.rc = { ownerName: a.vehicle!.rc?.ownerName ?? "", validTill: a.vehicle!.rc?.validTill ?? "", hasPhoto: true };
    else a.vehicle!.insurance = { insurer: a.vehicle!.insurance?.insurer ?? "", policyNumber: a.vehicle!.insurance?.policyNumber ?? "", validTill: a.vehicle!.insurance?.validTill ?? "", hasPhoto: true };
    return refresh(a, kind);
  },
  async documentUrl(kind) { await wait(100); return load<Record<string, string>>(PHOTOS, {})[kind] ?? null; },
  async reset() {
    await wait(300);
    const a = mine();
    editable(a);
    save(PHOTOS, {});
    save(KEY, null);
    return mockVendor.start();
  },
  async submit() {
    await wait(400);
    const a = mine();
    editable(a);
    if (!readyToSubmit(a)) fail("Fill in every section before sending your application.");
    Object.assign(a, { status: "submitted", submittedAt: new Date().toISOString(), note: null, reviewAt: Date.now() + MOCK_LICENCE_REVIEW_SECONDS * 1000 });
    save(KEY, a);
    return a;
  },
  async payJoiningFee() {
    await wait(600);
    const a = mine();
    if (a.status !== "onboarding") fail("Onboarding opens once your application is approved.");
    a.onboarding.paidAt ??= new Date().toISOString();
    save(KEY, a);
    return a;
  },
  async acceptAgreement(signedBy) {
    await wait(400);
    const a = mine();
    if (a.status !== "onboarding") fail("Onboarding opens once your application is approved.");
    if (!a.onboarding.paidAt) fail("The agreement opens after the joining fee.");
    a.onboarding.agreementName = name(signedBy, "Enter your full name.");
    a.onboarding.agreementAt ??= new Date().toISOString();
    save(KEY, a);
    return a;
  },
  async requestSticker() {
    await wait(400);
    const a = mine();
    if (a.status !== "onboarding") fail("Onboarding opens once your application is approved.");
    if (!a.onboarding.agreementAt) fail("Sticker and paint open after you accept the agreement.");
    a.onboarding.stickerRequestedAt ??= new Date().toISOString();
    a.stickerAt ??= Date.now() + MOCK_LICENCE_REVIEW_SECONDS * 1000;
    save(KEY, a);
    return a;
  },
};
