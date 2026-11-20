"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, XCircle } from "lucide-react";
import { COUPON_LINE, TOLLS_MAX, type AdminBookingDetail, RIDE_CANCEL_REASONS, termLines, tollSettlement } from "@quikfly/shared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ReasonDialog } from "@/components/ReasonDialog";
import { Badge, Button, ErrorBox, PageHeader } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { SERVICE_LABEL, STATUS_STYLE, dateTime, inr } from "@/lib/format";
import { RequireAdmin, useSession } from "@/lib/session";
import { PartnerAssign } from "@/components/PartnerAssign";
import { RentalReview } from "@/components/RentalReview";
import { useLoad } from "@/lib/useLoad";

const KIND_LABEL: Record<string, string> = { payment: "Paid from wallet", refund: "Refunded to wallet", welcome: "Welcome credit", referral: "Referral", opening: "Opening balance" };

function Detail({ id }: { id: string }) {
  const { can } = useSession();
  const { data, setData, error, reload } = useLoad(() => adminApi.bookings.get(id), [id]);
  const [dialog, setDialog] = useState<"cancel" | "complete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [tolls, setTolls] = useState("");

  const act = async (fn: () => Promise<AdminBookingDetail>, done: string) => {
    setBusy(true); setActionError("");
    try { setData(await fn()); setDialog(null); if (done) setNotice(done); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Couldn't update the booking."); }
    finally { setBusy(false); }
  };

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <div className="card p-6 grid gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10" />)}</div>;
  const { booking: b, wallet, coupon, history, refundIfCancelled: refund } = data;
  const active = b.status === "confirmed" || b.status === "ongoing";
  const manage = active && can("bookings.manage");

  return (
    <>
      <PageHeader
        title={b.title}
        sub={<>{SERVICE_LABEL[b.service]} · <span className="font-mono">{b.id}</span> · booked {dateTime(b.createdAt)}</>}
        actions={manage && (
          <>
            {b.rentalState !== "returned" && <Button onClick={() => setDialog("complete")}><CheckCircle2 size={16} /> Mark completed</Button>}
            <Button variant="danger" onClick={() => setDialog("cancel")}><XCircle size={16} /> Cancel booking</Button>
          </>
        )}
      />
      {notice && <p className="text-sm text-success mb-4" role="status">{notice}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 grid gap-3 content-start">
        <section className="card p-5" aria-labelledby="sum">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 id="sum" className="font-semibold text-strong">Booking</h2>
            <Badge className={STATUS_STYLE[b.status].cls}>{STATUS_STYLE[b.status].label}</Badge>
          </div>
          <dl className="grid gap-2 text-sm">
            <Row k="Route / item" v={b.subtitle} />
            {/* The coupon has its own row by the amount below, so skip the booking's copy of it. */}
            {b.lines.filter(([k]) => k !== COUPON_LINE).map(([k, v], i) => <Row key={`${k}-${i}`} k={k} v={v} />)}
          </dl>
          <div className="border-t border-line mt-4 pt-4 grid gap-1 text-sm">
            {coupon && <Row k="Coupon" v={`${coupon.code} (−${inr(coupon.discount)})`} />}
            {b.cancelReason && <Row k="Rider's reason" v={RIDE_CANCEL_REASONS.find((r) => r.key === b.cancelReason)?.label ?? b.cancelReason} />}
            {b.cancelFee > 0 && <Row k="Cancellation fee" v={`${inr(b.cancelFee)}${b.payment === "wallet" ? " (kept from the wallet refund)" : " (owed; not collected)"}`} />}
            <div className="flex justify-between items-baseline gap-3"><span className="text-muted">Paid</span><span className="text-xl font-semibold text-strong tabular-nums">{inr(b.amount)} <span className="text-xs text-subtle font-normal uppercase">{b.payment}</span></span></div>
          </div>
        </section>
        {b.rentalState && <RentalReview bookingId={b.id} canManage={can("bookings.manage")} onSettled={() => { reload(); setNotice("Deposit settled and booking completed."); }} />}
        </div>

        <div className="grid gap-3 content-start">
          <PartnerAssign detail={data} canManage={can("bookings.manage")} onChange={setData} />
          <section className="card p-5" aria-labelledby="cust">
            <h2 id="cust" className="font-semibold text-strong mb-2">Customer</h2>
            <p className="text-sm text-fg">{b.customer.name}</p>
            <a href={`tel:${b.customer.phone.replace(/\s/g, "")}`} className="text-sm text-accent hover:underline">{b.customer.phone}</a>
            <Link href={`/bookings?q=${encodeURIComponent(b.customer.phone.replace(/\D/g, "").slice(-10))}`} className="block text-xs text-muted hover:text-fg mt-2">All bookings by this customer →</Link>
          </section>
          <section className="card p-5" aria-labelledby="terms">
            <h2 id="terms" className="font-semibold text-strong mb-1">Sold under</h2>
            <p className="text-xs text-subtle mb-3">The terms kept with this booking. Refunds, the deposit settlement and the invoice use these, whatever the settings say now.</p>
            {b.terms ? (
              <dl className="grid gap-2 text-sm">{termLines(b.terms, b.service).map(([k, v]) => <Row key={k} k={k} v={v} />)}</dl>
            ) : <p className="text-sm text-muted">Booked before terms were kept, so today&apos;s settings apply.</p>}
          </section>
          <section className="card p-5" aria-labelledby="wal">
            <h2 id="wal" className="font-semibold text-strong mb-2">Wallet</h2>
            {wallet.length === 0 ? <p className="text-sm text-muted">Not paid from the wallet{b.payment !== "wallet" ? ` (${b.payment.toUpperCase()})` : ""}.</p> : (
              <ul className="grid gap-2 text-sm">
                {wallet.map((w) => (
                  <li key={w.id} className="flex justify-between gap-3">
                    <span><span className="text-fg">{KIND_LABEL[w.kind] ?? w.kind}</span><span className="block text-xs text-subtle">{dateTime(w.createdAt)}</span></span>
                    <span className={w.amount < 0 ? "text-danger tabular-nums" : "text-success tabular-nums"}>{w.amount < 0 ? "−" : "+"}{inr(Math.abs(w.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {history.length > 0 && (
            <section className="card p-5" aria-labelledby="his">
              <h2 id="his" className="font-semibold text-strong mb-2">Staff actions</h2>
              <ul className="grid gap-2 text-sm">
                {history.map((h) => (
                  <li key={h.id}>
                    <span className="text-fg">{h.action === "booking.cancel" ? "Cancelled" : h.action === "booking.complete" ? "Marked completed" : h.action === "rental.settle" ? "Deposit settled" : h.action}</span>
                    <span className="text-subtle"> by {h.admin?.name ?? "script"} · {dateTime(h.createdAt)}</span>
                    {typeof (h.detail as { reason?: string })?.reason === "string" && <span className="block text-xs text-muted">“{(h.detail as { reason: string }).reason}”</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <ReasonDialog
        open={dialog === "cancel"} title="Cancel this booking?" confirmLabel="Cancel booking" busy={busy} error={actionError}
        label="Reason (kept in the audit log)" placeholder="e.g. Driver unavailable; customer asked by phone"
        intro={b.payment === "wallet"
          ? refund && refund.amount > 0
            ? <>{inr(refund.amount)}{refund.percent < 100 ? ` (${refund.percent}% under the cancellation policy)` : ""} goes back to {b.customer.name}&apos;s QuikFly wallet at once.</>
            : <>It&apos;s too close to the start for a refund under the cancellation policy, so nothing goes back to the wallet.</>
          : <>This was paid by {b.payment.toUpperCase()}. No payment gateway is connected yet, so refund it outside QuikFly if money was taken.</>}
        onCancel={() => setDialog(null)}
        onConfirm={(reason) => act(async () => {
          const d = await adminApi.bookings.cancel(b.id, reason);
          const back = d.booking.refundAmount ?? 0;
          setNotice(b.payment === "wallet" ? (back ? `Cancelled. ${inr(back)} refunded to the wallet.` : "Cancelled. No refund under the policy.") : "Cancelled.");
          return d;
        }, "")}
      />
      <ConfirmDialog
        open={dialog === "complete"} title="Mark as completed?" confirmLabel="Mark completed" busy={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (data.tollEstimate !== null) {
            const actual = Number(tolls);
            if (tolls.trim() === "" || !Number.isInteger(actual) || actual < 0 || actual > TOLLS_MAX) return setActionError(`Enter the actual tolls in whole rupees (₹0 to ₹${TOLLS_MAX.toLocaleString("en-IN")}).`);
            const { refund, due } = tollSettlement(data.tollEstimate, actual);
            return act(() => adminApi.bookings.complete(b.id, actual),
              refund ? `Marked completed. ${inr(refund)} of tolls ${b.payment === "wallet" ? "refunded to the wallet" : "is due back to the customer"}.` : due ? `Marked completed. The customer owes ${inr(due)} more in tolls (not collected).` : "Marked completed. Tolls matched the estimate.");
          }
          return act(() => adminApi.bookings.complete(b.id), b.deposit > 0 && b.payment === "wallet" ? `Marked completed. ${inr(b.deposit)} deposit returned to the wallet.` : "Marked completed.");
        }}
      >
        Use this when the trip or stay has happened. Completed bookings can&apos;t be cancelled.
        {data.tollEstimate !== null && (() => {
          const actual = Number(tolls);
          const valid = tolls.trim() !== "" && Number.isInteger(actual) && actual >= 0;
          const s = valid ? tollSettlement(data.tollEstimate, actual) : null;
          return (
            <span className="block mt-3 text-fg">
              <label htmlFor="tolls-actual" className="block text-sm font-medium">Actual tolls (₹)</label>
              <span className="block text-xs text-subtle">{inr(data.tollEstimate)} was quoted as an estimate. Less comes back to the customer{b.payment === "wallet" ? "'s wallet" : " (refund outside QuikFly)"}; more is recorded as owed.</span>
              <input id="tolls-actual" type="number" min={0} max={TOLLS_MAX} step={1} inputMode="numeric" className="field sm:w-48 mt-1.5" value={tolls} placeholder={String(data.tollEstimate)} onChange={(e) => setTolls(e.target.value)} />
              {s && <span className="block text-xs mt-1">{s.refund ? `${inr(s.refund)} back to the customer.` : s.due ? `Customer owes ${inr(s.due)} more.` : "Matches the estimate."}</span>}
            </span>
          );
        })()}
        {b.deposit > 0 && (b.payment === "wallet"
          ? <> Check the car first: the {inr(b.deposit)} deposit goes back to {b.customer.name}&apos;s wallet at once.</>
          : <> Check the car first: the {inr(b.deposit)} deposit was paid by {b.payment.toUpperCase()}, so return it outside QuikFly.</>)}
        {actionError && <p className="text-sm text-danger mt-2" role="alert">{actionError}</p>}
      </ConfirmDialog>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-subtle shrink-0">{k}</dt><dd className="text-fg text-right break-words min-w-0">{v}</dd></div>;
}

function ViewPage() {
  const id = useSearchParams().get("id");
  return (
    <>
      <Link href="/bookings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg mb-3"><ChevronLeft size={16} /> Bookings</Link>
      {id ? <Detail key={id} id={id} /> : <ErrorBox message="No booking selected." />}
    </>
  );
}

export default function Page() {
  return <RequireAdmin permission="bookings.view"><Suspense><ViewPage /></Suspense></RequireAdmin>;
}
