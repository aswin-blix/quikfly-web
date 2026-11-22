// Bookings for staff: search across all customers, detail with wallet entries, and
// cancel (with wallet refund) or complete. Each action is audited.
import { ADMIN_RULES, PARCEL_CANCELLABLE, PARCEL_NOT_CANCELLABLE, TOLL_LINE, TOLLS_MAX, TOLLS_SETTLED_LINE, tollSettlement, type AdminBooking, type AdminBookingDetail, type BookingFilters, type BookingNote, type FareLine, type Page, type WalletTransaction } from "@quikfly/shared";
import { uid } from "../../lib/random";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { cancelBookingRow, completeBookingRow, refundFor, refundText } from "../bookings";
import { notify } from "../notifications";
import { audit, auditStatement, listAudit } from "./audit";
import { LOCAL_DATE, toAdminBooking, type AdminBookingRow } from "./stats";

const SELECT = "SELECT b.*, u.name AS customer_name, u.phone AS customer_phone, (SELECT CASE WHEN settlement IS NOT NULL THEN 'settled' WHEN return_at IS NOT NULL THEN 'returned' WHEN pickup_at IS NOT NULL THEN 'on_trip' ELSE 'booked' END FROM rentals WHERE booking_id = b.id) AS rental_state, (SELECT state FROM parcels WHERE booking_id = b.id) AS parcel_state FROM bookings b JOIN users u ON u.id = b.user_id";

/** The WHERE clause and its parameters for a booking search (shared by the list and the CSV export). */
function bookingFilter(f: BookingFilters): { filter: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    const digits = f.q.replace(/\D/g, "");
    where.push(`(b.id LIKE ? OR b.title LIKE ? OR u.name LIKE ?${digits.length >= 4 ? " OR REPLACE(u.phone, ' ', '') LIKE ?" : ""})`);
    params.push(like, like, like, ...(digits.length >= 4 ? [`%${digits}%`] : []));
  }
  if (f.status) { where.push("b.status = ?"); params.push(f.status); }
  if (f.rental === "returned") where.push("EXISTS (SELECT 1 FROM rentals r WHERE r.booking_id = b.id AND r.return_at IS NOT NULL AND r.settlement IS NULL)");
  if (f.service) { where.push("b.service = ?"); params.push(f.service); }
  if (f.from) { where.push(`${LOCAL_DATE("b.created_at")} >= ?`); params.push(f.from); }
  if (f.to) { where.push(`${LOCAL_DATE("b.created_at")} <= ?`); params.push(f.to); }
  return { filter: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

/** Up to ADMIN_RULES.exportMaxRows bookings matching the filters, newest first, for the CSV export. */
export async function exportBookings(db: D1Database, f: BookingFilters): Promise<ExportRow[]> {
  const { filter, params } = bookingFilter(f);
  // The parcel columns carry nothing of the receiver, the contents or the code: content staff can export too.
  const { results } = await db.prepare(
    `SELECT x.*, p.lr AS parcel_lr, p.mode AS parcel_mode, p.weight_band AS parcel_weight_band
     FROM (${SELECT} ${filter} ORDER BY b.created_at DESC LIMIT ?) x LEFT JOIN parcels p ON p.booking_id = x.id ORDER BY x.created_at DESC`,
  ).bind(...params, ADMIN_RULES.exportMaxRows).all<AdminBookingRow & { parcel_lr: string | null; parcel_mode: string | null; parcel_weight_band: string | null }>();
  return results.map((r) => ({ ...toAdminBooking(r), parcelLr: r.parcel_lr, parcelMode: r.parcel_mode, parcelWeightKg: r.parcel_weight_band }));
}

type ExportRow = AdminBooking & { parcelLr: string | null; parcelMode: string | null; parcelWeightKg: string | null };

/** One CSV line per booking; a header first. Fields with commas, quotes or line breaks are quoted. */
export function bookingsCsv(rows: ExportRow[]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, "\"\"")}"` : s;
  };
  const header = ["booking_id", "created_at", "service", "status", "title", "subtitle", "customer_name", "customer_phone", "payment", "amount_inr", "discount_inr", "credits_used_inr", "deposit_inr", "refund_inr", "cancel_fee_inr", "cancel_reason", "starts_at", "trip_id",
    "parcel_lr", "parcel_mode", "parcel_state", "parcel_max_kg"];
  const lines = rows.map((b) => [
    b.id, b.createdAt, b.service, b.status, b.title, b.subtitle, b.customer.name, b.customer.phone, b.payment, b.amount, b.discount, b.creditsUsed,
    b.deposit, b.refundAmount ?? "", b.cancelFee, b.cancelReason ?? "", b.startsAt ?? "", b.tripId ?? "",
    b.parcelLr ?? "", b.parcelMode ?? "", b.parcelState ?? "", b.parcelWeightKg ?? "",
  ].map(cell).join(","));
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}

