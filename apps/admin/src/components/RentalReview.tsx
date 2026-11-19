"use client";
// Self-drive rental on the booking page: the customer's pickup and return readings and photos,
// extensions, and, once the car is back, the settlement form (damage + note) that refunds the
// rest of the deposit and completes the booking. Deductions are worked out by the API.
import { useEffect, useState } from "react";
import { CheckCircle2, ImageOff, KeyRound } from "lucide-react";
import { RENTAL_PHOTO_LABEL, RENTAL_PHOTO_SIDES, RENTAL_RULES, fuelLabel, type AdminRental, type RentalPhotoSide, type RentalSettlement, type RentalStage } from "@quikfly/shared";
import { Badge, Button, ErrorBox } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { cx, inr } from "@/lib/format";
import { useLoad } from "@/lib/useLoad";

const STATE: Record<AdminRental["state"], { label: string; cls: string }> = {
  booked: { label: "Not started", cls: "" },
  on_trip: { label: "On trip", cls: "border-brand/40 text-accent" },
  returned: { label: "Returned · settle the deposit", cls: "border-warning/50 text-warning" },
  settled: { label: "Settled", cls: "border-success/50 text-success" },
};
const local = (s: string) => s.replace("T", " ");

function Photo({ id, stage, side, has }: { id: string; stage: RentalStage; side: RentalPhotoSide; has: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!has) return;
    let live = true, made: string | null = null;
    adminApi.bookings.rentalPhoto(id, stage, side).then((u) => { made = u; if (live) setUrl(u); else URL.revokeObjectURL(u); }, () => live && setFailed(true));
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [id, stage, side, has]);
  return (
    <figure className="text-xs">
      <a href={url ?? undefined} target="_blank" rel="noreferrer" className={cx("block aspect-[4/3] rounded-lg border border-line overflow-hidden bg-fg/[0.03] grid place-items-center", url && "hover:border-brand/60")}>
        {url ? <img src={url} alt={`${RENTAL_PHOTO_LABEL[side]} at ${stage}`} className="w-full h-full object-cover" />
          : has && !failed ? <span className="skeleton w-full h-full" /> : <ImageOff size={18} className="text-subtle" />}
      </a>
      <figcaption className="text-subtle mt-1">{RENTAL_PHOTO_LABEL[side]}</figcaption>
    </figure>
  );
}

