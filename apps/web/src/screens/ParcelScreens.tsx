"use client";
// /parcels: book a bus parcel, counter to counter. The API prices it (POST /quotes); checkout takes the payment.
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Package, Search } from "lucide-react";
import {
  LIMITS, PARCEL_CATEGORIES, PARCEL_RULES, PARCEL_SIZES, PARCEL_WEIGHT_BANDS, PATTERNS, cancelPolicyText, parcelBandLabel, parcelTime,
  type ParcelCategory, type ParcelOptions, type ParcelSize, type ParcelWeightBand, type PriceQuote, type QuoteRequest,
} from "@quikfly/shared";
import { useApp } from "@/components/AppProvider";
import { Select } from "@/components/BookingWidget";
import { useConfig, useSettings } from "@/components/ConfigProvider";
import { SimulatedNote } from "@/components/parcel/ParcelTimeline";
import { GoldButton, PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cx, inr } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { CATEGORY_LABEL, PARCEL_QUOTE_DEBOUNCE_MS, PARCEL_QUOTE_MARGIN_MS, SIZE_LABEL, parcelTrackPath } from "@/lib/parcels";

type BusParcelRequest = Extract<QuoteRequest, { service: "parcel"; mode: "intercity" }>;
/** One departure: two operators' buses can leave at the same time, and bus ids repeat across days. */
const busKey = (d: { busId: string; departAt: string }) => `${d.busId}@${d.departAt}`;
type Field = "departure" | "value" | "name" | "phone" | "contents" | "declaration";

function TrackForm() {
  const nav = useNav();
  const [lr, setLr] = useState("");
  return (
    <form className="mt-6 flex gap-2 max-w-lg" onSubmit={(e) => { e.preventDefault(); if (lr.trim()) nav.push(parcelTrackPath(lr.trim().toUpperCase())); }}>
      <input className="field min-w-0 uppercase placeholder:normal-case" placeholder="Track by LR number" maxLength={30} value={lr} onChange={(e) => setLr(e.target.value)} aria-label="LR number" />
      <button className="shrink-0 rounded-xl px-4 border border-line hover:border-gold/60 inline-flex items-center gap-2 text-sm"><Search size={16} />Track</button>
    </form>
  );
}

function FieldError({ id, text }: { id: Field; text?: string }) {
  return text ? <p id={`err-${id}`} className="text-xs text-danger mt-1" role="alert">{text}</p> : null;
}

function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="label mb-2">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, text]) => <button key={v} type="button" data-on={value === v} aria-pressed={value === v} onClick={() => onChange(v)} className="chip">{text}</button>)}
      </div>
    </fieldset>
  );
}

