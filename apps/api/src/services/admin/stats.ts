// Dashboard numbers. Days are counted in India time (BUSINESS_UTC_OFFSET_MIN), like fares.
import type { AdminBooking, AdminStats, ServiceKey } from "@quikfly/shared";
import { BUSINESS_UTC_OFFSET_MIN } from "../../config";

export interface AdminBookingRow {
  id: string; service: ServiceKey; title: string; subtitle: string; amount: number; status: AdminBooking["status"];
  payment: AdminBooking["payment"]; lines: string; created_at: string;
  starts_at: string | null; refund_amount: number | null; deposit: number; cancel_reason: string | null; cancel_fee: number; ride_id: string | null; trip_id: string | null; credits_used: number;
  user_id: string; customer_name: string; customer_phone: string;
}

export const toAdminBooking = (r: AdminBookingRow): AdminBooking => ({
  id: r.id, service: r.service, title: r.title, subtitle: r.subtitle, amount: r.amount, status: r.status,
  payment: r.payment, createdAt: r.created_at, lines: JSON.parse(r.lines),
  startsAt: r.starts_at ?? null, refundAmount: r.refund_amount ?? null, deposit: r.deposit ?? 0,
  cancelReason: r.cancel_reason ?? null, cancelFee: r.cancel_fee ?? 0, rideId: r.ride_id ?? null, tripId: r.trip_id ?? null,
  creditsUsed: r.credits_used ?? 0,
  customer: { id: r.user_id, name: r.customer_name, phone: r.customer_phone },
});

/** SQL for the India-time calendar date of an ISO timestamp column. */
export const LOCAL_DATE = (col: string) => `date(substr(${col}, 1, 19), '+${BUSINESS_UTC_OFFSET_MIN} minutes')`;

export async function dashboardStats(db: D1Database, days: number): Promise<AdminStats> {
  // The range starts at local midnight `days - 1` days ago, so "1 day" means "today".
  const local = new Date(Date.now() + BUSINESS_UTC_OFFSET_MIN * 60_000);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() - (days - 1));
  const since = new Date(local.getTime() - BUSINESS_UTC_OFFSET_MIN * 60_000).toISOString();

  const [totals, customers, byService, byDay, queues, recent] = await db.batch([
    db.prepare(
      `SELECT COUNT(*) AS bookings,
              COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN amount END), 0) AS revenue,
              SUM(status = 'cancelled') AS cancelled
       FROM bookings WHERE created_at >= ?`,
    ).bind(since),
    db.prepare(
      `SELECT SUM(created_at >= ?) AS new_customers, COUNT(*) AS customers, COALESCE(SUM(wallet_balance), 0) AS wallet
       FROM users WHERE deleted_at IS NULL`,
    ).bind(since),
    db.prepare(
      `SELECT service, COUNT(*) AS bookings, COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN amount END), 0) AS revenue
       FROM bookings WHERE created_at >= ? GROUP BY service ORDER BY revenue DESC`,
    ).bind(since),
    db.prepare(
      `SELECT ${LOCAL_DATE("created_at")} AS date, COUNT(*) AS bookings,
              COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN amount END), 0) AS revenue, SUM(status = 'cancelled') AS cancelled
       FROM bookings WHERE created_at >= ? GROUP BY date ORDER BY date`,
    ).bind(since),
    db.prepare(
      `SELECT SUM(licence_status = 'pending' AND deleted_at IS NULL) AS pending_licences, SUM(deleted_at IS NOT NULL) AS pending_deletions FROM users`,
    ),
    db.prepare(
      `SELECT b.*, u.name AS customer_name, u.phone AS customer_phone FROM bookings b JOIN users u ON u.id = b.user_id
       ORDER BY b.created_at DESC LIMIT 8`,
    ),
  ]);

  const t = totals.results[0] as { bookings: number; revenue: number; cancelled: number | null };
  const c = customers.results[0] as { new_customers: number | null; customers: number; wallet: number };
  const q = queues.results[0] as { pending_licences: number | null; pending_deletions: number | null };

  // Fill in days with no bookings so charts have a bar per day.
  const dayRows = new Map((byDay.results as AdminStats["byDay"]).map((d) => [d.date, d]));
  const allDays: AdminStats["byDay"] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(local.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    allDays.push(dayRows.get(d) ?? { date: d, bookings: 0, revenue: 0, cancelled: 0 });
  }

  return {
    days,
    totals: {
      bookings: t.bookings, revenue: t.revenue, cancelled: t.cancelled ?? 0,
      newCustomers: c.new_customers ?? 0, customers: c.customers, walletBalance: c.wallet,
    },
    byService: byService.results as AdminStats["byService"],
    byDay: allDays,
    queues: { pendingLicences: q.pending_licences ?? 0, pendingDeletions: q.pending_deletions ?? 0 },
    recent: (recent.results as AdminBookingRow[]).map(toAdminBooking),
  };
}
