"use client";
// Single-series charts for the dashboard, following the dataviz rules: one hue (--chart-bar),
// bars ≤ 24px with a 4px rounded end and a square baseline, 2px gaps, hairline grid,
// a tooltip on hover and keyboard focus, and a table view so nothing hides behind hover.
import { useState } from "react";
import { cx } from "@/lib/format";

export interface Datum {
  key: string;
  /** Axis / row label, e.g. "16 Nov". */
  label: string;
  /** Extra line in the tooltip, e.g. "Mon". */
  sub?: string;
  value: number;
}

/** A round axis maximum (1, 2, 2.5 or 5 × 10ⁿ) at or above `max`. */
function niceMax(max: number) {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= max) ?? 10) * p;
}

export function ColumnChart({
  data, format, axisFormat = format, label, height = 200,
}: { data: Datum[]; format: (n: number) => string; axisFormat?: (n: number) => string; label: string; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const top = niceMax(Math.max(...data.map((d) => d.value), 0));
  const ticks = [top, top / 2, 0];
  // Label at most ~8 days along the axis so labels never collide.
  const every = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div>
      <div className="flex justify-end -mt-1 mb-2">
        <button onClick={() => setAsTable((v) => !v)} className="text-xs text-muted hover:text-fg underline-offset-2 hover:underline">
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{label}</caption>
            <thead><tr className="text-left text-muted"><th className="font-medium py-1.5">Day</th><th className="font-medium py-1.5 text-right">Value</th></tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key} className="border-t border-line"><td className="py-1.5">{d.label}{d.sub && <span className="text-subtle"> · {d.sub}</span>}</td><td className="py-1.5 text-right tabular-nums">{format(d.value)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2" role="group" aria-label={label}>
          {/* Y axis */}
          <div className="flex flex-col justify-between text-[11px] text-subtle tabular-nums text-right shrink-0" style={{ height }}>
            {ticks.map((t) => <span key={t} className="leading-none -translate-y-1/2 first:translate-y-0 last:translate-y-0">{axisFormat(t)}</span>)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="relative" style={{ height }}>
              {/* Grid: hairlines at the ticks */}
              {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-chart-grid" style={{ bottom: `${(t / top) * 100}%` }} />)}
              <div className="absolute inset-0 flex items-end gap-[2px]">
                {data.map((d, i) => (
                  <button
                    key={d.key}
                    type="button"
                    className="relative flex-1 min-w-0 h-full flex items-end justify-center group outline-none"
                    onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                    aria-label={`${d.label}${d.sub ? ` ${d.sub}` : ""}: ${format(d.value)}`}
                  >
                    <span
                      className={cx("block w-full max-w-6 rounded-t-[4px] transition-colors",
                        active === i ? "bg-chart-bar-hover" : "bg-chart-bar", d.value === 0 && "bg-transparent")}
                      style={{ height: `${(d.value / top) * 100}%` }}
                    />
                    {active === i && (
                      <span className={cx("absolute bottom-full mb-2 z-10 pointer-events-none card px-2.5 py-1.5 text-left whitespace-nowrap",
                        i < data.length / 3 ? "left-0" : i > (data.length * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2")}>
                        <span className="block text-sm font-semibold text-strong tabular-nums">{format(d.value)}</span>
                        <span className="block text-xs text-muted">{d.label}{d.sub && ` · ${d.sub}`}</span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            {/* X axis */}
            <div className="flex gap-[2px] mt-1.5">
              {data.map((d, i) => (
                <span key={d.key} className={cx("flex-1 min-w-0 text-center text-[11px] text-subtle whitespace-nowrap overflow-visible",
                  // Phones get every other label, so they never touch.
                  (i / every) % 2 !== 0 && "max-sm:invisible")}>{i % every === 0 ? d.label : ""}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Horizontal bars, largest first, value at the tip. For comparing a handful of categories. */
export function BarList({ data, format, label }: { data: Datum[]; format: (n: number) => string; label: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="flex flex-col gap-3" aria-label={label}>
      {data.map((d) => (
        <li key={d.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm mb-1">
            <span className="text-fg truncate">{d.label}</span>
            <span className="text-strong font-medium tabular-nums">{format(d.value)}{d.sub && <span className="text-subtle font-normal"> · {d.sub}</span>}</span>
          </div>
          <div className="h-2 rounded-full bg-chart-grid">
            <div className="h-full rounded-full bg-chart-bar" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
