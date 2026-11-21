// Customers for staff: search, one customer's detail, and the actions on an account (wallet
// adjustments, suspend / lift, sign out everywhere, cancel a scheduled deletion). Every action
// is audited in the same batch as its change (AGENTS.md rules 4 and 6).
import { ADMIN_RULES, type AdminCustomer, type AdminCustomerDetail, type CustomerFilters, type CustomerStatus, type Page } from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { listTransactions, txnStatement } from "../wallet";
import { auditStatement, listAudit } from "./audit";
import { toAdminBooking, type AdminBookingRow } from "./stats";

interface CustomerRow {
  id: string; name: string; phone: string; email: string | null; created_at: string; last_active_at: string | null;
  wallet_balance: number; deleted_at: string | null; erased_at: string | null; suspended_at: string | null; suspend_reason: string | null;
  licence_status: AdminCustomer["licenceStatus"]; bookings: number; vendor_status: string | null;
}

const statusOf = (r: CustomerRow): CustomerStatus =>
  r.erased_at ? "erased" : r.suspended_at ? "suspended" : r.deleted_at ? "deleting" : "active";

const toCustomer = (r: CustomerRow): AdminCustomer => ({
  id: r.id, name: r.name, phone: r.phone, email: r.email, createdAt: r.created_at, lastActiveAt: r.last_active_at,
  walletBalance: r.wallet_balance, bookings: r.bookings, status: statusOf(r), suspendReason: r.suspend_reason,
  suspendedAt: r.suspended_at, deletedAt: r.deleted_at, licenceStatus: r.licence_status, vendorStatus: r.vendor_status,
});

const SELECT = `SELECT u.id, u.name, u.phone, u.email, u.created_at, u.last_active_at, u.wallet_balance, u.deleted_at, u.erased_at,
  u.suspended_at, u.suspend_reason, u.licence_status,
  (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id) AS bookings,
  (SELECT v.status FROM vendors v WHERE v.user_id = u.id) AS vendor_status
  FROM users u`;

const STATUS_WHERE: Record<CustomerStatus, string> = {
  active: "u.erased_at IS NULL AND u.suspended_at IS NULL AND u.deleted_at IS NULL",
  suspended: "u.erased_at IS NULL AND u.suspended_at IS NOT NULL",
  deleting: "u.erased_at IS NULL AND u.deleted_at IS NOT NULL",
  erased: "u.erased_at IS NOT NULL",
};

export async function searchCustomers(db: D1Database, f: CustomerFilters): Promise<Page<AdminCustomer>> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    const digits = f.q.replace(/\D/g, "");
    where.push(`(u.id = ? OR u.name LIKE ? OR u.email LIKE ?${digits.length >= 4 ? " OR REPLACE(u.phone, ' ', '') LIKE ?" : ""})`);
    params.push(f.q, like, like, ...(digits.length >= 4 ? [`%${digits}%`] : []));
  }
  if (f.status) where.push(STATUS_WHERE[f.status]);
  const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const page = Math.max(1, f.page ?? 1);
  const pageSize = ADMIN_RULES.pageSize;
  const [count, rows] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM users u ${filter}`).bind(...params),
    db.prepare(`${SELECT} ${filter} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).bind(...params, pageSize, (page - 1) * pageSize),
  ]);
  return { items: (rows.results as CustomerRow[]).map(toCustomer), total: (count.results[0] as { n: number }).n, page, pageSize };
}

async function customerRow(db: D1Database, id: string): Promise<CustomerRow> {
  const row = await db.prepare(`${SELECT} WHERE u.id = ?`).bind(id).first<CustomerRow>();
  if (!row) throw notFound("Customer not found.");
  return row;
}

export async function customerDetail(db: D1Database, id: string): Promise<AdminCustomerDetail> {
  const row = await customerRow(db, id);
  const [wallet, bookings, history, sessions] = await Promise.all([
    listTransactions(db, id),
    db.prepare(
      `SELECT b.*, u.name AS customer_name, u.phone AS customer_phone, NULL AS rental_state FROM bookings b JOIN users u ON u.id = b.user_id
       WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT 10`,
    ).bind(id).all<AdminBookingRow>(),
    listAudit(db, 1, "customer", id),
    db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?").bind(id, Date.now()).first<{ n: number }>(),
  ]);
  return {
    customer: toCustomer(row),
    wallet,
    bookings: bookings.results.map(toAdminBooking),
    history: history.items,
    sessions: sessions?.n ?? 0,
  };
}

