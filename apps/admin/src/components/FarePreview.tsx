"use client";
// "Try a fare": sample prices under today's values and under the unsaved draft, side by side,
// so staff see what customers would pay before saving. Prices come from @quikfly/shared, the
// same functions the API quotes with (lib/fare-samples.ts). Nothing here saves anything.
import { useEffect, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { parseSurgeHours, type CatalogItem, type CatalogKind, type Settings } from "@quikfly/shared";
import { adminApi } from "@/lib/api";
import { cx, inr } from "@/lib/format";
import { busSamples, groupSamples, rentSamples, rideSamples, tourSamples, withId, type Sample, type SampleCatalog } from "@/lib/fare-samples";

import type { PreviewKind } from "@/lib/settings-fields";
export type { PreviewKind };

const rows = <K extends CatalogKind>(kind: K) => adminApi.catalog.list(kind) as Promise<CatalogItem<K>[]>;

let catalogPromise: Promise<SampleCatalog> | null = null;
/** The catalog rows samples need, loaded once per page visit (again after a failure). */
export function loadSampleCatalog(): Promise<SampleCatalog> {
  if (catalogPromise) return catalogPromise;
  const p = Promise.all([rows("place"), rows("rideOption"), rows("tour"), rows("rentalCar"), rows("travelVehicle"), rows("groupDestination")])
    .then(([places, rideOptions, tours, cars, vehicles, destinations]) => ({
      places: withId(places), rideOptions: withId(rideOptions), tours: withId(tours),
      cars: withId(cars), vehicles: withId(vehicles), destinations: withId(destinations),
    }));
  p.catch(() => { catalogPromise = null; });
  catalogPromise = p;
  return p;
}

export function useSampleCatalog() {
  const [cat, setCat] = useState<SampleCatalog | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { loadSampleCatalog().then(setCat, (e: Error) => setError(e.message)); }, []);
  return { cat, error };
}

/** One sample line: "₹397 → ₹495 (+₹98)", or the one price when nothing changed. */
export function SampleRow({ s, isNew }: { s: Sample; isNew?: boolean }) {
  const diff = s.draft - s.now;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5 text-sm">
      <span className="text-muted min-w-0">{s.label}</span>
      <span className="tabular-nums text-right">
        {isNew || diff === 0 ? <span className="text-fg">{inr(s.draft)}</span> : (
          <>
            <span className="text-subtle line-through">{inr(s.now)}</span>{" "}
            <span className="font-semibold text-strong">{inr(s.draft)}</span>{" "}
            <span className={cx("text-xs", diff > 0 ? "text-danger" : "text-success")}>({diff > 0 ? "+" : "−"}{inr(Math.abs(diff))})</span>
          </>
        )}
      </span>
    </li>
  );
}

/** India-time hour picker for ride samples (surge depends on the hour). */
export function HourSelect({ id, value, onChange }: { id: string; value: number; onChange: (h: number) => void }) {
  return (
    <select id={id} className="field" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>)}
    </select>
  );
}

export function ItemSelect<T extends { id: string }>({ id, items, value, onChange, label }: { id: string; items: T[]; value: string; onChange: (id: string) => void; label: (x: T) => string }) {
  return (
    <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      {items.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}
    </select>
  );
}

const firstSurgeHour = (s: Settings) => parseSurgeHours(s.surgeHours)[0]?.[0] ?? 9;

