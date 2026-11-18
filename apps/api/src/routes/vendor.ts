// /v1/vendor: partner registration for the QuikFly Partner app. Partners sign in with the
// same phone login as customers; the vendor row hangs off their account.
import { Hono } from "hono";
import { VENDOR_DOCUMENTS, VENDOR_SECTIONS, type VendorDocument, type VendorSection } from "@quikfly/shared";
import type { AppEnv } from "../env";
import { badRequest } from "../lib/errors";
import { jsonBody } from "../lib/validate";
import { requireUser } from "../middleware/auth";
import {
  acceptAgreement, getApplication, myDocument, payJoiningFee, requestSticker, resetApplication, saveSection, startApplication,
  submitApplication, uploadDocument,
} from "../services/vendors";

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
  .post("/onboarding/sticker", async (c) => c.json(await requestSticker(c.env.DB, c.var.user.id)));
