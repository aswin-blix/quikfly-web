// /v1/vendor: partner registration for the QuikFly Partner app. Partners sign in with the
// same phone login as customers; the vendor row hangs off their account.
import { Hono } from "hono";
import { VENDOR_DOCUMENTS, VENDOR_SECTIONS, type VendorDocument, type VendorSection } from "@quikfly/shared";
import type { AppEnv } from "../env";
import { badRequest } from "../lib/errors";
import { jsonBody } from "../lib/validate";
import { requireUser } from "../middleware/auth";
import {
  addDriver, addVehicle, assignDriver, deleteVehicle, isVehicleDocument, myDriverLicencePhoto, myFleet, myVehicleDocument, removeDriver,
  saveDriverLicence, saveVehicle, setVehicleActive, submitVehicle, uploadDriverLicence, uploadVehicleDocument,
} from "../services/fleet";
import {
  acceptAgreement, getApplication, myDocument, payJoiningFee, requestSticker, resetApplication, saveSection, startApplication,
  submitApplication, uploadDocument,
} from "../services/vendors";

const VEHICLE_PARTS = ["details", "rc", "insurance", "audit"] as const;
type VehiclePart = (typeof VEHICLE_PARTS)[number];

const section = (s: string): VendorSection => {
  if (!VENDOR_SECTIONS.includes(s as VendorSection)) throw badRequest(`Unknown section. Use one of: ${VENDOR_SECTIONS.join(", ")}.`);
  return s as VendorSection;
};
const doc = (s: string): VendorDocument => {
  if (!VENDOR_DOCUMENTS.includes(s as VendorDocument)) throw badRequest(`Unknown document. Use one of: ${VENDOR_DOCUMENTS.join(", ")}.`);
  return s as VendorDocument;
};

export const vendor = new Hono<AppEnv>()
  .use(requireUser)
  // { application } — null until the partner starts one.
  .get("/", async (c) => c.json({ application: await getApplication(c.env.DB, c.var.user.id) }))
  .post("/", async (c) => c.json(await startApplication(c.env.DB, c.var.user.id), 201))
  .put("/sections/:section", async (c) => c.json(await saveSection(c.env.DB, c.var.user.id, section(c.req.param("section")), await jsonBody(c))))
  // Raw image body (JPEG, PNG or WebP, up to VENDOR_RULES.maxPhotoBytes).
  .put("/documents/:kind", async (c) => c.json(await uploadDocument(c.env.DB, c.env.DOCS, c.var.user.id, doc(c.req.param("kind")), await c.req.arrayBuffer())))
  .get("/documents/:kind", async (c) => myDocument(c.env.DB, c.env.DOCS, c.var.user.id, doc(c.req.param("kind"))))
  .post("/reset", async (c) => c.json(await resetApplication(c.env.DB, c.env.DOCS, c.var.user.id)))
  .post("/submit", async (c) => c.json(await submitApplication(c.env.DB, c.var.user.id)))
  .post("/onboarding/payment", async (c) => c.json(await payJoiningFee(c.env.DB, c.var.user.id)))
  // { name, accept: true }
  .post("/onboarding/agreement", async (c) => c.json(await acceptAgreement(c.env.DB, c.var.user.id, await jsonBody(c))))
  .post("/onboarding/sticker", async (c) => c.json(await requestSticker(c.env.DB, c.var.user.id)))

  // ── Fleet (live partners): vehicles and drivers. Each change returns the whole fleet. ──
  .get("/fleet", async (c) => c.json(await myFleet(c.env.DB, c.var.user.id)))
  // { type, fuel, regNumber, purchaseDate } → a draft vehicle to fill in and send
  .post("/vehicles", async (c) => c.json(await addVehicle(c.env.DB, c.var.user.id, await jsonBody(c)), 201))
  .put("/vehicles/:id/documents/:kind", async (c) => {
    const kind = c.req.param("kind");
    if (!isVehicleDocument(kind)) throw badRequest("Use rc or insurance.");
    return c.json(await uploadVehicleDocument(c.env.DB, c.env.DOCS, c.var.user.id, c.req.param("id"), kind, await c.req.arrayBuffer()));
  })
  .get("/vehicles/:id/documents/:kind", async (c) => {
    const kind = c.req.param("kind");
    if (!isVehicleDocument(kind)) throw badRequest("Use rc or insurance.");
    return myVehicleDocument(c.env.DB, c.env.DOCS, c.var.user.id, c.req.param("id"), kind);
  })
  // part: details | rc | insurance | audit (rc/insurance on a live vehicle = a renewal staff check).
  // Registered after the documents routes so /documents/… never lands here.
  .put("/vehicles/:id/:part", async (c) => {
    const part = c.req.param("part");
    if (!VEHICLE_PARTS.includes(part as VehiclePart)) throw badRequest(`Use one of: ${VEHICLE_PARTS.join(", ")}.`);
    return c.json(await saveVehicle(c.env.DB, c.var.user.id, c.req.param("id"), part as VehiclePart, await jsonBody(c)));
  })
  .post("/vehicles/:id/submit", async (c) => c.json(await submitVehicle(c.env.DB, c.var.user.id, c.req.param("id"))))
  // { active: boolean } — take a live vehicle off duty or back on
  .patch("/vehicles/:id", async (c) => {
    const body = await jsonBody(c);
    if (typeof body.active !== "boolean") throw badRequest('"active" must be true or false.');
    return c.json(await setVehicleActive(c.env.DB, c.var.user.id, c.req.param("id"), body.active));
  })
  .delete("/vehicles/:id", async (c) => c.json(await deleteVehicle(c.env.DB, c.env.DOCS, c.var.user.id, c.req.param("id"))))
  // { name, phone, dlNumber, dlValidTill } or { self: true, dlNumber, dlValidTill }
  .post("/drivers", async (c) => c.json(await addDriver(c.env.DB, c.var.user.id, await jsonBody(c)), 201))
  .put("/drivers/:id/licence", async (c) => c.json(await saveDriverLicence(c.env.DB, c.var.user.id, c.req.param("id"), await jsonBody(c))))
  .put("/drivers/:id/documents/dl", async (c) => c.json(await uploadDriverLicence(c.env.DB, c.env.DOCS, c.var.user.id, c.req.param("id"), await c.req.arrayBuffer())))
  .get("/drivers/:id/documents/dl", async (c) => myDriverLicencePhoto(c.env.DB, c.env.DOCS, c.var.user.id, c.req.param("id")))
  // { vehicleId: string | null }
  .post("/drivers/:id/assign", async (c) => {
    const body = await jsonBody(c);
    if (body.vehicleId !== null && typeof body.vehicleId !== "string") throw badRequest('"vehicleId" must be a vehicle id or null.');
    return c.json(await assignDriver(c.env.DB, c.var.user.id, c.req.param("id"), body.vehicleId as string | null));
  })
  .delete("/drivers/:id", async (c) => c.json(await removeDriver(c.env.DB, c.env.DOCS, c.var.user.id, c.req.param("id"))));
