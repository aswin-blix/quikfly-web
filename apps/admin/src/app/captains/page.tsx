"use client";
// Captains (QuikFly Captain, step 5 of docs/driver-app-plan.md): who is online, on a ride or silent,
// the same "why can't I go online" words the Captain app shows, and a readiness card that says whether
// live rides can work. Read again every 15 s while on screen. Blocking and gender stay on the partner's page.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Car, CircleAlert, CircleCheck, PhoneCall, PowerOff, RefreshCw } from "lucide-react";
import { CAPTAIN_STATUS_LABEL, formatRegNumber, type AdminCaptain, type AdminCaptains, type CaptainLiveStatus } from "@quikfly/shared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge, Button, Empty, ErrorBox, PageHeader, Segmented } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { cx, inr, timeAgo } from "@/lib/format";
import { RequireAdmin, useSession } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

/** How often the list is read again while the page is open. */
const REFRESH_MS = 15_000;

type Filter = "all" | CaptainLiveStatus;
const STATUS_CLS: Record<CaptainLiveStatus, string> = {
  onRide: "bg-accent/10 text-accent", online: "bg-success/10 text-success", silent: "bg-warning/10 text-warning", offline: "bg-raised text-subtle",
};

/** Above the list: can live rides work right now? Red where a real launch would go wrong. */
function Readiness({ r }: { r: AdminCaptains["readiness"] }) {
  const item = (ok: boolean, text: string, hint?: string) => (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <CircleCheck size={16} className="text-success shrink-0 mt-0.5" /> : <CircleAlert size={16} className="text-danger shrink-0 mt-0.5" />}
      <span><span className="text-fg">{text}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </li>
  );
  return (
    <section className="card p-5 mb-4" aria-labelledby="ready">
      <h2 id="ready" className="font-semibold text-strong mb-1">Ready for live rides?</h2>
      <p className="text-xs text-subtle mb-3">
        Live captains is <strong>{r.liveDrivers ? "on" : "off"}</strong>{r.liveDrivers ? ": rides from the website and up-to-date apps go to the captains below." : ": every ride is simulated."}{" "}
        <Link href="/settings" className="text-accent hover:underline">Settings → Captains</Link>
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {item(r.approved > 0, `${r.approved} approved driver${r.approved === 1 ? "" : "s"} on autos and cars`, r.approved ? undefined : "Approve drivers on a partner's page first.")}
        {item(r.signedIn > 0, `${r.signedIn} signed in to QuikFly Captain`, r.signedIn < r.approved ? "Drivers sign in with the number their owner registered." : undefined)}
        {item(r.online + r.onRide > 0, `${r.online} online now, ${r.onRide} on a ride`, r.online + r.onRide ? undefined : "With nobody online, every live ride finds no captain.")}
        {item(!r.demoLocation, r.demoLocation ? "Demo locations are on (test mode)" : "Demo locations are off", r.demoLocation ? "Captains can pretend to be anywhere. Turn off before real riders." : undefined)}
        {item(!r.simulateDrivers, r.simulateDrivers ? "Simulated captain when none is free (demo)" : "No simulated captains", r.simulateDrivers ? "Riders get a pretend captain when nobody takes a ride. Turn off for real operations." : undefined)}
      </ul>
    </section>
  );
}

