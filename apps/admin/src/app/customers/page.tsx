"use client";
// Customers: find anyone by name, phone, email or id; see wallet, bookings and account state at a
// glance; open one for the wallet history and the account actions (customers.manage).
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Users, X } from "lucide-react";
import { CUSTOMER_STATUSES, type AdminCustomer, type CustomerFilters, type CustomerStatus } from "@quikfly/shared";
import { Badge, Button, Empty, ErrorBox, PageHeader, Pager, Segmented } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { CUSTOMER_STATUS_STYLE, cx, dateTime, inr } from "@/lib/format";
import { RequireAdmin } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

/** Filters live in the address, so a search can be bookmarked or sent to a colleague. */
function useFilters(): [CustomerFilters, (patch: Partial<CustomerFilters>) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const status = params.get("status");
  const f: CustomerFilters = {
    q: params.get("q") || undefined,
    status: status && (CUSTOMER_STATUSES as readonly string[]).includes(status) ? (status as CustomerStatus) : undefined,
    page: Number(params.get("page")) || 1,
  };
  const set = (patch: Partial<CustomerFilters>) => {
    const next = { ...f, page: 1, ...patch };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && !(k === "page" && v === 1)) sp.set(k, String(v));
    router.replace(sp.size ? `${path}?${sp}` : path);
  };
  return [f, set];
}

function CustomerRow({ c }: { c: AdminCustomer }) {
  const st = CUSTOMER_STATUS_STYLE[c.status];
  return (
    <li>
      <Link href={`/customers/view?id=${encodeURIComponent(c.id)}`} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-1 items-center px-4 py-3 hover:bg-fg/[0.03] transition-colors">
        <span className="min-w-0">
          <span className="block font-medium text-strong truncate">{c.name}{c.vendorStatus === "active" && <span className="ml-2 text-[11px] font-normal text-accent">Partner</span>}</span>
          <span className="block text-xs text-muted">{c.phone}{c.email ? ` · ${c.email}` : ""} · joined {dateTime(c.createdAt).split(",")[0]}</span>
        </span>
        <span className="text-sm text-fg tabular-nums sm:text-right"><span className="sm:hidden text-subtle">Wallet </span>{inr(c.walletBalance)}</span>
        <span className="text-sm text-muted tabular-nums sm:text-right">{c.bookings} booking{c.bookings === 1 ? "" : "s"}</span>
        <span className="sm:justify-self-end"><Badge className={st.cls}>{st.label}</Badge></span>
      </Link>
    </li>
  );
}

function CustomersList() {
  const [f, setF] = useFilters();
  const [q, setQ] = useState(f.q ?? "");
  useEffect(() => setQ(f.q ?? ""), [f.q]);
  const key = JSON.stringify(f);
  const { data, error, loading, reload } = useLoad(() => adminApi.customers.search(f), [key]);

  return (
    <>
      <PageHeader title="Customers" sub="Everyone with a QuikFly account. Search by name, phone, email or customer id; open one for the wallet, bookings and account actions." />
      <form className="card p-3 mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto] items-center" onSubmit={(e) => { e.preventDefault(); setF({ q: q.trim() || undefined }); }}>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input className="field pl-9" placeholder="Name, phone, email or customer id" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
        </div>
        <Segmented label="Account state" value={f.status ?? ""} onChange={(v) => setF({ status: (v || undefined) as CustomerStatus | undefined })}
          options={[{ value: "", label: "All" }, ...CUSTOMER_STATUSES.map((s) => ({ value: s, label: CUSTOMER_STATUS_STYLE[s].label }))]} />
        <div className="flex gap-2">
          <Button type="submit" variant="primary" className="flex-1">Search</Button>
          {(f.q || f.status) && <Button type="button" variant="ghost" aria-label="Clear filters" onClick={() => { setQ(""); setF({ q: undefined, status: undefined }); }}><X size={16} /></Button>}
        </div>
      </form>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <div className="card p-5 grid gap-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12" />)}</div>}
      {data && (data.items.length === 0 ? <Empty icon={Users} title="No customers match" sub="Try part of the name or the last digits of the phone number." /> : (
        <div className={cx("card overflow-hidden", loading && "opacity-60")}>
          <ul className="divide-y divide-line">{data.items.map((c) => <CustomerRow key={c.id} c={c} />)}</ul>
          <div className="px-4 pb-1"><Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setF({ page: p })} /></div>
        </div>
      ))}
      {data && data.total > 0 && <p className="text-xs text-subtle mt-2">{data.total.toLocaleString("en-IN")} customer{data.total === 1 ? "" : "s"}{f.status ? ` · ${CUSTOMER_STATUS_STYLE[f.status].label.toLowerCase()}` : ""}. Last active updates at most once a day.</p>}
    </>
  );
}

export default function Page() {
  return (
    <RequireAdmin permission="customers.view">
      <Suspense fallback={null}><CustomersList /></Suspense>
    </RequireAdmin>
  );
}
