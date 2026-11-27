// Operations endpoints for staff: /v1/admin/bookings, /v1/admin/licences and /v1/admin/vendors.
import { staffClose, staffReply, supportQueue, supportTicket } from "../../services/support";
import { Hono } from "hono";
import { ADMIN_RULES, BOOKING_STATUSES, GENDERS, LICENCE_QUEUE_STATUSES, PATTERNS, RENTAL_PHOTO_SIDES, RENTAL_RULES, RENTAL_STAGES, SUPPORT_RULES, VENDOR_DOCUMENTS, VENDOR_SECTIONS, VENDOR_STATUSES, type BookingFilters } from "@quikfly/shared";
import { SERVICE_KEYS } from "../../config";
import type { AppEnv } from "../../env";
import { badRequest } from "../../lib/errors";
import { jsonBody, text } from "../../lib/validate";
import { requireAdmin } from "../../middleware/admin";
import { addNote, adminCancel, adminComplete, bookingDetail, bookingsCsv, exportBookings, searchBookings } from "../../services/admin/bookings";
import { audit } from "../../services/admin/audit";
import { businessDate } from "../../config";
import { adminRental, rentalPhoto, settleRental, settlementPreview } from "../../services/rentals";
import { licenceQueue, reviewLicence } from "../../services/admin/licences";
import { finishReview, markSticker, reviewSection, vendorDetail, vendorDocument, vendorQueue } from "../../services/admin/vendors";
import { assignBookingVendor, assignableVehicles, decidePayout, payoutQueue } from "../../services/admin/partner-money";
import {
  adminDriverLicence, adminVehicleDocument, blockDriver, blockVehicle, fleetQueue, reviewDriver, reviewDriverDocs, reviewVehicle, reviewVehicleDocs, setDriverGender, stickerVehicle,
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

/** The booking list's filters from the query string (shared by the list and the CSV export). */
function bookingFilters(q: Record<string, string>): BookingFilters {
  return {
    q: q.q?.trim().slice(0, 60) || undefined,
    status: pick(q.status, BOOKING_STATUSES, "status"),
    service: pick(q.service, SERVICE_KEYS, "service"),
    from: date(q.from, "from"),
    to: date(q.to, "to"),
    rental: q.rental === "returned" ? "returned" : undefined,
    page: Math.max(1, parseInt(q.page ?? "1", 10) || 1),
  };
}

export const adminBookings = new Hono<AppEnv>()
  // ?q=&status=&service=&from=&to=&page=
  .get("/", requireAdmin("bookings.view"), async (c) => c.json(await searchBookings(c.env.DB, bookingFilters(c.req.query()))))
  // Same filters, as a CSV download (newest first, up to ADMIN_RULES.exportMaxRows rows). Audited.
  .get("/export.csv", requireAdmin("bookings.view"), async (c) => {
    const f = bookingFilters(c.req.query());
    const rows = await exportBookings(c.env.DB, f);
    await audit(c.env.DB, { adminId: c.var.admin.id, action: "bookings.export", entity: "bookings", detail: { filters: { ...f, page: undefined }, rows: rows.length } });
    return c.body(bookingsCsv(rows), 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="quikfly-bookings-${businessDate()}.csv"`,
      "Cache-Control": "no-store",
    });
  })
  .get("/:id", requireAdmin("bookings.view"), async (c) => c.json(await bookingDetail(c.env.DB, c.req.param("id"))))
  // { body }: an internal note on the booking (customers never see it) → the booking's notes
  .post("/:id/notes", requireAdmin("bookings.manage"), async (c) =>
    c.json(await addNote(c.env.DB, c.var.admin.id, c.req.param("id"), text(await jsonBody(c), "body", ADMIN_RULES.noteMin, ADMIN_RULES.noteMax)), 201))
  // { reason } — refunds a wallet payment to the customer's wallet.
  // { vehicleId | null } — give a group-travel booking to a live partner vehicle (or take it back)
  .post("/:id/vendor", requireAdmin("bookings.manage"), async (c) => {
    const body = await jsonBody(c);
    if (body.vehicleId !== null && typeof body.vehicleId !== "string") throw badRequest('"vehicleId" must be a vehicle id or null.');
    await assignBookingVendor(c.env.DB, c.var.admin.id, c.req.param("id"), body.vehicleId as string | null);
    return c.json(await bookingDetail(c.env.DB, c.req.param("id")));
  })
  .post("/:id/cancel", requireAdmin("bookings.manage"), async (c) =>
    c.json(await adminCancel(c.env.DB, c.var.admin.id, c.req.param("id"), reason(await jsonBody(c)))))
  // { tollsActual? }: a group trip quoted with a toll estimate needs the actual tolls.
  .post("/:id/complete", requireAdmin("bookings.manage"), async (c) => {
    const body = await jsonBody(c).catch(() => ({} as Record<string, unknown>));
    if (body.tollsActual !== undefined && typeof body.tollsActual !== "number") throw badRequest('"tollsActual" must be a number of rupees.');
    return c.json(await adminComplete(c.env.DB, c.var.admin.id, c.req.param("id"), body.tollsActual as number | undefined));
  })
  // Self-drive rental: readings, photos, extensions, settlement
  .get("/:id/rental", requireAdmin("bookings.view"), async (c) => c.json(await adminRental(c.env.DB, c.req.param("id"))))
  .get("/:id/rental/photos/:stage/:side", requireAdmin("bookings.view"), async (c) => {
    const stage = c.req.param("stage"), side = c.req.param("side");
    if (!(RENTAL_STAGES as readonly string[]).includes(stage) || !(RENTAL_PHOTO_SIDES as readonly string[]).includes(side)) throw badRequest("Unknown photo.");
    return rentalPhoto(c.env.DB, c.env.DOCS, null, c.req.param("id"), stage as (typeof RENTAL_STAGES)[number], side as (typeof RENTAL_PHOTO_SIDES)[number]);
  })
  // ?damage=₹ → the settlement that would be recorded (nothing changes)
  .get("/:id/rental/settlement", requireAdmin("bookings.manage"), async (c) => {
    const damage = Math.max(0, Math.min(RENTAL_RULES.damageMax, Math.round(Number(c.req.query("damage") ?? 0)) || 0));
    return c.json((await settlementPreview(c.env.DB, c.req.param("id"), damage)).settlement);
  })
  // { damage, damageNote? } → deductions recorded, the rest of the deposit refunded, booking completed (audited)
  .post("/:id/rental/settle", requireAdmin("bookings.manage"), async (c) => {
    const body = await jsonBody(c);
    const damage = typeof body.damage === "number" ? body.damage : 0;
    const note = typeof body.damageNote === "string" ? body.damageNote.trim().slice(0, RENTAL_RULES.damageNoteMax) : null;
    return c.json(await settleRental(c.env.DB, c.var.admin.id, c.req.param("id"), { damage, damageNote: note || null }));
  });

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

// Customer support: callbacks and tickets. ?status=open (default) | answered | closed
export const adminSupport = new Hono<AppEnv>()
  .get("/", requireAdmin("support.manage"), async (c) =>
    c.json(await supportQueue(c.env.DB, pick(c.req.query("status"), ["open", "answered", "closed"] as const, "status") ?? "open")))
  .get("/:id", requireAdmin("support.manage"), async (c) => c.json(await supportTicket(c.env.DB, c.req.param("id"))))
  // { body } — the customer sees it and is notified
  .post("/:id/reply", requireAdmin("support.manage"), async (c) =>
    c.json(await staffReply(c.env.DB, c.var.admin.id, c.req.param("id"), text(await jsonBody(c), "body", SUPPORT_RULES.messageMin, SUPPORT_RULES.messageMax))))
  // { note? } — added to the thread when given
  .post("/:id/close", requireAdmin("support.manage"), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const note = typeof body.note === "string" && body.note.trim() ? text(body, "note", 3, SUPPORT_RULES.messageMax) : undefined;
    return c.json(await staffClose(c.env.DB, c.var.admin.id, c.req.param("id"), note));
  });

// Partner (vendor) applications from the QuikFly Partner app.
const note = (body: Record<string, unknown>) => (typeof body.note === "string" && body.note.trim() ? text(body, "note", 3, ADMIN_RULES.reasonMax) : undefined);
export const adminVendors = new Hono<AppEnv>()
  // Live partners' vehicles and drivers waiting for staff (these come before /:id).
  .get("/fleet-queue", requireAdmin("vendors.review"), async (c) => c.json(await fleetQueue(c.env.DB)))
  // ?status=requested (default) | paid | rejected
  .get("/payouts", requireAdmin("vendors.review"), async (c) =>
    c.json(await payoutQueue(c.env.DB, pick(c.req.query("status"), ["requested", "paid", "rejected"] as const, "status") ?? "requested")))
  // { decision: paid | rejected, reference?, note? } — paid needs the bank reference, rejected a reason
  .post("/payouts/:pid", requireAdmin("vendors.review"), async (c) => {
    const body = await jsonBody(c);
    const decision = pick(String(body.decision ?? ""), ["paid", "rejected"] as const, "decision");
    if (!decision) throw badRequest('"decision" is required.');
    const reference = typeof body.reference === "string" && body.reference.trim() ? text(body, "reference", 4, 40) : undefined;
    await decidePayout(c.env.DB, c.var.admin.id, c.req.param("pid"), decision, { reference, note: note(body) });
    return c.json(await payoutQueue(c.env.DB, "requested"));
  })
  .get("/assignable-vehicles", requireAdmin("vendors.review"), async (c) => c.json(await assignableVehicles(c.env.DB)))
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
      { note: note(body), policeVerified: body.policeVerified === true, trainingDone: body.trainingDone === true, gender: pick(typeof body.gender === "string" ? body.gender : undefined, GENDERS, "gender") }));
  })
  // { gender: female | male | other | null } — as on the driver's documents (women-only rides need a woman captain)
  .post("/:id/drivers/:did/gender", requireAdmin("vendors.review"), async (c) => {
    const body = await jsonBody(c);
    const gender = body.gender === null ? null : pick(typeof body.gender === "string" ? body.gender : undefined, GENDERS, "gender");
    if (gender === undefined) throw badRequest('"gender" must be female, male, other or null.');
    return c.json(await setDriverGender(c.env.DB, c.var.admin.id, c.req.param("id"), c.req.param("did"), gender));
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
