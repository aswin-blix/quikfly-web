"use client";
// A pickup or drop field: search the places, saved ones first. Used by rides and Quick parcels.
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import type { Place, SavedPlace } from "@quikfly/shared";
import { api } from "@/lib/api";
import { PLACE_ICON } from "./account/PlacesSection";

export function PlacePicker({
  icon, placeholder, value, onChange, exclude, autoFocus, saved = [], id, label,
}: { id?: string; label?: string; icon: React.ReactNode; placeholder: string; value: Place | null; onChange: (p: Place | null) => void; exclude?: string; autoFocus?: boolean; saved?: SavedPlace[] }) {
  const [q, setQ] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  useEffect(() => setQ(value?.name ?? ""), [value]);
  const browsing = q === "" || q === value?.name;
  useEffect(() => {
    if (!open) return;
    api.places.search(browsing ? "" : q).then((r) => setResults(r.filter((p) => p.id !== exclude)));
  }, [q, open, exclude, browsing]);
  // Before the rider types, saved places come first.
  const savedHere = browsing ? saved.filter((s) => s.place.id !== exclude) : [];

  return (
    <div className="relative">
      <div className="flex items-center gap-3 field !pr-12">
        {icon}
        <input id={id} aria-label={label ?? placeholder} autoComplete="off" className="bg-transparent outline-none flex-1 min-w-0" placeholder={placeholder} value={q} autoFocus={autoFocus && !value}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setQ(e.target.value); if (!e.target.value) onChange(null); }} />
      </div>
      {open && (results.length > 0 || savedHere.length > 0) && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto scrollbar-thin rounded-xl border border-line bg-coal shadow-2xl">
          {savedHere.map((s) => {
            const Icon = PLACE_ICON[s.kind];
            return (
              <button key={s.id} type="button" onMouseDown={() => { onChange(s.place); setOpen(false); }} onClick={() => { onChange(s.place); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-fg/5 text-left border-b border-line">
                <Icon size={14} className="text-gold" />
                <span><span className="block text-sm font-medium">{s.label}</span><span className="block text-xs text-subtle">{s.place.name}</span></span>
              </button>
            );
          })}
          {results.map((p) => (
            <button key={p.id} type="button" onMouseDown={() => { onChange(p); setOpen(false); }} onClick={() => { onChange(p); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-fg/5 text-left">
              <Clock size={14} className="text-subtle" />
              <span><span className="block text-sm">{p.name}</span><span className="block text-xs text-subtle">{p.area}, Chennai</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
