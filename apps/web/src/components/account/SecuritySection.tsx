"use client";
import { useState } from "react";
import { LogOut, Smartphone, Trash2 } from "lucide-react";
import { DELETION_GRACE_DAYS, PATTERNS } from "@quikfly/shared";
import { api, DEMO_OTP } from "@/lib/api";
import { inr } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { useApp } from "../AppProvider";
import { OtpInput } from "../LoginModal";
import { GoldButton } from "../ui";
import { ErrorText, Field, Section, useAction } from "./kit";

const OtpHint = () => (DEMO_OTP ? <p className="text-xs text-gold-pale/80">Demo: use OTP <b>{DEMO_OTP}</b></p> : null);

function ChangeNumber() {
  const { user, setUser, toast } = useApp();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const { run, busy, error, setError } = useAction();

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!PATTERNS.phone.test(phone)) return setError("Enter a valid 10-digit mobile number.");
    run(async () => { await api.account.requestPhoneChange(phone); setSent(true); setOtp(""); });
  };
  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => { setUser(await api.account.changePhone(phone, otp)); toast("Mobile number updated"); setSent(false); setPhone(""); setOtp(""); });
  };

  return (
    <div>
      <p className="font-medium text-strong flex items-center gap-2"><Smartphone size={17} className="text-gold" />Mobile number</p>
      <p className="text-sm text-muted mt-1">Current: {user?.phone}. You&apos;ll sign in with the new number from now on.</p>
      {!sent ? (
        <form onSubmit={send} className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1"><Field label="New mobile number" htmlFor="cn-phone">
            <div className="flex gap-2"><span className="field !w-auto text-muted">+91</span>
              <input id="cn-phone" className="field" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} /></div>
          </Field></div>
          <GoldButton loading={busy}>Send OTP</GoldButton>
        </form>
      ) : (
        <form onSubmit={confirm} className="mt-4 space-y-3 max-w-sm">
          <p className="text-sm text-muted">Enter the code sent to +91 {phone}. <button type="button" className="text-gold" onClick={() => setSent(false)}>Change</button></p>
          <OtpInput value={otp} onChange={setOtp} />
          <OtpHint />
          <GoldButton className="w-full" loading={busy} disabled={otp.length !== 4}>Update number</GoldButton>
        </form>
      )}
      <div className="mt-2"><ErrorText>{error}</ErrorText></div>
    </div>
  );
}

function SignOutEverywhere() {
  const { setUser, toast } = useApp();
  const nav = useNav();
  const [confirming, setConfirming] = useState(false);
  const { run, busy, error } = useAction();
  const go = () => run(async () => { await api.account.signOutEverywhere(); setUser(null); toast("Signed out on all devices"); nav.replace("/"); });

  return (
    <div>
      <p className="font-medium text-strong flex items-center gap-2"><LogOut size={17} className="text-gold" />Sign out of all devices</p>
      <p className="text-sm text-muted mt-1">Lost a phone or used a shared computer? This ends every session, including this one.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <GoldButton loading={busy} onClick={go}>Yes, sign out everywhere</GoldButton>
            <button type="button" className="text-sm text-muted" onClick={() => setConfirming(false)}>Cancel</button>
          </>
        ) : <button type="button" className="chip" onClick={() => setConfirming(true)}>Sign out everywhere</button>}
        <ErrorText>{error}</ErrorText>
      </div>
    </div>
  );
}

function DeleteAccount() {
  const { user, setUser, toast } = useApp();
  const nav = useNav();
  const [open, setOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const { run, busy, error } = useAction();
  if (!user) return null;

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await api.account.deleteAccount(otp);
      setUser(null);
      toast(`Account scheduled for deletion. Sign in within ${DELETION_GRACE_DAYS} days to keep it.`);
      nav.replace("/");
    });
  };

  return (
    <div className="rounded-2xl border border-danger/30 bg-danger/[0.04] p-4 sm:p-5">
      <p className="font-medium text-danger flex items-center gap-2"><Trash2 size={17} />Delete account</p>
      <ul className="text-sm text-soft mt-2 space-y-1 list-disc pl-5">
        <li>Your account is closed now and erased after {DELETION_GRACE_DAYS} days. Sign in before then to cancel.</li>
        <li>Your wallet balance of <b>{inr(user.walletBalance)}</b> will be lost and can&apos;t be refunded.</li>
        <li>Upcoming bookings stay valid; cancel them first if you don&apos;t need them.</li>
      </ul>
      {!open ? (
        <button type="button" className="mt-4 text-sm font-semibold text-danger border border-danger/40 rounded-xl px-4 py-2 hover:bg-danger/10" onClick={() => setOpen(true)}>Delete my account</button>
      ) : (
        <form onSubmit={go} className="mt-4 space-y-3 max-w-sm">
          <p className="text-sm text-muted">To confirm, enter the code sent to {user.phone}.</p>
          <OtpInput value={otp} onChange={setOtp} />
          <OtpHint />
          <div className="flex items-center gap-3">
            <button className="text-sm font-semibold text-on-brand bg-danger rounded-xl px-4 py-2.5 disabled:opacity-50" disabled={otp.length !== 4 || busy}>{busy ? "Deleting…" : "Permanently delete"}</button>
            <button type="button" className="text-sm text-muted" onClick={() => { setOpen(false); setOtp(""); }}>Keep my account</button>
          </div>
        </form>
      )}
      <div className="mt-2"><ErrorText>{error}</ErrorText></div>
    </div>
  );
}

export function SecuritySection() {
  return (
    <Section title="Login & security">
      <div className="space-y-6 divide-y divide-line [&>*:not(:first-child)]:pt-6">
        <ChangeNumber />
        <SignOutEverywhere />
        <DeleteAccount />
      </div>
    </Section>
  );
}
