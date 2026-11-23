// What staff can correct before a bus parcel leaves: its bus and its weight. Neither moves the
// parcel along (that is legs.ts), but both take a new move id, so a move, a cancel and a change
// can't overwrite each other.
import {
  PARCEL_RETURN_LOCKED, canReweigh, parcelBandLabel, parcelRateFor, parcelTime, parseTerms, planBusChange, nextMoveAt, priceParcelIntercity, sumLines, withTerms,
  type AdminParcel, type ParcelDeparture, type ParcelWeightBand, type WeightChange,
} from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { setLine } from "../../lib/lines";
import { randomToken, uid } from "../../lib/random";
import { auditIfStatement } from "../admin/audit";
import { visible } from "../catalog";
import { getSettings } from "../settings";
import { isReturn, loadParcels, type LoadedParcel } from "./legs";
import { departuresBetween } from "./parcels";
import { staffParcel } from "./staff";

const ACTIVE = "('confirmed', 'ongoing')";
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
/** ?1 = the booking, ?2 = this change's token. */
const CHANGED = "EXISTS (SELECT 1 FROM parcels WHERE booking_id = ?1 AND move_id = ?2)";

async function beforeLeaving(db: D1Database, id: string): Promise<LoadedParcel> {
  const [parcel] = await loadParcels(db, "p.booking_id = ?", id);
  if (!parcel) throw notFound("Parcel not found.");
  const { row } = parcel;
  if (row.booking_status !== "confirmed" && row.booking_status !== "ongoing") throw conflict(`This booking is already ${row.booking_status}.`);
  if (!canReweigh(row)) throw conflict("Only a bus parcel that hasn't left can be changed.");
  return parcel;
}

/** The event, the sender's notice and the audit row, each only if the change went in. */
function told(db: D1Database, adminId: string, parcel: LoadedParcel, token: string, at: string, note: string, title: string, action: string, detail: Record<string, unknown>) {
  const { row } = parcel;
  const id = row.booking_id;
  return [
    db.prepare(`INSERT INTO parcel_events (id, booking_id, state, note, by_admin_id, at) SELECT ?2, ?1, p.state, ?3, ?4, ?5 FROM parcels p WHERE p.booking_id = ?1 AND ${CHANGED}`)
      .bind(id, token, note, adminId, at),
    db.prepare(
      `INSERT OR IGNORE INTO notifications (id, user_id, kind, ref, title, body, booking_id, created_at)
       SELECT 'NT' || upper(?2), ?3, 'parcel.moved', ?2, ?4, ?5, ?1, ?6 WHERE ${CHANGED}`,
    ).bind(id, token, row.user_id, `${title} · ${row.lr}`, note, at),
    auditIfStatement(db, { adminId, action, entity: "booking", entityId: id, detail: { lr: row.lr, ...detail } },
      "EXISTS (SELECT 1 FROM parcels WHERE booking_id = ? AND move_id = ?)", id, token),
  ];
}

async function bookingText(db: D1Database, id: string) {
  const b = await db.prepare("SELECT lines, payment FROM bookings WHERE id = ?").bind(id).first<{ lines: string; payment: string }>();
  if (!b) throw notFound("Booking not found.");
  return { raw: b.lines, lines: JSON.parse(b.lines) as [string, string][], payment: b.payment };
}

async function choices(db: D1Database, { row, legs }: LoadedParcel): Promise<ParcelDeparture[]> {
  const { departures } = await departuresBetween(db, await getSettings(db), row.from_city, row.to_city);
  return departures.filter((d) => !("error" in planBusChange(legs, d)));
}

export async function busChoices(db: D1Database, id: string): Promise<ParcelDeparture[]> {
  return choices(db, await beforeLeaving(db, id));
}

