"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, IdCard, KeyRound, Package, PackageCheck, PackageX, Siren, Truck, UserMinus } from "lucide-react";
import type { AdminStats } from "@quikfly/shared";
import { BarList, ColumnChart } from "@/components/charts";
import { PushCard } from "@/components/PushCard";
import { Badge, Empty, ErrorBox, PageHeader, Segmented } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { SERVICE_LABEL, STATUS_STYLE, compact, cx, dayLabel, inr, inrCompact, pct, timeAgo, weekday } from "@/lib/format";
import { LIVE_ROUTES } from "@/lib/nav";
import { RequireAdmin, useSession } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

/** Date presets, one row above everything they scope. */
const RANGES = [
  { value: 1, label: "Today" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-semibold text-strong mt-1 tabular-nums">{value}</p>
      {note && <p className="text-xs text-subtle mt-1">{note}</p>}
    </div>
  );
}

function StatSkeleton() {
  return <div className="card p-4"><div className="skeleton h-4 w-24" /><div className="skeleton h-7 w-28 mt-2" /></div>;
}

function Queue({ icon: Icon, label, count, href, note }: { icon: typeof IdCard; label: string; count: number; href?: string; note?: string }) {
  const body = (
    <>
      <span className={cx("size-9 grid place-items-center rounded-full", count ? "bg-warning/10 text-warning" : "bg-raised text-subtle")}><Icon size={18} /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        <span className="block text-xs text-subtle">{note ?? (count ? "Waiting for action" : "Nothing waiting")}</span>
      </span>
      <span className="text-xl font-semibold text-strong tabular-nums">{count}</span>
      {href && <ArrowRight size={16} className="text-subtle" />}
    </>
  );
  return href
    ? <Link href={href} className="card p-4 flex items-center gap-3 hover:border-line-strong transition-colors">{body}</Link>
    : <div className="card p-4 flex items-center gap-3">{body}</div>;
}

/** Today in India, as the parcels queue's date filter takes it. */
const indiaToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

