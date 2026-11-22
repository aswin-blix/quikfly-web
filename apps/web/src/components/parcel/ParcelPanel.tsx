"use client";
// The sender's view of a parcel inside My Trips. The collection code appears only here.
import { useEffect, useState } from "react";
import { Navigation, Share2 } from "lucide-react";
import { PARCEL_RULES, parcelTime, type Booking, type Parcel, type ParcelCounter } from "@quikfly/shared";
import { useApp } from "@/components/AppProvider";
import { Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { Link } from "@/lib/nav";
import { PARCEL_POLL_MS, parcelShareText, parcelTrackPath, parcelTrackUrl } from "@/lib/parcels";
import { ParcelQr } from "./ParcelQr";
import { ParcelTimeline, SimulatedNote } from "./ParcelTimeline";

function Counter({ title, counter, when }: { title: string; counter: ParcelCounter | null; when?: string }) {
  if (!counter) return null;
  return (
    <div className="text-sm min-w-0">
      <p className="label">{title}</p>
      <p className="text-strong font-medium mt-1">{counter.name}</p>
      <p className="text-muted break-words">{counter.address}</p>
      <p className="text-xs text-subtle">{counter.hours} · <a href={`tel:${counter.phone.replace(/\s/g, "")}`} className="hover:text-gold">{counter.phone}</a></p>
      {when && <p className="text-xs text-soft mt-1">{when}</p>}
    </div>
  );
}

export function ParcelPanel({ booking }: { booking: Booking }) {
  const { refreshBookings, toast } = useApp();
  const [parcel, setParcel] = useState<Parcel | null>(null);
  const [error, setError] = useState("");
  const { id, parcelState, status } = booking;
  const live = status === "confirmed" || status === "ongoing";

  useEffect(() => {
    let alive = true;
    const load = () => api.parcels.get(id).then((p) => {
      if (!alive) return;
      setParcel(p); setError("");
      // It moved since the list loaded, so the card's chip and buttons need the new state.
      if (p.state !== parcelState) refreshBookings();
    }, (e: Error) => alive && setError(e.message));
    load();
    const timer = live ? setInterval(() => { if (document.visibilityState === "visible") load(); }, PARCEL_POLL_MS) : null;
    return () => { alive = false; if (timer) clearInterval(timer); };
  }, [id, parcelState, live, refreshBookings]);

  if (!parcel) {
    return error ? <p className="text-sm text-danger mt-4" role="alert">{error}</p> : <div className="py-6 text-center text-gold"><Spinner /></div>;
  }
  const p = parcel;

  async function share() {
    const url = parcelTrackUrl(p.lr);
    const text = parcelShareText(p.lr, p.from, p.to);
    if (navigator.share) { try { await navigator.share({ title: "QuikFly parcel", text, url }); return; } catch { /* dismissed: fall back to copy */ } }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast("Tracking link copied. Send it to the receiver.");
    } catch {
      toast("Couldn't copy. Open Track and copy the address instead.", "err");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-line p-4 space-y-4">
      {p.collectOtp && (
        <div className="no-print rounded-xl border border-gold/50 bg-gold/[0.06] p-4">
          <p className="label !text-gold">Collection code</p>
          <p className="font-mono text-3xl tracking-[0.2em] text-strong mt-1" aria-label={`Collection code ${p.collectOtp.split("").join(" ")}`}>{p.collectOtp}</p>
          <p className="text-xs text-muted mt-2">
            Give these {PARCEL_RULES.collectOtpDigits} digits only to {p.receiver.name || "the receiver"}. The counter hands the parcel over to whoever has them. Demo: no SMS is sent.
            {p.holdUntil && ` It's held until ${parcelTime(p.holdUntil)}.`}
          </p>
        </div>
      )}
      {p.state === "unclaimed" && <p className="text-sm text-danger">Nobody collected it within the hold period. Use Get help and we&apos;ll agree how it comes back to you.</p>}

      <div className="grid sm:grid-cols-2 gap-5">
        <ParcelTimeline state={p.state} events={p.events} departAt={p.departAt} readyAt={p.readyAt} />
        <div className="space-y-4 min-w-0">
          <Counter title="Hand in at" counter={p.fromCounter} />
          <Counter title="Collect at" counter={p.toCounter} when={p.readyAt ? `Expected ${parcelTime(p.readyAt)}` : undefined} />
          <div className="text-sm">
            <p className="label">Receiver</p>
            <p className="text-strong font-medium mt-1 break-words">{p.receiver.name || "Erased"}</p>
            <p className="text-muted">{p.receiver.phone}</p>
            <p className="text-xs text-subtle break-words">{p.contents}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 border-t border-line pt-4">
        <ParcelQr lr={p.lr} className="!w-20 !h-20" />
        <div className="min-w-0 text-sm">
          <p className="font-mono text-strong break-all">{p.lr}</p>
          <p className="text-xs text-subtle">The tracking page shows first names only, and never the code.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
            <Link href={parcelTrackPath(p.lr)} className="text-gold flex items-center gap-1.5"><Navigation size={15} />Track</Link>
            <button onClick={share} className="text-gold flex items-center gap-1.5"><Share2 size={15} />Share tracking link</button>
          </div>
        </div>
      </div>
      {live && p.simulated && p.state !== "unclaimed" && <SimulatedNote />}
    </div>
  );
}
