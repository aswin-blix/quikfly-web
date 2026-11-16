"use client";
import { useEffect, useState } from "react";
import { PhoneCall, Share2, ShieldAlert, Trash2, UserRound } from "lucide-react";
import { LIMITS, NIGHT_HOURS, PATTERNS, type EmergencyContact } from "@quikfly/shared";
import { SAFETY } from "@/lib/account";
import { api } from "@/lib/api";
import { useApp } from "../AppProvider";
import { GoldButton } from "../ui";
import { ErrorText, Field, ItemRow, Section, Toggle, useAction } from "./kit";

const hour = (h: number) => `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;

export function SafetySection() {
  const { user, setUser, toast } = useApp();
  const [contacts, setContacts] = useState<EmergencyContact[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relation, setRelation] = useState("");
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
  const setAutoShare = (on: boolean) => run(async () => {
    setUser(await api.account.update({ autoShareNightRides: on }));
    toast(on ? "Night rides will be shared automatically" : "Auto-share turned off");
  });
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
        <Toggle checked={user.autoShareNightRides} onChange={setAutoShare} disabled={busy || noContacts}
          label="Share night rides automatically"
          sub={noContacts
            ? "Add an emergency contact first."
            : `Rides booked between ${hour(NIGHT_HOURS[0])} and ${hour(NIGHT_HOURS[1])} are shared with your emergency contacts as soon as a driver is assigned.`} />
      </Section>

      <Section title="During every ride">
        <ul className="grid sm:grid-cols-3 gap-3 text-sm">
          {[
            [ShieldAlert, "SOS button", `Calls ${SAFETY.emergency} or our 24×7 safety line, and alerts your contacts.`],
            [Share2, "Share trip", "Send a live link so family can follow the ride on a map."],
            [PhoneCall, "Ride OTP", "Your driver starts the trip only after you share the 4-digit code."],
          ].map(([I, t, d]) => {
            const Icon = I as typeof ShieldAlert;
            return <li key={t as string} className="rounded-xl border border-line p-4"><Icon size={20} className="text-gold" /><p className="font-medium text-strong mt-2">{t as string}</p><p className="text-xs text-muted mt-1">{d as string}</p></li>;
          })}
        </ul>
      </Section>
    </div>
  );
}
