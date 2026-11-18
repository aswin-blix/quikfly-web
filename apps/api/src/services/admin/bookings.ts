// Bookings for staff: search across all customers, detail with wallet entries, and
// cancel (with wallet refund) or complete. Each action is audited.
import { ADMIN_RULES, type AdminBookingDetail, type BookingFilters, type Page, type WalletTransaction } from "@quikfly/shared";
import { conflict, notFound } from "../../lib/errors";
import { ACTIVE, cancelBookingRow, refundFor } from "../bookings";
import { audit, listAudit } from "./audit";
import { LOCAL_DATE, toAdminBooking, type AdminBookingRow } from "./stats";

const SELECT = "SELECT b.*, u.name AS customer_name, u.phone AS customer_phone FROM bookings b JOIN users u ON u.id = b.user_id";

export async function searchBookings(db: D1Database, f: BookingFilters): Promise<Page<ReturnType<typeof toAdminBooking>>> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    const digits = f.q.replace(/\D/g, "");
    where.push(`(b.id LIKE ? OR b.title LIKE ? OR u.name LIKE ?${digits.length >= 4 ? " OR REPLACE(u.phone, ' ', '') LIKE ?" : ""})`);
    params.push(like, like, like, ...(digits.length >= 4 ? [`%${digits}%`] : []));
  }
  if (f.status) { where.push("b.status = ?"); params.push(f.status); }
  if (f.service) { where.push("b.service = ?"); params.push(f.service); }
  if (f.from) { where.push(`${LOCAL_DATE("b.created_at")} >= ?`); params.push(f.from); }
  if (f.to) { where.push(`${LOCAL_DATE("b.created_at")} <= ?`); params.push(f.to); }
  const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
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
  const row = await db.prepare(`${SELECT} WHERE b.id = ?`).bind(id).first<AdminBookingRow & { coupon_code: string | null; discount: number }>();
  if (!row) throw notFound("Booking not found.");
  const active = row.status === "confirmed" || row.status === "ongoing";
  const [{ results: txns }, history] = await Promise.all([
    db.prepare("SELECT * FROM wallet_transactions WHERE booking_id = ? ORDER BY created_at").bind(id).all<TxnRow>(),
    listAudit(db, 1, "booking", id),
  ]);
  return {
    booking: toAdminBooking(row),
    wallet: txns.map((t) => ({ id: t.id, kind: t.kind, amount: t.amount, note: t.note, bookingId: t.booking_id, createdAt: t.created_at })),
    coupon: row.coupon_code ? { code: row.coupon_code, discount: row.discount } : null,
    refundIfCancelled: active ? await refundFor(db, row) : null,
    history: history.items,
  };
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
  if (!row) await assertActive(db, id); // lost a race: explain the new status
  await audit(db, { adminId, action: "booking.cancel", entity: "booking", entityId: id, detail: { reason, amount: row!.amount, payment: row!.payment, refund: row!.refund_amount, refundedToWallet: row!.payment === "wallet" && (row!.refund_amount ?? 0) > 0 } });
  return bookingDetail(db, id);
}

export async function adminComplete(db: D1Database, adminId: string, id: string) {
  const done = await db.prepare(`UPDATE bookings SET status = 'completed' WHERE id = ? AND status IN ${ACTIVE} RETURNING id`).bind(id).first();
  if (!done) await assertActive(db, id); // throws: not found, or already finished
  await audit(db, { adminId, action: "booking.complete", entity: "booking", entityId: id });
  return bookingDetail(db, id);
}