interface NoteRow { id: string; body: string; admin_id: string; admin_name: string | null; created_at: string }
const toNote = (n: NoteRow): BookingNote => ({ id: n.id, body: n.body, admin: { id: n.admin_id, name: n.admin_name ?? "Staff" }, createdAt: n.created_at });

export async function listNotes(db: D1Database, bookingId: string): Promise<BookingNote[]> {
  const { results } = await db.prepare(
    "SELECT n.id, n.body, n.admin_id, a.name AS admin_name, n.created_at FROM booking_notes n LEFT JOIN admin_users a ON a.id = n.admin_id WHERE n.booking_id = ? ORDER BY n.created_at",
  ).bind(bookingId).all<NoteRow>();
  return results.map(toNote);
}

/** Adds an internal note (customers never see it) and audits it in the same batch. */
export async function addNote(db: D1Database, adminId: string, bookingId: string, body: string): Promise<BookingNote[]> {
  const exists = await db.prepare("SELECT 1 FROM bookings WHERE id = ?").bind(bookingId).first();
  if (!exists) throw notFound("Booking not found.");
  await db.batch([
    db.prepare("INSERT INTO booking_notes (id, booking_id, admin_id, body, created_at) VALUES (?, ?, ?, ?, ?)").bind(uid("BN"), bookingId, adminId, body, new Date().toISOString()),
    auditStatement(db, { adminId, action: "booking.note", entity: "booking", entityId: bookingId, detail: { body } }),
  ]);
  return listNotes(db, bookingId);
}

