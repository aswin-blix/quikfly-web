// How a parcel moves. advanceLegs() is the only writer of a move, for staff and the simulated
// carrier alike. It writes set-based statements (json_each), so moving 20 parcels costs the same
// few queries as moving one: the cron shares the free plan's 50 queries with its other jobs.
import {
  PARCEL_CANCELLABLE, PARCEL_RULES, parcelNotice,
  type BookingStatus, type LegMove, type ParcelActor, type ParcelCategory, type ParcelLeg, type ParcelSize, type ParcelState, type ParcelWeightBand,
} from "@quikfly/shared";
import { randomDigits, randomToken } from "../../lib/random";
import { auditIfStatement } from "../admin/audit";

const ACTIVE = "('confirmed', 'ongoing')";

/** SQL, true for a bookings row that may be cancelled: not a parcel, or one not yet on the bus. */
export const CANCELLABLE_SQL = `(bookings.service <> 'parcel' OR EXISTS (
  SELECT 1 FROM parcels cp WHERE cp.booking_id = bookings.id AND cp.state IN (${PARCEL_CANCELLABLE.map((s) => `'${s}'`).join(", ")})))`;

export interface ParcelRow {
  booking_id: string; user_id: string; lr: string; mode: "city" | "intercity"; state: ParcelState; move_id: string;
  from_city: string; to_city: string; depart_at: string | null; ready_at: string | null; from_counter: string | null; to_counter: string | null;
  category: ParcelCategory; weight_band: ParcelWeightBand; size: ParcelSize; declared_value: number; liability_cap: number;
  contents: string; receiver_name: string; receiver_phone: string; declaration_version: string;
  collect_otp: string | null; hold_until: string | null;
  // From the booking
  title: string; amount: number; deposit: number; terms: string | null; booking_status: BookingStatus;
}
export interface LoadedParcel { row: ParcelRow; legs: ParcelLeg[] }

/** SQL: a parcel's legs (`p`) as a JSON list. */
export const LEGS_JSON = `(SELECT json_group_array(json_object('seq', l.seq, 'kind', l.kind, 'state', l.state, 'operatorId', l.operator_id, 'counterId', l.counter_id,
    'busId', l.bus_id, 'busDate', l.bus_date, 'departAt', l.depart_at, 'plannedAt', l.planned_at, 'startedAt', l.started_at, 'endedAt', l.ended_at))
  FROM parcel_legs l WHERE l.booking_id = p.booking_id)`;
export const parseLegs = (json: string) => (JSON.parse(json) as ParcelLeg[]).sort((a, b) => a.seq - b.seq);

/**
 * Parcels with their legs, in one query. `where` is trusted SQL over `p` (parcels) and `b`
 * (bookings); values go in `params`.
 */
export async function loadParcels(db: D1Database, where: string, ...params: unknown[]): Promise<LoadedParcel[]> {
  const { results } = await db.prepare(
    `SELECT p.*, b.title, b.amount, b.deposit, b.terms, b.status AS booking_status, ${LEGS_JSON} AS legs_json
     FROM parcels p JOIN bookings b ON b.id = p.booking_id WHERE ${where}`,
  ).bind(...params).all<ParcelRow & { legs_json: string }>();
  return results.map(({ legs_json, ...row }) => ({ row, legs: parseLegs(legs_json) }));
}

/** The move's columns, read from one element `m` of a json_each() list. */
const field = (name: string) => `json_extract(m.value, '$.${name}')`;
/** The moves that went in: the parcel now carries the move's token. */
const MOVED = `json_each(?1) m JOIN parcels p ON p.booking_id = ${field("id")} AND p.move_id = ${field("token")}`;

/**
 * Writes planned moves (planLegMove) in one batch: the parcel, its legs, the event, the booking's
 * status and the sender's notification, with the audit row for a staff move. Each parcel is
 * written only if nobody moved or cancelled it since it was read; returns the ids that moved.
 */