function Dashboard({ s }: { s: AdminStats }) {
  const [metric, setMetric] = useState<"revenue" | "bookings">("revenue");
  const { can } = useSession();
  const t = s.totals;
  const rangeWord = s.days === 1 ? "today" : `in the last ${s.days} days`;
  const series = s.byDay.map((d) => ({ key: d.date, label: dayLabel(d.date), sub: weekday(d.date), value: d[metric] }));
  const money = metric === "revenue";

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Revenue" value={inrCompact(t.revenue)} note={`Bookings not cancelled, ${rangeWord}`} />
        <Stat label="Bookings" value={compact(t.bookings)} note={rangeWord} />
        <Stat label="Cancelled" value={compact(t.cancelled)} note={`${pct(t.cancelled, t.bookings)}% of bookings`} />
        <Stat label="New customers" value={compact(t.newCustomers)} note={`${compact(t.customers)} customers in total`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
        <section className="card p-5 lg:col-span-2" aria-labelledby="trend-title">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 id="trend-title" className="font-semibold text-strong">{money ? "Revenue by day" : "Bookings by day"}</h2>
            <Segmented label="Chart measure" value={metric} onChange={setMetric}
              options={[{ value: "revenue", label: "Revenue" }, { value: "bookings", label: "Bookings" }]} />
          </div>
          {s.days === 1
            ? <p className="text-sm text-muted py-10 text-center">Pick 7 days or more to see a daily trend.</p>
            : <ColumnChart data={series} label={money ? "Revenue by day" : "Bookings by day"} format={money ? inr : (n) => n.toLocaleString("en-IN")} axisFormat={money ? inrCompact : compact} />}
        </section>

        <section className="card p-5" aria-labelledby="svc-title">
          <h2 id="svc-title" className="font-semibold text-strong mb-4">Revenue by service</h2>
          {s.byService.length
            ? <BarList label="Revenue by service" format={inrCompact}
                data={s.byService.map((x) => ({ key: x.service, label: SERVICE_LABEL[x.service], sub: `${x.bookings} booking${x.bookings === 1 ? "" : "s"}`, value: x.revenue }))} />
            : <Empty title="No bookings yet" sub={`Nothing booked ${rangeWord}.`} />}
        </section>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
        <Queue icon={Siren} label="SOS alerts open" count={s.queues.openSos ?? 0}
          href={can("sos.manage") ? "/sos" : undefined} />
        <Queue icon={IdCard} label="Licences to review" count={s.queues.pendingLicences}
          href={LIVE_ROUTES.has("/licences") && can("licences.review") ? "/licences" : undefined} />
        <Queue icon={UserMinus} label="Accounts waiting to be deleted" count={s.queues.pendingDeletions} />
        <Queue icon={KeyRound} label="Returned cars to settle" count={s.queues.returnsToSettle}
          href={can("bookings.manage") ? "/bookings?rental=returned" : undefined} />
        <div className="card p-4">
          <p className="text-sm text-muted">Held in customer wallets</p>
          <p className="text-xl font-semibold text-strong mt-1 tabular-nums">{inr(t.walletBalance)}</p>
          <p className="text-xs text-subtle mt-1">Money QuikFly owes customers right now</p>
        </div>
      </div>

      {can("parcels.manage") && s.queues.parcelsToday !== undefined && (
        <section className="mt-3" aria-label="Parcels">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <Queue icon={Package} label="Parcels today" note="By bus date, or booking date for Quick" count={s.queues.parcelsToday}
              href={`/parcels?state=all&date=${indiaToday()}`} />
            <Queue icon={Truck} label="Parcels on the bus" note="On the way" count={s.queues.parcelsOnBus ?? 0} href="/parcels?state=on_bus" />
            <Queue icon={PackageCheck} label="Ready for collection" note="At the counter" count={s.queues.parcelsReady ?? 0} href="/parcels?state=ready" />
            <Queue icon={PackageX} label="Unclaimed parcels" count={s.queues.parcelsUnclaimed ?? 0} href="/parcels?state=unclaimed" />
          </div>
        </section>
      )}

      <section className="card mt-3" aria-labelledby="recent-title">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 id="recent-title" className="font-semibold text-strong">Latest bookings</h2>
          {LIVE_ROUTES.has("/bookings") && can("bookings.view") && <Link href="/bookings" className="text-sm text-accent font-medium hover:underline">All bookings</Link>}
        </div>
        {s.recent.length === 0 ? <Empty title="No bookings yet" /> : (
          <ul className="divide-y divide-line">
            {s.recent.map((b) => (
              <li key={b.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-sm text-fg truncate">{b.title}</p>
                  <p className="text-xs text-subtle truncate">{SERVICE_LABEL[b.service]} · {b.customer.name} · {b.customer.phone}</p>
                </div>
                <Badge className={STATUS_STYLE[b.status].cls}>{STATUS_STYLE[b.status].label}</Badge>
                <span className="text-sm font-medium text-strong tabular-nums w-24 text-right">{inr(b.amount)}</span>
                <span className="text-xs text-subtle w-28 text-right">{timeAgo(b.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function DashboardPage() {
  const [days, setDays] = useState(7);
  const { data, error, loading, reload } = useLoad(() => adminApi.stats(days), [days]);

  return (
    <>
      <PageHeader title="Dashboard" sub="How QuikFly is doing. Days are counted in India time." />
      <PushCard />
      <div className="mb-4"><Segmented label="Date range" options={RANGES} value={days} onChange={setDays} /></div>
      {error && <div className="mb-4"><ErrorBox message={error} onRetry={reload} /></div>}
      {data ? (
        <div className={cx("transition-opacity", loading && "opacity-60")} aria-busy={loading}><Dashboard s={data} /></div>
      ) : !error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-busy="true"><StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton /></div>
      )}
    </>
  );
}

/** The panel opens here; a counter login's home is the parcels queue. */
function Landing() {
  const { can } = useSession();
  const router = useRouter();
  const toQueue = !can("dashboard.view") && can("parcels.manage");
  useEffect(() => {
    if (toQueue) router.replace("/parcels");
  }, [toQueue, router]);
  return toQueue ? null : <RequireAdmin permission="dashboard.view"><DashboardPage /></RequireAdmin>;
}

export default function Page() {
  return <RequireAdmin><Landing /></RequireAdmin>;
}
