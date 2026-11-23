// Parcels as staff see them: the queue and one parcel. Both people's details are here (staff need
// them at the counter); the collection code never is. Moving a parcel is carriers.ts.
import {
  ADMIN_RULES, PARCEL_CANCELLABLE, PARCEL_FINISHED,
  type AdminParcel, type AdminParcelRow, type AdminUser, type BookingStatus, type CounterScope, type Page, type ParcelEvent, type ParcelFilters, type ParcelState,
  type ParcelWeightBand, type PaymentMethod,
} from "@quikfly/shared";
import { forbidden, notFound } from "../../lib/errors";
import { LOCAL_DATE } from "../admin/stats";
import { refundFor } from "../bookings";
import { LEGS_JSON, isReturn, loadParcels, parseLegs, type LoadedParcel } from "./legs";
import { toParcel } from "./parcels";

/** A search that is only a number looks at phones; an LR number has digits in it too. */
const PHONE_SEARCH = /^[\d\s+()-]+$/;
const PHONE_SEARCH_MIN_DIGITS = 4;
const PHONE_DIGITS = 10;
/** D1 refuses LIKE patterns over 50 bytes. LR numbers and booking ids are shorter, in letters, digits and "-". */
const SEARCH_CHARS_MAX = 48;

const FINISHED = `(${PARCEL_FINISHED.map((s) => `'${s}'`).join(", ")})`;
/** A bus parcel's day is its bus's; a Quick parcel's is the day it was booked. */
const PARCEL_WHEN = "COALESCE(p.depart_at, p.created_at)";

/** Where this staff member may act: null is everywhere. A counter account without a counter is refused. */
export function staffScope(admin: AdminUser): CounterScope | null {
  if (admin.role !== "counter") return null;
  if (!admin.counter) throw forbidden();
  return admin.counter;
}

/** SQL over `p`: that operator's bus parcels to or from that city. */
function inScope({ operatorId, city }: CounterScope): { sql: string; params: string[] } {
  return {
    sql: `(p.mode = 'intercity' AND (p.from_city = ? COLLATE NOCASE OR p.to_city = ? COLLATE NOCASE)
      AND EXISTS (SELECT 1 FROM parcel_legs sl WHERE sl.booking_id = p.booking_id AND sl.kind = 'bus' AND sl.operator_id = ?))`,
    params: [city, city, operatorId],
  };
}

/** One parcel, or 404 when it isn't there or is outside the scope: which of the two isn't said. */
export async function scopedParcel(db: D1Database, id: string, scope: CounterScope | null): Promise<LoadedParcel> {
  const only = scope && inScope(scope);
  const found = (await loadParcels(db, `p.booking_id = ?${only ? ` AND ${only.sql}` : ""}`, id, ...(only ? only.params : [])))[0];
  if (!found) throw notFound("Parcel not found.");
  return found;
}

