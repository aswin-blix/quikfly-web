"use client";
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Coins, Gift, Wallet } from "lucide-react";
import { PassCard } from "./PassCard";
import type { CreditSummary, WalletTransaction } from "@quikfly/shared";
import { CREDIT_KIND_LABEL, REFUND_TIMINGS, WALLET_KIND_LABEL } from "@/lib/account";
import { useSettings } from "../ConfigProvider";
import { api } from "@/lib/api";
import { cx, inr, prettyDate, prettyDateTime } from "@/lib/format";
import { useApp } from "../AppProvider";
import { Section } from "./kit";

export function WalletSection() {
  const { user } = useApp();
  const [history, setHistory] = useState<WalletTransaction[] | null>(null);
  const [error, setError] = useState("");
  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const settings = useSettings();
  const balance = user?.walletBalance;
  const creditBalance = user?.creditBalance;

  // Reload when a balance changes (e.g. a booking elsewhere in the app).
  useEffect(() => {
    api.account.walletHistory().then(setHistory, (e) => setError((e as Error).message));
  }, [balance]);
  useEffect(() => {
    api.account.credits().then(setCredits, () => setCredits(null));
  }, [creditBalance]);
  const rates = ([["Rides", settings.creditsRides], ["Bus", settings.creditsBus], ["Holidays", settings.creditsTours], ["Rent a car", settings.creditsRent], ["Group travel", settings.creditsGroup]] as const)
    .filter(([, pct]) => pct > 0);
  if (!user) return null;

  return (
    <div className="space-y-5">
      <Section title="Wallet" sub="Use it for any QuikFly booking. Refunds to the wallet are instant. Wallet money can't be withdrawn to a bank.">
        <div className="rounded-2xl border border-gold/30 bg-gold/[0.06] p-5 flex items-center gap-4">
          <Wallet className="text-gold shrink-0" size={30} />
          <div>
            <p className="text-xs text-muted">Available balance</p>
            <p className="font-display text-3xl text-strong">{inr(user.walletBalance)}</p>
          </div>
        </div>
        <p className="text-xs text-subtle mt-3">Adding money is available once online payments go live.</p>
      </Section>

      <PassCard />

      <Section title="QuikFly Credits" sub={`Earned back on completed trips. Credits pay up to ${settings.creditsMaxRedeemPercent}% of a booking, expire ${settings.creditsExpiryDays} days after you get them, and can't be withdrawn.`}>
        <div className="rounded-2xl border border-line p-5 flex items-center gap-4">
          <Coins className="text-gold shrink-0" size={30} />
          <div className="min-w-0">
            <p className="text-xs text-muted">Credits to use</p>
            <p className="font-display text-3xl text-strong">{inr(user.creditBalance)}</p>
            {credits?.nextExpiry && <p className="text-xs text-subtle mt-0.5">{inr(credits.nextExpiry.amount)} expire on {prettyDate(credits.nextExpiry.expiresAt)}</p>}
          </div>
        </div>
        {rates.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-muted mb-2">How much comes back (up to {inr(settings.creditsCap)} a booking)</p>
            <div className="flex flex-wrap gap-2">{rates.map(([label, pct]) => <span key={label} className="chip !text-xs">{label} · {pct}%</span>)}</div>
          </div>
        )}
        {credits && credits.items.length > 0 && (
          <ul className="divide-y divide-line mt-3">
            {credits.items.map((t) => {
              const gained = t.amount >= 0;
              return (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", gained ? "bg-gold/10 text-gold" : "bg-fg/5 text-muted")}><Coins size={18} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-strong truncate">{t.note}</p>
                    <p className="text-xs text-subtle">
                      {CREDIT_KIND_LABEL[t.kind]} · {prettyDateTime(t.createdAt)}
                      {gained && t.remaining > 0 && t.expiresAt ? ` · ${t.remaining < t.amount ? `${inr(t.remaining)} left, ` : ""}expires ${prettyDate(t.expiresAt)}` : ""}
                    </p>
                  </div>
                  <span className={cx("font-semibold tabular-nums", gained ? "text-gold" : "text-strong")}>{gained ? "+" : "−"}{inr(Math.abs(t.amount))}</span>
                </li>
              );
            })}
          </ul>
        )}
        {credits && credits.items.length === 0 && <p className="text-sm text-muted mt-3">Complete a trip to earn your first credits.</p>}
      </Section>

      <Section title="Wallet history">
        {error && <p className="text-sm text-danger">{error}</p>}
        {!history && !error && <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>}
        {history?.length === 0 && <p className="text-sm text-muted">No wallet activity yet.</p>}
        {history && history.length > 0 && (
          <ul className="divide-y divide-line">
            {history.map((t) => {
              const credit = t.amount >= 0;
              const Icon = t.kind === "referral" || t.kind === "welcome" ? Gift : credit ? ArrowDownLeft : ArrowUpRight;
              return (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", credit ? "bg-success/10 text-success" : "bg-fg/5 text-muted")}><Icon size={18} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-strong truncate">{t.note}</p>
                    <p className="text-xs text-subtle">{WALLET_KIND_LABEL[t.kind]} · {prettyDateTime(t.createdAt)}</p>
                  </div>
                  <span className={cx("font-semibold tabular-nums", credit ? "text-success" : "text-strong")}>{credit ? "+" : "−"}{inr(Math.abs(t.amount))}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Refund timings" sub="How long a cancelled booking takes to reach you, by how you paid.">
        <dl className="divide-y divide-line text-sm">
          {REFUND_TIMINGS.map(([k, v]) => <div key={k} className="flex justify-between py-2.5"><dt className="text-muted">{k}</dt><dd className="font-medium text-strong">{v}</dd></div>)}
        </dl>
      </Section>
    </div>
  );
}
