"use client";
// The parcels queue: what each counter has to do next.
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Package, RefreshCw, Search, X } from "lucide-react";
import { PARCEL_QUEUE_STATES, PARCEL_STATE_LABEL, parcelBandLabel, type AdminParcelRow, type ParcelFilters, type ParcelQueueState } from "@quikfly/shared";
import { Badge, Button, Empty, ErrorBox, PageHeader, Pager } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { cx, dateTime } from "@/lib/format";
import { PARCEL_STATE_STYLE, QUEUE_STATE_LABEL, nextAction } from "@/lib/parcels";
import { RequireAdmin } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

const stateLabel = (s: ParcelQueueState) => (s === "open" || s === "all" ? QUEUE_STATE_LABEL[s] : PARCEL_STATE_LABEL[s]);

/**
 * City, state and date live in the address, so a counter can bookmark its queue. The search
 * doesn't: it can be someone's phone number.
 */
function useFilters(): [ParcelFilters, (patch: Partial<ParcelFilters>) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [q, setQ] = useState<string>();
  const f: ParcelFilters = {
    q,
    city: params.get("city") || undefined,
    state: PARCEL_QUEUE_STATES.find((s) => s === params.get("state")),
    date: params.get("date") || undefined,
    page: Number(params.get("page")) || 1,
  };
  const set = (patch: Partial<ParcelFilters>) => {
    const { q: search, ...next } = { ...f, page: 1, ...patch };
    setQ(search);
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && !(k === "page" && v === 1)) sp.set(k, String(v));
    router.replace(sp.size ? `${path}?${sp}` : path);
  };
  return [f, set];
}

/** Only bus parcels have a departure. */
const route = (p: AdminParcelRow) => (p.departAt ? `${p.from} → ${p.to}` : `Quick parcel, ${p.to}`);
const viewHref = (p: AdminParcelRow) => `/parcels/view?id=${encodeURIComponent(p.bookingId)}`;
const StateBadge = ({ p }: { p: AdminParcelRow }) => <Badge className={PARCEL_STATE_STYLE[p.state]}>{PARCEL_STATE_LABEL[p.state]}</Badge>;
const Person = ({ who }: { who: { name: string; phone: string } }) => (
  <><span className="block text-fg break-words">{who.name || "Erased"}</span><span className="block text-xs text-subtle">{who.phone}</span></>
);

function Queue() {
  const [f, setF] = useFilters();
  const [q, setQ] = useState(f.q ?? "");
  useEffect(() => setQ(f.q ?? ""), [f.q]);
  const { data, error, loading, reload } = useLoad(() => adminApi.parcels.list(f), [JSON.stringify(f)]);
  // The counters' cities. The queue works without them, so a failure only empties the select.
  const counters = useLoad(() => adminApi.catalog.list("parcelCounter"), []);
  const cities = [...new Set((counters.data ?? []).map((c) => String((c.data as { city?: unknown }).city ?? "")).filter(Boolean))].sort();
  if (f.city && !cities.includes(f.city)) cities.push(f.city);
  const state = f.state ?? (f.q ? "all" : "open");
  const filtered = !!(f.q || f.city || f.state || f.date);

  return (
    <>
      <PageHeader title="Parcels" sub="Bus and Quick parcels, the most urgent first. Open one to receive it, move it or hand it over."
        actions={<Button loading={loading} onClick={reload}><RefreshCw size={16} /> Refresh</Button>} />

      <form className="card p-3 mb-4 grid gap-2 grid-cols-2 lg:grid-cols-6 items-end" onSubmit={(e) => { e.preventDefault(); setF({ q: q.trim() || undefined }); }}>
        <div className="relative col-span-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input className="field pl-9" placeholder="LR number or phone" maxLength={60} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search parcels" />
        </div>
        <label className="grid gap-1"><span className="label">Counter city</span>
          <select className="field" value={f.city ?? ""} onChange={(e) => setF({ city: e.target.value || undefined })}>
            <option value="">All cities</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>
        <label className="grid gap-1"><span className="label">Status</span>
          <select className="field" value={state} onChange={(e) => setF({ state: e.target.value as ParcelQueueState })}>
            {PARCEL_QUEUE_STATES.map((s) => <option key={s} value={s}>{stateLabel(s)}</option>)}
          </select></label>
        <label className="grid gap-1"><span className="label">Date</span>
          <input type="date" className="field min-w-0" value={f.date ?? ""} onChange={(e) => setF({ date: e.target.value || undefined })} /></label>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" className="flex-1">Search</Button>
          {filtered && (
            <Button type="button" variant="ghost" aria-label="Clear filters"
              onClick={() => { setQ(""); setF({ q: undefined, city: undefined, state: undefined, date: undefined }); }}><X size={16} /></Button>
          )}
        </div>
      </form>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <div className="card p-5 grid gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-12" />)}</div>}
      {data && (
        <div className={cx("card transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          {data.items.length === 0 ? (
            <Empty icon={Package} title={filtered ? "No parcels match these filters" : "No open parcels"} sub={filtered ? "Try fewer filters." : "New bookings show up here."} />
          ) : (
            <>
              <table className="hidden xl:table w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-line">
                    <th className="font-medium px-5 py-3">Parcel</th>
                    <th className="font-medium px-3 py-3">Sender</th>
                    <th className="font-medium px-3 py-3">Receiver</th>
                    <th className="font-medium px-3 py-3">Travels</th>
                    <th className="font-medium px-3 py-3">Status</th>
                    <th className="font-medium px-5 py-3">Next</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((p) => (
                    <tr key={p.bookingId} className="hover:bg-raised/50">
                      <td className="px-5 py-3">
                        <Link href={viewHref(p)} className="block group">
                          <span className="block text-fg font-medium group-hover:text-accent">{route(p)}</span>
                          <span className="block text-xs text-subtle"><span className="font-mono whitespace-nowrap">{p.lr}</span> · {parcelBandLabel(p.weightBand)}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-3"><Person who={p.sender} /></td>
                      <td className="px-3 py-3"><Person who={p.receiver} /></td>
                      <td className="px-3 py-3 text-fg whitespace-nowrap">{p.departAt ? dateTime(p.departAt) : "With a captain"}</td>
                      <td className="px-3 py-3"><StateBadge p={p} /></td>
                      <td className="px-5 py-3 text-fg">{nextAction(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="xl:hidden divide-y divide-line">
                {data.items.map((p) => (
                  <li key={p.bookingId}>
                    <Link href={viewHref(p)} className="block px-4 py-3 active:bg-raised">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-fg min-w-0">{route(p)}</p>
                        <StateBadge p={p} />
                      </div>
                      <p className="text-xs text-subtle mt-0.5"><span className="font-mono">{p.lr}</span> · {parcelBandLabel(p.weightBand)}{p.departAt ? ` · ${dateTime(p.departAt)}` : ""}</p>
                      <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                        <p className="min-w-0"><span className="label block">Sender</span><Person who={p.sender} /></p>
                        <p className="min-w-0"><span className="label block">Receiver</span><Person who={p.receiver} /></p>
                      </div>
                      <p className="text-xs text-muted mt-2">Next: <span className="text-fg font-medium">{nextAction(p)}</span></p>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="px-4 sm:px-5 pb-4"><Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setF({ page })} /></div>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return <RequireAdmin permission="parcels.manage"><Suspense><Queue /></Suspense></RequireAdmin>;
}
