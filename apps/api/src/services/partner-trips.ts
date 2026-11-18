// Trips on partners' vehicles and the money that follows: which partner vehicle takes a ride,
// the settlement written when a trip completes (vendor_trips + vendor_ledger, in the
// completion batch), the partner's trips, dashboard, statements, payouts and payments.
// Money here is in paise. No payment gateway yet: payouts are paid by staff outside the app
// and recorded with a reference; partner payments are simulated (labelled in the app).
import {
  formatRegNumber, tripEarnings, vehicleTypeForRide, VENDOR_VEHICLE_LABEL,
  type LedgerEntry, type LedgerKind, type PaymentMethod, type RideOption, type ServiceKey, type Settings, type VendorMoney, type VendorPayout,
  type VendorTrip, type VendorTripSummary,
} from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { loadVendor } from "./vendors";
import { getSettings } from "./settings";

/** A live partner vehicle with an approved driver that can take a ride now (least recently used first). */
export async function partnerForRide(db: D1Database, option: Pick<RideOption, "id" | "service">) {
  const type = vehicleTypeForRide(option);
  if (!type) return null;
  return db.prepare(
    `SELECT vv.id AS vehicle_id, vv.vendor_id, vv.reg_number, vv.type, d.id AS driver_id, d.name AS driver_name, d.phone AS driver_phone,
            (SELECT COUNT(*) FROM vendor_trips t WHERE t.driver_id = d.id) AS trips
     FROM vendor_vehicles vv
     JOIN vendor_drivers d ON d.vehicle_id = vv.id AND d.status = 'active'
     JOIN vendors ve ON ve.id = vv.vendor_id AND ve.status = 'active'
     JOIN users u ON u.id = ve.user_id AND u.deleted_at IS NULL
     WHERE vv.status = 'active' AND vv.type = ?
       AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.vendor_vehicle_id = vv.id AND b.status IN ('confirmed', 'ongoing') AND b.starts_at IS NULL)
     ORDER BY COALESCE((SELECT MAX(created_at) FROM bookings b WHERE b.vendor_vehicle_id = vv.id), '') ASC
     LIMIT 1`,
  ).bind(type).first<{ vehicle_id: string; vendor_id: string; reg_number: string; type: keyof typeof VENDOR_VEHICLE_LABEL; driver_id: string; driver_name: string; driver_phone: string; trips: number }>();
}

/** The ride's driver card for a partner vehicle. */
export const partnerDriverCard = (p: NonNullable<Awaited<ReturnType<typeof partnerForRide>>>, model: string) => ({
  name: p.driver_name, rating: 5, trips: p.trips, vehicle: model, plate: formatRegNumber(p.reg_number), phone: p.driver_phone,
});

interface SettleRow {
  id: string; service: ServiceKey; title: string; amount: number; discount: number; credits_used: number; payment: PaymentMethod;
  vendor_id: string | null; vendor_vehicle_id: string | null; vendor_driver_id: string | null;
}

/**
 * Statements that settle a completed partner trip: its split in vendor_trips, the earning
 * (+) and, for cash, what the driver collected (−) in vendor_ledger. Each only runs once the
 * booking is completed, and only once per booking. Empty for bookings without a partner.
 */
export function settlementStatements(db: D1Database, settings: Settings, row: SettleRow): D1PreparedStatement[] {
  if (!row.vendor_id) return [];
  const gross = row.amount + (row.discount ?? 0) + (row.credits_used ?? 0);
  const e = tripEarnings(settings, row.service, gross);
  const now = new Date().toISOString();
  const done = "EXISTS (SELECT 1 FROM bookings WHERE id = ?1 AND status = 'completed')";
  const statements = [
    db.prepare(
      `INSERT OR IGNORE INTO vendor_trips (booking_id, vendor_id, vehicle_id, driver_id, service, payment, gross_paise, discount_paise, gst_paise, fare_paise, commission_paise, tds_paise, earning_paise, completed_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14 WHERE ${done}`,
    ).bind(row.id, row.vendor_id, row.vendor_vehicle_id, row.vendor_driver_id, row.service, row.payment, e.gross, Math.round(((row.discount ?? 0) + (row.credits_used ?? 0)) * 100),
      e.gst, e.fare, e.commission, e.tds, e.earning, now),
    db.prepare(`INSERT OR IGNORE INTO vendor_ledger (id, vendor_id, kind, amount_paise, booking_id, note, created_at) SELECT ?2, ?3, 'earning', ?4, ?1, ?5, ?6 WHERE ${done}`)
      .bind(row.id, uid("VL"), row.vendor_id, e.earning, `Trip · ${row.title}`, now),
  ];
  if (row.payment === "cash") {
    statements.push(db.prepare(`INSERT OR IGNORE INTO vendor_ledger (id, vendor_id, kind, amount_paise, booking_id, note, created_at) SELECT ?2, ?3, 'cash', ?4, ?1, ?5, ?6 WHERE ${done}`)
      .bind(row.id, uid("VL"), row.vendor_id, -Math.round(row.amount * 100), `Cash collected · ${row.title}`, now));
  }
  return statements;
}

