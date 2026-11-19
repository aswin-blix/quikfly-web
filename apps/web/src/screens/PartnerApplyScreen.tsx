"use client";
// /partner/apply: vehicle owners apply (step 1) and onboard (step 2) on the website, with the
// same /vendor endpoints as the QuikFly Partner app. Fleet, trips and money stay in the app.
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, Circle, CircleAlert, Download, Handshake, Lock, Paintbrush, ScrollText, Wallet } from "lucide-react";
import {
  VENDOR_AGREEMENT_TERMS, VENDOR_SECTIONS, VENDOR_SECTION_LABEL, readyToSubmit,
  type SectionState, type VendorApplication, type VendorSection,
} from "@quikfly/shared";
import { useApp } from "@/components/AppProvider";
import { useSettings } from "@/components/ConfigProvider";
import { SectionForm } from "@/components/partner/ApplySections";
import { GoldButton, PageHeader, Spinner } from "@/components/ui";
import { ErrorText } from "@/components/account/kit";
import { api, DEMO_MODE } from "@/lib/api";
import { cx, inr } from "@/lib/format";
import { Link } from "@/lib/nav";
import { REVIEW_POLL_MS } from "@/lib/partner";
import { PARTNER_APP } from "@/lib/site";

const STATE: Record<SectionState, { label: string; className: string; Icon: typeof Circle }> = {
  pending: { label: "Pending", className: "text-subtle", Icon: Circle },
  filled: { label: "Filled", className: "text-gold", Icon: CheckCircle2 },
  changes: { label: "Needs changes", className: "text-warning", Icon: CircleAlert },
  approved: { label: "Approved", className: "text-success", Icon: CheckCircle2 },
};

