// Who moves parcels: staff at the counters and, in the demo, a simulated carrier run by the cron.
// An operator's API would be a third carrier in this file; all of them end in advanceLegs().
import { PARCEL_RULES, parseTerms, planLegMove, simulatedMove, withTerms, type AdminParcel, type ParcelLegState, type Settings } from "@quikfly/shared";
import { PARCEL_SIM_BATCH } from "../../config";
import { badRequest, conflict, notFound, tooMany } from "../../lib/errors";
import { audit } from "../admin/audit";
import { cancelBookingRow, refundText } from "../bookings";
import { earnStatement, earnedNotice } from "../credits";
import { notify } from "../notifications";
import { getSettings } from "../settings";
import { advanceLegs, loadParcels, type LoadedParcel } from "./legs";
import { staffParcel } from "./staff";

/** A parcel as planLegMove reads it, with the hold period it was sold under. */
const journey = (settings: Settings, { row, legs }: LoadedParcel) => ({
  legs, holdUntil: row.hold_until, holdDays: withTerms(settings, parseTerms(row.terms)).parcelCounterHoldDays,
});

/** Cron, demo only: each parcel whose time has come takes one step, PARCEL_SIM_BATCH of them a run. */
export async function runSimulatedCarrier(db: D1Database) {
  const settings = await getSettings(db);
  if (!settings.parcelSimulateTransit) return;
  const now = Date.now();
  // `next_at IS NOT NULL` lets the partial index serve the (usually empty) search.
  const due = await loadParcels(db,
    "p.next_at IS NOT NULL AND p.next_at <= ? AND b.status IN ('confirmed', 'ongoing') ORDER BY p.next_at LIMIT ?",
    new Date(now).toISOString(), PARCEL_SIM_BATCH);
  const moves = due.flatMap((parcel) => {
    const step = simulatedMove(parcel.legs);
    if (!step) return [];
    const move = planLegMove(journey(settings, parcel), step.seq, step.to, "simulated", now);
    return "error" in move ? [] : [{ parcel, move }];
  });
  await advanceLegs(db, moves, { actor: "simulated" });
}

/**
 * Counts the try before comparing, in one batch, so parallel guesses can't get around the limit.
 * Throws unless the code is right.
 */
async function checkCollectOtp(db: D1Database, adminId: string, id: string, otp: string | undefined) {
  if (!otp) throw badRequest("Enter the receiver's collection code.");
  const now = new Date().toISOString();
  const lockUntil = new Date(Date.now() + PARCEL_RULES.otpLockMinutes * 60_000).toISOString();
  const [, claim] = await db.batch([
    db.prepare("UPDATE parcels SET otp_tries = 0, otp_locked_until = NULL WHERE booking_id = ? AND otp_locked_until <= ?").bind(id, now),
    db.prepare(
      `UPDATE parcels SET otp_tries = otp_tries + 1, otp_locked_until = CASE WHEN otp_tries + 1 >= ?2 THEN ?3 ELSE NULL END
       WHERE booking_id = ?1 AND otp_tries < ?2 RETURNING collect_otp`,
    ).bind(id, PARCEL_RULES.otpMaxTries, lockUntil),
  ]);
  const attempt = (claim.results as { collect_otp: string | null }[])[0];
  if (!attempt) throw tooMany(`Too many wrong codes. Try again in ${PARCEL_RULES.otpLockMinutes} minutes.`);
  if (attempt.collect_otp !== otp) {
    await audit(db, { adminId, action: "parcel.code_wrong", entity: "booking", entityId: id });
    throw badRequest("That collection code isn't right.");
  }
}

/** A counter action: one leg transition from PARCEL_TRANSITIONS, audited. */
export async function staffMove(
  db: D1Database, adminId: string, id: string, seq: number,
  input: { to: ParcelLegState; note?: string; otp?: string },
): Promise<AdminParcel> {
  const parcel = (await loadParcels(db, "p.booking_id = ?", id))[0];
  if (!parcel) throw notFound("Parcel not found.");
  const { row } = parcel;
  if (row.booking_status !== "confirmed" && row.booking_status !== "ongoing") throw conflict(`This booking is already ${row.booking_status}.`);
  const settings = await getSettings(db);
  const move = planLegMove(journey(settings, parcel), seq, input.to, "staff");
  if ("error" in move) throw conflict(move.error);

  if (move.refuses) {
    const reason = input.note;
    if (!reason) throw badRequest("Say why the parcel is refused: the sender sees it.");
    const cancelled = await cancelBookingRow(db, null, id, "Refund, parcel refused", null, { adminId, note: reason });
    if (!cancelled) throw conflict("This parcel just moved. Reload and try again.");
    await notify(db, cancelled.user_id, {
      kind: "booking.cancelled_by_staff", ref: id, bookingId: id, title: `Parcel refused · ${row.lr}`, body: `${reason} ${refundText(cancelled)}`,
    });
    return staffParcel(db, id);
  }

  if (move.needsOtp) await checkCollectOtp(db, adminId, id, input.otp);
  // Credits are earned on collection, in the same batch (the statement waits for 'completed').
  const earn = move.state === "collected"
    ? earnStatement(db, settings, { id, user_id: row.user_id, service: "parcel", amount: row.amount, deposit: row.deposit, title: row.title })
    : null;
  const { moved, results } = await advanceLegs(db, [{ parcel, move }], { actor: "staff", adminId, note: input.note }, earn ? [earn.statement] : []);
  if (!moved.has(id)) throw conflict("This parcel just moved. Reload and try again.");
  if (earn && results[0]?.meta.changes) await notify(db, row.user_id, { ...earnedNotice(earn.earn, row.title, settings), ref: id, bookingId: id });
  return staffParcel(db, id);
}
