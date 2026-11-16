"use client";
import { useEffect, useState } from "react";
import { GENDERS, LIMITS, PATTERNS, type Gender, type ProfileUpdate } from "@quikfly/shared";
import { api } from "@/lib/api";
import { todayISO } from "@/lib/format";
import { useApp } from "../AppProvider";
import { GoldButton } from "../ui";
import { ErrorText, Field, Section, useAction } from "./kit";

const GENDER_LABEL: Record<Gender, string> = { female: "Female", male: "Male", other: "Other" };
/** Latest birth date allowed: today minus the minimum age. */
const maxDob = () => `${Number(todayISO().slice(0, 4)) - LIMITS.minAge}${todayISO().slice(4)}`;

export function ProfileSection() {
  const { user, setUser, toast } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [dob, setDob] = useState("");
  const { run, busy, error, setError } = useAction();

  useEffect(() => {
    if (!user) return;
    setName(user.name); setEmail(user.email ?? ""); setGender(user.gender ?? ""); setDob(user.dob ?? "");
  }, [user]);
  if (!user) return null;

  const patch: ProfileUpdate = {};
  if (name.trim() !== user.name) patch.name = name.trim();
  if ((email.trim() || null) !== user.email) patch.email = email.trim() || null;
  if ((gender || null) !== user.gender) patch.gender = gender || null;
  if ((dob || null) !== user.dob) patch.dob = dob || null;
  const dirty = Object.keys(patch).length > 0;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < LIMITS.nameMin) return setError("Please enter your name.");
    if (patch.email && !PATTERNS.email.test(patch.email)) return setError("Enter a valid email address.");
    run(async () => { setUser(await api.account.update(patch)); toast("Profile saved"); });
  };

  return (
    <Section title="Profile" sub="Used on tickets and invoices, and so drivers know who to look for.">
      <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
        <Field label="Full name" htmlFor="pf-name">
          <input id="pf-name" className="field" autoComplete="name" maxLength={LIMITS.nameMax} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Mobile number" htmlFor="pf-phone" hint="Change it under Login & security.">
          <input id="pf-phone" className="field text-muted" value={user.phone} readOnly />
        </Field>
        <Field label="Email" htmlFor="pf-email" hint="Tickets and invoices are emailed here.">
          <input id="pf-email" type="email" className="field" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Gender" htmlFor="pf-gender" hint="Helps with women-only seats and options.">
          <select id="pf-gender" className="field" value={gender} onChange={(e) => setGender(e.target.value as Gender | "")}>
            <option value="">Prefer not to say</option>
            {GENDERS.map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}
          </select>
        </Field>
        <Field label="Date of birth" htmlFor="pf-dob" hint="Needed for self-drive (18+).">
          <input id="pf-dob" type="date" className="field" max={maxDob()} value={dob} onChange={(e) => setDob(e.target.value)} />
        </Field>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <GoldButton loading={busy} disabled={!dirty}>Save changes</GoldButton>
          {!dirty && <span className="text-xs text-subtle">No unsaved changes</span>}
          <ErrorText>{error}</ErrorText>
        </div>
      </form>
    </Section>
  );
}