function queueFilter(f: ParcelFilters, scope: CounterScope | null): { filter: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (scope) {
    const only = inScope(scope);
    where.push(only.sql);
    params.push(...only.params);
  }
  // A search looks everywhere; otherwise the queue is what's still open.
  const state = f.state ?? (f.q ? "all" : "open");
  if (state === "open") where.push(`p.state NOT IN ${FINISHED}`);
  else if (state !== "all") { where.push("p.state = ?"); params.push(state); }
  if (f.city) { where.push("(p.from_city = ? COLLATE NOCASE OR p.to_city = ? COLLATE NOCASE)"); params.push(f.city, f.city); }
  if (f.date) { where.push(`${LOCAL_DATE(PARCEL_WHEN)} = ?`); params.push(f.date); }
  if (f.q) {
    const digits = f.q.replace(/\D/g, "");
    if (digits.length >= PHONE_SEARCH_MIN_DIGITS && PHONE_SEARCH.test(f.q)) {
      where.push("(REPLACE(u.phone, ' ', '') LIKE ? OR REPLACE(p.receiver_phone, ' ', '') LIKE ?)");
      // The last ten, so "+91 …" and "0…" find the number too.
      const like = `%${digits.slice(-PHONE_DIGITS)}%`;
      params.push(like, like);
    } else {
      const term = f.q.replace(/[^A-Za-z0-9-]/g, "").slice(0, SEARCH_CHARS_MAX);
      // Nothing left to look for finds nothing, rather than everything.
      if (!term) where.push("0 = 1");
      else {
        where.push("(p.lr LIKE ? OR p.booking_id LIKE ?)");
        params.push(`%${term}%`, `%${term}%`);
      }
    }
  }
  return { filter: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

interface QueueRow {
  booking_id: string; booking_status: BookingStatus; lr: string; state: ParcelState; from_city: string; to_city: string;
  depart_at: string | null; weight_band: ParcelWeightBand; hold_until: string | null; receiver_name: string; receiver_phone: string;
  user_id: string; sender_name: string; sender_phone: string; legs_json: string;
}

/** Open parcels first, by their bus (the most urgent on top); finished ones after, newest first. */
export async function parcelQueue(db: D1Database, f: ParcelFilters, scope: CounterScope | null): Promise<Page<AdminParcelRow>> {
  const { filter, params } = queueFilter(f, scope);
  const page = Math.max(1, f.page ?? 1);
  const pageSize = ADMIN_RULES.pageSize;
  const from = "FROM parcels p JOIN bookings b ON b.id = p.booking_id JOIN users u ON u.id = p.user_id";
  const [count, rows] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n ${from} ${filter}`).bind(...params),
    // Named columns, not p.*: the collection code mustn't be read here.
    db.prepare(
      `SELECT p.booking_id, b.status AS booking_status, p.lr, p.state, p.from_city, p.to_city, p.depart_at, p.weight_band, p.hold_until,
         p.receiver_name, p.receiver_phone, p.user_id, u.name AS sender_name, u.phone AS sender_phone, ${LEGS_JSON} AS legs_json
       ${from} ${filter}
       ORDER BY p.state IN ${FINISHED},
         CASE WHEN p.state NOT IN ${FINISHED} THEN ${PARCEL_WHEN} END,
         p.created_at DESC, p.booking_id
       LIMIT ? OFFSET ?`,
    ).bind(...params, pageSize, (page - 1) * pageSize),
  ]);
  return {
    items: (rows.results as QueueRow[]).map((r) => ({
      bookingId: r.booking_id, bookingStatus: r.booking_status, lr: r.lr, state: r.state, from: r.from_city, to: r.to_city,
      departAt: r.depart_at, weightBand: r.weight_band, holdUntil: r.hold_until, legs: parseLegs(r.legs_json),
      sender: { id: r.user_id, name: r.sender_name, phone: r.sender_phone },
      receiver: { name: r.receiver_name, phone: r.receiver_phone },
    })),
    total: (count.results[0] as { n: number }).n,
    page,
    pageSize,
  };
}

/** One parcel for staff: everything but the collection code, with who made each move. */
export async function staffParcel(db: D1Database, id: string, scope: CounterScope | null = null): Promise<AdminParcel> {
  const found = await scopedParcel(db, id, scope);
  const [parcel, booking, { results: events }] = await Promise.all([
    toParcel(db, found, false),
    db.prepare("SELECT b.starts_at, b.created_at, b.payment, u.name, u.phone FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.id = ?").bind(id)
      .first<{ starts_at: string | null; created_at: string; payment: PaymentMethod; name: string; phone: string }>(),
    db.prepare(
      `SELECT e.state, e.note, e.at, a.name AS "by" FROM parcel_events e LEFT JOIN admin_users a ON a.id = e.by_admin_id
       WHERE e.booking_id = ? ORDER BY e.at, e.rowid`,
    ).bind(id).all<ParcelEvent & { by: string | null }>(),
  ]);
  if (!booking) throw notFound("Parcel not found.");
  const { row } = found;
  // A counter can't cancel, so it isn't shown what cancelling would refund.
  const cancellable = !scope && (row.booking_status === "confirmed" || row.booking_status === "ongoing") && PARCEL_CANCELLABLE.includes(row.state) && !(await isReturn(db, id));
  const refund = cancellable
    ? await refundFor(db, { service: "parcel", payment: booking.payment, starts_at: booking.starts_at, created_at: booking.created_at, amount: row.amount, deposit: row.deposit, terms: row.terms })
    : null;
  return {
    ...parcel, events,
    bookingStatus: row.booking_status,
    sender: { id: row.user_id, name: booking.name, phone: booking.phone },
    amount: row.amount, payment: booking.payment,
    refundIfCancelled: refund && { amount: refund.amount, percent: refund.percent },
  };
}
