"use client";
import { useEffect, useState } from "react";
import { PATTERNS, compactCode } from "@quikfly/shared";
import { api } from "@/lib/api";
import { useApp } from "../AppProvider";
import { GoldButton } from "../ui";
import { ErrorText, Field, Section, useAction } from "./kit";

export function BusinessSection() {
  const { user, setUser, toast } = useApp();
  const [gstin, setGstin] = useState("");
  const [name, setName] = useState("");
  const { run, busy, error, setError } = useAction();

  useEffect(() => { setGstin(user?.gst?.gstin ?? ""); setName(user?.gst?.name ?? ""); }, [user]);
  if (!user) return null;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!PATTERNS.gstin.test(compactCode(gstin))) return setError("Enter a valid 15-character GSTIN, e.g. 33ABCDE1234F1Z5.");
    if (name.trim().length < 2) return setError("Enter the registered business name.");
    run(async () => { setUser(await api.account.update({ gst: { gstin, name: name.trim() } })); toast("GST details saved"); });
  };
  const remove = () => run(async () => { setUser(await api.account.update({ gst: null })); toast("GST details removed"); });

  return (
    <Section title="Business / GST" sub="Travelling for work? Save your GST details and tick “GST invoice” at checkout to claim input tax credit.">
      <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
        <Field label="GSTIN" htmlFor="gst-no"><input id="gst-no" className="field uppercase font-mono" maxLength={15} placeholder="33ABCDE1234F1Z5" value={gstin} onChange={(e) => setGstin(e.target.value)} /></Field>
        <Field label="Registered business name" htmlFor="gst-name"><input id="gst-name" className="field" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <GoldButton loading={busy}>Save GST details</GoldButton>
          {user.gst && <button type="button" onClick={remove} className="text-sm text-danger">Remove</button>}
          <ErrorText>{error}</ErrorText>
        </div>
      </form>
    </Section>
  );
}
