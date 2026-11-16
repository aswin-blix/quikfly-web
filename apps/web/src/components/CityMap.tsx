"use client";
// Stylised demo map. Swap for Google Maps / Mapbox / OLA Maps when going live —
// the props (pickup, drop, vehicle position) stay the same.
import type { Place } from "@quikfly/shared";
import { useConfig } from "@/components/ConfigProvider";

export type Pt = { x: number; y: number };

/** Point on the curved route between a and b at t (0..1). */
export function routePoint(a: Pt, b: Pt, t: number): Pt {
  const c = control(a, b);
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}
/** Where the simulated driver starts before heading to the pickup. */
export const driverStartFor = (pickup: Pt): Pt => ({ x: Math.max(4, pickup.x - 14), y: Math.min(96, pickup.y + 12) });

/** Simulated vehicle position for a ride phase, with t = progress through that phase (0..1). */
export function vehiclePosition(phase: "arriving" | "ontrip" | "done", pickup: Pt, drop: Pt, t: number): Pt {
  if (phase === "done") return drop;
  if (phase === "ontrip") return routePoint(pickup, drop, t);
  const s = driverStartFor(pickup);
  return { x: s.x + (pickup.x - s.x) * t, y: s.y + (pickup.y - s.y) * t };
}

function control(a: Pt, b: Pt): Pt {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  return { x: mx - dy * 0.25, y: my + dx * 0.25 };
}

