"use client";
// One parcel: its journey and the counter buttons.
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, RefreshCw, XCircle } from "lucide-react";
import { PARCEL_STATE_LABEL, parcelBandLabel, type AdminParcel, type StaffMove } from "@quikfly/shared";
import { ParcelMoveDialog } from "@/components/ParcelMoveDialog";
import { ReasonDialog } from "@/components/ReasonDialog";
import { Badge, Button, ErrorBox, PageHeader } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { STATUS_STYLE, dateTime, inr } from "@/lib/format";
import { MOVE_LABEL, PARCEL_STATE_STYLE, movesFor } from "@/lib/parcels";
import { RequireAdmin, useSession } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><dt className="text-subtle shrink-0">{k}</dt><dd className="text-fg text-right break-words min-w-0">{children}</dd></div>;
}

function Person({ title, who }: { title: string; who: { name: string; phone: string } }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold text-strong mb-2">{title}</h2>
      <p className="text-sm text-fg break-words">{who.name || "Erased"}</p>
      {who.phone && <a href={`tel:${who.phone.replace(/\s/g, "")}`} className="text-sm text-accent hover:underline">{who.phone}</a>}
    </section>
  );
}

function Detail({ id }: { id: string }) {
  const { can } = useSession();
  const { data, setData, error, loading, reload } = useLoad(() => adminApi.parcels.get(id), [id]);
  const [move, setMove] = useState<StaffMove | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const run = async (change: () => Promise<AdminParcel>, done: (p: AdminParcel) => string) => {
    setBusy(true); setActionError(""); setNotice("");
    try {
      const next = await change();
      setData(next); setMove(null); setCancelling(false); setNotice(done(next));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't update the parcel.");
      // Someone else or the simulation may have moved it: show where it is now.
      reload();
    } finally {
      setBusy(false);
    }
  };
  const open = (m: StaffMove) => { setActionError(""); setNotice(""); setMove(m); };
  const close = () => { setMove(null); setCancelling(false); setActionError(""); };

  if (!data) return error ? <ErrorBox message={error} onRetry={reload} /> : <div className="card p-6 grid gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10" />)}</div>;
  const p = data;
  const moves = movesFor(p);
  const refund = can("bookings.manage") ? p.refundIfCancelled : null;
  const active = p.bookingStatus === "confirmed" || p.bookingStatus === "ongoing";

  return (
    <>
      <PageHeader title={`${p.from} → ${p.to}`} sub={<>Bus parcel · <span className="font-mono">{p.lr}</span></>}
        actions={<Button loading={loading} onClick={reload}><RefreshCw size={16} /> Refresh</Button>} />
      {error && <div className="mb-3"><ErrorBox message={error} onRetry={reload} /></div>}
      {notice && <p className="text-sm text-success mb-3" role="status">{notice}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 grid gap-3 content-start">
          <section className="card p-5" aria-labelledby="now">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="now" className="font-semibold text-strong">Counter actions</h2>
              <Badge className={PARCEL_STATE_STYLE[p.state]}>{PARCEL_STATE_LABEL[p.state]}</Badge>
            </div>
            {active && p.simulated && (
              <p className="text-xs text-muted mt-2">Demo: simulated transit is on, so this parcel also moves by itself at its planned times. Handing over always needs staff and the code.</p>
            )}
            {(moves.length > 0 || refund) ? (
              <div className="flex flex-wrap gap-2 mt-4">
                {moves.map((m, i) => (
                  <Button key={`${m.seq}-${m.to}`} variant={m.refuses || m.state === "unclaimed" ? "danger" : i === 0 ? "primary" : "secondary"} onClick={() => open(m)}>
                    {MOVE_LABEL[m.state]}
                  </Button>
                ))}
                {refund && <Button variant="danger" onClick={() => { setActionError(""); setNotice(""); setCancelling(true); }}><XCircle size={16} /> Cancel under the policy</Button>}
              </div>
            ) : (
              <p className="text-sm text-muted mt-3">
                {p.state === "unclaimed" ? "Nobody collected it. Agree the return with the sender by phone: return bookings aren't built yet." : "Nothing left to do."}
              </p>
            )}
            {active && p.state === "ready" && p.holdUntil && Date.parse(p.holdUntil) > Date.now() && (
              <p className="text-xs text-subtle mt-3">It can be marked unclaimed from {dateTime(p.holdUntil)}.</p>
            )}
          </section>

          <section className="card p-5" aria-labelledby="what">
            <h2 id="what" className="font-semibold text-strong mb-3">Parcel</h2>
            <dl className="grid gap-2 text-sm">
              <Row k="Contents">{p.contents || "Erased"}</Row>
              <Row k="Category"><span className="capitalize">{p.category}</span></Row>
              <Row k="Weight">{parcelBandLabel(p.weightBand)}</Row>
              <Row k="Size">{p.size === "backpack" ? "Fits a backpack" : "A box"}</Row>
              <Row k="Declared value">{inr(p.declaredValue)}</Row>
              <Row k="Liability">Up to {inr(p.liability)}, not insured</Row>
              {p.fromCounter && <Row k="Handed in at">{p.fromCounter.name}</Row>}
              {p.departAt && <Row k="Bus leaves">{dateTime(p.departAt)}</Row>}
              {p.toCounter && <Row k="Collected at">{p.toCounter.name}</Row>}
              {p.readyAt && <Row k="Expected there">{dateTime(p.readyAt)}</Row>}
              {p.holdUntil && <Row k="Held until">{dateTime(p.holdUntil)}</Row>}
            </dl>
          </section>

          <section className="card p-5" aria-labelledby="journey">
            <h2 id="journey" className="font-semibold text-strong mb-3">Timeline</h2>
            <ol className="grid gap-3 text-sm">
              {p.events.map((e, i) => (
                <li key={i} className="border-l-2 border-line pl-3">
                  <p className="text-fg font-medium">{PARCEL_STATE_LABEL[e.state]}</p>
                  <p className="text-xs text-subtle">{dateTime(e.at)}{e.by ? ` · ${e.by}` : ""}</p>
                  {e.note && <p className="text-xs text-muted break-words">“{e.note}”</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="grid gap-3 content-start">
          <Person title="Sender" who={p.sender} />
          <Person title="Receiver" who={p.receiver} />
          <section className="card p-5">
            <h2 className="font-semibold text-strong mb-2">Booking</h2>
            <dl className="grid gap-2 text-sm">
              <Row k="Status"><Badge className={STATUS_STYLE[p.bookingStatus].cls}>{STATUS_STYLE[p.bookingStatus].label}</Badge></Row>
              <Row k="Paid">{inr(p.amount)} by {p.payment.toUpperCase()}</Row>
            </dl>
            <Link href={`/bookings/view?id=${encodeURIComponent(p.bookingId)}`} className="block text-xs text-muted hover:text-fg mt-3">Payment, terms and staff notes →</Link>
          </section>
        </div>
      </div>

      {move && (
        <ParcelMoveDialog key={`${move.seq}-${move.to}`} move={move} busy={busy} error={actionError} onCancel={close}
          onConfirm={(input) => run(() => adminApi.parcels.move(p.bookingId, move.seq, { to: move.to, ...input }),
            (next) => (move.refuses ? "Refused. The sender gets a full refund." : `Done: ${PARCEL_STATE_LABEL[next.state].toLowerCase()}.`))} />
      )}
      <ReasonDialog open={cancelling} title="Cancel this parcel?" confirmLabel="Cancel parcel" busy={busy} error={actionError}
        label="Reason (the sender sees it; kept in the audit log)" placeholder="e.g. The sender asked by phone"
        intro={refund ? (
          <>
            Under the policy it was sold with, {inr(refund.amount)} ({refund.percent}%) {p.payment === "wallet" ? "goes back to the sender's wallet" : "is due back, outside QuikFly"}.
            {" "}To turn a parcel away at the counter use Refuse on sight, which refunds it all.
          </>
        ) : "It can't be cancelled any more."}
        onCancel={close}
        onConfirm={(reason) => run(async () => { await adminApi.bookings.cancel(p.bookingId, reason); return adminApi.parcels.get(p.bookingId); }, () => "Cancelled under the policy.")} />
    </>
  );
}

function ViewPage() {
  const id = useSearchParams().get("id");
  return (
    <>
      <Link href="/parcels" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg mb-3"><ChevronLeft size={16} /> Parcels</Link>
      {id ? <Detail key={id} id={id} /> : <ErrorBox message="No parcel selected." />}
    </>
  );
}

export default function Page() {
  return <RequireAdmin permission="parcels.manage"><Suspense><ViewPage /></Suspense></RequireAdmin>;
}
