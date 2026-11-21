// Phase 6 staff endpoints: /v1/admin/customers, /v1/admin/sos and /v1/admin/team.
import { Hono } from "hono";
import { ADMIN_ROLES, ADMIN_RULES, CUSTOMER_STATUSES, LIMITS, SOS_STATUSES, type AdminRole } from "@quikfly/shared";
import type { AppEnv } from "../../env";
import { badRequest } from "../../lib/errors";
import { bool, has, jsonBody, oneOf, optStr, str, text } from "../../lib/validate";
import { requireAdmin } from "../../middleware/admin";
import {
  adjustWallet, cancelCustomerDeletion, customerDetail, searchCustomers, signOutCustomer, suspendCustomer, unsuspendCustomer,
} from "../../services/admin/customers";
import { createMember, listTeam, resetMemberPassword, updateMember } from "../../services/admin/team";
import { handleSos, sosAlert, sosQueue } from "../../services/sos";

const reason = (body: Record<string, unknown>) => text(body, "reason", ADMIN_RULES.reasonMin, ADMIN_RULES.reasonMax);

export const adminCustomers = new Hono<AppEnv>()
  // ?q=&status=active|suspended|deleting|erased&page=
  .get("/", requireAdmin("customers.view"), async (c) => {
    const q = c.req.query();
    const status = q.status?.trim();
    if (status && !(CUSTOMER_STATUSES as readonly string[]).includes(status)) throw badRequest(`"status" must be one of: ${CUSTOMER_STATUSES.join(", ")}.`);
    return c.json(await searchCustomers(c.env.DB, {
      q: q.q?.trim().slice(0, 60) || undefined,
      status: status as (typeof CUSTOMER_STATUSES)[number] | undefined,
      page: Math.max(1, parseInt(q.page ?? "1", 10) || 1),
    }));
  })
  .get("/:id", requireAdmin("customers.view"), async (c) => c.json(await customerDetail(c.env.DB, c.req.param("id"))))
  // { amount (₹, negative to debit), reason }: the reason goes on the wallet entry the customer sees.
  .post("/:id/wallet", requireAdmin("customers.manage"), async (c) => {
    const body = await jsonBody(c);
    if (typeof body.amount !== "number") throw badRequest('"amount" must be a number of rupees (negative to debit).');
    return c.json(await adjustWallet(c.env.DB, c.var.admin.id, c.req.param("id"), body.amount, reason(body)));
  })
  // { reason }
  .post("/:id/suspend", requireAdmin("customers.manage"), async (c) =>
    c.json(await suspendCustomer(c.env.DB, c.var.admin.id, c.req.param("id"), reason(await jsonBody(c)))))
  .post("/:id/unsuspend", requireAdmin("customers.manage"), async (c) =>
    c.json(await unsuspendCustomer(c.env.DB, c.var.admin.id, c.req.param("id"), reason(await jsonBody(c)))))
  .post("/:id/sign-out", requireAdmin("customers.manage"), async (c) =>
    c.json(await signOutCustomer(c.env.DB, c.var.admin.id, c.req.param("id"), reason(await jsonBody(c)))))
  .post("/:id/cancel-deletion", requireAdmin("customers.manage"), async (c) =>
    c.json(await cancelCustomerDeletion(c.env.DB, c.var.admin.id, c.req.param("id"), reason(await jsonBody(c)))));

// SOS alerts. ?status=open (default) | acknowledged | closed
export const adminSos = new Hono<AppEnv>()
  .get("/", requireAdmin("sos.manage"), async (c) => {
    const status = c.req.query("status")?.trim() || "open";
    if (!(SOS_STATUSES as readonly string[]).includes(status)) throw badRequest(`"status" must be one of: ${SOS_STATUSES.join(", ")}.`);
    return c.json(await sosQueue(c.env.DB, status as (typeof SOS_STATUSES)[number]));
  })
  .get("/:id", requireAdmin("sos.manage"), async (c) => c.json(await sosAlert(c.env.DB, c.req.param("id"))))
  // { note? } (acknowledge) / { note } (close: what was done)
  .post("/:id/acknowledge", requireAdmin("sos.manage"), async (c) => {
    const body = await jsonBody(c).catch(() => ({} as Record<string, unknown>));
    return c.json(await handleSos(c.env.DB, c.var.admin.id, c.req.param("id"), "acknowledge", optStr(body, "note", ADMIN_RULES.reasonMax) ?? null));
  })
  .post("/:id/close", requireAdmin("sos.manage"), async (c) =>
    c.json(await handleSos(c.env.DB, c.var.admin.id, c.req.param("id"), "close", reason(await jsonBody(c)).replace(/^/, ""))));

// Staff accounts (owners only).
export const adminTeam = new Hono<AppEnv>()
  .get("/", requireAdmin("team.manage"), async (c) => c.json(await listTeam(c.env.DB)))
  // { email, name, role } → 201 { member, password } (the password is shown once and never again)
  .post("/", requireAdmin("team.manage"), async (c) => {
    const body = await jsonBody(c);
    const role = oneOf(body, "role", ADMIN_ROLES) as AdminRole;
    return c.json(await createMember(c.env.DB, c.var.admin.id, { email: str(body, "email", 200), name: str(body, "name", LIMITS.nameMax), role }), 201);
  })
  // { role? , name?, disabled? }
  .patch("/:id", requireAdmin("team.manage"), async (c) => {
    const body = await jsonBody(c);
    return c.json(await updateMember(c.env.DB, c.var.admin.id, c.req.param("id"), {
      role: has(body, "role") ? (oneOf(body, "role", ADMIN_ROLES) as AdminRole) : undefined,
      name: has(body, "name") ? str(body, "name", LIMITS.nameMax) : undefined,
      disabled: has(body, "disabled") ? bool(body, "disabled") : undefined,
    }));
  })
  // → { member, password }: a new one-time password; the person's sessions end.
  .post("/:id/reset-password", requireAdmin("team.manage"), async (c) => c.json(await resetMemberPassword(c.env.DB, c.var.admin.id, c.req.param("id"))));
