import type { WalletTransaction, WalletTxnKind } from "@quikfly/shared";
import { uid } from "../lib/random";

interface TxnRow {
  id: string; kind: WalletTxnKind; amount: number; note: string; booking_id: string | null; created_at: string;
}

/** A ledger entry, as a statement to run in the same batch as the balance change. */
export function txnStatement(
  db: D1Database,
  t: { userId: string; kind: WalletTxnKind; amount: number; note: string; bookingId?: string | null },
) {
  return db.prepare(
    "INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(uid("WT"), t.userId, t.kind, t.amount, t.note, t.bookingId ?? null, new Date().toISOString());
}

export async function listTransactions(db: D1Database, userId: string): Promise<WalletTransaction[]> {
  const { results } = await db.prepare("SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100")
    .bind(userId).all<TxnRow>();
  return results.map((r) => ({ id: r.id, kind: r.kind, amount: r.amount, note: r.note, bookingId: r.booking_id, createdAt: r.created_at }));
}
