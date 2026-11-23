"use client";
// Alerts: what needs a staff member's eyes, newest first (SOS presses, tickets and callbacks, partner
// reviews and payouts, licences, unclaimed parcels). Each opens its page. Opening this page marks
// them read; unread ones keep their highlight until you leave. Alerts name no customer: the linked
// page has the details.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, Handshake, Headphones, IdCard, PackageX, RefreshCw, Siren, type LucideIcon } from "lucide-react";
import type { StaffAlert, StaffAlertKind } from "@quikfly/shared";
import { AlertSettings } from "@/components/PushCard";
import { Button, Empty, PageHeader, Segmented } from "@/components/ui";
import { useAlerts } from "@/lib/alerts";
import { cx, dateTime, timeAgo } from "@/lib/format";
import { RequireAdmin } from "@/lib/session";

const ICON: Record<StaffAlertKind, LucideIcon> = {
  "sos.raised": Siren,
  "support.ticket": Headphones,
  "support.reply": Headphones,
  "support.callback": Headphones,
  "vendor.applied": Handshake,
  "vendor.fleet": Handshake,
  "vendor.payout": Handshake,
  "licence.submitted": IdCard,
  "parcel.unclaimed": PackageX,
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "sos", label: "SOS" },
  { value: "support", label: "Support" },
  { value: "vendor", label: "Partners" },
  { value: "licence", label: "Licences" },
  { value: "parcel", label: "Parcels" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

function Row({ a }: { a: StaffAlert }) {
  const Icon = ICON[a.kind] ?? Bell;
  const sos = a.kind === "sos.raised";
  return (
    <li>
      <Link href={a.link} className={cx("card p-4 flex items-start gap-3 hover:border-accent/50 transition-colors", !a.readAt && (sos ? "border-danger/50 bg-danger/5" : "border-accent/40"))}>
        <span className={cx("size-10 shrink-0 rounded-field grid place-items-center", sos ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent")}><Icon size={19} /></span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-strong">{a.title}</span>
          <span className="block text-sm text-muted">{a.body}</span>
          <span className="block text-xs text-subtle mt-1" title={dateTime(a.createdAt)}>{timeAgo(a.createdAt)}</span>
        </span>
        {!a.readAt && <span className={cx("size-2 rounded-full mt-2 shrink-0", sos ? "bg-danger" : "bg-accent")} aria-label="Unread" />}
        <ArrowRight size={16} className="text-subtle mt-1 shrink-0" />
      </Link>
    </li>
  );
}

function AlertsPage() {
  const { items, unread, refresh, markRead } = useAlerts();
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);
  // What was unread when the page opened keeps its highlight until you leave (like the customers' inbox).
  const [shown, setShown] = useState<StaffAlert[] | null>(null);
  const marked = useRef(false);

  useEffect(() => {
    if (!items) return;
    setShown((prev) => {
      if (!prev) return items;
      const read = new Map(prev.map((a) => [a.id, a.readAt]));
      return items.map((a) => (read.has(a.id) ? { ...a, readAt: read.get(a.id) ?? null } : a));
    });
    if (!marked.current && unread > 0) { marked.current = true; markRead(); }
  }, [items, unread, markRead]);

  const list = useMemo(() => (shown ?? []).filter((a) => filter === "all" || a.kind.startsWith(`${filter}.`)), [shown, filter]);

  return (
    <>
      <PageHeader title="Alerts" sub="What needs a look: SOS presses, tickets and callbacks, partner reviews and payouts, licences and unclaimed parcels. Each opens its page."
        actions={<Button onClick={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} loading={refreshing}><RefreshCw size={16} /> Refresh</Button>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
        <div className="min-w-0 grid gap-4">
          <div className="overflow-x-auto"><Segmented label="Show" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f }))} /></div>
          {!shown && <div className="card p-5 grid gap-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div>}
          {shown && (list.length === 0
            ? <div className="card"><Empty icon={Bell} title="Nothing waiting" sub="New alerts appear here and on the bell; this page checks every 30 seconds." /></div>
            : <ul className="grid gap-2">{list.map((a) => <Row key={a.id} a={a} />)}</ul>)}
        </div>
        <AlertSettings />
      </div>
    </>
  );
}

export default function Page() {
  return <RequireAdmin permission="alerts.view"><AlertsPage /></RequireAdmin>;
}
