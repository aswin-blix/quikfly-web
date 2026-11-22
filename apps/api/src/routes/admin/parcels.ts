// Parcels for staff: /v1/admin/parcels (the queue, one parcel, counter actions).
import { Hono } from "hono";
import { PARCEL_QUEUE_STATES, PARCEL_RULES, PATTERNS, type ParcelFilters, type ParcelLegState } from "@quikfly/shared";
import type { AppEnv } from "../../env";
import { badRequest } from "../../lib/errors";
import { jsonBody, matches, oneOf, optStr, str, text } from "../../lib/validate";
import { requireAdmin } from "../../middleware/admin";
import { staffMove } from "../../services/parcels/carriers";
import { parcelQueue, staffParcel } from "../../services/parcels/staff";

const MOVES_TO: readonly ParcelLegState[] = ["active", "done", "failed"];
const OTP = new RegExp(`^\\d{${PARCEL_RULES.collectOtpDigits}}$`);

const SEARCH_MAX = 60;

/** ?city=&state=&date=&q=&page= */
function queueFilters(q: Record<string, string>): ParcelFilters {
  const f: ParcelFilters = { page: Math.max(1, parseInt(q.page ?? "1", 10) || 1) };
  if (q.city) f.city = str(q, "city", SEARCH_MAX);
  if (q.state) f.state = oneOf(q, "state", PARCEL_QUEUE_STATES);
  if (q.date) f.date = matches(q.date, PATTERNS.isoDate, '"date" must be YYYY-MM-DD.');
  if (q.q?.trim()) f.q = str(q, "q", SEARCH_MAX);
  return f;
}

export const adminParcels = new Hono<AppEnv>()
  // Reading needs the permission too: these answers carry both people's numbers.
  .get("/", requireAdmin("parcels.manage"), async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(await parcelQueue(c.env.DB, queueFilters(c.req.query())));
  })
  .get("/:id", requireAdmin("parcels.manage"), async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(await staffParcel(c.env.DB, c.req.param("id")));
  })
  // { to, note?, otp? }: one transition from PARCEL_TRANSITIONS. Audited by the service.
  .post("/:id/legs/:seq", requireAdmin("parcels.manage"), async (c) => {
    const seq = c.req.param("seq");
    if (!/^\d{1,2}$/.test(seq)) throw badRequest('"seq" must be a leg number.');
    const body = await jsonBody(c);
    return c.json(await staffMove(c.env.DB, c.var.admin.id, c.req.param("id"), Number(seq), {
      to: oneOf(body, "to", MOVES_TO),
      note: optStr(body, "note", PARCEL_RULES.noteMax) === undefined ? undefined : text(body, "note", PARCEL_RULES.noteMin, PARCEL_RULES.noteMax),
      otp: body.otp === undefined ? undefined : matches(str(body, "otp", 10), OTP, `The collection code is ${PARCEL_RULES.collectOtpDigits} digits.`),
    }));
  });
