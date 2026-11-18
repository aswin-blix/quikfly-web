// Operations endpoints for staff: /v1/admin/bookings, /v1/admin/licences and /v1/admin/vendors.
import { Hono } from "hono";
import { ADMIN_RULES, BOOKING_STATUSES, LICENCE_QUEUE_STATUSES, PATTERNS, VENDOR_DOCUMENTS, VENDOR_SECTIONS, VENDOR_STATUSES, type BookingFilters } from "@quikfly/shared";
import { SERVICE_KEYS } from "../../config";
import type { AppEnv } from "../../env";
import { badRequest } from "../../lib/errors";
import { jsonBody, text } from "../../lib/validate";
import { requireAdmin } from "../../middleware/admin";
import { adminCancel, adminComplete, bookingDetail, searchBookings } from "../../services/admin/bookings";
import { licenceQueue, reviewLicence } from "../../services/admin/licences";
import { finishReview, markSticker, reviewSection, vendorDetail, vendorDocument, vendorQueue } from "../../services/admin/vendors";
import {
  adminDriverLicence, adminVehicleDocument, blockDriver, blockVehicle, fleetQueue, reviewDriver, reviewDriverDocs, reviewVehicle, reviewVehicleDocs, stickerVehicle,
} from "../../services/admin/fleet";

const pick = <T extends string>(v: string | undefined, allowed: readonly T[], name: string): T | undefined => {
  if (!v) return undefined;
  if (!allowed.includes(v as T)) throw badRequest(`"${name}" must be one of: ${allowed.join(", ")}.`);
  return v as T;
};
const date = (v: string | undefined, name: string) => {
  if (!v) return undefined;
  if (!PATTERNS.isoDate.test(v)) throw badRequest(`"${name}" must be YYYY-MM-DD.`);
  return v;
};
const reason = (body: Record<string, unknown>) => text(body, "reason", ADMIN_RULES.reasonMin, ADMIN_RULES.reasonMax);

export const adminBookings = new Hono<AppEnv>()
  // ?q=&status=&service=&from=&to=&page=
  .get("/", requireAdmin("bookings.view"), async (c) => {
    const q = c.req.query();
    const f: BookingFilters = {
      q: q.q?.trim().slice(0, 60) || undefined,
      status: pick(q.status, BOOKING_STATUSES, "status"),
      service: pick(q.service, SERVICE_KEYS, "service"),
      from: date(q.from, "from"),
      to: date(q.to, "to"),
      page: Math.max(1, parseInt(q.page ?? "1", 10) || 1),
    };
    return c.json(await searchBookings(c.env.DB, f));
  })
  .get("/:id", requireAdmin("bookings.view"), async (c) => c.json(await bookingDetail(c.env.DB, c.req.param("id"))))
  // { reason } — refunds a wallet payment to the customer's wallet.
  .post("/:id/cancel", requireAdmin("bookings.manage"), async (c) =>
    c.json(await adminCancel(c.env.DB, c.var.admin.id, c.req.param("id"), reason(await jsonBody(c)))))
  .post("/:id/complete", requireAdmin("bookings.manage"), async (c) =>
    c.json(await adminComplete(c.env.DB, c.var.admin.id, c.req.param("id"))));

export const adminLicences = new Hono<AppEnv>()
  // ?status=pending (default) | rejected | verified
  .get("/", requireAdmin("licences.review"), async (c) =>
    c.json(await licenceQueue(c.env.DB, pick(c.req.query("status"), LICENCE_QUEUE_STATUSES, "status") ?? "pending")))
  .post("/:userId/approve", requireAdmin("licences.review"), async (c) => {
    await reviewLicence(c.env.DB, c.var.admin.id, c.req.param("userId"), "approve");
    return c.json({ status: "verified" });
  })
  // { reason } — shown to the customer, who can submit again.
  .post("/:userId/reject", requireAdmin("licences.review"), async (c) => {
    await reviewLicence(c.env.DB, c.var.admin.id, c.req.param("userId"), "reject", reason(await jsonBody(c)));
    return c.json({ status: "rejected" });
  });

