// Parcels for staff: /v1/admin/parcels (the queue, one parcel, counter actions, bus and weight changes, returns).
import { Hono } from "hono";
import { PARCEL_LR, PARCEL_QUEUE_STATES, PARCEL_RULES, PARCEL_WEIGHT_BANDS, PATTERNS, type ParcelFilters, type ParcelLegState } from "@quikfly/shared";
import type { AppEnv } from "../../env";
import { badRequest } from "../../lib/errors";
import { int, jsonBody, matches, oneOf, optStr, query, str, text } from "../../lib/validate";
import { requireAdmin } from "../../middleware/admin";
import { staffMove, staffReturn } from "../../services/parcels/carriers";
import { busChoices, changeBus, changeWeight, weightChange } from "../../services/parcels/changes";
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

const note = (body: Record<string, unknown>) => text(body, "note", PARCEL_RULES.noteMin, PARCEL_RULES.noteMax);
/** Money the staff member confirmed: 0 is allowed. */
const RUPEES_MAX = 100_000;

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
  // The buses it can still move to (same operator, same counters).
  .get("/:id/buses", requireAdmin("parcels.manage"), async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(await busChoices(c.env.DB, c.req.param("id")));
  })
  // { busId, departAt, note }: the same LR and price on another bus. Audited by the service.
  .post("/:id/bus", requireAdmin("parcels.manage"), async (c) => {
    const body = await jsonBody(c);
    return c.json(await changeBus(c.env.DB, c.var.admin.id, c.req.param("id"), {
      busId: str(body, "busId", 120), departAt: str(body, "departAt", 30), note: note(body),
    }));
  })
  // ?band=: what that weight would charge or give back.
  .get("/:id/weight", requireAdmin("parcels.manage"), async (c) => {
    c.header("Cache-Control", "no-store");
    const band = oneOf({ band: query(c, "band") }, "band", PARCEL_WEIGHT_BANDS);
    return c.json(await weightChange(c.env.DB, c.req.param("id"), band));
  })
  // { weightBand, charge, refund (as previewed), senderAgreed }: audited by the service.
  .post("/:id/weight", requireAdmin("parcels.manage"), async (c) => {
    const body = await jsonBody(c);
    return c.json(await changeWeight(c.env.DB, c.var.admin.id, c.req.param("id"), {
      weightBand: oneOf(body, "weightBand", PARCEL_WEIGHT_BANDS),
      charge: int(body, "charge", 0, RUPEES_MAX), refund: int(body, "refund", 0, RUPEES_MAX),
      senderAgreed: body.senderAgreed === true,
    }));
  })
  // { lr }: an unclaimed parcel goes back as the return parcel the sender booked.
  .post("/:id/return", requireAdmin("parcels.manage"), async (c) => {
    const lr = str(await jsonBody(c), "lr", 30).toUpperCase();
    return c.json(await staffReturn(c.env.DB, c.var.admin.id, c.req.param("id"), matches(lr, PARCEL_LR.pattern, "That doesn't look like an LR number.")));
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
