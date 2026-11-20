"use client";
// Row editors for the two settings written as short text: surge hours ("8-10, 17-20") and
// cancellation tiers ("15d:100, 7d:50"). Staff edit rows; the editor writes the same text the
// API stores and validates (SETTING_RULES), so nothing changes server-side.
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { CANCEL_EVENT, describeCancelPolicy, parseCancelPolicy, parseSurgeHours, type ServiceKey } from "@quikfly/shared";
import { Button } from "./ui";

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Keeps local rows while typing; takes the value again only when it changes from outside (discard, reset, restore). */
function useRows<T>(value: string, parse: (v: string) => T[], format: (rows: T[]) => string) {
  const [rows, setRows] = useState<T[]>(() => parse(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) { setRows(parse(value)); emitted.current = value; }
  }, [value, parse]);
  return { rows, update: (next: T[], onChange: (v: string) => void) => { setRows(next); emitted.current = format(next); onChange(emitted.current); } };
}

const parseHours = (v: string) => parseSurgeHours(v).filter(([a, b]) => Number.isInteger(a) && Number.isInteger(b));
const formatHours = (rows: [number, number][]) => rows.map(([a, b]) => `${a}-${b}`).join(", ");

export function SurgeHoursEditor({ id, value, onChange, disabled }: { id: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const { rows, update } = useRows(value, parseHours, formatHours);
  const set = (i: number, k: 0 | 1, h: number) => update(rows.map((r, j) => (j === i ? (k === 0 ? [h, r[1]] : [r[0], h]) : r)) as [number, number][], onChange);
  return (
    <div id={id} className="grid gap-2 w-full sm:w-auto">
      {rows.length === 0 && <p className="text-sm text-muted">No surge hours: rides never surge.</p>}
      {rows.map(([a, b], i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
          <label className="sr-only" htmlFor={`${id}-from-${i}`}>Surge window {i + 1} from</label>
          <select id={`${id}-from-${i}`} className="field w-24" value={a} disabled={disabled} onChange={(e) => set(i, 0, Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
          </select>
          <span className="text-muted">to</span>
          <label className="sr-only" htmlFor={`${id}-to-${i}`}>Surge window {i + 1} until the end of</label>
          <select id={`${id}-to-${i}`} className="field w-28" value={b} disabled={disabled} onChange={(e) => set(i, 1, Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${String(h).padStart(2, "0")}:59`}</option>)}
          </select>
          {!disabled && <button type="button" className="p-1.5 rounded-md text-muted hover:text-danger" aria-label={`Remove surge window ${i + 1}`} onClick={() => update(rows.filter((_, j) => j !== i), onChange)}><X size={16} /></button>}
        </div>
      ))}
      {!disabled && <Button type="button" size="sm" className="justify-self-start" onClick={() => update([...rows, [17, 20]], onChange)}><Plus size={14} /> Add surge window</Button>}
    </div>
  );
}

interface TierRow { n: string; unit: "d" | "h"; pct: string }
const parseTiers = (v: string): TierRow[] => parseCancelPolicy(v).map((t) =>
  t.hoursBefore >= 24 && t.hoursBefore % 24 === 0 ? { n: String(t.hoursBefore / 24), unit: "d", pct: String(t.refundPercent) } : { n: String(t.hoursBefore), unit: "h", pct: String(t.refundPercent) });
/** Rows with a number and a percentage, longest notice first, as policy text. */
const formatTiers = (rows: TierRow[]) => rows
  .filter((r) => r.n !== "" && r.pct !== "")
  .map((r) => ({ ...r, hours: Number(r.n) * (r.unit === "d" ? 24 : 1) }))
  .sort((x, y) => y.hours - x.hours)
  .map((r) => `${r.n}${r.unit}:${r.pct}`).join(", ");

export const POLICY_SERVICE: Record<string, ServiceKey> = { cancelPolicyBus: "bus", cancelPolicyTours: "tours", cancelPolicyRent: "rent", cancelPolicyGroup: "rentals" };

export function CancelTiersEditor({ id, value, onChange, disabled, service }: { id: string; value: string; onChange: (v: string) => void; disabled: boolean; service: ServiceKey }) {
  const { rows, update } = useRows(value, parseTiers, formatTiers);
  const set = (i: number, patch: Partial<TierRow>) => update(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)), onChange);
  return (
    <div id={id} className="grid gap-2 w-full sm:max-w-md">
      {rows.length === 0 && <p className="text-sm text-muted">No tiers: a full refund any time before the start.</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Cancel</span>
          <label className="sr-only" htmlFor={`${id}-n-${i}`}>Tier {i + 1}: notice</label>
          <input id={`${id}-n-${i}`} type="number" min={1} max={999} step={1} inputMode="numeric" className="field w-20" value={r.n} disabled={disabled} onChange={(e) => set(i, { n: e.target.value })} />
          <label className="sr-only" htmlFor={`${id}-u-${i}`}>Tier {i + 1}: days or hours</label>
          <select id={`${id}-u-${i}`} className="field w-24" value={r.unit} disabled={disabled} onChange={(e) => set(i, { unit: e.target.value as "d" | "h" })}>
            <option value="d">day(s)</option><option value="h">hour(s)</option>
          </select>
          <span className="text-muted">or more before:</span>
          <label className="sr-only" htmlFor={`${id}-p-${i}`}>Tier {i + 1}: percent refunded</label>
          <input id={`${id}-p-${i}`} type="number" min={0} max={100} step={1} inputMode="numeric" className="field w-20" value={r.pct} disabled={disabled} onChange={(e) => set(i, { pct: e.target.value })} />
          <span className="text-muted">% back</span>
          {!disabled && <button type="button" className="p-1.5 rounded-md text-muted hover:text-danger" aria-label={`Remove tier ${i + 1}`} onClick={() => update(rows.filter((_, j) => j !== i), onChange)}><X size={16} /></button>}
        </div>
      ))}
      {!disabled && <Button type="button" size="sm" className="justify-self-start" onClick={() => update([...rows, { n: "", unit: "h", pct: "" }], onChange)}><Plus size={14} /> Add tier</Button>}
      <p className="text-xs text-subtle">Customers read: “{describeCancelPolicy(parseCancelPolicy(value), CANCEL_EVENT[service])}”</p>
    </div>
  );
}