// Partner (vendor) applications from the QuikFly Partner app.
const note = (body: Record<string, unknown>) => (typeof body.note === "string" && body.note.trim() ? text(body, "note", 3, ADMIN_RULES.reasonMax) : undefined);
export const adminVendors = new Hono<AppEnv>()
  // Live partners' vehicles and drivers waiting for staff (must come before /:id).
  .get("/fleet-queue", requireAdmin("vendors.review"), async (c) => c.json(await fleetQueue(c.env.DB)))
  // ?status=submitted (default) | draft | onboarding | active | rejected | blocked
  .get("/", requireAdmin("vendors.review"), async (c) =>
    c.json(await vendorQueue(c.env.DB, pick(c.req.query("status"), VENDOR_STATUSES, "status") ?? "submitted")))
  .get("/:id", requireAdmin("vendors.review"), async (c) => c.json(await vendorDetail(c.env.DB, c.req.param("id"))))
  .get("/:id/documents/:kind", requireAdmin("vendors.review"), async (c) =>
    vendorDocument(c.env.DB, c.env.DOCS, c.req.param("id"), pick(c.req.param("kind"), VENDOR_DOCUMENTS, "kind")!))
  // { decision: "approve" | "changes", note? } — a note is required to send a section back.
  .post("/:id/sections/:section", requireAdmin("vendors.review"), async (c) => {
    const body = await jsonBody(c);
    const decision = pick(String(body.decision ?? ""), ["approve", "changes"] as const, "decision");
    if (!decision) throw badRequest('"decision" is required.');
    return c.json(await reviewSection(c.env.DB, c.var.admin.id, c.req.param("id"), pick(c.req.param("section"), VENDOR_SECTIONS, "section")!, decision, note(body)));
  })
  // { decision: "approve" | "changes" | "reject", note? } — a note is required to reject.
  .post("/:id/review", requireAdmin("vendors.review"), async (c) => {
    const body = await jsonBody(c);
    const decision = pick(String(body.decision ?? ""), ["approve", "changes", "reject"] as const, "decision");
    if (!decision) throw badRequest('"decision" is required.');
    return c.json(await finishReview(c.env.DB, c.var.admin.id, c.req.param("id"), decision, note(body)));
  })
  .post("/:id/sticker", requireAdmin("vendors.review"), async (c) => c.json(await markSticker(c.env.DB, c.var.admin.id, c.req.param("id"))))

  // Fleet: vehicles added after joining, and drivers.
  .get("/:id/vehicles/:vid/documents/:kind", requireAdmin("vendors.review"), async (c) =>
    adminVehicleDocument(c.env.DB, c.env.DOCS, c.req.param("id"), c.req.param("vid"), pick(c.req.param("kind"), ["rc", "insurance"] as const, "kind")!))
  // { decision: approve | changes | reject, note? }
  .post("/:id/vehicles/:vid/review", requireAdmin("vendors.review"), async (c) => {
    const body = await jsonBody(c);
    const decision = pick(String(body.decision ?? ""), ["approve", "changes", "reject"] as const, "decision");
    if (!decision) throw badRequest('"decision" is required.');
    return c.json(await reviewVehicle(c.env.DB, c.var.admin.id, c.req.param("id"), c.req.param("vid"), decision, note(body)));
  })
  .post("/:id/vehicles/:vid/sticker", requireAdmin("vendors.review"), async (c) => c.json(await stickerVehicle(c.env.DB, c.var.admin.id, c.req.param("id"), c.req.param("vid"))))
  // { decision: approve | changes, note? } — a renewed RC or insurance
  .post("/:id/vehicles/:vid/docs", requireAdmin("vendors.review"), async (c) => {
    const body = await jsonBody(c);
    const decision = pick(String(body.decision ?? ""), ["approve", "changes"] as const, "decision");
    if (!decision) throw badRequest('"decision" is required.');
    return c.json(await reviewVehicleDocs(c.env.DB, c.var.admin.id, c.req.param("id"), c.req.param("vid"), decision, note(body)));
  })
  // { block: boolean, note? } — a reason is required to block
  .post("/:id/vehicles/:vid/block", requireAdmin("vendors.review"), async (c) => {
    const body = await jsonBody(c);
    if (typeof body.block !== "boolean") throw badRequest('"block" must be true or false.');
    return c.json(await blockVehicle(c.env.DB, c.var.admin.id, c.req.param("id"), c.req.param("vid"), body.block, note(body)));
  })
  .get("/:id/drivers/:did/documents/dl", requireAdmin("vendors.review"), async (c) => adminDriverLicence(c.env.DB, c.env.DOCS, c.req.param("id"), c.req.param("did")))
  // { decision: approve | reject, note?, policeVerified?, trainingDone? }
  .post("/:id/drivers/:did/review", requireAdmin("vendors.review"), async (c) => {
    const body = await jsonBody(c);
    const decision = pick(String(body.decision ?? ""), ["approve", "reject"] as const, "decision");
    if (!decision) throw badRequest('"decision" is required.');
    return c.json(await reviewDriver(c.env.DB, c.var.admin.id, c.req.param("id"), c.req.param("did"), decision,
      { note: note(body), policeVerified: body.policeVerified === true, trainingDone: body.trainingDone === true }));
  })
  .post("/:id/drivers/:did/docs", requireAdmin("vendors.review"), async (c) => {
    const body = await jsonBody(c);
    const decision = pick(String(body.decision ?? ""), ["approve", "changes"] as const, "decision");
    if (!decision) throw badRequest('"decision" is required.');
    return c.json(await reviewDriverDocs(c.env.DB, c.var.admin.id, c.req.param("id"), c.req.param("did"), decision, note(body)));
  })
  .post("/:id/drivers/:did/block", requireAdmin("vendors.review"), async (c) => {
    const body = await jsonBody(c);
    if (typeof body.block !== "boolean") throw badRequest('"block" must be true or false.');
    return c.json(await blockDriver(c.env.DB, c.var.admin.id, c.req.param("id"), c.req.param("did"), body.block, note(body)));
  });
