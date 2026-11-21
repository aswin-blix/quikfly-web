"use client";
// SOS alerts: every press of the safety sheet's SOS, newest first. Staff acknowledge one (so
// colleagues see it's being handled), call the customer, and close it with what was done.
// Nothing is dispatched automatically yet; the apps say so on screen.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, MapPin, PhoneCall, RefreshCw, Siren } from "lucide-react";
import { SOS_STATUSES, type SosAlert, type SosStatus } from "@quikfly/shared";
import { ReasonDialog } from "@/components/ReasonDialog";
import { Badge, Button, Empty, ErrorBox, PageHeader, Segmented } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { cx, dateTime, timeAgo } from "@/lib/format";
import { RequireAdmin } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

const TAB_LABEL: Record<SosStatus, string> = { open: "Open", acknowledged: "Being handled", closed: "Closed" };
const STATUS_CLS: Record<SosStatus, string> = { open: "bg-danger/10 text-danger", acknowledged: "bg-warning/10 text-warning", closed: "bg-raised text-subtle" };
/** Open alerts are re-read this often while the tab is on screen. */
const REFRESH_MS = 30_000;

function Alert({ a, onAcknowledge, onClose, busy }: { a: SosAlert; onAcknowledge: () => void; onClose: () => void; busy: boolean }) {
  return (
    <li className={cx("card p-4 grid gap-3", a.status === "open" && "border-danger/40")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-strong">{a.customer.name} <span className="font-normal text-muted">· {timeAgo(a.createdAt)}</span></p>
          <p className="text-xs text-subtle">{dateTime(a.createdAt)} · <span className="font-mono">{a.id}</span></p>
        </div>
        <Badge className={STATUS_CLS[a.status]}>{TAB_LABEL[a.status]}</Badge>
      </div>
      <div className="grid gap-1 text-sm">
        <p><a href={`tel:${a.customer.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-accent hover:underline"><PhoneCall size={14} /> {a.customer.phone}</a></p>
        {a.ride && <p className="text-fg">Ride {a.ride.status}: {a.ride.pickup} → {a.ride.drop}{a.ride.driverName ? ` · ${a.ride.driverName}, ${a.ride.vehicle} ${a.ride.plate}` : ""}</p>}
        {a.bookingId && !a.ride && <p className="text-fg">Booking <Link href={`/bookings/view?id=${encodeURIComponent(a.bookingId)}`} className="text-accent hover:underline">{a.bookingId}</Link></p>}
        {a.lat !== null && a.lng !== null
          ? <p><a href={`https://www.google.com/maps?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-accent hover:underline"><MapPin size={14} /> Location shared ({a.lat.toFixed(4)}, {a.lng.toFixed(4)})</a></p>
          : <p className="text-muted">No location shared.</p>}
        {a.note && <p className="text-fg">“{a.note}”</p>}
        {a.handledBy && <p className="text-xs text-subtle">{a.status === "closed" ? "Closed" : "Picked up"} by {a.handledBy.name}{a.handledAt ? ` · ${dateTime(a.handledAt)}` : ""}{a.handledNote ? ` · “${a.handledNote}”` : ""}</p>}
      </div>
      {a.status !== "closed" && (
        <div className="flex flex-wrap gap-2 justify-end">
          {a.status === "open" && <Button variant="primary" loading={busy} disabled={busy} onClick={onAcknowledge}><Check size={16} /> I&apos;m on it</Button>}
          <Button disabled={busy} onClick={onClose}>Close with a note</Button>
        </div>
      )}
    </li>
  );
}

function Queue() {
  const [tab, setTab] = useState<SosStatus>("open");
  const { data, setData, error, loading, reload } = useLoad(() => adminApi.sos.list(tab), [tab]);
  const [busy, setBusy] = useState<string | null>(null);
  const [closing, setClosing] = useState<SosAlert | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (tab !== "open") return;
    const t = setInterval(reload, REFRESH_MS);
    return () => clearInterval(t);
  }, [tab, reload]);

  const replace = (next: SosAlert) => setData((list) => list?.map((x) => (x.id === next.id ? next : x)).filter((x) => x.status === tab) ?? null);

  const acknowledge = async (a: SosAlert) => {
    setBusy(a.id); setActionError("");
    try { replace(await adminApi.sos.acknowledge(a.id)); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Couldn't update the alert."); }
    finally { setBusy(null); }
  };
  const close = async (reason: string) => {
    if (!closing) return;
    setBusy(closing.id); setActionError("");
    try { replace(await adminApi.sos.close(closing.id, reason)); setClosing(null); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Couldn't close the alert."); }
    finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader title="SOS alerts" sub="Presses of the SOS button in the apps. Call the customer first; then say what was done and close it. Nothing is dispatched automatically yet."
        actions={<Button onClick={reload} loading={loading}><RefreshCw size={16} /> Refresh</Button>} />
      <div className="mb-4"><Segmented label="Alert status" value={tab} onChange={setTab} options={SOS_STATUSES.map((s) => ({ value: s, label: TAB_LABEL[s] }))} /></div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {actionError && <ErrorBox message={actionError} />}
      {!data && !error && <div className="card p-5 grid gap-3">{[0, 1].map((i) => <div key={i} className="skeleton h-24" />)}</div>}
      {data && (data.length === 0
        ? <Empty icon={Siren} title={tab === "open" ? "No open alerts" : `No ${TAB_LABEL[tab].toLowerCase()} alerts`} sub={tab === "open" ? "This page checks again every 30 seconds." : undefined} />
        : <ul className={cx("grid gap-3", loading && "opacity-60")}>{data.map((a) => <Alert key={a.id} a={a} busy={busy === a.id} onAcknowledge={() => acknowledge(a)} onClose={() => setClosing(a)} />)}</ul>)}
      <ReasonDialog open={!!closing} title="Close this SOS alert" confirmLabel="Close alert" busy={!!busy} error={actionError} onCancel={() => setClosing(null)}
        intro={<p>What was done for {closing?.customer.name}? This stays on the alert and in the audit log.</p>}
        label="What happened" placeholder="e.g. Called the customer at 9:42 PM; false alarm, trip continued"
        onConfirm={close} />
    </>
  );
}

export default function Page() {
  return <RequireAdmin permission="sos.manage"><Queue /></RequireAdmin>;
}