export async function searchBookings(db: D1Database, f: BookingFilters): Promise<Page<ReturnType<typeof toAdminBooking>>> {
  const { filter, params } = bookingFilter(f);
  const page = Math.max(1, f.page ?? 1);
  const pageSize = ADMIN_RULES.pageSize;

  const [count, rows] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM bookings b JOIN users u ON u.id = b.user_id ${filter}`).bind(...params),
    db.prepare(`${SELECT} ${filter} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`).bind(...params, pageSize, (page - 1) * pageSize),
  ]);
  return {
    items: (rows.results as AdminBookingRow[]).map(toAdminBooking),
    total: (count.results[0] as { n: number }).n,
    page,
    pageSize,
  };
}

interface TxnRow { id: string; kind: WalletTransaction["kind"]; amount: number; note: string; booking_id: string | null; created_at: string }

export async function bookingDetail(db: D1Database, id: string): Promise<AdminBookingDetail> {
  const row = await db.prepare(`${SELECT} WHERE b.id = ?`).bind(id).first<AdminBookingRow & { coupon_code: string | null; discount: number; vendor_id: string | null; vendor_vehicle_id: string | null; vendor_driver_id: string | null; quote_id: string | null }>();
  if (!row) throw notFound("Booking not found.");
  const active = row.status === "confirmed" || row.status === "ongoing";
  const cancellable = active && (row.service !== "parcel" || (!!row.parcel_state && PARCEL_CANCELLABLE.includes(row.parcel_state)));
  const tollEstimate = active && row.service === "rentals" ? await quotedTolls(db, row.quote_id) : null;
  const [{ results: txns }, history, partner, notes] = await Promise.all([
    db.prepare("SELECT * FROM wallet_transactions WHERE booking_id = ? ORDER BY created_at").bind(id).all<TxnRow>(),
    listAudit(db, 1, "booking", id),
    row.vendor_vehicle_id
      ? db.prepare(`SELECT vv.reg_number, u.name AS vendor_name, d.name AS driver_name FROM vendor_vehicles vv JOIN vendors ve ON ve.id = vv.vendor_id
          JOIN users u ON u.id = ve.user_id LEFT JOIN vendor_drivers d ON d.id = ? WHERE vv.id = ?`).bind(row.vendor_driver_id, row.vendor_vehicle_id)
        .first<{ reg_number: string; vendor_name: string; driver_name: string | null }>()
      : Promise.resolve(null),
    listNotes(db, id),
  ]);
  return {
    booking: toAdminBooking(row),
    wallet: txns.map((t) => ({ id: t.id, kind: t.kind, amount: t.amount, note: t.note, bookingId: t.booking_id, createdAt: t.created_at })),
    coupon: row.coupon_code ? { code: row.coupon_code, discount: row.discount } : null,
    refundIfCancelled: cancellable ? await refundFor(db, row) : null,
    history: history.items,
    partner: partner && row.vendor_id && row.vendor_vehicle_id
      ? { vendorId: row.vendor_id, vendorName: partner.vendor_name, vehicleId: row.vendor_vehicle_id, regNumber: partner.reg_number, driverName: partner.driver_name }
      : null,
    tollEstimate,
    notes,
  };
}

/** ₹ of toll estimate in a quote's lines, or null when it had none. */
async function quotedTolls(db: D1Database, quoteId: string | null): Promise<number | null> {
  if (!quoteId) return null;
  const q = await db.prepare("SELECT lines FROM quotes WHERE id = ?").bind(quoteId).first<{ lines: string }>();
  const line = q ? (JSON.parse(q.lines) as FareLine[]).find((l) => l.label === TOLL_LINE) : undefined;
  return line ? line.amount : null;
}

async function assertActive(db: D1Database, id: string) {
  const row = await db.prepare("SELECT status FROM bookings WHERE id = ?").bind(id).first<{ status: string }>();
  if (!row) throw notFound("Booking not found.");
  if (row.status !== "confirmed" && row.status !== "ongoing") throw conflict(`This booking is already ${row.status}.`);
}

/** Cancels any customer's active booking; a wallet payment goes back to their wallet. */
export async function adminCancel(db: D1Database, adminId: string, id: string, reason: string) {
  await assertActive(db, id);
  const row = await cancelBookingRow(db, null, id, "Refund by QuikFly");
  if (!row) {
    await assertActive(db, id); // lost a race: explain the new status
    throw conflict(PARCEL_NOT_CANCELLABLE); // still active, so it's a parcel on its way
  }
  await audit(db, { adminId, action: "booking.cancel", entity: "booking", entityId: id, detail: { reason, amount: row!.amount, payment: row!.payment, refund: row!.refund_amount, refundedToWallet: row!.payment === "wallet" && (row!.refund_amount ?? 0) > 0 } });
  await notify(db, row!.user_id, { kind: "booking.cancelled_by_staff", ref: id, bookingId: id, title: `QuikFly cancelled · ${row!.title}`, body: `${reason} ${refundText(row!)}` });
  return bookingDetail(db, id);
}

/**
 * Closes a booking; a self-drive deposit paid from the wallet goes back to the customer. A group
 * trip quoted with a toll estimate needs the actual tolls (`tollsActual`): less than quoted comes
 * back (to the wallet for wallet bookings, in the same batch), more is recorded as owed (demo:
 * not collected). Either way the booking gets a "Tolls" line.
 */
export async function adminComplete(db: D1Database, adminId: string, id: string, tollsActual?: number) {
  const returned = await db.prepare("SELECT 1 AS ok FROM rentals WHERE booking_id = ? AND return_at IS NOT NULL AND settlement IS NULL").bind(id).first();
  if (returned) throw conflict("The customer has returned this car. Settle the deposit from the Rental section instead.");
  const current = await db.prepare("SELECT service, status, quote_id, payment, lines, user_id, title FROM bookings WHERE id = ?").bind(id)
    .first<{ service: string; status: string; quote_id: string | null; payment: string; lines: string; user_id: string; title: string }>();
  if (current?.service === "parcel") throw conflict("A parcel completes when it's handed over with the receiver's collection code.");
  const estimate = current && current.service === "rentals" && (current.status === "confirmed" || current.status === "ongoing") ? await quotedTolls(db, current.quote_id) : null;
  if (estimate === null && tollsActual !== undefined) throw badRequest("This booking has no toll estimate to settle.");
  if (estimate !== null && tollsActual === undefined) throw badRequest(`Enter the actual tolls for this trip (₹${estimate.toLocaleString("en-IN")} was quoted).`);
  if (tollsActual !== undefined && (!Number.isInteger(tollsActual) || tollsActual < 0 || tollsActual > TOLLS_MAX)) throw badRequest(`Actual tolls must be ₹0 to ₹${TOLLS_MAX.toLocaleString("en-IN")}.`);
  let tolls: { estimate: number; actual: number; refund: number; due: number; text: string } | null = null;
  if (estimate !== null && tollsActual !== undefined && current) {
    const { refund, due } = tollSettlement(estimate, tollsActual);
    const wallet = current.payment === "wallet";
    const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
    const text = `${inr(tollsActual)} (estimate ${inr(estimate)})${refund ? ` · ${inr(refund)} ${wallet ? "back to your wallet" : "refund due"}` : due ? ` · ${inr(due)} more owed (demo: not collected)` : ""}`;
    tolls = { estimate, actual: tollsActual, refund, due, text };
  }
  const done = await completeBookingRow(db, id, tolls && current ? {
    depositBack: 0, note: `Tolls refund · ${current.title}`,
    statements: (stillActive) => {
      const lines = [...(JSON.parse(current.lines) as [string, string][]).filter(([k]) => k !== TOLLS_SETTLED_LINE), [TOLLS_SETTLED_LINE, tolls!.text]];
      const credit = current.payment === "wallet" ? tolls!.refund : 0;
      return [
        db.prepare(`UPDATE bookings SET lines = ?2 WHERE id = ?1 AND ${stillActive}`).bind(id, JSON.stringify(lines)),
        db.prepare(`UPDATE users SET wallet_balance = wallet_balance + ?2 WHERE id = ?3 AND ?2 > 0 AND ${stillActive}`).bind(id, credit, current.user_id),
        db.prepare(
          `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
           SELECT ?2, ?3, 'refund', ?4, ?5, ?1, ?6 WHERE ?4 > 0 AND ${stillActive}`,
        ).bind(id, uid("WT"), current.user_id, credit, `Tolls refund · ${current.title}`, new Date().toISOString()),
      ];
    },
  } : undefined);
  if (!done) await assertActive(db, id); // throws: not found, or already finished
  await audit(db, { adminId, action: "booking.complete", entity: "booking", entityId: id,
    detail: tolls ? { tollsEstimate: tolls.estimate, tollsActual: tolls.actual, tollsRefund: tolls.refund, tollsDue: tolls.due, toWallet: done!.payment === "wallet" }
      : done!.deposit ? { depositReturned: done!.deposit, toWallet: done!.payment === "wallet" } : undefined });
  if (tolls && (tolls.refund || tolls.due)) {
    await notify(db, done!.user_id, { kind: "booking.changed", ref: `${id}:tolls`, bookingId: id, title: `Tolls settled · ${done!.title}`, body: `Tolls came to ${tolls.text}.` });
  }
  if (done!.deposit) {
    await notify(db, done!.user_id, { kind: "booking.deposit_returned", ref: id, bookingId: id, title: `Deposit returned · ${done!.title}`,
      body: done!.payment === "wallet" ? `₹${done!.deposit.toLocaleString("en-IN")} is back in your QuikFly wallet.` : `₹${done!.deposit.toLocaleString("en-IN")} is due back to you.` });
  }
  return bookingDetail(db, id);
}
