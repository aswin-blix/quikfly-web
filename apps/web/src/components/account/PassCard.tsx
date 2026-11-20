"use client";
import { Ticket } from "lucide-react";
import { PASS_NAME, effectiveSurge, passSaleError } from "@quikfly/shared";
import { api } from "@/lib/api";
import { inr, prettyDate } from "@/lib/format";
import { useApp } from "../AppProvider";
import { useConfig, useSettings } from "../ConfigProvider";
import { GoldButton } from "../ui";
import { ErrorText, Section, useAction } from "./kit";

/** QuikFly Pass in Account → Wallet: what it does, when it ends, and buying or extending it. */
export function PassCard() {
  const { user, setUser, toast } = useApp();
  const settings = useSettings();
  const rules = useConfig()?.surgeRules ?? [];
  const { run, busy, error } = useAction();
  if (!user) return null;
  const saleError = passSaleError(settings, rules);
  const active = !!user.passUntil;
  // Nothing to show when the pass isn't sold and the rider doesn't hold one.
  if (saleError && !active) return null;
  const short = user.walletBalance < settings.passPrice;

  const buy = () => run(async () => {
    const { passUntil } = await api.account.buyPass();
    setUser(await api.auth.me());
    toast(`${PASS_NAME} active until ${prettyDate(passUntil)}`, "ok");
  });

  return (
    <div id="pass">
      <Section
        title={PASS_NAME}
        sub={`Peak hours (${settings.surgeHours}) add a ×${effectiveSurge(settings)} surge to ride fares. With the pass you pay the normal fare on every bike, auto and cab ride for ${settings.passDays} days.`}
      >
        <div className="rounded-2xl border border-line p-5 flex items-center gap-4">
          <Ticket className="text-gold shrink-0" size={30} />
          <div className="min-w-0">
            <p className="text-xs text-muted">{active ? "Active until" : "Price"}</p>
            <p className="font-display text-3xl text-strong">{active ? prettyDate(user.passUntil!) : inr(settings.passPrice)}</p>
            {!active && <p className="text-xs text-subtle mt-0.5">for {settings.passDays} days</p>}
          </div>
        </div>
        {!saleError && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <GoldButton onClick={buy} loading={busy} disabled={short}>
              {active ? `Add ${settings.passDays} days · ${inr(settings.passPrice)}` : `Get ${PASS_NAME} · ${inr(settings.passPrice)}`}
            </GoldButton>
            <p className="text-xs text-subtle">
              {short ? `Your wallet has ${inr(user.walletBalance)}; the pass costs ${inr(settings.passPrice)}.` : "Paid from your wallet. A pass can't be cancelled or refunded."}
              {active && !short && " The new days start when this pass ends."}
            </p>
          </div>
        )}
        <div className="mt-3"><ErrorText>{error}</ErrorText></div>
      </Section>
    </div>
  );
}
