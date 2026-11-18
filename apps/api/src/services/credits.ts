// QuikFly Credits (see packages/shared/src/credits.ts for the rules). Balances are always
// computed from unexpired rows, so an expiry takes effect the moment it passes; the cron
// (scheduled.ts) only writes the 'expired' history rows. Statements that move credits for a
// booking are guarded by a condition on that booking and run in the booking's db.batch().
import { creditsEarned, type CreditEntry, type CreditKind, type CreditSummary, type ServiceKey, type Settings } from "@quikfly/shared";
import { CREDITS_HISTORY } from "../config";
import { uid } from "../lib/random";

/** Column for user SELECTs (`FROM users u`): the live credit balance. ISO text compares in time order. */
export const CREDIT_BALANCE_COLUMN =
  "(SELECT COALESCE(SUM(c.remaining), 0) FROM credits c WHERE c.user_id = u.id AND c.remaining > 0 AND c.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) AS credit_balance";

export const creditExpiry = (settings: Settings, from = Date.now()) => new Date(from + settings.creditsExpiryDays * 86_400_000).toISOString();

interface CreditRow {
  id: string; kind: CreditKind; amount: number; remaining: number; expires_at: string | null; booking_id: string | null; note: string; created_at: string;
}

/** Unused, unexpired credits, soonest expiry first (the order they are spent in). */
async function liveLots(db: D1Database, userId: string) {
  const { results } = await db.prepare(
    "SELECT id, remaining, expires_at FROM credits WHERE user_id = ? AND remaining > 0 AND expires_at > ? ORDER BY expires_at, id",
  ).bind(userId, new Date().toISOString()).all<{ id: string; remaining: number; expires_at: string }>();
  return results;
}

export async function creditSummary(db: D1Database, userId: string): Promise<CreditSummary> {
  const [lots, { results }] = await Promise.all([
    liveLots(db, userId),
    db.prepare("SELECT * FROM credits WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").bind(userId, CREDITS_HISTORY).all<CreditRow>(),
  ]);
  const first = lots[0];
  return {
    balance: lots.reduce((s, l) => s + l.remaining, 0),
    nextExpiry: first ? { amount: lots.filter((l) => l.expires_at === first.expires_at).reduce((s, l) => s + l.remaining, 0), expiresAt: first.expires_at } : null,
    items: results.map((r): CreditEntry => ({
      id: r.id, kind: r.kind, amount: r.amount, note: r.note, bookingId: r.booking_id, createdAt: r.created_at, expiresAt: r.expires_at, remaining: r.remaining,
    })),
  };
}

/** The balance, and which credits would pay `want` of it (soonest expiry first). */
export async function spendPlan(db: D1Database, userId: string) {
  const lots = await liveLots(db, userId);
  const balance = lots.reduce((s, l) => s + l.remaining, 0);
  return {
    balance,
    plan(want: number) {
      const out: { id: string; take: number }[] = [];
      let left = want;
      for (const l of lots) {
        if (left <= 0) break;
        const take = Math.min(l.remaining, left);
        out.push({ id: l.id, take });
        left -= take;
      }
      return out;
    },
  };
}

/**
 * Statement: the credits a booking earns once it is completed (inserted only if it is, and
 * only once per booking). Null when the booking earns nothing.
 */
export function earnStatement(
  db: D1Database, settings: Settings,
  row: { id: string; user_id: string; service: ServiceKey; amount: number; deposit: number | null; title: string },
) {
  const earn = creditsEarned(settings, row.service, row.amount, row.deposit ?? 0);
  if (!earn) return null;
  const statement = db.prepare(
    `INSERT OR IGNORE INTO credits (id, user_id, kind, amount, remaining, expires_at, booking_id, note, created_at)
     SELECT ?1, ?2, 'earned', ?3, ?3, ?4, ?5, ?6, ?7 WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ?5 AND status = 'completed')`,
  ).bind(uid("CR"), row.user_id, earn, creditExpiry(settings), row.id, `Earned · ${row.title}`, new Date().toISOString());
  return { earn, statement };
}

/** The notification for credits just earned. */
export const earnedNotice = (earn: number, title: string, settings: Settings) => ({
  kind: "credits.earned" as const,
  title: `You earned ₹${earn.toLocaleString("en-IN")} QuikFly Credits`,
  body: `For ${title}. Use them on your next booking within ${settings.creditsExpiryDays} days.`,
});
