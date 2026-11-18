"use client";
// /track?t=TOKEN: public page (no login) where family can follow a shared ride.
// The ride is simulated, so the position is worked out from the start time with the
// same timings as the rider's screen (RIDE_SIMULATION).
import { useEffect, useState } from "react";
import { CircleCheck, MapPin, Navigation, ShieldCheck, Star, XCircle } from "lucide-react";
import { RIDE_SIMULATION, type SharedRide } from "@quikfly/shared";
import { CityMap, driverStartFor, vehiclePosition } from "@/components/CityMap";
import { Empty, Spinner } from "@/components/ui";
import { EMERGENCY_NUMBER } from "@/lib/account";
import { useSettings } from "@/components/ConfigProvider";
import { api } from "@/lib/api";
import { useQuery } from "@/lib/nav";

/** How often to re-check the ride (e.g. to notice a cancellation). */
const REFRESH_MS = 15_000;

type Phase = "arriving" | "ontrip" | "done";
function progress(startedAt: string, now: number): { phase: Phase; t: number } {
  const elapsed = now - Date.parse(startedAt);
  const { arriveMs, tripMs } = RIDE_SIMULATION;
  if (elapsed < arriveMs) return { phase: "arriving", t: Math.max(0, elapsed / arriveMs) };
  if (elapsed < arriveMs + tripMs) return { phase: "ontrip", t: (elapsed - arriveMs) / tripMs };
  return { phase: "done", t: 1 };
}

export function TrackScreen() {
  const SAFETY = { emergency: EMERGENCY_NUMBER, safetyLine: useSettings().safetyLine };
  const token = useQuery().get("t") ?? "";
  const [ride, setRide] = useState<SharedRide | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!token) return setError("This link is missing its trip code.");
    let live = true;
    const load = () => api.rides.shared(token).then((r) => live && setRide(r), (e) => live && setError((e as Error).message));
    load();
    const poll = setInterval(load, REFRESH_MS);
    return () => { live = false; clearInterval(poll); };
  }, [token]);

  // Smooth movement on the map while the ride is in progress.
  const finished = !ride || ride.status === "cancelled" || progress(ride.startedAt, now).phase === "done";
  useEffect(() => {
    if (finished) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [finished]);

  if (error) {
    return <div className="max-w-xl mx-auto px-4 py-20"><div className="panel"><Empty icon={<XCircle size={40} />} text={error} /></div></div>;
  }
  if (!ride) {
    return <div className="py-32 grid place-items-center text-muted gap-3"><Spinner size={26} />Loading trip…</div>;
  }

  const { phase, t } = progress(ride.startedAt, now);
  const cancelled = ride.status === "cancelled";
  const minsLeft = phase === "arriving" ? Math.max(1, Math.ceil(ride.etaMin * (1 - t))) : Math.max(1, Math.ceil(ride.durationMin * (1 - t)));
  const headline = cancelled ? "This ride was cancelled"
    : phase === "arriving" ? `Driver reaching ${ride.riderName} in ${minsLeft} min`
    : phase === "ontrip" ? `${ride.riderName} is on the way · ${minsLeft} min to drop`
    : `${ride.riderName} has arrived`;

  return (
    <div className="max-w-6xl mx-auto px-4 pt-8 pb-16">
      <p className="label flex items-center gap-1.5"><ShieldCheck size={14} className="text-success" />Shared trip · live</p>
      <h1 className="font-display text-2xl sm:text-3xl text-strong mt-2">{headline}</h1>

      <div className="grid lg:grid-cols-[380px_1fr] gap-5 mt-6">
        <div className="space-y-4 order-2 lg:order-1">
          {!cancelled && (
            <div className="panel p-4">
              <div className="h-1.5 rounded-full bg-line overflow-hidden">
                <div className="h-full bg-gradient-to-r from-gold-deep to-gold" style={{ width: `${phase === "done" ? 100 : phase === "ontrip" ? 50 + t * 50 : t * 50}%` }} />
              </div>
              <div className="flex justify-between text-xs text-subtle mt-2"><span>Driver assigned</span><span>Picked up</span><span>Arrived</span></div>
            </div>
          )}
          <div className="panel p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full btn-gold grid place-items-center text-lg">{ride.driver.name[0]}</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-strong">{ride.driver.name}</p>
              <p className="text-xs text-muted flex items-center gap-1"><Star size={12} className="fill-gold text-gold" />{ride.driver.rating} · {ride.driver.vehicle}</p>
            </div>
            <p className="font-mono font-bold bg-white text-on-brand border border-line px-2 py-1 rounded text-sm">{ride.driver.plate}</p>
          </div>
          <div className="panel p-4 text-sm space-y-2">
            <p className="flex gap-2"><MapPin size={16} className="text-success shrink-0" />{ride.pickup.name}</p>
            <p className="flex gap-2"><Navigation size={16} className="text-gold shrink-0" />{ride.drop.name}</p>
            <p className="text-xs text-subtle pt-1">{ride.distanceKm} km · about {ride.durationMin} min</p>
          </div>
          {phase === "done" && !cancelled && <p className="text-sm text-success flex items-center gap-2"><CircleCheck size={16} />Reached the destination safely.</p>}
          <p className="text-xs text-subtle">Worried? Call {SAFETY.emergency} or the QuikFly safety line {SAFETY.safetyLine}. Driver phone numbers aren&apos;t shown on shared links.</p>
        </div>
        <div className="h-[340px] lg:h-auto lg:min-h-[480px] order-1 lg:order-2">
          <CityMap pickup={ride.pickup} drop={ride.drop} stops={ride.stops ?? []} kind={ride.service} showRoute={phase !== "arriving"}
            vehicle={cancelled ? null : vehiclePosition(phase, ride.pickup, ride.drop, t, ride.stops ?? [])}
            vehicleFrom={!cancelled && phase === "arriving" ? driverStartFor(ride.pickup) : null} />
        </div>
      </div>
    </div>
  );
}
