"use client";
// On a booking's page: which partner vehicle runs the trip. Group-travel bookings can be
// given to a live partner vehicle (with its driver) by staff; rides find one themselves.
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatRegNumber, VENDOR_VEHICLE_LABEL, type AdminBookingDetail, type AssignableVehicle } from "@quikfly/shared";
import { Button } from "./ui";
import { adminApi } from "@/lib/api";

export function PartnerAssign({ detail, canManage, onChange }: { detail: AdminBookingDetail; canManage: boolean; onChange: (d: AdminBookingDetail) => void }) {
  const b = detail.booking;
  const p = detail.partner;
  const assignable = canManage && b.service === "rentals" && (b.status === "confirmed" || b.status === "ongoing");
  const [options, setOptions] = useState<AssignableVehicle[] | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!assignable) return;
    adminApi.vendors.assignable().then(setOptions, (e) => setError(e instanceof Error ? e.message : "Couldn't load partner vehicles."));
  }, [assignable]);

  const save = async (vehicleId: string | null) => {
    setBusy(true); setError("");
    try { onChange(await adminApi.bookings.assignVendor(b.id, vehicleId)); setPick(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't assign."); }
    finally { setBusy(false); }
  };

  if (!p && !assignable) return null;
  return (
    <section className="card p-5" aria-labelledby="partner">
      <h2 id="partner" className="font-semibold text-strong mb-2">Partner vehicle</h2>
      {p ? (
        <div className="text-sm grid gap-1">
          <p className="font-mono text-strong">{formatRegNumber(p.regNumber)}</p>
          <p className="text-muted">{p.driverName ? `Driver: ${p.driverName}` : "No driver recorded"}</p>
          <Link href={`/vendors/view?id=${encodeURIComponent(p.vendorId)}`} className="text-accent hover:underline">{p.vendorName} →</Link>
          {assignable && <Button size="sm" className="mt-2 justify-self-start" loading={busy} onClick={() => save(null)}>Take it back</Button>}
        </div>
      ) : (
        <div className="grid gap-2">
          <p className="text-sm text-muted">Give this trip to a live partner vehicle with an approved driver. The partner is notified and earns on completion.</p>
          {options && options.length === 0 && <p className="text-sm text-muted">No partner vehicle is live with a driver right now.</p>}
          {options && options.length > 0 && (
            <>
              <select className="field text-sm" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Partner vehicle">
                <option value="">Choose a vehicle…</option>
                {options.map((o) => <option key={o.vehicleId} value={o.vehicleId}>{formatRegNumber(o.regNumber)} · {VENDOR_VEHICLE_LABEL[o.type]} · {o.driverName} ({o.vendorName})</option>)}
              </select>
              <Button size="sm" variant="primary" className="justify-self-start" disabled={!pick} loading={busy} onClick={() => save(pick)}>Assign</Button>
            </>
          )}
        </div>
      )}
      {error && <p className="text-sm text-danger mt-2">{error}</p>}
    </section>
  );
}
