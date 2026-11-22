"use client";
// A Quick parcel's captain and codes, on the sender's screen only. In the demo there is no driver
// app, so the sender also plays the captain at both hand-offs.
import { useState } from "react";
import { Star } from "lucide-react";
import { PARCEL_RULES, type Parcel } from "@quikfly/shared";
import { useApp } from "@/components/AppProvider";
import { GoldButton } from "@/components/ui";
import { api } from "@/lib/api";

export function CourierSteps({ parcel: p, onChange }: { parcel: Parcel; onChange: (p: Parcel) => void }) {
  const { refreshBookings } = useApp();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!p.courier) return null;
  const { captain, pickup, drop, distanceKm } = p.courier;

  async function act(move: () => Promise<Parcel>) {
    setBusy(true);
    setError("");
    try {
      onChange(await move());
      setCode("");
      await refreshBookings();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div className="no-print space-y-3">
      {p.state !== "cancelled" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm">
          <div className="min-w-0">
            <p className="label">Captain (simulated)</p>
            <p className="text-strong font-medium mt-1 flex items-center gap-1.5">{captain.name}<Star size={13} className="text-gold" /><span className="text-xs text-muted">{captain.rating}</span></p>
            <p className="text-muted">{captain.vehicle} · <span className="font-mono">{captain.plate}</span></p>
          </div>
          <p className="text-xs text-subtle min-w-0 break-words">{pickup.name} → {drop.name} · {distanceKm} km</p>
        </div>
      )}
      {p.pickupOtp && (
        <div className="rounded-xl border border-gold/50 bg-gold/[0.06] p-4">
          <p className="label !text-gold">Pickup code</p>
          <p className="font-mono text-3xl tracking-[0.2em] text-strong mt-1" aria-label={`Pickup code ${p.pickupOtp.split("").join(" ")}`}>{p.pickupOtp}</p>
          <p className="text-xs text-muted mt-2">Give it to the captain when you hand the parcel over.</p>
          {p.simulated && (
            <GoldButton type="button" className="mt-3" loading={busy} onClick={() => act(() => api.parcels.handover(p.bookingId, p.pickupOtp!))}>
              The captain has it (demo)
            </GoldButton>
          )}
        </div>
      )}
      {p.state === "in_transit" && p.simulated && (
        <form className="rounded-xl border border-dashed border-line p-4 space-y-2" onSubmit={(e) => { e.preventDefault(); void act(() => api.parcels.deliver(p.bookingId, code)); }}>
          <label className="label" htmlFor={`deliver-${p.bookingId}`}>Demo: you play the captain. Type the receiver&apos;s code to deliver.</label>
          <div className="flex flex-wrap gap-2">
            <input id={`deliver-${p.bookingId}`} className="field !w-40 font-mono" inputMode="numeric" autoComplete="off" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, PARCEL_RULES.collectOtpDigits))} />
            <GoldButton type="submit" loading={busy} disabled={code.length !== PARCEL_RULES.collectOtpDigits}>Mark delivered</GoldButton>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
