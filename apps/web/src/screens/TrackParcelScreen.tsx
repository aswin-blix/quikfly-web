"use client";
// /parcels/track?lr=: public tracking for whoever has the LR number. First names only, and no code.
// It works while the service is off, so parcels already sent can still be followed.
import { useEffect, useState } from "react";
import { Package, Search } from "lucide-react";
import { PARCEL_STATE_LABEL, parcelTime, type PublicTracking } from "@quikfly/shared";
import { ParcelTimeline, SimulatedNote } from "@/components/parcel/ParcelTimeline";
import { PageHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { useNav, useQuery } from "@/lib/nav";
import { PARCEL_CHIP, PARCEL_POLL_MS, parcelTrackPath } from "@/lib/parcels";

export function TrackParcelScreen() {
  const lr = (useQuery().get("lr") ?? "").trim().toUpperCase();
  const nav = useNav();
  const [entry, setEntry] = useState(lr);
  const [found, setFound] = useState<PublicTracking | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setEntry(lr); setFound(null); setError("");
    if (!lr) return;
    let live = true;
    const load = () => api.parcels.track(lr).then((t) => { if (live) { setFound(t); setError(""); } }, (e: Error) => live && setError(e.message));
    load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, PARCEL_POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [lr]);

  const t = found;
  return (
    <>
      <PageHeader crumbs={[["Home", "/"], ["Track a parcel"]]} title="Track a parcel" icon={<Package className="text-gold" size={36} />}>
        <form className="mt-6 flex gap-2 max-w-lg" onSubmit={(e) => { e.preventDefault(); if (entry.trim()) nav.replace(parcelTrackPath(entry.trim().toUpperCase())); }}>
          <input className="field min-w-0 uppercase placeholder:normal-case" placeholder="LR number, starts with QFP-" maxLength={30} value={entry} onChange={(e) => setEntry(e.target.value)} aria-label="LR number" />
          <button className="btn-gold shrink-0 rounded-xl px-4 inline-flex items-center gap-2 text-sm"><Search size={16} />Track</button>
        </form>
      </PageHeader>

      <div className="max-w-7xl mx-auto px-4">
        {error && <p className="text-sm text-danger mb-4" role="alert">{error}</p>}
        {lr && !t && !error && <div className="py-16 text-center text-gold"><Spinner size={26} /></div>}
        {t && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
            <section className="panel p-5 space-y-5 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-2xl text-strong">{t.from} → {t.to}</h2>
                  <p className="font-mono text-sm text-muted break-all">{t.lr}</p>
                </div>
                <span className={cx("text-xs font-semibold px-2.5 py-1 rounded-full", PARCEL_CHIP[t.state])}>{PARCEL_STATE_LABEL[t.state]}</span>
              </div>
              <ParcelTimeline state={t.state} events={t.events} departAt={t.departAt} readyAt={t.readyAt} />
              {t.simulated && !["collected", "cancelled", "unclaimed"].includes(t.state) && <SimulatedNote />}
            </section>
            <aside className="panel p-5 h-fit space-y-4 text-sm min-w-0">
              {(t.sender || t.receiver) && (
                <dl className="space-y-1.5">
                  {t.sender && <div className="flex justify-between gap-3"><dt className="text-subtle">From</dt><dd className="break-words min-w-0">{t.sender}</dd></div>}
                  {t.receiver && <div className="flex justify-between gap-3"><dt className="text-subtle">For</dt><dd className="break-words min-w-0">{t.receiver}</dd></div>}
                </dl>
              )}
              {t.collectAt && t.state !== "cancelled" && (
                <div>
                  <p className="label">Collect at</p>
                  <p className="text-strong font-medium mt-1">{t.collectAt.name}</p>
                  <p className="text-muted break-words">{t.collectAt.address}</p>
                  <p className="text-xs text-subtle">{t.collectAt.hours}</p>
                  {t.state === "ready" && t.holdUntil && <p className="text-xs text-soft mt-1">Held until {parcelTime(t.holdUntil)}</p>}
                </div>
              )}
              {!["collected", "cancelled", "unclaimed"].includes(t.state) && (
                <p className="text-xs text-muted">To collect it you need a code. The sender gets it when the parcel is ready and passes it to you (demo: no SMS is sent).</p>
              )}
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
