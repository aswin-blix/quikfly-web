// Staff side of partner trips and money: payout requests (paid outside the app with a bank
// reference, which writes the ledger row), and assigning group-travel bookings to a live
// partner vehicle. Every decision is audited; the partner is notified.
import { formatRegNumber, inrPaise, type AdminPayout, type AssignableVehicle, type VendorPayout } from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { uid } from "../../lib/random";
import { notify } from "../notifications";
import { toPayout } from "../partner-trips";
import { auditStatement } from "./audit";

export async function payoutQueue(db: D1Database, status: VendorPayout["status"]): Promise<AdminPayout[]> {
  const { results } = await db.prepare(
    `SELECT p.*, u.name AS vendor_name, v.bank_holder, v.bank_ifsc, v.bank_account FROM vendor_payouts p
     JOIN vendors v ON v.id = p.vendor_id JOIN users u ON u.id = v.user_id
     WHERE p.status = ? ORDER BY ${status === "requested" ? "p.requested_at ASC" : "p.decided_at DESC"} LIMIT 200`,
  ).bind(status).all<Parameters<typeof toPayout>[0] & { vendor_name: string; bank_holder: string | null; bank_ifsc: string | null; bank_account: string | null }>();
  return results.map((r) => ({
    ...toPayout(r), vendorId: r.vendor_id, vendorName: r.vendor_name,
    bank: r.bank_holder && r.bank_ifsc && r.bank_account ? { holder: r.bank_holder, ifsc: r.bank_ifsc, account: r.bank_account } : null,
  }));
}

/** Paid (with the bank reference; the ledger records it) or rejected (with a reason). */
export async function decidePayout(db: D1Database, adminId: string, id: string, decision: "paid" | "rejected", opts: { reference?: string; note?: string }) {
  const p = await db.prepare("SELECT p.*, v.user_id FROM vendor_payouts p JOIN vendors v ON v.id = p.vendor_id WHERE p.id = ?").bind(id)
    .first<{ id: string; vendor_id: string; amount_paise: number; status: string; user_id: string }>();
  if (!p) throw notFound("Payout request not found.");
  if (p.status !== "requested") throw conflict("This payout has already been decided.");
  if (decision === "paid" && !opts.reference) throw badRequest("Add the bank transfer reference (UTR).");
  if (decision === "rejected" && !opts.note) throw badRequest("Give a reason; the partner sees it.");
  const now = new Date().toISOString();
  const statements = [
    db.prepare("UPDATE vendor_payouts SET status = ?, reference = ?, note = ?, decided_at = ?, admin_id = ? WHERE id = ? AND status = 'requested'")
      .bind(decision, opts.reference ?? null, opts.note ?? null, now, adminId, id),
    auditStatement(db, { adminId, action: `vendor.payout.${decision}`, entity: "vendor", entityId: p.vendor_id, detail: { payout: id, amountPaise: p.amount_paise, ...opts } }),
  ];
  if (decision === "paid") {
    statements.push(db.prepare(
      `INSERT INTO vendor_ledger (id, vendor_id, kind, amount_paise, payout_id, note, created_at)
       SELECT ?1, ?2, 'payout', ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM vendor_payouts WHERE id = ?4 AND status = 'paid' AND decided_at = ?6)`,
    ).bind(uid("VL"), p.vendor_id, -p.amount_paise, id, `Payout · ref ${opts.reference}`, now));
  }
  const [updated] = await db.batch(statements);
  if (!updated.meta.changes) throw conflict("Someone else decided this payout just now.");
  await notify(db, p.user_id, decision === "paid"
    ? { kind: "vendor.payout", ref: `${id}:paid`, title: `${inrPaise(p.amount_paise)} paid to your bank`, body: `Reference ${opts.reference}. It can take a few hours to show in your account.` }
    : { kind: "vendor.payout", ref: `${id}:rejected`, title: "Payout request not paid", body: opts.note! });
}

/** Live partner vehicles with an approved driver, for staff to give a group trip to. */
export async function assignableVehicles(db: D1Database): Promise<AssignableVehicle[]> {
  const { results } = await db.prepare(
    `SELECT vv.id, vv.reg_number, vv.type, vv.vendor_id, u.name AS vendor_name, d.id AS driver_id, d.name AS driver_name
     FROM vendor_vehicles vv JOIN vendor_drivers d ON d.vehicle_id = vv.id AND d.status = 'active'
     JOIN vendors ve ON ve.id = vv.vendor_id AND ve.status = 'active' JOIN users u ON u.id = ve.user_id AND u.deleted_at IS NULL
     WHERE vv.status = 'active' AND vv.type IN ('car', 'tempo', 'bus') ORDER BY vv.type, vv.reg_number LIMIT 300`,
  ).all<{ id: string; reg_number: string; type: AssignableVehicle["type"]; vendor_id: string; vendor_name: string; driver_id: string; driver_name: string }>();
  return results.map((r) => ({ vehicleId: r.id, regNumber: r.reg_number, type: r.type, vendorId: r.vendor_id, vendorName: r.vendor_name, driverId: r.driver_id, driverName: r.driver_name }));
}

/** Gives an active group-travel booking to a partner vehicle (with its driver), or takes it back with null. */
export async function assignBookingVendor(db: D1Database, adminId: string, bookingId: string, vehicleId: string | null) {
  const b = await db.prepare("SELECT id, service, status, title, starts_at, vendor_id FROM bookings WHERE id = ?").bind(bookingId)
    .first<{ id: string; service: string; status: string; title: string; starts_at: string | null; vendor_id: string | null }>();
  if (!b) throw notFound("Booking not found.");
  if (b.service !== "rentals") throw conflict("Only group-travel bookings are assigned by staff; rides find a partner vehicle themselves.");
  if (b.status !== "confirmed" && b.status !== "ongoing") throw conflict("Only an active booking can be assigned.");
  if (vehicleId === null) {
    await db.batch([
      db.prepare("UPDATE bookings SET vendor_id = NULL, vendor_vehicle_id = NULL, vendor_driver_id = NULL WHERE id = ?").bind(bookingId),
      auditStatement(db, { adminId, action: "booking.vendor.unassign", entity: "booking", entityId: bookingId, detail: {} }),
    ]);
    return;
  }
  const v = (await assignableVehicles(db)).find((x) => x.vehicleId === vehicleId);
  if (!v) throw conflict("That vehicle isn't live with an approved driver.");
  await db.batch([
    db.prepare("UPDATE bookings SET vendor_id = ?, vendor_vehicle_id = ?, vendor_driver_id = ? WHERE id = ?").bind(v.vendorId, v.vehicleId, v.driverId, bookingId),
    auditStatement(db, { adminId, action: "booking.vendor.assign", entity: "booking", entityId: bookingId, detail: { vehicle: v.regNumber, vendor: v.vendorName } }),
  ]);
  const user = await db.prepare("SELECT user_id FROM vendors WHERE id = ?").bind(v.vendorId).first<{ user_id: string }>();
  if (user) {
    await notify(db, user.user_id, {
      kind: "vendor.trip", ref: `${bookingId}:${v.vehicleId}`, title: `New trip for ${formatRegNumber(v.regNumber)}`,
      body: `${b.title}${b.starts_at ? `, ${new Date(b.starts_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}` : ""}. Driver: ${v.driverName}.`,
    });
  }
}
