"use client";
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Gift, Wallet } from "lucide-react";
import type { WalletTransaction } from "@quikfly/shared";
import { REFUND_TIMINGS, WALLET_KIND_LABEL } from "@/lib/account";
import { api } from "@/lib/api";
import { cx, inr, prettyDateTime } from "@/lib/format";
import { useApp } from "../AppProvider";
import { Section } from "./kit";

export function WalletSection() {
  const { user } = useApp();
  const [history, setHistory] = useState<WalletTransaction[] | null>(null);
  const [error, setError] = useState("");
  const balance = user?.walletBalance;

  // Reload when the balance changes (e.g. a booking elsewhere in the app).
  useEffect(() => {
    api.account.walletHistory().then(setHistory, (e) => setError((e as Error).message));
  }, [balance]);
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

      <Section title="History">
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