function Settle({ rental, onSettled }: { rental: AdminRental; onSettled: () => void }) {
  const [damage, setDamage] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<RentalSettlement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const amount = Math.min(RENTAL_RULES.damageMax, Number(damage) || 0);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => adminApi.bookings.settlementPreview(rental.bookingId, amount).then((p) => live && setPreview(p), (e) => live && setError(e.message)), 250);
    return () => { live = false; clearTimeout(t); };
  }, [rental.bookingId, amount]);

  async function settle() {
    if (amount > 0 && !note.trim()) return setError("Say what the damage charge is for.");
    setBusy(true); setError("");
    try { await adminApi.bookings.settle(rental.bookingId, amount, note.trim()); onSettled(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't settle."); }
    finally { setBusy(false); }
  }

  return (
    <div className="border-t border-line mt-4 pt-4 grid gap-3">
      <h3 className="font-medium text-strong">Settle the deposit</h3>
      <p className="text-sm text-muted">Compare the pickup and return photos. Extra km, late return and fuel are worked out from the customer&apos;s readings; add a damage charge only if the photos show new damage.</p>
      <div className="grid sm:grid-cols-[160px_1fr] gap-3">
        <label className="text-sm"><span className="text-muted">Damage (₹)</span>
          <input className="field mt-1" inputMode="numeric" maxLength={6} value={damage} onChange={(e) => setDamage(e.target.value.replace(/\D/g, ""))} placeholder="0" />
        </label>
        <label className="text-sm"><span className="text-muted">What for (shown to the customer)</span>
          <input className="field mt-1" maxLength={RENTAL_RULES.damageNoteMax} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. New scratch on the rear bumper" disabled={!amount} />
        </label>
      </div>
      {preview && <Breakdown s={preview} payment={rental.payment} />}
      {error && <ErrorBox message={error} />}
      <div><Button variant="primary" loading={busy} disabled={!preview} onClick={settle}><CheckCircle2 size={16} /> Settle and complete</Button></div>
    </div>
  );
}

function Breakdown({ s, payment }: { s: RentalSettlement; payment: string }) {
  return (
    <div className="rounded-lg border border-line p-3 text-sm grid gap-1">
      <p className="text-muted">{s.kmDriven.toLocaleString("en-IN")} km driven{s.kmIncluded != null ? `, ${s.kmIncluded.toLocaleString("en-IN")} included` : ", unlimited plan"}{s.lateHours ? ` · ${s.lateHours} hr late` : ""}{s.fuelShort ? ` · ${s.fuelShort}/8 tank less fuel` : ""}</p>
      <div className="flex justify-between"><span className="text-muted">Deposit</span><span className="tabular-nums">{inr(s.deposit)}</span></div>
      {s.lines.map((l) => <div key={l.label} className="flex justify-between"><span className="text-muted">{l.label}</span><span className="text-danger tabular-nums">−{inr(l.amount)}</span></div>)}
      {s.damageNote && <p className="text-xs text-subtle">“{s.damageNote}”</p>}
      <div className="flex justify-between font-semibold border-t border-line pt-1"><span>{payment === "wallet" ? "Back to the wallet" : "Due back (refund outside QuikFly)"}</span><span className="text-success tabular-nums">{inr(s.depositReturned)}</span></div>
      {s.due > 0 && <div className="flex justify-between text-danger"><span>Customer still owes</span><span className="tabular-nums">{inr(s.due)} (not collected)</span></div>}
    </div>
  );
}

export function RentalReview({ bookingId, canManage, onSettled }: { bookingId: string; canManage: boolean; onSettled: () => void }) {
  const { data: r, error, reload } = useLoad(() => adminApi.bookings.rental(bookingId), [bookingId]);
  if (error) return <section className="card p-5"><ErrorBox message={error} onRetry={reload} /></section>;
  if (!r) return <section className="card p-5"><div className="skeleton h-24" /></section>;

  return (
    <section className="card p-5" aria-labelledby="rental">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 id="rental" className="font-semibold text-strong flex items-center gap-2"><KeyRound size={16} className="text-accent" /> Self-drive rental</h2>
        <Badge className={STATE[r.state].cls}>{STATE[r.state].label}</Badge>
      </div>
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted">Pickup booked</dt><dd>{local(r.start)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Return due</dt><dd>{local(r.endsAt)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Km plan</dt><dd className="capitalize">{r.kmPlan}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Deposit</dt><dd>{inr(r.deposit)}</dd></div>
        {r.pickup && <div className="flex justify-between gap-3"><dt className="text-muted">Picked up</dt><dd>{local(r.pickup.at)} · {r.pickup.odometerKm.toLocaleString("en-IN")} km · {fuelLabel(r.pickup.fuel)}</dd></div>}
        {r.dropoff && <div className="flex justify-between gap-3"><dt className="text-muted">Returned</dt><dd>{local(r.dropoff.at)} · {r.dropoff.odometerKm.toLocaleString("en-IN")} km · {fuelLabel(r.dropoff.fuel)}</dd></div>}
        {r.extensions.map((e, i) => <div key={i} className="flex justify-between gap-3"><dt className="text-muted">Extension {i + 1}</dt><dd>+{e.hours} hrs · {inr(e.amount)}</dd></div>)}
      </dl>

      {(["pickup", "return"] as const).map((stage) => (r.photos[stage].length > 0 || (stage === "pickup" ? r.pickup : r.dropoff)) && (
        <div key={stage} className="mt-4">
          <p className="text-sm text-muted mb-2">{stage === "pickup" ? "At pickup" : "At return"}</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {RENTAL_PHOTO_SIDES.map((side) => <Photo key={side} id={r.bookingId} stage={stage} side={side} has={r.photos[stage].includes(side)} />)}
          </div>
        </div>
      ))}

      {r.state === "returned" && canManage && <Settle rental={r} onSettled={() => { reload(); onSettled(); }} />}
      {r.settlement && <div className="mt-4"><Breakdown s={r.settlement} payment={r.payment} /></div>}
      {r.state === "booked" && <p className="text-sm text-muted mt-3">The customer starts the rental in the app or website at pickup (five photos, odometer, fuel).</p>}
    </section>
  );
}
