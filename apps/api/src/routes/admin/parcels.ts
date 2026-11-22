// Counter actions on parcels: /v1/admin/parcels. The queue and its screens come in step 2 of
// docs/parcel-service-plan.md.
import { Hono } from "hono";
import { PARCEL_RULES, type ParcelLegState } from "@quikfly/shared";
import type { AppEnv } from "../../env";
import { badRequest } from "../../lib/errors";
import { jsonBody, matches, oneOf, optStr, str, text } from "../../lib/validate";
import { requireAdmin } from "../../middleware/admin";
import { staffMove } from "../../services/parcels/carriers";

const MOVES_TO: readonly ParcelLegState[] = ["active", "done", "failed"];
const OTP = new RegExp(`^\\d{${PARCEL_RULES.collectOtpDigits}}$`);

export const adminParcels = new Hono<AppEnv>()
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