export async function advanceLegs(
  db: D1Database,
  moves: { parcel: LoadedParcel; move: LegMove }[],
  by: { actor: ParcelActor; adminId?: string; note?: string | null },
  /** Extra statements to run last, e.g. the credits earned on collection. */
  alsoRun: D1PreparedStatement[] = [],
): Promise<{ moved: Set<string>; results: D1Result[] }> {
  if (!moves.length) return { moved: new Set(), results: [] };
  const at = new Date().toISOString();
  const planned = moves.map(({ parcel: { row, legs }, move }) => {
    const token = randomToken(12);
    const notice = parcelNotice(move.state, row.lr);
    return {
      row, token,
      changed: move.legs.filter((l, i) => l.state !== legs[i].state).map((l) => ({ ...l, id: row.booking_id, token })),
      data: {
        id: row.booking_id, prev: row.move_id, token, from: row.state, state: move.state,
        status: move.state === "collected" ? "completed" : "ongoing",
        holdUntil: move.holdUntil, nextAt: move.nextAt,
        otp: move.state === "ready" ? randomDigits(PARCEL_RULES.collectOtpDigits) : null,
        kind: notice?.kind ?? null, title: notice?.title ?? null, body: notice?.body ?? null,
      },
    };
  });
  const list = JSON.stringify(planned.map((p) => p.data));
  const statements = [
    db.prepare(
      `UPDATE parcels SET state = ${field("state")}, move_id = ${field("token")}, next_at = ${field("nextAt")}, hold_until = ${field("holdUntil")},
         collect_otp = ${field("otp")}, updated_at = ?2
       FROM json_each(?1) m
       WHERE parcels.booking_id = ${field("id")} AND parcels.move_id = ${field("prev")}
         AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = parcels.booking_id AND b.status IN ${ACTIVE})
       RETURNING booking_id`,
    ).bind(list, at),
    db.prepare(
      `UPDATE parcel_legs SET state = ${field("state")}, started_at = ${field("startedAt")}, ended_at = ${field("endedAt")}
       FROM ${MOVED}
       WHERE parcel_legs.booking_id = p.booking_id AND parcel_legs.seq = ${field("seq")}`,
    ).bind(JSON.stringify(planned.flatMap((p) => p.changed))),
    db.prepare(
      `INSERT INTO parcel_events (id, booking_id, state, note, by_admin_id, at)
       SELECT ${field("token")}, p.booking_id, p.state, ?2, ?3, ?4 FROM ${MOVED}`,
    ).bind(list, by.note ?? null, by.adminId ?? null, at),
    db.prepare(
      `UPDATE bookings SET status = ${field("status")} FROM ${MOVED}
       WHERE bookings.id = p.booking_id AND bookings.status IN ${ACTIVE}`,
    ).bind(list),
    db.prepare(
      `INSERT OR IGNORE INTO notifications (id, user_id, kind, ref, title, body, booking_id, created_at)
       SELECT 'NT' || upper(${field("token")}), p.user_id, ${field("kind")}, ${field("token")}, ${field("title")}, ${field("body")}, p.booking_id, ?2
       FROM ${MOVED} WHERE ${field("kind")} IS NOT NULL`,
    ).bind(list, at),
  ];
  if (by.actor === "staff" && by.adminId) {
    for (const { row, token, data, changed } of planned) {
      statements.push(auditIfStatement(db, {
        adminId: by.adminId, action: "parcel.move", entity: "booking", entityId: row.booking_id,
        detail: { lr: row.lr, before: data.from, after: data.state, legs: changed.map((l) => ({ seq: l.seq, to: l.state })), note: by.note ?? null },
      }, "EXISTS (SELECT 1 FROM parcels WHERE booking_id = ? AND move_id = ?)", row.booking_id, token));
    }
  }
  const results = await db.batch([...statements, ...alsoRun]);
  return {
    moved: new Set((results[0].results as { booking_id: string }[]).map((r) => r.booking_id)),
    results: results.slice(statements.length),
  };
}

/**
 * What cancelling a parcel's booking also writes. Runs after the booking's own update in the same
 * batch, and does nothing unless that update went in. `refusal`: staff refused it on sight.
 */
export function cancelParcelStatements(db: D1Database, id: string, refusal?: { adminId: string; note: string }): D1PreparedStatement[] {
  const token = randomToken(12);
  const at = new Date().toISOString();
  const cancelledNow = "EXISTS (SELECT 1 FROM parcels WHERE booking_id = ?1 AND move_id = ?2)";
  return [
    db.prepare(
      `UPDATE parcels SET state = 'cancelled', move_id = ?2, next_at = NULL, collect_otp = NULL, updated_at = ?3
       WHERE booking_id = ?1 AND state <> 'cancelled' AND EXISTS (SELECT 1 FROM bookings WHERE id = ?1 AND status = 'cancelled')`,
    ).bind(id, token, at),
    db.prepare(`UPDATE parcel_legs SET state = 'failed', ended_at = ?3 WHERE booking_id = ?1 AND state IN ('pending', 'active') AND ${cancelledNow}`)
      .bind(id, token, at),
    db.prepare(`INSERT INTO parcel_events (id, booking_id, state, note, by_admin_id, at) SELECT ?2, ?1, 'cancelled', ?4, ?5, ?3 WHERE ${cancelledNow}`)
      .bind(id, token, at, refusal?.note ?? null, refusal?.adminId ?? null),
    ...(refusal ? [auditIfStatement(db, {
      adminId: refusal.adminId, action: "parcel.refuse", entity: "booking", entityId: id, detail: { reason: refusal.note, refund: "full" },
    }, "EXISTS (SELECT 1 FROM parcels WHERE booking_id = ? AND move_id = ?)", id, token)] : []),
  ];
}