/** Another bus (say, the booked one was cancelled): the LR and the price stay. */
export async function changeBus(db: D1Database, adminId: string, id: string, input: { busId: string; departAt: string; note: string }): Promise<AdminParcel> {
  const parcel = await beforeLeaving(db, id);
  const { row, legs } = parcel;
  const departure = (await choices(db, parcel)).find((d) => d.busId === input.busId && d.departAt === input.departAt);
  if (!departure) throw badRequest("That bus can't take this parcel. Pick one from the list.");
  const plan = planBusChange(legs, departure);
  if ("error" in plan) throw conflict(plan.error);

  const { raw, lines } = await bookingText(db, id);
  let text = setLine(lines, "Departs", `${parcelTime(departure.departAt)} · ${departure.operator}`);
  text = setLine(text, "Collect at", `${departure.toCounter.name}, from ${parcelTime(departure.readyAt)}`);
  if (row.state === "booked") text = setLine(text, "Hand in at", `${departure.fromCounter.name}, by ${parcelTime(departure.cutoffAt)}`);

  const token = randomToken(12);
  const at = new Date().toISOString();
  const note = `Moved to the ${parcelTime(departure.departAt)} bus: ${input.note}`;
  const results = await db.batch([
    db.prepare(
      `UPDATE parcels SET move_id = ?2, depart_at = ?3, ready_at = ?4, next_at = ?5, updated_at = ?6
       WHERE booking_id = ?1 AND move_id = ?7 AND EXISTS (SELECT 1 FROM bookings WHERE id = ?1 AND status IN ${ACTIVE} AND lines = ?8)`,
    ).bind(id, token, departure.departAt, departure.readyAt, nextMoveAt(plan.legs, row.hold_until), at, row.move_id, raw),
    db.prepare(
      `UPDATE parcel_legs SET bus_id = json_extract(j.value, '$.busId'), bus_date = json_extract(j.value, '$.busDate'),
         depart_at = json_extract(j.value, '$.departAt'), planned_at = json_extract(j.value, '$.plannedAt')
       FROM json_each(?3) j WHERE parcel_legs.booking_id = ?1 AND parcel_legs.seq = json_extract(j.value, '$.seq') AND ${CHANGED}`,
    ).bind(id, token, JSON.stringify(plan.legs)),
    // The refund tiers count to whichever departure is later: a change by QuikFly can't cost the sender a refund.
    db.prepare(`UPDATE bookings SET starts_at = MAX(COALESCE(starts_at, ?3), ?3), lines = ?4 WHERE id = ?1 AND ${CHANGED}`)
      .bind(id, token, departure.departAt, JSON.stringify(text)),
    ...told(db, adminId, parcel, token, at, note, "Bus changed", "parcel.bus",
      { before: row.depart_at, after: departure.departAt, note: input.note }),
  ]);
  if (!results[0].meta.changes) throw conflict("This parcel just changed. Reload and try again.");
  return staffParcel(db, id);
}

/** Both weights at today's tariff and the GST rate it was sold at: only the difference is charged or given back. */
async function priceWeight(db: D1Database, { row, legs }: LoadedParcel, band: ParcelWeightBand): Promise<WeightChange> {
  if (await isReturn(db, row.booking_id)) throw conflict(PARCEL_RETURN_LOCKED);
  const current = await getSettings(db);
  if (band === row.weight_band) throw badRequest("That's the weight it's booked at.");
  if (Number(band) > current.parcelMaxKg) throw badRequest(`Parcels can weigh up to ${current.parcelMaxKg} kg. Refuse it instead.`);
  const operator = legs.find((l) => l.kind === "bus")?.operatorId ?? "";
  const rate = parcelRateFor(await visible(db, "parcelRate"), operator, row.from_city, row.to_city);
  const settings = withTerms(current, parseTerms(row.terms));
  const price = (b: ParcelWeightBand) => sumLines(priceParcelIntercity(rate, b, settings));
  const difference = price(band) - price(row.weight_band);
  // A coupon or credits paid part of it, so only the share paid in money comes back.
  const paidShare = row.amount / Math.max(row.amount + row.discount + row.credits_used, 1);
  return { weightBand: band, charge: Math.max(difference, 0), refund: Math.min(Math.floor(Math.max(-difference, 0) * paidShare), row.amount) };
}