function Captain({ c, canManage, onOffline }: { c: AdminCaptain; canManage: boolean; onOffline: () => void }) {
  return (
    <li className="card p-4 grid gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-strong">{c.name}{c.gender === "female" && <span className="font-normal text-muted"> · women-only rides</span>}</p>
          <p className="text-xs text-subtle">
            {c.vehicle ? <span className="font-mono">{formatRegNumber(c.vehicle.regNumber)}</span> : "No vehicle"} ·{" "}
            <Link href={`/vendors/view?id=${encodeURIComponent(c.vendor.id)}`} className="text-accent hover:underline">{c.vendor.name}</Link>
          </p>
        </div>
        <Badge className={STATUS_CLS[c.status]}>{CAPTAIN_STATUS_LABEL[c.status]}</Badge>
      </div>
      <div className="grid gap-1 text-sm">
        <p className="text-muted">
          {c.seenAt ? `Last heard from ${timeAgo(c.seenAt)}` : "Never online"}
          {c.position && c.status !== "offline" ? ` · map ${Math.round(c.position.x)}, ${Math.round(c.position.y)}${c.demo ? " (demo location)" : ""}` : ""}
        </p>
        <p className="text-muted">Today: {c.tripsToday} trip{c.tripsToday === 1 ? "" : "s"}, {inr(Math.round(c.earningTodayPaise / 100))} earned for the vehicle</p>
        {c.blocker && <p className="text-warning">Can&apos;t go online: {c.blocker}</p>}
        <p><a href={`tel:${c.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-accent hover:underline"><PhoneCall size={14} /> {c.phone}</a></p>
      </div>
      {canManage && (c.status === "online" || c.status === "silent") && (
        <div className="flex justify-end"><Button onClick={onOffline}><PowerOff size={16} /> Set offline</Button></div>
      )}
    </li>
  );
}

function CaptainsPage() {
  const { can } = useSession();
  const { data, setData, error, loading, reload } = useLoad(() => adminApi.captains.list(), []);
  const [filter, setFilter] = useState<Filter>("all");
  const [confirming, setConfirming] = useState<AdminCaptain | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") reload(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);

  const setOffline = async () => {
    if (!confirming) return;
    setBusy(true); setActionError("");
    try { setData(await adminApi.captains.offline(confirming.driverId)); setConfirming(null); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Couldn't set the captain offline."); }
    finally { setBusy(false); }
  };

  const list = data?.captains.filter((c) => filter === "all" || c.status === filter) ?? [];
  const count = (s: CaptainLiveStatus) => data?.captains.filter((c) => c.status === s).length ?? 0;
  return (
    <>
      <PageHeader title="Captains" sub="Drivers who have signed in to QuikFly Captain, and whether they are taking rides. Checked again every 15 seconds."
        actions={<Button onClick={reload} loading={loading}><RefreshCw size={16} /> Refresh</Button>} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {actionError && <ErrorBox message={actionError} />}
      {!data && !error && <div className="card p-5 grid gap-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div>}
      {data && (
        <>
          <Readiness r={data.readiness} />
          <div className="mb-4 overflow-x-auto">
            <Segmented label="Captain status" value={filter} onChange={setFilter} options={[
              { value: "all" as Filter, label: `All (${data.captains.length})` },
              { value: "online" as Filter, label: `Online (${count("online")})` },
              { value: "onRide" as Filter, label: `On a ride (${count("onRide")})` },
              { value: "silent" as Filter, label: `Not heard from (${count("silent")})` },
              { value: "offline" as Filter, label: `Offline (${count("offline")})` },
            ]} />
          </div>
          {list.length === 0
            ? <Empty icon={Car} title={data.captains.length ? "No captains in this list" : "No captains yet"} sub={data.captains.length ? undefined : "Drivers appear here once they sign in to QuikFly Captain with the number their owner registered."} />
            : <ul className={cx("grid gap-3 lg:grid-cols-2", loading && "opacity-60")}>{list.map((c) => <Captain key={c.driverId} c={c} canManage={can("drivers.manage")} onOffline={() => setConfirming(c)} />)}</ul>}
        </>
      )}
      <ConfirmDialog open={!!confirming} title={`Set ${confirming?.name ?? "this captain"} offline?`} confirmLabel="Set offline" busy={busy}
        onCancel={() => setConfirming(null)} onConfirm={setOffline}>
        <p>They stop getting offers until they go online again in the app. Use it for a phone left open in a parked vehicle. This is recorded in the audit log.</p>
      </ConfirmDialog>
    </>
  );
}

export default function Page() {
  return <RequireAdmin permission="drivers.view"><CaptainsPage /></RequireAdmin>;
}
