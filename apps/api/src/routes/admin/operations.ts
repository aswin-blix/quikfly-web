// Operations endpoints for staff: /v1/admin/bookings and /v1/admin/licences.
import { Hono } from "hono";
import { ADMIN_RULES, BOOKING_STATUSES, LICENCE_QUEUE_STATUSES, PATTERNS, type BookingFilters } from "@quikfly/shared";
import { SERVICE_KEYS } from "../../config";
import type { AppEnv } from "../../env";
import { badRequest } from "../../lib/errors";
import { jsonBody, text } from "../../lib/validate";
import { requireAdmin } from "../../middleware/admin";
import { adminCancel, adminComplete, bookingDetail, searchBookings } from "../../services/admin/bookings";
import { licenceQueue, reviewLicence } from "../../services/admin/licences";

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
