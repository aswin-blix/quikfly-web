"use client";
import { useEffect, useState } from "react";
import { Briefcase, Home, MapPin, Trash2 } from "lucide-react";
import { PLACES, SAVED_PLACE_KINDS, type SavedPlace, type SavedPlaceKind } from "@quikfly/shared";
import { api } from "@/lib/api";
import { GoldButton } from "../ui";
import { ErrorText, Field, ItemRow, Section, useAction } from "./kit";

export const PLACE_ICON: Record<SavedPlaceKind, typeof Home> = { home: Home, work: Briefcase, other: MapPin };
const KIND_LABEL: Record<SavedPlaceKind, string> = { home: "Home", work: "Work", other: "Other" };

export function PlacesSection() {
  const [places, setPlaces] = useState<SavedPlace[] | null>(null);
  const [kind, setKind] = useState<SavedPlaceKind>("home");
  const [placeId, setPlaceId] = useState(PLACES[0].id);
  const [label, setLabel] = useState("");
  const { run, busy, error } = useAction();

  useEffect(() => { run(async () => setPlaces(await api.savedPlaces.list())); }, [run]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => { setPlaces(await api.savedPlaces.save(kind, placeId, kind === "other" ? label.trim() : undefined)); setLabel(""); });
  };
  const replacing = kind !== "other" && places?.some((p) => p.kind === kind);

  return (
    <Section title="Saved places" sub="Pick them in one tap when you book a bike or cab.">
      {places === null ? <div className="skeleton h-16" /> : places.length === 0 ? (
        <p className="text-sm text-muted">No saved places yet. Add Home and Work below.</p>
      ) : (
        <ul className="divide-y divide-line">
          {places.map((p) => {
            const Icon = PLACE_ICON[p.kind];
            return (
              <ItemRow key={p.id} icon={<Icon size={18} />} title={p.label} sub={`${p.place.name} · ${p.place.area}`}
                action={<button type="button" aria-label={`Remove ${p.label}`} className="p-2 rounded-lg text-muted hover:text-danger hover:bg-danger/10"
                  onClick={() => run(async () => setPlaces(await api.savedPlaces.remove(p.id)))}><Trash2 size={16} /></button>} />
            );
          })}
        </ul>
      )}

      <form onSubmit={add} className="mt-5 pt-5 border-t border-line grid sm:grid-cols-[140px_1fr] gap-4">
        <Field label="Type" htmlFor="sp-kind">
          <select id="sp-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as SavedPlaceKind)}>
            {SAVED_PLACE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Place" htmlFor="sp-place" hint="Demo: places on the Chennai map. The live app will use map search.">
          <select id="sp-place" className="field" value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
            {PLACES.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.area}</option>)}
          </select>
        </Field>
        {kind === "other" && (
          <div className="sm:col-span-2"><Field label="Name it" htmlFor="sp-label"><input id="sp-label" className="field" maxLength={30} placeholder="e.g. Gym, Mom's place" value={label} onChange={(e) => setLabel(e.target.value)} /></Field></div>
        )}
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <GoldButton loading={busy} disabled={kind === "other" && !label.trim()}>{replacing ? `Replace ${KIND_LABEL[kind]}` : "Save place"}</GoldButton>
          <ErrorText>{error}</ErrorText>
        </div>
      </form>
    </Section>
  );
}
