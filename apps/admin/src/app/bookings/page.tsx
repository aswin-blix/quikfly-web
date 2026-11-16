"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Search, X } from "lucide-react";
import { BOOKING_STATUSES, type BookingFilters, type ServiceKey } from "@quikfly/shared";
import { Badge, Button, Empty, ErrorBox, PageHeader, Pager } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { SERVICE_LABEL, STATUS_STYLE, cx, dateTime, inr } from "@/lib/format";
import { RequireAdmin } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

const SERVICES = Object.keys(SERVICE_LABEL) as ServiceKey[];

/** Filters live in the address, so a filtered list can be bookmarked or shared with a colleague. */
function useFilters(): [BookingFilters, (patch: Partial<BookingFilters>) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const f: BookingFilters = {
    q: params.get("q") || undefined,
    status: (params.get("status") as BookingFilters["status"]) || undefined,
    service: (params.get("service") as ServiceKey) || undefined,
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    page: Number(params.get("page")) || 1,
  };
  const set = (patch: Partial<BookingFilters>) => {
    const next = { ...f, page: 1, ...patch };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && !(k === "page" && v === 1)) sp.set(k, String(v));
    router.replace(sp.size ? `${path}?${sp}` : path);
  };
  return [f, set];
}

function BookingsList() {
  const [f, setF] = useFilters();
  const [q, setQ] = useState(f.q ?? "");
  useEffect(() => setQ(f.q ?? ""), [f.q]);
  const key = JSON.stringify(f);
  const { data, error, loading, reload } = useLoad(() => adminApi.bookings.search(f), [key]);
  const filtered = !!(f.q || f.status || f.service || f.from || f.to);

  return (
    <>
      <PageHeader title="Bookings" sub="Every booking across all services, newest first. Open one to cancel with a refund or mark it completed." />

      {/* Filters: one row above the list they scope */}
      <form className="card p-3 mb-4 grid gap-2 grid-cols-2 lg:grid-cols-4 items-end" onSubmit={(e) => { e.preventDefault(); setF({ q: q.trim() || undefined }); }}>
        <div className="relative col-span-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input className="field pl-9" placeholder="Booking ID, name, phone or title" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search bookings" />
        </div>
        <select className="field" value={f.status ?? ""} onChange={(e) => setF({ status: (e.target.value || undefined) as BookingFilters["status"] })} aria-label="Status">
          <option value="">All statuses</option>
          {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
        </select>
        <select className="field" value={f.service ?? ""} onChange={(e) => setF({ service: (e.target.value || undefined) as ServiceKey })} aria-label="Service">
          <option value="">All services</option>
          {SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABEL[s]}</option>)}
        </select>
        <label className="grid gap-1"><span className="label">From</span>
          <input type="date" className="field" value={f.from ?? ""} max={f.to} onChange={(e) => setF({ from: e.target.value || undefined })} aria-label="From date" /></label>
        <label className="grid gap-1"><span className="label">To</span>
          <input type="date" className="field" value={f.to ?? ""} min={f.from} onChange={(e) => setF({ to: e.target.value || undefined })} aria-label="To date" /></label>
        <div className="flex gap-2 col-span-2">
          <Button type="submit" variant="primary" className="flex-1">Search</Button>
          {filtered && <Button type="button" variant="ghost" aria-label="Clear filters" onClick={() => { setQ(""); setF({ q: undefined, status: undefined, service: undefined, from: undefined, to: undefined }); }}><X size={16} /></Button>}
        </div>
      </form>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <div className="card p-5 grid gap-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12" />)}</div>}
      {data && (
        <div className={cx("card transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          {data.items.length === 0 ? (
            <Empty icon={ClipboardList} title={filtered ? "No bookings match these filters" : "No bookings yet"} sub={filtered ? "Try fewer filters." : undefined} />
          ) : (
            <>
              {/* Desktop: table */}
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-line">
                    <th className="font-medium px-5 py-3">Booking</th>
                    <th className="font-medium px-3 py-3">Customer</th>
                    <th className="font-medium px-3 py-3">Status</th>
                    <th className="font-medium px-3 py-3 text-right">Amount</th>
                    <th className="font-medium px-5 py-3 text-right">Booked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((b) => (
                    <tr key={b.id} className="hover:bg-raised/50">
                      <td className="px-5 py-3 max-w-[22rem]">
                        <Link href={`/bookings/view?id=${encodeURIComponent(b.id)}`} className="block group">
                          <span className="block text-fg font-medium truncate group-hover:text-accent">{b.title}</span>
                          <span className="block text-xs text-subtle truncate">{SERVICE_LABEL[b.service]} · <span className="font-mono">{b.id}</span></span>
                        </Link>
                      </td>
                      <td className="px-3 py-3"><span className="block text-fg">{b.customer.name}</span><span className="block text-xs text-subtle">{b.customer.phone}</span></td>
                      <td className="px-3 py-3"><Badge className={STATUS_STYLE[b.status].cls}>{STATUS_STYLE[b.status].label}</Badge></td>
                      <td className="px-3 py-3 text-right tabular-nums text-strong font-medium">{inr(b.amount)}<span className="block text-xs text-subtle font-normal uppercase">{b.payment}</span></td>
                      <td className="px-5 py-3 text-right text-xs text-subtle whitespace-nowrap">{dateTime(b.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Phones: cards */}
              <ul className="md:hidden divide-y divide-line">
                {data.items.map((b) => (
                  <li key={b.id}>
                    <Link href={`/bookings/view?id=${encodeURIComponent(b.id)}`} className="block px-4 py-3 active:bg-raised">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-fg min-w-0 truncate">{b.title}</p>
                        <span className="text-sm font-semibold text-strong tabular-nums shrink-0">{inr(b.amount)}</span>
                      </div>
                      <p className="text-xs text-subtle mt-0.5 truncate">{SERVICE_LABEL[b.service]} · {b.customer.name} · {b.customer.phone}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <Badge className={STATUS_STYLE[b.status].cls}>{STATUS_STYLE[b.status].label}</Badge>
                        <span className="text-xs text-subtle">{dateTime(b.createdAt)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="px-4 sm:px-5 pb-4"><Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(page) => setF({ ...f, page })} /></div>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return <RequireAdmin permission="bookings.view"><Suspense><BookingsList /></Suspense></RequireAdmin>;
}
