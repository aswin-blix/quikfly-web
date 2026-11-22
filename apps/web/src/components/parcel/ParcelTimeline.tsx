"use client";
// A parcel's journey: what has happened, then (until it ends) what comes next with planned times.
import { PARCEL_JOURNEY, PARCEL_STATE_LABEL, parcelTime, type ParcelState } from "@quikfly/shared";
import { cx } from "@/lib/format";

export function ParcelTimeline({ state, events, departAt, readyAt }: {
  state: ParcelState;
  events: { state: ParcelState; at: string; note?: string | null }[];
  departAt: string | null;
  readyAt: string | null;
}) {
  const at = PARCEL_JOURNEY.indexOf(state);
  // -1: cancelled or unclaimed, so nothing comes next.
  const upcoming = at < 0 ? [] : PARCEL_JOURNEY.slice(at + 1);
  const planned: Partial<Record<ParcelState, string | null>> = { on_bus: departAt, ready: readyAt };
  return (
    <ol className="text-sm" aria-label="Parcel timeline">
      {events.map((e, i) => (
        <li key={`done-${i}`} className="relative pl-6 pb-4 last:pb-0">
          {(i < events.length - 1 || upcoming.length > 0) && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-gold/50" aria-hidden />}
          <span className={cx("absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full", e.state === "cancelled" || e.state === "unclaimed" ? "bg-danger" : "bg-brand")} aria-hidden />
          <p className={cx("font-medium", i === events.length - 1 ? "text-strong" : "text-soft")}>{PARCEL_STATE_LABEL[e.state]}</p>
          <p className="text-xs text-subtle">{parcelTime(e.at)}</p>
          {e.note && <p className="text-xs text-muted break-words">“{e.note}”</p>}
        </li>
      ))}
      {upcoming.map((s, i) => (
        <li key={s} className="relative pl-6 pb-4 last:pb-0">
          {i < upcoming.length - 1 && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-line" aria-hidden />}
          <span className="absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border border-line-strong" aria-hidden />
          <p className="text-muted">{PARCEL_STATE_LABEL[s]}<span className="sr-only"> (not yet)</span></p>
          {planned[s] && <p className="text-xs text-subtle">Planned {parcelTime(planned[s]!)}</p>}
        </li>
      ))}
    </ol>
  );
}

export function SimulatedNote() {
  return <p className="text-xs text-muted rounded-lg border border-dashed border-line px-3 py-2">Demo: simulated transit. The parcel moves by the bus timetable, not a real bus.</p>;
}