/** Settings page panel: samples for the kinds this tab's settings affect. */
export function SettingsFarePreview({ kinds, now, draft }: { kinds: PreviewKind[]; now: Settings; draft: Settings }) {
  const { cat, error } = useSampleCatalog();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hour, setHour] = useState(() => firstSurgeHour(draft));
  const [tourId, setTourId] = useState("");
  const [carId, setCarId] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  const samples = useMemo(() => {
    if (!cat) return null;
    const out: { title: string; rows: Sample[] }[] = [];
    if (kinds.includes("ride") && cat.places.length >= 2 && cat.rideOptions.length) {
      const a = cat.places.find((p) => p.id === from) ?? cat.places[0];
      const b = cat.places.find((p) => p.id === to) ?? cat.places[1];
      out.push({ title: "Rides", rows: rideSamples(cat.rideOptions, a, b, hour, now, draft) });
    }
    if (kinds.includes("bus")) out.push({ title: "Bus", rows: busSamples(now, draft) });
    const tour = cat.tours.find((t) => t.id === tourId) ?? cat.tours[0];
    if (kinds.includes("tour") && tour) out.push({ title: "Holidays", rows: tourSamples(tour, now, draft) });
    const car = cat.cars.find((c) => c.id === carId) ?? cat.cars[0];
    if (kinds.includes("rent") && car) out.push({ title: "Rent a car", rows: rentSamples(car, now, draft) });
    const v = cat.vehicles.find((x) => x.id === vehicleId) ?? cat.vehicles[0];
    if (kinds.includes("group") && v) out.push({ title: "Group travel", rows: groupSamples(v, cat.destinations[0], now, draft) });
    return out;
  }, [cat, kinds, from, to, hour, tourId, carId, vehicleId, now, draft]);

  return (
    <section className="card p-5" aria-labelledby="try-fare">
      <h2 id="try-fare" className="font-semibold text-strong flex items-center gap-2"><Calculator size={18} className="text-accent" /> Try a fare</h2>
      <p className="text-xs text-subtle mt-0.5">What a customer would pay today, and with your unsaved changes. Nothing is saved here.</p>
      {error && <p className="text-sm text-danger mt-3" role="alert">Couldn&apos;t load sample trips: {error}</p>}
      {!samples && !error && <div className="skeleton h-16 mt-3" />}
      {cat && (
        <div className="grid gap-3 mt-3 sm:grid-cols-2">
          {kinds.includes("ride") && cat.places.length >= 2 && (
            <>
              <label className="grid gap-1 text-xs text-muted">From<ItemSelect id="tf-from" items={cat.places} value={from || cat.places[0].id} onChange={setFrom} label={(p) => p.name} /></label>
              <label className="grid gap-1 text-xs text-muted">To<ItemSelect id="tf-to" items={cat.places} value={to || cat.places[1].id} onChange={setTo} label={(p) => p.name} /></label>
              <label className="grid gap-1 text-xs text-muted">Pickup time (India)<HourSelect id="tf-hour" value={hour} onChange={setHour} /></label>
            </>
          )}
          {kinds.includes("tour") && cat.tours.length > 0 && <label className="grid gap-1 text-xs text-muted">Holiday<ItemSelect id="tf-tour" items={cat.tours} value={tourId || cat.tours[0].id} onChange={setTourId} label={(t) => t.title} /></label>}
          {kinds.includes("rent") && cat.cars.length > 0 && <label className="grid gap-1 text-xs text-muted">Car<ItemSelect id="tf-car" items={cat.cars} value={carId || cat.cars[0].id} onChange={setCarId} label={(c) => c.name} /></label>}
          {kinds.includes("group") && cat.vehicles.length > 0 && <label className="grid gap-1 text-xs text-muted">Group vehicle<ItemSelect id="tf-veh" items={cat.vehicles} value={vehicleId || cat.vehicles[0].id} onChange={setVehicleId} label={(v) => v.name} /></label>}
        </div>
      )}
      {samples?.map((g) => (
        <div key={g.title} className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">{g.title}</h3>
          <ul className="divide-y divide-line">{g.rows.map((s) => <SampleRow key={s.label} s={s} />)}</ul>
        </div>
      ))}
    </section>
  );
}

/** Catalog kinds the edit form can preview. */
export const PREVIEW_KINDS: CatalogKind[] = ["rideOption", "tour", "rentalCar", "travelVehicle"];

/**
 * Catalog edit form panel: the saved item vs the edited one (or just the new item), under
 * today's settings. `edited` is null while the form doesn't validate yet.
 */
export function ItemFarePreview({ kind, original, edited }: { kind: CatalogKind; original: Record<string, unknown> | null; edited: Record<string, unknown> | null }) {
  const { cat, error } = useSampleCatalog();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hour, setHour] = useState(12);
  useEffect(() => { adminApi.settings.get().then(setSettings, () => undefined); }, []);

  const rows = useMemo((): Sample[] | null => {
    if (!cat || !settings || !edited) return null;
    const after = { ...edited, id: "preview" } as never;
    const before = (original ? { ...original, id: "preview" } : after) as never;
    switch (kind) {
      case "rideOption": return cat.places.length >= 2 ? rideSamples([before], cat.places[0], cat.places[1], hour, settings, settings, [after]) : [];
      case "tour": return tourSamples(before, settings, settings, after);
      case "rentalCar": return rentSamples(before, settings, settings, after);
      case "travelVehicle": return groupSamples(before, cat.destinations[0], settings, settings, after);
      default: return null;
    }
  }, [cat, settings, edited, original, kind, hour]);

  if (!PREVIEW_KINDS.includes(kind)) return null;
  return (
    <section className="card p-5" aria-labelledby="try-item">
      <h2 id="try-item" className="font-semibold text-strong flex items-center gap-2"><Calculator size={18} className="text-accent" /> Try a fare</h2>
      <p className="text-xs text-subtle mt-0.5">{original ? "What a customer pays now, and with your edits" : "What a customer would pay"}, with today&apos;s settings. Nothing is saved here.</p>
      {error && <p className="text-sm text-danger mt-3" role="alert">Couldn&apos;t load sample trips: {error}</p>}
      {kind === "rideOption" && cat && cat.places.length >= 2 && (
        <label className="grid gap-1 text-xs text-muted mt-3 sm:max-w-48">
          Pickup time (India) · {cat.places[0].name} → {cat.places[1].name}
          <HourSelect id="ti-hour" value={hour} onChange={setHour} />
        </label>
      )}
      {!edited && <p className="text-sm text-muted mt-3">Fill in the price fields to see a fare.</p>}
      {edited && !rows && !error && <div className="skeleton h-12 mt-3" />}
      {rows && <ul className="divide-y divide-line mt-2">{rows.map((s) => <SampleRow key={s.label} s={s} isNew={!original} />)}</ul>}
    </section>
  );
}