export async function weightChange(db: D1Database, id: string, band: ParcelWeightBand): Promise<WeightChange> {
  return priceWeight(db, await beforeLeaving(db, id), band);
}

/**
 * The weight at the counter. Less is refunded. More is charged only where it can really be taken:
 * from the wallet that paid, after the sender agreed. Otherwise staff refuse it, with a full refund.
 */
export async function changeWeight(
  db: D1Database, adminId: string, id: string, input: WeightChange & { senderAgreed: boolean },
): Promise<AdminParcel> {
  const parcel = await beforeLeaving(db, id);
  const { row } = parcel;
  const { charge, refund } = await priceWeight(db, parcel, input.weightBand);
  if (charge !== input.charge || refund !== input.refund) throw conflict("The difference has changed. Check the weight again.");
  const { raw, lines, payment } = await bookingText(db, id);
  const wallet = payment === "wallet";
  if (charge && !wallet) throw conflict("More can be charged only to a parcel paid from the wallet. Refuse it (full refund) and ask the sender to book the right weight.");
  if (charge && !input.senderAgreed) throw badRequest("Confirm that the sender agreed to pay the difference.");

  const token = randomToken(12);
  const at = new Date().toISOString();
  const money = charge ? `${inr(charge)} more paid from the wallet`
    : refund ? `${inr(refund)} ${wallet ? "back to the wallet" : "refund due"}`
      : "same price";
  const note = `Weighed as ${parcelBandLabel(input.weightBand)}: ${money}`;
  const results = await db.batch([
    db.prepare(
      `UPDATE parcels SET weight_band = ?3, move_id = ?2, updated_at = ?4
       WHERE booking_id = ?1 AND move_id = ?5
         AND EXISTS (SELECT 1 FROM bookings WHERE id = ?1 AND status IN ${ACTIVE} AND amount = ?6 AND lines = ?7)
         AND (?8 = 0 OR (SELECT wallet_balance FROM users WHERE id = ?9) >= ?8)`,
    ).bind(id, token, input.weightBand, at, row.move_id, row.amount, raw, charge, row.user_id),
    db.prepare(`UPDATE bookings SET amount = amount + ?3, subtitle = ?4, lines = ?5 WHERE id = ?1 AND ${CHANGED}`)
      .bind(id, token, charge - refund, `Bus parcel · ${parcelBandLabel(input.weightBand)}`,
        JSON.stringify(setLine(lines, "Weight checked", `${parcelBandLabel(input.weightBand)}, ${money}`))),
    ...(wallet && (charge || refund) ? [
      db.prepare(`UPDATE users SET wallet_balance = wallet_balance + ?3 WHERE id = ?4 AND ${CHANGED}`).bind(id, token, refund - charge, row.user_id),
      db.prepare(
        `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
         SELECT ?3, ?4, ?5, ?6, ?7, ?1, ?8 WHERE ${CHANGED}`,
      ).bind(id, token, uid("WT"), row.user_id, charge ? "payment" : "refund", refund - charge, `Weight checked · ${row.title}`, at),
    ] : []),
    ...told(db, adminId, parcel, token, at, note, "Weight checked", "parcel.weight",
      { before: row.weight_band, after: input.weightBand, charge, refund, senderAgreed: !!charge && input.senderAgreed }),
  ]);
  if (!results[0].meta.changes) {
    if (charge) {
      const u = await db.prepare("SELECT wallet_balance FROM users WHERE id = ?").bind(row.user_id).first<{ wallet_balance: number }>();
      if ((u?.wallet_balance ?? 0) < charge) throw conflict(`The sender's wallet doesn't have ${inr(charge)}. Refuse it, with a full refund, or wait until they add money.`);
    }
    throw conflict("This parcel just changed. Reload and try again.");
  }
  return staffParcel(db, id);
}