export function ParcelScreen() {
  const { draft, setDraft, toast } = useApp();
  const settings = useSettings();
  const config = useConfig();
  const nav = useNav();
  // "Edit" at checkout comes back here with everything but the declaration filled in.
  const [initial] = useState(() => draft?.parcel);

  const [from, setFrom] = useState(initial?.request.from ?? "Chennai");
  const [to, setTo] = useState(initial?.request.to ?? "Coimbatore");
  const [options, setOptions] = useState<ParcelOptions | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [bus, setBus] = useState(initial ? busKey(initial.request) : "");
  const [category, setCategory] = useState<ParcelCategory>(initial?.request.category ?? "documents");
  const [band, setBand] = useState<ParcelWeightBand>(initial?.request.weightBand ?? PARCEL_WEIGHT_BANDS[0]);
  const [size, setSize] = useState<ParcelSize>(initial?.request.size ?? "backpack");
  const [value, setValue] = useState(initial ? String(initial.request.declaredValue) : "");
  const [name, setName] = useState(initial?.receiver.name ?? "");
  const [phone, setPhone] = useState(initial?.receiver.phone ?? "");
  const [contents, setContents] = useState(initial?.contents ?? "");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [priced, setPriced] = useState<{ key: string; quote: PriceQuote } | null>(null);
  const [priceError, setPriceError] = useState("");
  const [continuing, setContinuing] = useState(false);

  const cities = (config?.cities ?? []).map((c) => c.name);

  useEffect(() => {
    let live = true;
    setOptions(null); setOptionsError("");
    api.parcels.options(from, to).then((o) => {
      if (!live) return;
      setOptions(o);
      setBus((current) => (o.departures.some((d) => busKey(d) === current) ? current : o.departures[0] ? busKey(o.departures[0]) : ""));
    }, (e: Error) => live && setOptionsError(e.message));
    return () => { live = false; };
  }, [from, to, attempt]);

  const departure = options?.departures.find((d) => busKey(d) === bus) ?? null;
  // The lightest band always stays, whatever the limit.
  const bands = PARCEL_WEIGHT_BANDS.filter((b, i) => i === 0 || Number(b) <= settings.parcelMaxKg);
  const weightBand = bands.includes(band) ? band : bands[bands.length - 1];
  const declaredValue = Number(value);
  const valueOk = value !== "" && declaredValue >= 1 && declaredValue <= settings.parcelMaxDeclaredValue;

  const request = useMemo<BusParcelRequest | null>(() => (departure && valueOk ? {
    service: "parcel", mode: "intercity", from, to, busId: departure.busId, departAt: departure.departAt,
    category, weightBand, size, declaredValue, pickup: "counter", delivery: "counter",
  } : null), [departure, valueOk, from, to, category, weightBand, size, declaredValue]);
  const key = request ? JSON.stringify(request) : "";
  const quote = priced && priced.key === key ? priced.quote : null;

  useEffect(() => {
    setPriceError("");
    if (!key) return;
    let live = true;
    const timer = setTimeout(() => {
      api.quotes.create(JSON.parse(key) as BusParcelRequest).then((q) => live && setPriced({ key, quote: q }), (e: Error) => live && setPriceError(e.message));
    }, PARCEL_QUOTE_DEBOUNCE_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [key]);

  const clear = (f: Field) => setErrors(({ [f]: _, ...rest }) => rest);
  function pickFrom(city: string) {
    if (city === to) setTo(from);
    setFrom(city);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Partial<Record<Field, string>> = {};
    if (!departure) found.departure = "Pick a bus for this route.";
    if (!valueOk) found.value = `Enter what it's worth, from ₹1 to ${inr(settings.parcelMaxDeclaredValue)}.`;
    if (name.trim().length < LIMITS.nameMin) found.name = "Enter the receiver's name.";
    if (!PATTERNS.phone.test(phone)) found.phone = "Enter the receiver's 10-digit mobile number.";
    if (contents.trim().length < PARCEL_RULES.contentsMin) found.contents = "Say what's inside, in a few words.";
    if (!agreed) found.declaration = "Read the list and tick the declaration.";
    setErrors(found);
    const first = (Object.keys(found) as Field[])[0];
    if (first) return document.getElementById(`parcel-${first}`)?.focus();
    if (!request || !departure || !options) return;

    setContinuing(true);
    try {
      const fresh = quote && Date.parse(quote.expiresAt) - Date.now() > PARCEL_QUOTE_MARGIN_MS;
      const price = fresh ? quote : await api.quotes.create(request);
      setDraft({
        service: "parcel",
        title: `${from} → ${to}`,
        subtitle: `Bus parcel · ${parcelBandLabel(weightBand)}`,
        // No names, numbers or contents here: the summary is what other services send as booking lines.
        summary: [
          ["Hand in by", parcelTime(departure.cutoffAt)],
          ["At", departure.fromCounter.name],
          ["Departs", parcelTime(departure.departAt)],
          ["Collect from", parcelTime(departure.readyAt)],
          ["Liability", `Up to ${inr(price.parcel?.liability ?? 0)}, not insured`],
        ],
        quote: price,
        travellers: [],
        policy: `${cancelPolicyText(settings, "parcel")} It can't be cancelled once it's on the bus.`,
        parcel: { request, receiver: { name: name.trim(), phone }, contents: contents.trim(), declaration: options.declaration.version },
      });
      nav.push("/checkout");
    } catch (err) {
      toast((err as Error).message, "err");
      setContinuing(false);
    }
  }

  return (
    <>
      <PageHeader crumbs={[["Home", "/"], ["Parcels"]]} title="Send a parcel" icon={<Package className="text-gold" size={36} />}
        sub="Hand it in at a QuikFly counter. It goes on the bus, and the receiver collects it with a code.">
        <TrackForm />
      </PageHeader>

      <form noValidate onSubmit={submit} className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="min-w-0 space-y-5">
          <section className="panel p-5 space-y-4" aria-labelledby="p-route">
            <h2 id="p-route" className="font-semibold text-strong">Route and bus</h2>
            <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
              <Select label="From" value={from} onChange={pickFrom} options={cities.map((c) => [c, c])} />
              <button type="button" onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap cities"
                className="justify-self-center w-10 h-10 sm:mb-1 rounded-full border border-line grid place-items-center hover:border-gold"><ArrowLeftRight size={16} /></button>
              <Select label="To" value={to} onChange={setTo} options={cities.filter((c) => c !== from).map((c) => [c, c])} />
            </div>

            {optionsError && (
              <p className="text-sm text-danger" role="alert">
                {optionsError} <button type="button" className="text-gold underline" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
              </p>
            )}
            {!options && !optionsError && <div className="skeleton h-24" />}
            {options && options.departures.length === 0 && <p className="text-sm text-muted">No bus takes parcels on this route in the next {PARCEL_RULES.bookingDays} days. Try another route.</p>}
            {options && options.departures.length > 0 && (
              <div id="parcel-departure" tabIndex={-1} className="grid grid-cols-2 xl:grid-cols-4 gap-2" role="group" aria-label="Departure">
                {options.departures.map((d) => (
                  <button key={busKey(d)} type="button" aria-pressed={busKey(d) === bus} onClick={() => { setBus(busKey(d)); clear("departure"); }}
                    className={cx("text-left rounded-xl border p-3 transition-colors", busKey(d) === bus ? "border-gold bg-gold/[0.06]" : "border-line hover:border-gold/50")}>
                    <span className="block text-sm font-semibold text-strong">{parcelTime(d.departAt)}</span>
                    <span className="block text-xs text-muted mt-1">Hand in by {parcelTime(d.cutoffAt)}</span>
                  </button>
                ))}
              </div>
            )}
            <FieldError id="departure" text={errors.departure} />

            {departure && (
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                {([["Hand in at", departure.fromCounter, `By ${parcelTime(departure.cutoffAt)}`], ["Collect at", departure.toCounter, `From ${parcelTime(departure.readyAt)}`]] as const).map(([title, c, when]) => (
                  <div key={title} className="rounded-xl border border-line p-3 min-w-0">
                    <p className="label">{title}</p>
                    <p className="text-strong font-medium mt-1">{c.name}</p>
                    <p className="text-muted break-words">{c.address}</p>
                    <p className="text-xs text-subtle">{c.hours}</p>
                    <p className="text-xs text-soft mt-1">{when}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel p-5 space-y-4" aria-labelledby="p-what">
            <h2 id="p-what" className="font-semibold text-strong">What you&apos;re sending</h2>
            <Choice label="Category" value={category} onChange={setCategory} options={PARCEL_CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]])} />
            <Choice label="Weight" value={weightBand} onChange={setBand} options={bands.map((b) => [b, parcelBandLabel(b)])} />
            <Choice label="Size" value={size} onChange={setSize} options={PARCEL_SIZES.map((s) => [s, SIZE_LABEL[s]])} />
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="parcel-value">What it&apos;s worth (₹)</label>
                <input id="parcel-value" className={cx("field mt-1.5", errors.value && "!border-danger/60")} inputMode="numeric" maxLength={5} value={value}
                  onChange={(e) => { setValue(e.target.value.replace(/\D/g, "")); clear("value"); }} aria-describedby="value-hint err-value" />
                <p id="value-hint" className={cx("text-xs mt-1", value && !valueOk ? "text-danger" : "text-subtle")}>Up to {inr(settings.parcelMaxDeclaredValue)}.</p>
                <FieldError id="value" text={errors.value} />
              </div>
              <div>
                <label className="label" htmlFor="parcel-contents">What&apos;s inside</label>
                <input id="parcel-contents" className={cx("field mt-1.5", errors.contents && "!border-danger/60")} maxLength={PARCEL_RULES.contentsMax} placeholder="e.g. Two cotton shirts"
                  value={contents} onChange={(e) => { setContents(e.target.value); clear("contents"); }} aria-describedby="err-contents" />
                <FieldError id="contents" text={errors.contents} />
              </div>
            </div>
          </section>

          <section className="panel p-5 space-y-4" aria-labelledby="p-who">
            <h2 id="p-who" className="font-semibold text-strong">Who collects it</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="parcel-name">Receiver&apos;s name</label>
                <input id="parcel-name" autoComplete="off" className={cx("field mt-1.5", errors.name && "!border-danger/60")} maxLength={LIMITS.nameMax} value={name}
                  onChange={(e) => { setName(e.target.value); clear("name"); }} aria-describedby="err-name" />
                <FieldError id="name" text={errors.name} />
              </div>
              <div>
                <label className="label" htmlFor="parcel-phone">Receiver&apos;s mobile</label>
                <input id="parcel-phone" autoComplete="off" className={cx("field mt-1.5", errors.phone && "!border-danger/60")} inputMode="numeric" value={phone}
                  onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(-10)); clear("phone"); }} aria-describedby="err-phone" />
                <FieldError id="phone" text={errors.phone} />
              </div>
            </div>
            <p className="text-xs text-muted">
              When it&apos;s ready, a collection code appears on your screen in My Trips. You pass it to the receiver: demo, no SMS is sent.
              It&apos;s held for {settings.parcelCounterHoldDays} days.
            </p>
          </section>

          {options && (
            <section className="panel p-5 space-y-3" aria-labelledby="p-not">
              <h2 id="p-not" className="font-semibold text-strong">Not allowed</h2>
              <ul className="grid sm:grid-cols-2 gap-x-5 gap-y-1 text-sm text-muted list-disc pl-5">
                {options.declaration.prohibited.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <label className="flex items-start gap-3 text-sm text-soft cursor-pointer">
                <input id="parcel-declaration" type="checkbox" className="mt-1 accent-brand" checked={agreed}
                  onChange={(e) => { setAgreed(e.target.checked); clear("declaration"); }} aria-describedby="err-declaration" />
                <span>{options.declaration.text}</span>
              </label>
              <FieldError id="declaration" text={errors.declaration} />
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 h-fit space-y-3" aria-label="Price">
          <div className="panel p-5 space-y-3" aria-live="polite">
            <p className="font-semibold text-strong">Price</p>
            {quote ? (
              <>
                <dl className="space-y-1.5 text-sm">
                  {quote.lines.map((l) => <div key={l.label} className="flex justify-between gap-3"><dt className="text-muted">{l.label}</dt><dd>{inr(l.amount)}</dd></div>)}
                  <div className="flex justify-between items-end gap-3 pt-3 mt-2 border-t border-line">
                    <dt className="font-semibold">Total</dt><dd className="text-2xl font-bold text-gold">{inr(quote.total)}</dd>
                  </div>
                </dl>
                <p className="text-xs text-muted">If it&apos;s lost or damaged QuikFly pays up to {inr(quote.parcel?.liability ?? 0)}. Parcels aren&apos;t insured.</p>
              </>
            ) : priceError ? (
              <p className="text-sm text-danger">{priceError}</p>
            ) : key ? (
              <p className="text-sm text-muted flex items-center gap-2"><Spinner size={14} />Getting the price…</p>
            ) : (
              <p className="text-sm text-muted">Pick a bus and say what it&apos;s worth to see the price.</p>
            )}
            <p className="text-xs text-subtle">{cancelPolicyText(settings, "parcel")} It can&apos;t be cancelled once it&apos;s on the bus.</p>
            <GoldButton type="submit" className="w-full" loading={continuing} disabled={!!priceError}>Continue</GoldButton>
          </div>
          {settings.parcelSimulateTransit && <SimulatedNote />}
        </aside>
      </form>
    </>
  );
}
