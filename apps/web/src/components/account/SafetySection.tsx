"use client";
import { useEffect, useState } from "react";
import { PhoneCall, Share2, ShieldAlert, Trash2, UserRound } from "lucide-react";
import { AUTO_SHARE_MODES, LIMITS, NIGHT_HOURS, PATTERNS, RIDE_PIN, type AutoShareMode, type EmergencyContact } from "@quikfly/shared";
import { EMERGENCY_NUMBER } from "@/lib/account";
import { useSettings } from "../ConfigProvider";
import { api } from "@/lib/api";
import { useApp } from "../AppProvider";
import { GoldButton } from "../ui";
import { ErrorText, Field, ItemRow, Section, useAction } from "./kit";

const AUTO_SHARE_LABEL: Record<AutoShareMode, string> = { off: "Off", night: "Night rides", always: "Every ride" };
const hour = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;

export function SafetySection() {
  const SAFETY = { emergency: EMERGENCY_NUMBER, safetyLine: useSettings().safetyLine };
  const { user, setUser, toast } = useApp();
  const [contacts, setContacts] = useState<EmergencyContact[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [pinDraft, setPinDraft] = useState("");
  const { run, busy, error, setError } = useAction();

  useEffect(() => { run(async () => setContacts(await api.contacts.list())); }, [run]);
  if (!user) return null;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < LIMITS.nameMin) return setError("Enter the contact's name.");
    if (!PATTERNS.phone.test(phone)) return setError("Enter a valid 10-digit mobile number.");
    run(async () => {
      setContacts(await api.contacts.add({ name: name.trim(), phone, relation: relation.trim() || undefined }));
      setName(""); setPhone(""); setRelation("");
    });
  };
  const setAutoShare = (mode: AutoShareMode) => run(async () => {
    setUser(await api.account.update({ autoShareRides: mode }));
    toast(mode === "always" ? "Every ride will be shared automatically" : mode === "night" ? "Night rides will be shared automatically" : "Auto-share turned off");
  });
  const savePin = (pin: string | null) => {
    if (pin !== null && !RIDE_PIN.test(pin)) return setError("A ride PIN is 4 digits.");
    run(async () => {
      setUser(await api.account.update({ ridePin: pin }));
      setPinDraft("");
      toast(pin ? "Your ride PIN is set" : "Back to a new code every ride");
    });
  };
  const full = (contacts?.length ?? 0) >= LIMITS.emergencyContacts;
  const noContacts = (contacts?.length ?? 0) === 0;

  return (
    <div className="space-y-5">
      <Section title="Emergency contacts" sub={`Up to ${LIMITS.emergencyContacts} people we alert when you press SOS or share a trip.`}>
        {contacts === null ? <div className="skeleton h-16" /> : noContacts ? (
          <p className="text-sm text-muted">No emergency contacts yet. Add someone you trust.</p>
        ) : (
          <ul className="divide-y divide-line">
            {contacts.map((c) => (
              <ItemRow key={c.id} icon={<UserRound size={18} />} title={c.name} sub={[c.phone, c.relation].filter(Boolean).join(" · ")}
                action={<button type="button" aria-label={`Remove ${c.name}`} className="p-2 rounded-lg text-muted hover:text-danger hover:bg-danger/10"
                  onClick={() => run(async () => setContacts(await api.contacts.remove(c.id)))}><Trash2 size={16} /></button>} />
            ))}
          </ul>
        )}
        {!full && (
          <form onSubmit={add} className="mt-5 pt-5 border-t border-line grid sm:grid-cols-3 gap-4">
            <Field label="Name" htmlFor="ec-name"><input id="ec-name" className="field" maxLength={LIMITS.nameMax} value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Mobile" htmlFor="ec-phone">
              <div className="flex gap-2"><span className="field !w-auto text-muted">+91</span>
                <input id="ec-phone" className="field" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} /></div>
            </Field>
            <Field label="Relation (optional)" htmlFor="ec-rel"><input id="ec-rel" className="field" maxLength={30} placeholder="e.g. Sister" value={relation} onChange={(e) => setRelation(e.target.value)} /></Field>
            <div className="sm:col-span-3 flex flex-wrap items-center gap-3"><GoldButton loading={busy}>Add contact</GoldButton><ErrorText>{error}</ErrorText></div>
          </form>
        )}
      </Section>

      <Section title="Safety preferences">
        <p className="label mb-2">Share my trip automatically</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Share my trip automatically">
          {AUTO_SHARE_MODES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={user.autoShareRides === m} data-on={user.autoShareRides === m}
              disabled={busy || (noContacts && m !== "off")} onClick={() => setAutoShare(m)} className="chip !text-sm disabled:opacity-50">{AUTO_SHARE_LABEL[m]}</button>
          ))}
        </div>
        <p className="text-xs text-muted mt-2">
          {noContacts
            ? "Add an emergency contact first."
            : `Your emergency contacts get a live trip link as soon as a driver is assigned${user.autoShareRides === "night" ? ` (rides between ${hour(NIGHT_HOURS[0])} and ${hour(NIGHT_HOURS[1])})` : user.autoShareRides === "always" ? " (every ride)" : ""}. Demo: no SMS is sent.`}
        </p>

        <div className="mt-6 pt-5 border-t border-line">
          <p className="label mb-1">Ride PIN</p>
          <p className="text-xs text-muted mb-3">Use your own 4-digit PIN instead of a new code each ride. Tell it to the driver to start the trip.</p>
          {user.ridePin ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-lg tracking-[0.3em] text-strong">{user.ridePin}</span>
              <button type="button" className="text-sm text-muted hover:text-strong" disabled={busy} onClick={() => savePin(null)}>Use a new code each ride</button>
            </div>
          ) : (
            <form className="flex flex-wrap items-center gap-3" onSubmit={(e) => { e.preventDefault(); savePin(pinDraft); }}>
              <input aria-label="New ride PIN" className="field !w-32 font-mono tracking-[0.3em] text-center" inputMode="numeric" maxLength={4} placeholder="••••"
                value={pinDraft} onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, ""))} />
              <GoldButton loading={busy} disabled={pinDraft.length !== 4}>Set PIN</GoldButton>
            </form>
          )}
        </div>
      </Section>

      <Section title="During every ride">
        <ul className="grid sm:grid-cols-3 gap-3 text-sm">
          {[
            [ShieldAlert, "SOS button", `Calls ${SAFETY.emergency} or our 24×7 safety line, and alerts your contacts.`],
            [Share2, "Share trip", "Send a live link so family can follow the ride on a map."],
            [PhoneCall, "Ride OTP", "Your driver starts the trip only after you share the 4-digit code (or your own ride PIN)."],
          ].map(([I, t, d]) => {
            const Icon = I as typeof ShieldAlert;
            return <li key={t as string} className="rounded-xl border border-line p-4"><Icon size={20} className="text-gold" /><p className="font-medium text-strong mt-2">{t as string}</p><p className="text-xs text-muted mt-1">{d as string}</p></li>;
          })}
        </ul>
      </Section>
    </div>
  );
}