async function vendorIdOf(db: D1Database, userId: string) {
  const f = await loadVendor(db, { userId });
  if (!f) throw notFound("Start your partner application first.");
  return f.v.id;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A from/to range in India dates; defaults to the last 7 days. */
export function range(from?: string, to?: string) {
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const t = to && ISO_DATE.test(to) ? to : today;
  const f = from && ISO_DATE.test(from) ? from : new Date(Date.parse(`${t}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
  if (f > t) throw badRequest('"from" must be on or before "to".');
  // India day boundaries as UTC instants.
  return { from: f, to: t, fromIso: new Date(Date.parse(`${f}T00:00:00+05:30`)).toISOString(), toIso: new Date(Date.parse(`${t}T23:59:59.999+05:30`)).toISOString() };
}

interface TripRow {
  id: string; status: VendorTrip["status"]; service: ServiceKey; title: string; subtitle: string; created_at: string; starts_at: string | null;
  payment: PaymentMethod; amount: number; discount: number; credits_used: number; vendor_vehicle_id: string | null; vendor_driver_id: string | null;
  reg_number: string | null; driver_name: string | null;
  t_gross: number | null; t_discount: number | null; t_gst: number | null; t_fare: number | null; t_commission: number | null; t_tds: number | null; t_earning: number | null; completed_at: string | null;
}

/** Trips on the partner's vehicles in the range (by booking date), newest first. */
export async function partnerTrips(db: D1Database, userId: string, from?: string, to?: string): Promise<VendorTrip[]> {
  const vendorId = await vendorIdOf(db, userId);
  const r = range(from, to);
  const settings = await getSettings(db);
  const { results } = await db.prepare(
    `SELECT b.id, b.status, b.service, b.title, b.subtitle, b.created_at, b.starts_at, b.payment, b.amount, b.discount, b.credits_used,
            b.vendor_vehicle_id, b.vendor_driver_id, vv.reg_number, d.name AS driver_name,
            t.gross_paise AS t_gross, t.discount_paise AS t_discount, t.gst_paise AS t_gst, t.fare_paise AS t_fare, t.commission_paise AS t_commission,
            t.tds_paise AS t_tds, t.earning_paise AS t_earning, t.completed_at
     FROM bookings b
     LEFT JOIN vendor_trips t ON t.booking_id = b.id
     LEFT JOIN vendor_vehicles vv ON vv.id = b.vendor_vehicle_id
     LEFT JOIN vendor_drivers d ON d.id = b.vendor_driver_id
     WHERE b.vendor_id = ? AND b.created_at BETWEEN ? AND ?
     ORDER BY b.created_at DESC LIMIT 300`,
  ).bind(vendorId, r.fromIso, r.toIso).all<TripRow>();
  return results.map((b) => {
    const settled = b.t_earning !== null;
    const live = settled ? null : tripEarnings(settings, b.service, b.amount + (b.discount ?? 0) + (b.credits_used ?? 0));
    return {
      bookingId: b.id, status: b.status, service: b.service, title: b.title, subtitle: b.subtitle, createdAt: b.created_at, startsAt: b.starts_at,
      completedAt: b.completed_at, vehicleId: b.vendor_vehicle_id, regNumber: b.reg_number, driverId: b.vendor_driver_id, driverName: b.driver_name, payment: b.payment,
      grossPaise: settled ? b.t_gross! : live!.gross,
      discountPaise: settled ? b.t_discount! : Math.round(((b.discount ?? 0) + (b.credits_used ?? 0)) * 100),
      gstPaise: settled ? b.t_gst! : live!.gst,
      farePaise: settled ? b.t_fare! : live!.fare,
      commissionPaise: settled ? b.t_commission! : live!.commission,
      tdsPaise: settled ? b.t_tds! : live!.tds,
      earningPaise: settled ? b.t_earning! : b.status === "cancelled" ? 0 : live!.earning,
      estimate: !settled,
    };
  });
}

/** Completed trips in the range: totals, and per vehicle and per driver. */
export async function partnerSummary(db: D1Database, userId: string, from?: string, to?: string): Promise<VendorTripSummary> {
  const vendorId = await vendorIdOf(db, userId);
  const r = range(from, to);
  const [tot, veh, drv] = await db.batch([
    db.prepare(
      `SELECT COUNT(*) AS trips, COALESCE(SUM(gross_paise), 0) AS gross, COALESCE(SUM(CASE WHEN payment = 'cash' THEN gross_paise - discount_paise ELSE 0 END), 0) AS cash,
              COALESCE(SUM(CASE WHEN payment <> 'cash' THEN gross_paise - discount_paise ELSE 0 END), 0) AS online,
              COALESCE(SUM(discount_paise), 0) AS discount, COALESCE(SUM(earning_paise), 0) AS earning
       FROM vendor_trips WHERE vendor_id = ? AND completed_at BETWEEN ? AND ?`,
    ).bind(vendorId, r.fromIso, r.toIso),
    db.prepare(
      `SELECT t.vehicle_id, vv.reg_number, COUNT(*) AS trips, SUM(t.earning_paise) AS earning FROM vendor_trips t JOIN vendor_vehicles vv ON vv.id = t.vehicle_id
       WHERE t.vendor_id = ? AND t.completed_at BETWEEN ? AND ? GROUP BY t.vehicle_id ORDER BY earning DESC`,
    ).bind(vendorId, r.fromIso, r.toIso),
    db.prepare(
      `SELECT t.driver_id, d.name, COUNT(*) AS trips, SUM(t.earning_paise) AS earning FROM vendor_trips t JOIN vendor_drivers d ON d.id = t.driver_id
       WHERE t.vendor_id = ? AND t.completed_at BETWEEN ? AND ? GROUP BY t.driver_id ORDER BY earning DESC`,
    ).bind(vendorId, r.fromIso, r.toIso),
  ]) as [D1Result<{ trips: number; gross: number; cash: number; online: number; discount: number; earning: number }>,
    D1Result<{ vehicle_id: string; reg_number: string; trips: number; earning: number }>, D1Result<{ driver_id: string; name: string; trips: number; earning: number }>];
  const t = tot.results[0];
  return {
    from: r.from, to: r.to,
    revenue: { trips: t.trips, grossPaise: t.gross, cashPaise: t.cash, onlinePaise: t.online, discountPaise: t.discount, earningPaise: t.earning },
    vehicles: veh.results.map((v) => ({ vehicleId: v.vehicle_id, regNumber: v.reg_number, trips: v.trips, earningPaise: v.earning })),
    drivers: drv.results.map((d) => ({ driverId: d.driver_id, name: d.name, trips: d.trips, earningPaise: d.earning })),
  };
}

interface PayoutRow { id: string; vendor_id: string; amount_paise: number; status: VendorPayout["status"]; reference: string | null; note: string | null; requested_at: string; decided_at: string | null }
export const toPayout = (p: PayoutRow): VendorPayout => ({
  id: p.id, amountPaise: p.amount_paise, status: p.status, reference: p.reference, note: p.note, requestedAt: p.requested_at, decidedAt: p.decided_at,
});

export async function balanceOf(db: D1Database, vendorId: string) {
  const r = await db.prepare("SELECT COALESCE(SUM(amount_paise), 0) AS bal FROM vendor_ledger WHERE vendor_id = ?").bind(vendorId).first<{ bal: number }>();
  return r?.bal ?? 0;
}

export async function partnerMoney(db: D1Database, userId: string): Promise<VendorMoney> {
  const vendorId = await vendorIdOf(db, userId);
  const settings = await getSettings(db);
  const [bal, statements, entries, payouts] = await db.batch([
    db.prepare("SELECT COALESCE(SUM(amount_paise), 0) AS bal FROM vendor_ledger WHERE vendor_id = ?").bind(vendorId),
    // India months: completed_at shifted by +5:30.
    db.prepare(
      `SELECT substr(datetime(completed_at, '+330 minutes'), 1, 7) AS month, COUNT(*) AS trips, SUM(gross_paise) AS gross, SUM(commission_paise) AS commission,
              SUM(tds_paise) AS tds, SUM(earning_paise) AS earning, SUM(CASE WHEN payment = 'cash' THEN gross_paise - discount_paise ELSE 0 END) AS cash
       FROM vendor_trips WHERE vendor_id = ? GROUP BY month ORDER BY month DESC`,
    ).bind(vendorId),
    db.prepare("SELECT id, kind, amount_paise, note, booking_id, created_at FROM vendor_ledger WHERE vendor_id = ? ORDER BY created_at DESC LIMIT 100").bind(vendorId),
    db.prepare("SELECT * FROM vendor_payouts WHERE vendor_id = ? ORDER BY requested_at DESC LIMIT 50").bind(vendorId),
  ]) as [D1Result<{ bal: number }>, D1Result<{ month: string; trips: number; gross: number; commission: number; tds: number; earning: number; cash: number }>,
    D1Result<{ id: string; kind: LedgerKind; amount_paise: number; note: string; booking_id: string | null; created_at: string }>, D1Result<PayoutRow>];
  const all = payouts.results.map(toPayout);
  return {
    balancePaise: bal.results[0]?.bal ?? 0,
    minPayoutPaise: settings.vendorMinPayout * 100,
    pendingPayout: all.find((p) => p.status === "requested") ?? null,
    statements: statements.results.map((s) => ({ month: s.month, trips: s.trips, grossPaise: s.gross, commissionPaise: s.commission, tdsPaise: s.tds, earningPaise: s.earning, cashPaise: s.cash })),
    entries: entries.results.map((e): LedgerEntry => ({ id: e.id, kind: e.kind, amountPaise: e.amount_paise, note: e.note, bookingId: e.booking_id, createdAt: e.created_at })),
    payouts: all,
  };
}

/** Asks QuikFly to pay out what it owes (at least vendorMinPayout; one open request at a time). */
export async function requestPayout(db: D1Database, userId: string) {
  const f = await loadVendor(db, { userId });
  if (!f) throw notFound("Start your partner application first.");
  if (!f.v.bank_account) throw conflict("Add your bank account first.");
  const settings = await getSettings(db);
  const balance = await balanceOf(db, f.v.id);
  if (balance < settings.vendorMinPayout * 100) throw conflict(`You can request a payout once QuikFly owes you at least ₹${settings.vendorMinPayout}.`);
  try {
    await db.prepare("INSERT INTO vendor_payouts (id, vendor_id, amount_paise, requested_at) VALUES (?, ?, ?, ?)").bind(uid("VP"), f.v.id, balance, new Date().toISOString()).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw conflict("You already have a payout request waiting.");
    throw e;
  }
  return partnerMoney(db, userId);
}

/** Pays what the partner owes QuikFly (cash their drivers kept). Demo: nothing is collected. */
export async function payWhatIsOwed(db: D1Database, userId: string) {
  const vendorId = await vendorIdOf(db, userId);
  const balance = await balanceOf(db, vendorId);
  if (balance >= 0) throw conflict("You don't owe QuikFly anything.");
  await db.prepare(
    `INSERT INTO vendor_ledger (id, vendor_id, kind, amount_paise, note, created_at)
     SELECT ?1, ?2, 'payment', ?3, 'Paid to QuikFly (demo: nothing collected)', ?4 WHERE (SELECT COALESCE(SUM(amount_paise), 0) FROM vendor_ledger WHERE vendor_id = ?2) = ?5`,
  ).bind(uid("VL"), vendorId, -balance, new Date().toISOString(), balance).run();
  return partnerMoney(db, userId);
}
