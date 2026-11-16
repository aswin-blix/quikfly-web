"use client";
import { useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { REFERRAL_BONUS } from "@quikfly/shared";
import { api } from "@/lib/api";
import { inr } from "@/lib/format";
import { useApp } from "../AppProvider";
import { GoldButton } from "../ui";
import { ErrorText, Field, Section, useAction } from "./kit";

export function ReferSection() {
  const { user, setUser, toast } = useApp();
  const [code, setCode] = useState("");
  const { run, busy, error } = useAction();
  if (!user) return null;

  const message = `Join me on QuikFly for rides, buses, holidays and rentals. Use my code ${user.referralCode} when you sign up and we both get ${inr(REFERRAL_BONUS)} in our wallets. ${location.origin}`;
  const copy = () => { try { navigator.clipboard.writeText(user.referralCode); toast("Code copied"); } catch { toast("Couldn't copy. Long-press the code instead.", "err"); } };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: "QuikFly", text: message }); } catch { /* dismissed */ } }
    else { try { await navigator.clipboard.writeText(message); toast("Invite message copied"); } catch { copy(); } }
  };
  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => { setUser(await api.account.applyReferral(code)); setCode(""); toast(`${inr(REFERRAL_BONUS)} added to your wallet`); });
  };

  return (
    <div className="space-y-5">
      <Section title="Refer & earn" sub={`Invite friends: when they join with your code, you both get ${inr(REFERRAL_BONUS)} in your wallets.`}>
        <div className="rounded-2xl border border-dashed border-gold/50 p-5 text-center">
          <p className="text-xs text-muted">Your referral code</p>
          <p className="font-mono text-3xl tracking-[0.2em] text-gold mt-1">{user.referralCode}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={copy} className="chip flex items-center gap-1.5"><Copy size={14} />Copy code</button>
            <GoldButton type="button" onClick={share} className="!py-2"><Share2 size={16} />Invite friends</GoldButton>
          </div>
        </div>
        <ol className="mt-5 grid sm:grid-cols-3 gap-3 text-sm">
          {["Share your code", "Your friend signs up and enters it", `You both get ${inr(REFERRAL_BONUS)} wallet credit`].map((s, i) => (
            <li key={s} className="rounded-xl border border-line p-3 flex gap-3"><span className="w-6 h-6 rounded-full bg-gold/15 text-gold text-xs grid place-items-center shrink-0">{i + 1}</span><span className="text-soft">{s}</span></li>
          ))}
        </ol>
      </Section>

      <Section title="Have a friend's code?" sub="You can use one referral code per account.">
        {user.referred ? (
          <p className="text-sm text-success">You&apos;ve already used a referral code. Thanks for joining through a friend!</p>
        ) : (
          <form onSubmit={apply} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1"><Field label="Friend's code" htmlFor="rf-code"><input id="rf-code" className="field uppercase" placeholder="e.g. QF7K2M9P" value={code} onChange={(e) => setCode(e.target.value)} /></Field></div>
            <GoldButton loading={busy} disabled={!code.trim()}>Apply</GoldButton>
          </form>
        )}
        <div className="mt-3"><ErrorText>{error}</ErrorText></div>
      </Section>
    </div>
  );
}
