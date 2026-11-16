"use client";
import { useEffect, useState } from "react";
import { Trash2, UserRound } from "lucide-react";
import { GENDERS, LIMITS, type Gender, type Traveller } from "@quikfly/shared";
import { api } from "@/lib/api";
import { GoldButton } from "../ui";
import { ErrorText, Field, ItemRow, Section, useAction } from "./kit";

const GENDER_SHORT: Record<Gender, string> = { female: "Female", male: "Male", other: "Other" };

export function TravellersSection() {
  const [list, setList] = useState<Traveller[] | null>(null);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  const { run, busy, error, setError } = useAction();

  useEffect(() => { run(async () => setList(await api.travellers.list())); }, [run]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(age);
    if (name.trim().length < LIMITS.nameMin) return setError("Enter the traveller's full name.");
    if (!Number.isInteger(n) || n < 1 || n > 120) return setError("Enter an age from 1 to 120.");
    run(async () => { setList(await api.travellers.add({ name: name.trim(), age: n, gender })); setName(""); setAge(""); });
  };
  const full = (list?.length ?? 0) >= LIMITS.travellers;

  return (
    <Section title="Travellers" sub="Family and friends you often book for. Their names fill in at checkout with one tap.">
      {list === null ? <div className="skeleton h-16" /> : list.length === 0 ? (
        <p className="text-sm text-muted">No saved travellers yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((t) => (
            <ItemRow key={t.id} icon={<UserRound size={18} />} title={t.name} sub={`${GENDER_SHORT[t.gender]} · ${t.age} yrs`}
              action={<button type="button" aria-label={`Remove ${t.name}`} className="p-2 rounded-lg text-muted hover:text-danger hover:bg-danger/10"
                onClick={() => run(async () => setList(await api.travellers.remove(t.id)))}><Trash2 size={16} /></button>} />
          ))}
        </ul>
      )}

      {full ? <p className="mt-5 text-sm text-muted">You&apos;ve saved the maximum of {LIMITS.travellers}. Remove one to add another.</p> : (
        <form onSubmit={add} className="mt-5 pt-5 border-t border-line grid grid-cols-2 sm:grid-cols-[1fr_90px_130px] gap-4">
          <div className="col-span-2 sm:col-span-1"><Field label="Full name (as on ID)" htmlFor="tr-name"><input id="tr-name" className="field" maxLength={LIMITS.nameMax} value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
          <Field label="Age" htmlFor="tr-age"><input id="tr-age" className="field" inputMode="numeric" maxLength={3} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Gender" htmlFor="tr-gender">
            <select id="tr-gender" className="field" value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
              {GENDERS.map((g) => <option key={g} value={g}>{GENDER_SHORT[g]}</option>)}
            </select>
          </Field>
          <div className="col-span-2 sm:col-span-3 flex flex-wrap items-center gap-3">
            <GoldButton loading={busy}>Add traveller</GoldButton>
            <ErrorText>{error}</ErrorText>
          </div>
        </form>
      )}
    </Section>
  );
}
