"use client";
// Self-drive rental inside My trips (packages/shared/src/rental.ts): the pickup checklist to
// start, extensions, the return checklist, and the deposit settlement once staff confirm it.
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Clock, Fuel, Gauge, KeyRound, Plus } from "lucide-react";
import {
  FUEL_EIGHTHS, RENTAL_PHOTO_LABEL, RENTAL_PHOTO_SIDES, RENTAL_RULES, fuelLabel,
  type Booking, type FareLine, type Rental, type RentalPhotoSide, type RentalStage,
} from "@quikfly/shared";
import { useApp } from "@/components/AppProvider";
import { useSettings } from "@/components/ConfigProvider";
import { GoldButton, Modal, Spinner } from "@/components/ui";
import { DEMO_MODE, api } from "@/lib/api";
import { cx, inr } from "@/lib/format";
import { shrinkPhoto } from "@/lib/photos";

/** "2026-11-20T18:30" → "20 Nov, 6:30 pm" */
const when = (local: string) => new Date(`${local}:00`).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).replace(/\s?([ap])m/i, " $1m").toLowerCase().replace(/^(\d+ )(\w)/, (_, d, m) => d + m.toUpperCase());

function Checklist({ rental, stage, onDone, onClose }: { rental: Rental; stage: RentalStage; onDone: (r: Rental) => void; onClose: () => void }) {
  const [r, setR] = useState(rental);
  const [thumbs, setThumbs] = useState<Partial<Record<RentalPhotoSide, string>>>({});
  const [busySide, setBusySide] = useState<RentalPhotoSide | null>(null);
  const [odometer, setOdometer] = useState("");
  const [fuel, setFuel] = useState<number>(stage === "pickup" ? FUEL_EIGHTHS : rental.pickup?.fuel ?? FUEL_EIGHTHS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputs = useRef<Partial<Record<RentalPhotoSide, HTMLInputElement | null>>>({});
  const done = r.photos[stage];

  async function pick(side: RentalPhotoSide, file?: File) {
    if (!file) return;
    setBusySide(side); setError("");
    try {
      const blob = await shrinkPhoto(file);
      setR(await api.rental.uploadPhoto(r.bookingId, stage, side, blob));
      setThumbs((t) => ({ ...t, [side]: URL.createObjectURL(blob) }));
    } catch (e) { setError((e as Error).message); }
    setBusySide(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const km = Number(odometer);
    if (done.length < RENTAL_PHOTO_SIDES.length) return setError("Add all five photos first.");
    if (!odometer || !Number.isInteger(km)) return setError("Enter the odometer reading in km.");
    if (stage === "return" && rental.pickup && km < rental.pickup.odometerKm) return setError(`The odometer can't be lower than at pickup (${rental.pickup.odometerKm.toLocaleString("en-IN")} km).`);
    setBusy(true); setError("");
    try {
      onDone(stage === "pickup" ? await api.rental.start(r.bookingId, { odometerKm: km, fuel }) : await api.rental.end(r.bookingId, { odometerKm: km, fuel }));
    } catch (e2) { setError((e2 as Error).message); }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <p className="text-sm text-muted">
        {stage === "pickup"
          ? "Before you drive off, photograph the car from every side and the odometer with the fuel gauge. These protect you if there's a question about damage later."
          : "Park the car, then photograph it again from every side and the odometer with the fuel gauge."}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {RENTAL_PHOTO_SIDES.map((side) => {
          const has = done.includes(side);
          return (
            <button key={side} type="button" onClick={() => inputs.current[side]?.click()} disabled={!!busySide}
              className={cx("relative aspect-[4/3] rounded-xl border overflow-hidden flex flex-col items-center justify-center gap-1 text-xs transition-colors",
                has ? "border-gold/60 bg-gold/5" : "border-dashed border-line hover:border-gold/60")}>
              {thumbs[side] && <><img src={thumbs[side]} alt="" className="absolute inset-0 w-full h-full object-cover" /><span aria-hidden className="absolute inset-0 bg-ink/60" /></>}
              <span className="relative flex flex-col items-center gap-1 text-strong">
                {busySide === side ? <Spinner /> : has ? <CheckCircle2 size={20} className="text-gold" /> : <Camera size={20} className="text-gold" />}
                <span className="font-medium">{RENTAL_PHOTO_LABEL[side]}</span>
                <span className={thumbs[side] ? "text-soft" : "text-subtle"}>{has ? "Retake" : "Add photo"}</span>
              </span>
              <input ref={(el) => { inputs.current[side] = el; }} type="file" accept="image/*" capture="environment" className="sr-only"
                aria-label={`${RENTAL_PHOTO_LABEL[side]} photo`} onChange={(e) => { pick(side, e.target.files?.[0]); e.target.value = ""; }} />
            </button>
          );
        })}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor={`odo-${stage}`}>Odometer (km)</label>
          <input id={`odo-${stage}`} className="field mt-1.5" inputMode="numeric" maxLength={6} value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ""))}
            placeholder={stage === "return" && rental.pickup ? `At pickup: ${rental.pickup.odometerKm}` : "e.g. 24816"} />
        </div>
        <div>
          <label className="label" htmlFor={`fuel-${stage}`}>Fuel level</label>
          <select id={`fuel-${stage}`} className="field mt-1.5" value={fuel} onChange={(e) => setFuel(Number(e.target.value))}>
            {Array.from({ length: FUEL_EIGHTHS + 1 }, (_, i) => FUEL_EIGHTHS - i).map((n) => <option key={n} value={n}>{fuelLabel(n)}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <GoldButton loading={busy}>{stage === "pickup" ? <><KeyRound size={16} /> Start rental</> : <><CheckCircle2 size={16} /> End rental</>}</GoldButton>
        <button type="button" onClick={onClose} className="text-sm text-muted hover:text-strong px-2 py-3">Not now</button>
        <span className="text-xs text-subtle">{done.length}/{RENTAL_PHOTO_SIDES.length} photos{DEMO_MODE ? " (demo: photos stay on this device)" : ""}</span>
      </div>
    </form>
  );
}

function Extend({ rental, payment, onDone, onClose }: { rental: Rental; payment: Booking["payment"]; onDone: (r: Rental, total: number) => void; onClose: () => void }) {
  const settings = useSettings();
  const options = RENTAL_RULES.extendHours.filter((h) => h <= settings.rentExtendMaxHours);
  const [hours, setHours] = useState<number>(options[1] ?? options[0]);
  const [quote, setQuote] = useState<{ lines: FareLine[]; total: number; endsAt: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setQuote(null); setError("");
    api.rental.extensionQuote(rental.bookingId, hours).then((q) => live && setQuote(q), (e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [rental.bookingId, hours]);

  async function pay() {
    setBusy(true); setError("");
    try { const r = await api.rental.extend(rental.bookingId, hours); onDone(r.rental, r.total); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Now due back {when(rental.endsAt)}. Add time before then.</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Hours to add">
        {options.map((h) => <button key={h} type="button" role="radio" aria-checked={hours === h} data-on={hours === h} onClick={() => setHours(h)} className="chip">+{h} hr{h > 1 ? "s" : ""}</button>)}
      </div>
      <div className="rounded-xl border border-line p-4 text-sm min-h-[92px]">
        {quote ? (
          <>
            {quote.lines.map((l) => <div key={l.label} className="flex justify-between"><span className="text-muted">{l.label}</span><span>{inr(l.amount)}</span></div>)}
            <div className="flex justify-between font-semibold mt-2 pt-2 border-t border-line"><span>Total</span><span className="text-gold">{inr(quote.total)}</span></div>
            <p className="text-xs text-subtle mt-2">New return time: {when(quote.endsAt)}. {payment === "wallet" ? "Paid from your QuikFly wallet." : "Demo: no payment is taken."}</p>
          </>
        ) : !error && <div className="flex justify-center py-4"><Spinner /></div>}
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <GoldButton type="button" loading={busy} disabled={!quote} onClick={pay}><Plus size={16} /> {quote ? `Extend for ${inr(quote.total)}` : "Extend"}</GoldButton>
        <button type="button" onClick={onClose} className="text-sm text-muted hover:text-strong px-2 py-3">Cancel</button>
      </div>
    </div>
  );
}

export function RentalPanel({ booking }: { booking: Booking }) {
  const { refreshBookings, toast } = useApp();
  const settings = useSettings();
  const [rental, setRental] = useState<Rental | null>(null);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<"pickup" | "return" | "extend" | null>(null);

  useEffect(() => {
    let live = true;
    api.rental.get(booking.id).then((r) => live && setRental(r), (e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [booking.id, booking.rentalState]);

  if (error) return <p className="text-sm text-danger mt-4">{error}</p>;
  if (!rental) return <div className="skeleton h-20 mt-4" />;

  const changed = (r: Rental, message: string) => { setRental(r); setSheet(null); toast(message); refreshBookings(); };
  const s = rental.settlement;

  return (
    <section className="mt-4 rounded-xl border border-gold/30 bg-gold/5 p-4" aria-label="Self-drive rental">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-strong flex items-center gap-2"><KeyRound size={16} className="text-gold" /> Self-drive</p>
        <span className="text-xs text-muted flex items-center gap-1"><Clock size={13} /> {rental.state === "settled" || rental.state === "returned" ? `Returned ${when(rental.dropoff!.at)}` : `Return by ${when(rental.endsAt)}`}</span>
      </div>

      {(rental.pickup || rental.dropoff) && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-3">
          {rental.pickup && <><dt className="text-subtle flex items-center gap-1"><Gauge size={13} /> At pickup</dt><dd className="text-right">{rental.pickup.odometerKm.toLocaleString("en-IN")} km · {fuelLabel(rental.pickup.fuel)}</dd></>}
          {rental.dropoff && <><dt className="text-subtle flex items-center gap-1"><Fuel size={13} /> At return</dt><dd className="text-right">{rental.dropoff.odometerKm.toLocaleString("en-IN")} km · {fuelLabel(rental.dropoff.fuel)}</dd></>}
          {rental.extensions.length > 0 && <><dt className="text-subtle">Extended</dt><dd className="text-right">+{rental.extensions.reduce((n, e) => n + e.hours, 0)} hrs ({inr(rental.extensions.reduce((n, e) => n + e.amount, 0))})</dd></>}
        </dl>
      )}

      {rental.state === "booked" && <p className="text-sm text-muted mt-2">At pickup, start the rental here: five photos of the car, the odometer and the fuel level.</p>}
      {rental.state === "returned" && <p className="text-sm text-muted mt-3">Thanks! QuikFly is checking the car. Your deposit settlement follows within {settings.rentDepositRefundHours} hours.</p>}
      {s && (
        <div className="mt-3 text-sm">
          <p className="text-muted">{s.kmDriven.toLocaleString("en-IN")} km driven{s.kmIncluded != null ? ` (${s.kmIncluded.toLocaleString("en-IN")} km included)` : " (unlimited km)"}.</p>
          <div className="mt-2 space-y-0.5">
            <div className="flex justify-between"><span className="text-muted">Deposit</span><span>{inr(s.deposit)}</span></div>
            {s.lines.map((l) => <div key={l.label} className="flex justify-between"><span className="text-muted">{l.label}</span><span className="text-danger">−{inr(l.amount)}</span></div>)}
            <div className="flex justify-between font-semibold pt-1 border-t border-line"><span>{booking.payment === "wallet" ? "Returned to wallet" : "Due back to you"}</span><span className="text-gold">{inr(s.depositReturned)}</span></div>
            {s.due > 0 && <div className="flex justify-between text-danger"><span>Still owed</span><span>{inr(s.due)} (demo: not collected)</span></div>}
          </div>
          {s.damageNote && <p className="text-xs text-subtle mt-2">Damage: {s.damageNote}</p>}
          {DEMO_MODE && <p className="text-xs text-subtle mt-2">Demo: settled straight away, without a staff check.</p>}
        </div>
      )}

      {(rental.state === "booked" || rental.state === "on_trip") && (
        <div className="flex flex-wrap gap-2 mt-3">
          {rental.state === "booked"
            ? <GoldButton type="button" onClick={() => setSheet("pickup")} className="!py-2"><KeyRound size={16} /> Start rental</GoldButton>
            : <GoldButton type="button" onClick={() => setSheet("return")} className="!py-2"><CheckCircle2 size={16} /> End rental</GoldButton>}
          <button type="button" onClick={() => setSheet("extend")} className="rounded-xl px-4 py-2 border border-line hover:border-gold/60 inline-flex items-center gap-2 text-sm"><Plus size={16} className="text-gold" /> Extend</button>
        </div>
      )}

      <Modal open={sheet === "pickup" || sheet === "return"} onClose={() => setSheet(null)} title={sheet === "pickup" ? "Start your rental" : "End your rental"} wide>
        {(sheet === "pickup" || sheet === "return") && <Checklist rental={rental} stage={sheet} onClose={() => setSheet(null)}
          onDone={(r) => changed(r, sheet === "pickup" ? "Rental started. Drive safe!" : r.state === "settled" ? "Car returned and deposit settled." : "Car returned. We'll settle your deposit soon.")} />}
      </Modal>
      <Modal open={sheet === "extend"} onClose={() => setSheet(null)} title="Extend your rental">
        {sheet === "extend" && <Extend rental={rental} payment={booking.payment} onClose={() => setSheet(null)} onDone={(r, total) => changed(r, `Extended. ${inr(total)} added.`)} />}
      </Modal>
    </section>
  );
}