export function PartnerApplyScreen() {
  const { user, requireAuth, toast } = useApp();
  const settings = useSettings();
  const [app, setApp] = useState<VendorApplication | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<VendorSection | "fee" | "agreement" | "sticker" | null>(null);
  const [busy, setBusy] = useState(false);
  const [signName, setSignName] = useState("");
  const [accept, setAccept] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(() => api.vendor.get().then(setApp, (e) => setError((e as Error).message)), []);
  useEffect(() => { if (user) load(); else setApp(undefined); }, [user, load]);
  useEffect(() => { if (user && !signName) setSignName(user.name); }, [user, signName]);
  // Waiting for review: check now and then, so approval shows without a reload.
  useEffect(() => {
    if (app?.status !== "submitted" && !(app?.status === "onboarding" && app.onboarding.stickerRequestedAt)) return;
    const t = setInterval(load, REVIEW_POLL_MS);
    return () => clearInterval(t);
  }, [app?.status, app?.onboarding.stickerRequestedAt, load]);

  async function run(call: () => Promise<VendorApplication>, done?: string) {
    setBusy(true); setError("");
    try {
      setApp(await call());
      if (done) toast(done);
      setOpen(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const header = (
    <PageHeader crumbs={[["Home", "/"], ["Become a partner", "/partner"], ["Apply"]]} title="Partner application" icon={<Handshake className="text-gold" size={36} />}
      sub="Register your cab, auto, tempo traveller or bus. It takes about 10 minutes; keep your RC, insurance and bank details handy." />
  );

  if (!user) {
    return (
      <>{header}
        <div className="max-w-3xl mx-auto px-4">
          <div className="panel p-6 text-center">
            <p className="text-soft">Sign in with your mobile number to start or continue your application. Already a QuikFly customer? Use the same number.</p>
            <GoldButton className="mt-4" onClick={() => requireAuth(() => undefined)}>Sign in to apply</GoldButton>
          </div>
        </div>
      </>
    );
  }
  if (app === undefined) return <>{header}<div className="py-16 text-center text-gold">{error ? <p className="text-danger">{error}</p> : <Spinner size={26} />}</div></>;

  if (app === null) {
    return (
      <>{header}
        <div className="max-w-3xl mx-auto px-4">
          <div className="panel p-6">
            <p className="font-semibold text-strong">Hi {user.name.split(" ")[0] || "there"}</p>
            <p className="text-sm text-muted mt-1">Your application saves as you go, so you can finish it later here or in the QuikFly Partner app.</p>
            <ErrorText>{error}</ErrorText>
            <GoldButton className="mt-4" loading={busy} onClick={() => run(() => api.vendor.start())}>Start my application</GoldButton>
          </div>
        </div>
      </>
    );
  }

  const anySentBack = VENDOR_SECTIONS.some((s) => app.sections[s].state === "changes");
  const banner = app.status === "draft" ? (anySentBack ? 'QuikFly asked for a few changes. Fix the sections marked "Needs changes", then send your application again.' : "Please complete the pending details to join QuikFly.")
    : app.status === "submitted" ? "Your application is with QuikFly for review. We'll send you a notification when it's checked."
    : app.status === "onboarding" ? "Approved! Finish these steps to go live."
    : app.status === "active" ? "You're live on QuikFly."
    : app.status === "rejected" ? `Your application wasn't accepted${app.note ? `: ${app.note}` : "."}`
    : "Your partner account is blocked. Call partner support.";
  const step2 = app.status === "onboarding" || app.status === "active";
  const o = app.onboarding;

  const row = (key: typeof open, title: string, sub: React.ReactNode, icon: React.ReactNode, body: React.ReactNode, locked = false) => (
    <div key={key} className="panel overflow-hidden">
      <button className="w-full flex items-center gap-3 p-4 text-left disabled:opacity-60" disabled={locked} onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}>
        {icon}
        <span className="flex-1 min-w-0"><span className="block font-semibold text-strong">{title}</span><span className="block text-xs mt-0.5">{sub}</span></span>
        {locked ? <Lock size={16} className="text-subtle" /> : <motion.span animate={{ rotate: open === key ? 180 : 0 }}><ChevronDown size={18} className="text-subtle" /></motion.span>}
      </button>
      <AnimatePresence initial={false}>
        {open === key && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-4 pb-4 pt-1 border-t border-line">{body}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <>{header}
      <div className="max-w-3xl mx-auto px-4 pb-16 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[["1", "Application", !step2], ["2", "Onboarding", step2]].map(([n, t, on]) => (
            <div key={n as string} className={cx("panel p-4", on ? "!border-gold/60 bg-gold/[0.06]" : "opacity-70")}>
              <p className="label">Step {n}</p>
              <p className="font-display text-lg text-strong flex items-center gap-2">{t}{!on && n === "2" && <Lock size={15} className="text-subtle" />}</p>
            </div>
          ))}
        </div>
        <div className={cx("panel p-4 text-sm", app.status === "rejected" || app.status === "blocked" ? "text-danger" : app.status === "active" ? "text-success" : "text-soft")} role="status">{banner}</div>
        {DEMO_MODE && (app.status === "submitted" || (o.stickerRequestedAt && !o.stickerDoneAt)) && <p className="text-xs text-subtle">Demo: there's no staff review here, so this moves on by itself in about 20 seconds.</p>}
        <ErrorText>{error}</ErrorText>

        {!step2 && app.status !== "rejected" && app.status !== "blocked" && (
          <>
            {VENDOR_SECTIONS.map((s) => {
              const st = app.sections[s];
              const meta = STATE[st.state];
              const readOnly = app.status !== "draft" || st.state === "approved";
              return row(s, VENDOR_SECTION_LABEL[s],
                <span className={meta.className}>{meta.label}{st.note ? <span className="text-warning"> · QuikFly asked: {st.note}</span> : null}</span>,
                <meta.Icon size={22} className={cx("shrink-0", meta.className)} />,
                <SectionForm app={app} section={s} readOnly={readOnly} onSaved={(a) => { setApp(a); if (a.sections[s].state === "filled" && s !== "photo") { toast(`${VENDOR_SECTION_LABEL[s]} saved`); setOpen(null); } }} />);
            })}
            {app.status === "draft" && (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <GoldButton disabled={!readyToSubmit(app)} loading={busy} onClick={() => run(() => api.vendor.submit(), "Application sent to QuikFly")}>Submit application</GoldButton>
                {confirmReset ? (
                  <>
                    <span className="text-sm text-soft">Clear everything you&apos;ve entered, photos included?</span>
                    <button className="text-sm px-3 py-1.5 rounded-lg bg-danger/15 text-danger hover:bg-danger/25" disabled={busy} onClick={() => { setConfirmReset(false); run(() => api.vendor.reset(), "Application cleared"); }}>Yes, reset</button>
                    <button className="text-sm text-muted" onClick={() => setConfirmReset(false)}>Keep it</button>
                  </>
                ) : <button className="text-sm text-muted hover:text-strong" disabled={busy} onClick={() => setConfirmReset(true)}>Reset</button>}
                {!readyToSubmit(app) && <p className="text-xs text-subtle w-full">Submit opens once every section is filled.</p>}
              </div>
            )}
          </>
        )}

        {step2 && (
          <>
            {row("fee", "Payment", o.paidAt ? <span className="text-success">Paid</span> : <span className="text-subtle">Joining fee {inr(o.fee)}</span>,
              <Wallet size={22} className={cx("shrink-0", o.paidAt ? "text-success" : "text-gold")} />,
              <div className="space-y-3">
                <p className="text-sm text-muted">One time, per partner. Covers onboarding, the vehicle audit and the QuikFly sticker kit.</p>
                <p className="text-xs text-subtle">Demo: no money is taken. Online payment comes once QuikFly&apos;s payment gateway is live.</p>
                {!o.paidAt && <GoldButton loading={busy} onClick={() => run(() => api.vendor.payJoiningFee(), "Payment recorded")}>Pay {inr(o.fee)}</GoldButton>}
              </div>)}
            {row("agreement", "Partner & vehicle agreement", o.agreementAt ? <span className="text-success">Accepted by {o.agreementName}</span> : <span className="text-subtle">{o.paidAt ? "Read and accept" : "Available after the payment"}</span>,
              <ScrollText size={22} className={cx("shrink-0", o.agreementAt ? "text-success" : "text-gold")} />,
              <div className="space-y-3">
                <p className="text-sm text-muted">Between you and {settings.companyName}</p>
                <ul className="space-y-2 text-sm list-disc pl-5 marker:text-gold">{VENDOR_AGREEMENT_TERMS.map((t) => <li key={t}>{t}</li>)}</ul>
                {!o.agreementAt && (
                  <>
                    <label className="block"><span className="label">Your full name (as your signature)</span>
                      <input className="field mt-1.5" value={signName} onChange={(e) => setSignName(e.target.value)} autoComplete="name" /></label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="accent-brand" />I have read and accept this agreement</label>
                    <GoldButton disabled={!accept || signName.trim().length < 2} loading={busy} onClick={() => run(() => api.vendor.acceptAgreement(signName.trim()), "Agreement accepted")}>Accept agreement</GoldButton>
                  </>
                )}
              </div>, !o.paidAt)}
            {row("sticker", "Vehicle sticker & paint",
              o.stickerDoneAt ? <span className="text-success">Done</span> : o.stickerRequestedAt ? <span className="text-gold">Requested · QuikFly will call you to fix a time</span> : <span className="text-subtle">{o.agreementAt ? "Request a slot" : "Available after the agreement"}</span>,
              <Paintbrush size={22} className={cx("shrink-0", o.stickerDoneAt ? "text-success" : "text-gold")} />,
              <div className="space-y-3">
                <p className="text-sm text-muted">Our team fixes the QuikFly stickers (and the roof sign for cabs) at {settings.vendorAuditAddress}. It takes about an hour. You go live as soon as it&apos;s done.</p>
                {!o.stickerRequestedAt && <GoldButton loading={busy} onClick={() => run(() => api.vendor.requestSticker(), "Request sent. We'll call you.")}>Request a slot</GoldButton>}
              </div>, !o.agreementAt)}
          </>
        )}

        {app.status === "active" && (
          <div className="panel p-5 space-y-3">
            <p className="text-sm text-soft">Add more vehicles and drivers, go on or off duty, and see trips, earnings and payouts in the QuikFly Partner app. Sign in there with the same number.</p>
            {PARTNER_APP.downloadUrl && <a href={PARTNER_APP.downloadUrl} className="btn-gold rounded-xl px-5 py-3 inline-flex items-center gap-2"><Download size={18} />Get the QuikFly Partner app (Android)</a>}
          </div>
        )}
        <p className="text-xs text-subtle">Questions? Call partner support on <a className="text-gold" href={`tel:${settings.companyPhone.replace(/\s/g, "")}`}>{settings.companyPhone}</a>, or read <Link href="/partner" className="text-gold">how partnering works</Link>.</p>
      </div>
    </>
  );
}
