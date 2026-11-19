"use client";
// Sign in / sign up: phone → OTP → (first time only) "complete your profile".
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Gift } from "lucide-react";
import { LIMITS, PATTERNS } from "@quikfly/shared";
import { useSettings } from "./ConfigProvider";
import { api, DEMO_OTP } from "@/lib/api";
import { cx, inr } from "@/lib/format";
import { useApp } from "./AppProvider";
import { useT } from "./LanguageProvider";
import { Link } from "@/lib/nav";
import { GoldButton, Modal } from "./ui";

type Step = "phone" | "otp" | "profile";
const TITLES: Record<Step, string> = { phone: "loginTitle", otp: "loginOtpTitle", profile: "loginProfileTitle" };

export function LoginModal() {
  const { loginOpen, closeLogin, setUser, toast } = useApp();
  const settings = useSettings();
  const t = useT();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reset = () => { setStep("phone"); setOtp(""); setName(""); setEmail(""); setCode(""); setShowCode(false); setErr(""); };
  const close = (ok: boolean) => { closeLogin(ok); reset(); };

  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr("");
    try { await fn(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!PATTERNS.phone.test(phone)) return setErr(t("loginErrPhone"));
    run(async () => { await api.auth.sendOtp(phone); setStep("otp"); });
  };

  const verify = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await api.auth.verifyOtp(`+91 ${phone}`, otp);
      setUser(r.user);
      if (r.restored) toast(t("loginRestored"));
      if (r.isNew) return setStep("profile");
      if (!r.restored) toast(t("loginWelcomeBack", { name: r.user.name }));
      close(true);
    });
  };

  const finish = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (n.length < LIMITS.nameMin) return setErr(t("loginErrName"));
    if (email && !PATTERNS.email.test(email.trim())) return setErr(t("loginErrEmail"));
    run(async () => {
      let user = await api.account.update({ name: n, ...(email.trim() ? { email: email.trim() } : {}) });
      setUser(user);
      if (code.trim()) {
        try {
          user = await api.account.applyReferral(code.trim());
          setUser(user);
          toast(t("loginReferralApplied", { amount: inr(settings.referralBonus) }));
        } catch (e) {
          // The profile is saved; let them fix the code or skip it.
          setCode(""); setShowCode(true);
          throw new Error(`${(e as Error).message} ${t("loginReferralRetry")}`);
        }
      }
      toast(`${t("loginWelcomeNew", { name: user.name })} ${settings.welcomeCredit ? t("loginWalletCredit", { amount: inr(settings.welcomeCredit) }) : ""}`.trim());
      close(true);
    });
  };

  return (
    // Sign-up can't be dismissed half-way: the account exists, so closing just finishes later.
    <Modal open={loginOpen} onClose={() => close(step === "profile")} title={t(TITLES[step])}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.25 }}>
          {step === "phone" && (
            <form onSubmit={send} className="space-y-4">
              <p className="text-sm text-muted">{t("loginIntro")}</p>
              <div>
                <label className="label" htmlFor="lp">{t("loginMobile")}</label>
                <div className="flex mt-1.5 gap-2">
                  <span className="field !w-auto text-muted">+91</span>
                  <input id="lp" className="field" inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="98765 43210" autoFocus
                    value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
                </div>
              </div>
              {err && <p className="text-danger text-sm">{err}</p>}
              <GoldButton className="w-full" loading={busy}>{t("loginSendOtp")}</GoldButton>
              <p className="text-[11px] text-subtle text-center"><Link href="/privacy" className="hover:text-gold underline-offset-2 hover:underline" onClick={() => close(false)}>{t("loginPrivacy")}</Link></p>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-sm text-muted">{t("loginCodeSent", { phone: `+91 ${phone}` })} <button type="button" className="text-gold" onClick={() => { setStep("phone"); setOtp(""); }}>{t("loginChange")}</button></p>
              <OtpInput value={otp} onChange={setOtp} />
              {DEMO_OTP && <p className="text-xs text-gold-pale/80">{t("loginDemoOtp", { otp: DEMO_OTP })}</p>}
              {err && <motion.p initial={{ x: -8 }} animate={{ x: [8, -6, 4, 0] }} className="text-danger text-sm">{err}</motion.p>}
              <GoldButton className="w-full" loading={busy} disabled={otp.length !== 4}>{t("loginVerify")}</GoldButton>
            </form>
          )}

          {step === "profile" && (
            <form onSubmit={finish} className="space-y-4">
              <p className="text-sm text-muted">{t("loginYoureIn")}</p>
              <div>
                <label className="label" htmlFor="sn">{t("loginFullName")}</label>
                <input id="sn" className="field mt-1.5" autoComplete="name" placeholder={t("loginNameExample")} autoFocus value={name}
                  maxLength={LIMITS.nameMax} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="se">{t("loginEmailOptional")} <span className="normal-case tracking-normal text-subtle">· {t("loginEmailHint")}</span></label>
                <input id="se" type="email" className="field mt-1.5" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {!settings.featureReferral ? null : showCode ? (
                <div>
                  <label className="label" htmlFor="sc">{t("loginReferralCode")}</label>
                  <input id="sc" className="field mt-1.5 uppercase" placeholder="e.g. QF7K2M9P" value={code} onChange={(e) => setCode(e.target.value)} />
                  <p className="text-xs text-muted mt-1">{t("loginReferralBonus", { amount: inr(settings.referralBonus) })}</p>
                </div>
              ) : (
                <button type="button" onClick={() => setShowCode(true)} className="text-sm text-gold flex items-center gap-1.5"><Gift size={15} />{t("loginHaveCode")}</button>
              )}
              {err && <p className="text-danger text-sm">{err}</p>}
              <GoldButton className="w-full" loading={busy}>{t("loginCreate")}</GoldButton>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}

/** Four boxes over one hidden input, so paste and SMS autofill work. */
export function OtpInput({ value, onChange, autoFocus = true }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <input aria-label="OTP" className="absolute inset-0 opacity-0" inputMode="numeric" autoComplete="one-time-code" maxLength={4} autoFocus={autoFocus}
        value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))} />
      <div className="grid grid-cols-4 gap-3 pointer-events-none">
        {[0, 1, 2, 3].map((i) => (
          <motion.div key={i} animate={{ scale: value.length === i ? 1.05 : 1 }}
            className={cx("h-14 rounded-xl border bg-ink grid place-items-center text-2xl font-bold transition-colors", value.length === i ? "border-gold" : "border-line")}>
            {value[i] ?? ""}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