export function CityMap({
  pickup, drop, vehicle, vehicleFrom, showRoute, searching, kind = "car",
}: {
  pickup?: Place | null; drop?: Place | null; vehicle?: Pt | null; vehicleFrom?: Pt | null;
  showRoute?: boolean; searching?: boolean; kind?: "bike" | "car";
}) {
  const PLACES = useConfig()?.places ?? [];
  const c = pickup && drop ? control(pickup, drop) : null;
  return (
    <div className="relative w-full h-full min-h-[320px] overflow-hidden rounded-[1.25rem] border border-line bg-[var(--map-bg)]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <pattern id="grid" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M6 0H0V6" fill="none" stroke="var(--map-grid)" strokeWidth="0.35" />
          </pattern>
          <linearGradient id="sea" x1="0" x2="1">
            <stop offset="0" stopColor="var(--map-water-from)" /><stop offset="1" stopColor="var(--map-water-to)" />
          </linearGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="0.8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />
        {/* Bay of Bengal */}
        <path d="M88 0 C 86 20, 90 35, 87 50 S 92 80, 95 100 L100 100 L100 0 Z" fill="url(#sea)" />
        {/* Parks */}
        <circle cx="40" cy="70" r="5" fill="var(--map-park)" />
        <circle cx="36" cy="22" r="3" fill="var(--map-park)" />
        {/* Rivers */}
        <path d="M0 33 C 20 30, 40 40, 60 36 S 80 40, 88 42" stroke="var(--map-river)" strokeWidth="1.4" fill="none" />
        <path d="M10 70 C 30 62, 55 66, 72 62 S 84 60, 88 60" stroke="var(--map-river)" strokeWidth="1.6" fill="none" />
        {/* Arterial roads */}
        {[
          "M0 50 C 25 48, 50 52, 88 46", "M30 0 C 34 30, 40 60, 30 100", "M60 0 C 58 30, 54 60, 58 100",
          "M10 100 C 30 70, 60 40, 88 20", "M45 55 C 60 70, 75 85, 84 100", "M0 20 C 30 25, 60 22, 88 28",
        ].map((d) => <path key={d} d={d} stroke="var(--map-road)" strokeWidth="1.3" fill="none" />)}
        {[
          "M0 50 C 25 48, 50 52, 88 46", "M30 0 C 34 30, 40 60, 30 100", "M10 100 C 30 70, 60 40, 88 20",
        ].map((d) => <path key={d + "c"} d={d} stroke="var(--map-road-line)" strokeWidth="0.3" strokeDasharray="1.5 1.5" fill="none" />)}

        {/* Landmarks */}
        {PLACES.map((p) => (
          <g key={p.id} opacity={pickup?.id === p.id || drop?.id === p.id ? 0 : 0.6}>
            <circle cx={p.x} cy={p.y} r="0.7" fill="var(--map-landmark)" />
            <text x={p.x + 1.4} y={p.y + 0.8} fontSize="2.2" fill="var(--map-landmark-text)">{p.name.split(" ")[0]}</text>
          </g>
        ))}

        {/* Route */}
        {pickup && drop && c && showRoute && (
          <>
            <path d={`M${pickup.x} ${pickup.y} Q ${c.x} ${c.y} ${drop.x} ${drop.y}`} stroke="var(--accent)" strokeOpacity="0.25" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <path d={`M${pickup.x} ${pickup.y} Q ${c.x} ${c.y} ${drop.x} ${drop.y}`} stroke="var(--accent)" strokeWidth="0.8" fill="none" strokeDasharray="2 2" className="route-dash" strokeLinecap="round" filter="url(#glow)" />
          </>
        )}
        {vehicleFrom && pickup && (
          <path d={`M${vehicleFrom.x} ${vehicleFrom.y} L ${pickup.x} ${pickup.y}`} stroke="var(--success)" strokeOpacity="0.4" strokeWidth="0.5" strokeDasharray="1 1.2" />
        )}

        {/* Pins */}
        {pickup && (
          <g>
            {searching && <circle cx={pickup.x} cy={pickup.y} r="4" fill="var(--success)" fillOpacity="0.35" className="pulse-ring" />}
            <circle cx={pickup.x} cy={pickup.y} r="2" fill="var(--success)" stroke="var(--map-pin-outline)" strokeWidth="0.8" />
            <Label p={pickup} color="var(--success)" text={pickup.name} dy={pickup.y < (drop?.y ?? 0) ? -5.5 : 5.5} />
          </g>
        )}
        {drop && (
          <g>
            <rect x={drop.x - 1.8} y={drop.y - 1.8} width="3.6" height="3.6" fill="var(--brand)" stroke="var(--map-pin-outline)" strokeWidth="0.8" />
            <Label p={drop} color="var(--brand)" text={drop.name} dy={pickup && drop.y <= pickup.y ? -5.5 : 5.5} />
          </g>
        )}
        {vehicle && (
          <g transform={`translate(${vehicle.x} ${vehicle.y})`} filter="url(#glow)">
            <circle r="3.2" fill="var(--map-pin-outline)" stroke="var(--brand)" strokeWidth="0.6" />
            {kind === "bike" ? (
              <g fill="none" stroke="var(--brand)" strokeWidth="0.45"><circle cx="-1.2" cy="0.6" r="0.9" /><circle cx="1.2" cy="0.6" r="0.9" /><path d="M-1.2 .6 L0 -1 L1.2 .6 M0 -1 L.8 -1.2" /></g>
            ) : (
              <g fill="var(--brand)"><rect x="-1.7" y="-0.9" width="3.4" height="1.6" rx="0.5" /><rect x="-1" y="-1.6" width="2" height="0.9" rx="0.3" /><circle cx="-1" cy="0.8" r="0.45" fill="var(--map-pin-outline)" stroke="var(--brand)" strokeWidth="0.25" /><circle cx="1" cy="0.8" r="0.45" fill="var(--map-pin-outline)" stroke="var(--brand)" strokeWidth="0.25" /></g>
            )}
          </g>
        )}
      </svg>
      <div className="absolute left-3 bottom-3 text-[10px] text-muted bg-ink/70 px-2 py-1 rounded-md">Demo map · Chennai</div>
    </div>
  );
}

function Label({ p, color, text, dy }: { p: Pt; color: string; text: string; dy: number }) {
  const t = text.length > 26 ? text.slice(0, 25) + "…" : text;
  const w = t.length * 1.25 + 3;
  const x = Math.min(99 - w, Math.max(1, p.x - w / 2));
  const y = p.y + dy;
  return (
    <g>
      <rect x={x} y={y - 2.5} width={w} height="5" rx="1.2" fill="var(--map-label-bg)" stroke={color} strokeWidth="0.3" />
      <text x={x + 1.5} y={y + 0.9} fontSize="2.4" fill="var(--map-label-text)" fontWeight="600">{t}</text>
    </g>
  );
}
