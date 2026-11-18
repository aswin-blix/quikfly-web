// Bookings for staff: search across all customers, detail with wallet entries, and
// cancel (with wallet refund) or complete. Each action is audited.
import { ADMIN_RULES, type AdminBookingDetail, type BookingFilters, type Page, type WalletTransaction } from "@quikfly/shared";
import { conflict, notFound } from "../../lib/errors";
import { cancelBookingRow, completeBookingRow, refundFor, refundText } from "../bookings";
import { notify } from "../notifications";
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
  const row = await db.prepare(`${SELECT} WHERE b.id = ?`).bind(id).first<AdminBookingRow & { coupon_code: string | null; discount: number; vendor_id: string | null; vendor_vehicle_id: string | null; vendor_driver_id: string | null }>();
  if (!row) throw notFound("Booking not found.");
  const active = row.status === "confirmed" || row.status === "ongoing";
  const [{ results: txns }, history, partner] = await Promise.all([
    db.prepare("SELECT * FROM wallet_transactions WHERE booking_id = ? ORDER BY created_at").bind(id).all<TxnRow>(),
    listAudit(db, 1, "booking", id),
    row.vendor_vehicle_id
      ? db.prepare(`SELECT vv.reg_number, u.name AS vendor_name, d.name AS driver_name FROM vendor_vehicles vv JOIN vendors ve ON ve.id = vv.vendor_id
          JOIN users u ON u.id = ve.user_id LEFT JOIN vendor_drivers d ON d.id = ? WHERE vv.id = ?`).bind(row.vendor_driver_id, row.vendor_vehicle_id)
        .first<{ reg_number: string; vendor_name: string; driver_name: string | null }>()
      : Promise.resolve(null),
  ]);
  return {
    booking: toAdminBooking(row),
    wallet: txns.map((t) => ({ id: t.id, kind: t.kind, amount: t.amount, note: t.note, bookingId: t.booking_id, createdAt: t.created_at })),
    coupon: row.coupon_code ? { code: row.coupon_code, discount: row.discount } : null,
    refundIfCancelled: active ? await refundFor(db, row) : null,
    history: history.items,
    partner: partner && row.vendor_id && row.vendor_vehicle_id
      ? { vendorId: row.vendor_id, vendorName: partner.vendor_name, vehicleId: row.vendor_vehicle_id, regNumber: partner.reg_number, driverName: partner.driver_name }
      : null,
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
  await notify(db, row!.user_id, { kind: "booking.cancelled_by_staff", ref: id, bookingId: id, title: `QuikFly cancelled · ${row!.title}`, body: `${reason} ${refundText(row!)}` });
  return bookingDetail(db, id);
}

/** Closes a booking; a self-drive deposit paid from the wallet goes back to the customer. */
export async function adminComplete(db: D1Database, adminId: string, id: string) {
  const done = await completeBookingRow(db, id);
  if (!done) await assertActive(db, id); // throws: not found, or already finished
  await audit(db, { adminId, action: "booking.complete", entity: "booking", entityId: id, detail: done!.deposit ? { depositReturned: done!.deposit, toWallet: done!.payment === "wallet" } : undefined });
  if (done!.deposit) {
    await notify(db, done!.user_id, { kind: "booking.deposit_returned", ref: id, bookingId: id, title: `Deposit returned · ${done!.title}`,
      body: done!.payment === "wallet" ? `₹${done!.deposit.toLocaleString("en-IN")} is back in your QuikFly wallet.` : `₹${done!.deposit.toLocaleString("en-IN")} is due back to you.` });
  }
  return bookingDetail(db, id);
}