/**
 * Credits (amount > 0) or debits (amount < 0) the wallet, with the reason on the ledger row the
 * customer sees. A debit can't take the balance below zero.
 */
export async function adjustWallet(db: D1Database, adminId: string, id: string, amount: number, reason: string): Promise<AdminCustomerDetail> {
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > ADMIN_RULES.walletAdjustMax) {
    throw badRequest(`"amount" must be a whole number of rupees from -${ADMIN_RULES.walletAdjustMax} to ${ADMIN_RULES.walletAdjustMax}, not 0.`);
  }
  const row = await customerRow(db, id);
  if (row.erased_at) throw conflict("This account has been erased.");
  if (row.wallet_balance + amount < 0) throw conflict(`The wallet holds ₹${row.wallet_balance}; it can't go below zero.`);
  await db.batch([
    db.prepare("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?").bind(amount, id),
    txnStatement(db, { userId: id, kind: "adjustment", amount, note: reason }),
    auditStatement(db, { adminId, action: amount > 0 ? "customer.wallet_credit" : "customer.wallet_debit", entity: "customer", entityId: id, detail: { amount, reason, before: row.wallet_balance, after: row.wallet_balance + amount } }),
  ]);
  return customerDetail(db, id);
}

/** Suspends the account: every session ends now and sign-in is refused until staff lift it. */
export async function suspendCustomer(db: D1Database, adminId: string, id: string, reason: string): Promise<AdminCustomerDetail> {
  const row = await customerRow(db, id);
  if (row.erased_at) throw conflict("This account has been erased.");
  if (row.suspended_at) throw conflict("This account is already suspended.");
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE users SET suspended_at = ?, suspend_reason = ? WHERE id = ?").bind(now, reason, id),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
    auditStatement(db, { adminId, action: "customer.suspend", entity: "customer", entityId: id, detail: { reason } }),
  ]);
  return customerDetail(db, id);
}

export async function unsuspendCustomer(db: D1Database, adminId: string, id: string, reason: string): Promise<AdminCustomerDetail> {
  const row = await customerRow(db, id);
  if (!row.suspended_at) throw conflict("This account isn't suspended.");
  await db.batch([
    db.prepare("UPDATE users SET suspended_at = NULL, suspend_reason = NULL WHERE id = ?").bind(id),
    auditStatement(db, { adminId, action: "customer.unsuspend", entity: "customer", entityId: id, detail: { reason, suspendedSince: row.suspended_at, was: row.suspend_reason } }),
  ]);
  return customerDetail(db, id);
}

/** Ends every sign-in session (lost phone, shared account...). The customer signs in again with an OTP. */
export async function signOutCustomer(db: D1Database, adminId: string, id: string, reason: string): Promise<AdminCustomerDetail> {
  await customerRow(db, id);
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
    auditStatement(db, { adminId, action: "customer.sign_out_all", entity: "customer", entityId: id, detail: { reason } }),
  ]);
  return customerDetail(db, id);
}

/** Stops a deletion the customer scheduled (they asked support to keep the account). */
export async function cancelCustomerDeletion(db: D1Database, adminId: string, id: string, reason: string): Promise<AdminCustomerDetail> {
  const row = await customerRow(db, id);
  if (row.erased_at) throw conflict("This account has already been erased; it can't be restored.");
  if (!row.deleted_at) throw conflict("No deletion is scheduled for this account.");
  await db.batch([
    db.prepare("UPDATE users SET deleted_at = NULL WHERE id = ?").bind(id),
    auditStatement(db, { adminId, action: "customer.cancel_deletion", entity: "customer", entityId: id, detail: { reason, wasScheduledAt: row.deleted_at } }),
  ]);
  return customerDetail(db, id);
}
