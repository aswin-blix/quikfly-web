"use client";
// One customer: profile, wallet history, recent bookings and the staff actions on the account.
// Actions need customers.manage and a written reason; each one lands in the audit log.
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, LogOut, ShieldBan, ShieldCheck, Undo2, Wallet } from "lucide-react";
import { ADMIN_RULES, type AdminCustomerDetail } from "@quikfly/shared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ReasonDialog } from "@/components/ReasonDialog";
import { Badge, Button, ErrorBox, PageHeader, Segmented } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { CUSTOMER_STATUS_STYLE, SERVICE_LABEL, STATUS_STYLE, dateTime, inr, timeAgo } from "@/lib/format";
import { RequireAdmin, useSession } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

const KIND_LABEL: Record<string, string> = { payment: "Payment", refund: "Refund", welcome: "Welcome credit", referral: "Referral", opening: "Opening balance", adjustment: "Adjusted by staff" };
const ACTION_LABEL: Record<string, string> = {
  "customer.wallet_credit": "Wallet credited", "customer.wallet_debit": "Wallet debited", "customer.suspend": "Suspended", "customer.unsuspend": "Suspension lifted",
  "customer.sign_out_all": "Signed out everywhere", "customer.cancel_deletion": "Deletion cancelled", "licence.approve": "Licence approved", "licence.reject": "Licence rejected",
};
const LICENCE_LABEL: Record<string, string> = { none: "Not submitted", pending: "Under review", verified: "Verified", rejected: "Rejected" };

type Dialog = "wallet" | "suspend" | "unsuspend" | "signout" | "undelete" | null;

/** Credit or debit the wallet with a reason the customer sees on their wallet history. */
function WalletDialog({ open, balance, busy, error, onConfirm, onCancel }: { open: boolean; balance: number; busy: boolean; error: string; onConfirm: (amount: number, reason: string) => void; onCancel: () => void }) {
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState("");
  const n = Number(amount);
  const submit = () => {
    if (!Number.isInteger(n) || n <= 0 || n > ADMIN_RULES.walletAdjustMax) return setProblem(`Enter a whole number of rupees from 1 to ${ADMIN_RULES.walletAdjustMax.toLocaleString("en-IN")}.`);
    if (direction === "debit" && n > balance) return setProblem(`The wallet holds ${inr(balance)}; it can't go below zero.`);
    if (reason.trim().length < ADMIN_RULES.reasonMin) return setProblem(`Write at least ${ADMIN_RULES.reasonMin} characters of reason: the customer sees it.`);
    setProblem("");
    onConfirm(direction === "credit" ? n : -n, reason.trim());
  };
  return (
    <ConfirmDialog open={open} title="Adjust wallet" confirmLabel={direction === "credit" ? "Credit wallet" : "Debit wallet"} danger={direction === "debit"} busy={busy} onCancel={onCancel} onConfirm={submit}>
      <div className="grid gap-3">
        <Segmented label="Direction" value={direction} onChange={setDirection} options={[{ value: "credit", label: "Credit (add money)" }, { value: "debit", label: "Debit (take money)" }]} />
        <div>
          <label htmlFor="adj-amount" className="label block mb-1.5">Amount (₹)</label>
          <input id="adj-amount" className="field" type="number" inputMode="numeric" min={1} max={ADMIN_RULES.walletAdjustMax} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <p className="text-xs text-subtle mt-1">Balance now {inr(balance)} → {inr(balance + (direction === "credit" ? n || 0 : -(n || 0)))}. At most {inr(ADMIN_RULES.walletAdjustMax)} per adjustment.</p>
        </div>
        <div>
          <label htmlFor="adj-reason" className="label block mb-1.5">Reason (shown to the customer on their wallet history)</label>
          <textarea id="adj-reason" className="field min-h-20 text-sm" maxLength={ADMIN_RULES.reasonMax} placeholder="e.g. Goodwill credit for the delayed bus on 18 Nov" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {(problem || error) && <p className="text-sm text-danger" role="alert">{problem || error}</p>}
      </div>
    </ConfirmDialog>
  );
}

function Detail({ id }: { id: string }) {
  const { can } = useSession();
  const { data, setData, error, reload } = useLoad(() => adminApi.customers.get(id), [id]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const act = async (fn: () => Promise<AdminCustomerDetail>, done: string) => {
    setBusy(true); setActionError("");
    try { setData(await fn()); setDialog(null); setNotice(done); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Couldn't update the account."); }
    finally { setBusy(false); }
  };

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <div className="card p-6 grid gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10" />)}</div>;
  const { customer: c, wallet, bookings, history, sessions } = data;
  const st = CUSTOMER_STATUS_STYLE[c.status];
  const manage = can("customers.manage") && c.status !== "erased";

  return (
    <>
      <PageHeader
        title={c.name}
        sub={<><a href={`tel:${c.phone.replace(/\s/g, "")}`} className="text-accent hover:underline">{c.phone}</a> · <span className="font-mono">{c.id}</span> · joined {dateTime(c.createdAt)}</>}
        actions={manage && (
          <>
            <Button onClick={() => setDialog("wallet")}><Wallet size={16} /> Adjust wallet</Button>
            {sessions > 0 && <Button onClick={() => setDialog("signout")}><LogOut size={16} /> Sign out everywhere</Button>}
            {c.status === "deleting" && <Button onClick={() => setDialog("undelete")}><Undo2 size={16} /> Cancel deletion</Button>}
            {c.status === "suspended"
              ? <Button variant="primary" onClick={() => setDialog("unsuspend")}><ShieldCheck size={16} /> Lift suspension</Button>
              : <Button variant="danger" onClick={() => setDialog("suspend")}><ShieldBan size={16} /> Suspend</Button>}
          </>
        )}
      />
      {notice && <p className="text-sm text-success mb-4" role="status">{notice}</p>}
      {actionError && !dialog && <ErrorBox message={actionError} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 grid gap-3 content-start">
          <section className="card p-5" aria-labelledby="acct">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 id="acct" className="font-semibold text-strong">Account</h2>
              <Badge className={st.cls}>{st.label}</Badge>
            </div>
            {c.status === "suspended" && <p className="text-sm text-danger mb-3">Suspended {c.suspendedAt ? timeAgo(c.suspendedAt) : ""}: “{c.suspendReason}”. They can&apos;t sign in until this is lifted.</p>}
            {c.status === "deleting" && <p className="text-sm text-warning mb-3">The customer asked to delete the account on {c.deletedAt ? dateTime(c.deletedAt) : "—"}. It is erased 30 days later unless they sign in again or you cancel it.</p>}
            {c.status === "erased" && <p className="text-sm text-muted mb-3">Personal details were erased; bookings and wallet history stay for accounts.</p>}
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <Row k="Email" v={c.email ?? "—"} />
              <Row k="Last active" v={c.lastActiveAt ? timeAgo(c.lastActiveAt) : "—"} />
              <Row k="Driving licence" v={LICENCE_LABEL[c.licenceStatus] ?? c.licenceStatus} />
              <Row k="Partner" v={c.vendorStatus ? `Application ${c.vendorStatus}` : "No"} />
              <Row k="Signed-in devices" v={`${sessions}`} />
              <Row k="Bookings" v={`${c.bookings}`} />
            </dl>
          </section>

          <section className="card p-5" aria-labelledby="bk">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 id="bk" className="font-semibold text-strong">Recent bookings</h2>
              {c.bookings > 0 && <Link href={`/bookings?q=${encodeURIComponent(c.phone.replace(/\D/g, "").slice(-10))}`} className="text-xs text-muted hover:text-fg">All {c.bookings} →</Link>}
            </div>
            {bookings.length === 0 ? <p className="text-sm text-muted">No bookings yet.</p> : (
              <ul className="divide-y divide-line -mx-5">
                {bookings.map((b) => (
                  <li key={b.id}>
                    <Link href={`/bookings/view?id=${encodeURIComponent(b.id)}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-fg/[0.03]">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-strong truncate">{b.title}</span>
                        <span className="block text-xs text-muted">{SERVICE_LABEL[b.service]} · {dateTime(b.createdAt)}</span>
                      </span>
                      <span className="text-sm tabular-nums text-fg">{inr(b.amount)}</span>
                      <Badge className={STATUS_STYLE[b.status].cls}>{STATUS_STYLE[b.status].label}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="grid gap-3 content-start">
          <section className="card p-5" aria-labelledby="wal">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h2 id="wal" className="font-semibold text-strong">Wallet</h2>
              <span className="text-xl font-semibold text-strong tabular-nums">{inr(c.walletBalance)}</span>
            </div>
            {wallet.length === 0 ? <p className="text-sm text-muted">No wallet activity.</p> : (
              <ul className="grid gap-2 text-sm max-h-96 overflow-auto pr-1">
                {wallet.map((w) => (
                  <li key={w.id} className="flex justify-between gap-3">
                    <span className="min-w-0">
                      <span className="text-fg">{KIND_LABEL[w.kind] ?? w.kind}</span>
                      <span className="block text-xs text-subtle truncate" title={w.note}>{w.note || ""}{w.bookingId ? ` · ${w.bookingId}` : ""} · {dateTime(w.createdAt)}</span>
                    </span>
                    <span className={w.amount < 0 ? "text-danger tabular-nums shrink-0" : "text-success tabular-nums shrink-0"}>{w.amount < 0 ? "−" : "+"}{inr(Math.abs(w.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card p-5" aria-labelledby="his">
            <h2 id="his" className="font-semibold text-strong mb-2">Staff actions</h2>
            {history.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
              <ul className="grid gap-2 text-sm">
                {history.map((h) => {
                  const d = h.detail as { reason?: string; amount?: number };
                  return (
                    <li key={h.id}>
                      <span className="text-fg">{ACTION_LABEL[h.action] ?? h.action}{typeof d?.amount === "number" ? ` ${inr(Math.abs(d.amount))}` : ""}</span>
                      <span className="text-subtle"> by {h.admin?.name ?? "script"} · {dateTime(h.createdAt)}</span>
                      {typeof d?.reason === "string" && <span className="block text-xs text-muted">“{d.reason}”</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <WalletDialog open={dialog === "wallet"} balance={c.walletBalance} busy={busy} error={actionError} onCancel={() => setDialog(null)}
        onConfirm={(amount, reason) => act(() => adminApi.customers.wallet(id, amount, reason), amount > 0 ? `Credited ${inr(amount)} to ${c.name}'s wallet.` : `Debited ${inr(-amount)} from ${c.name}'s wallet.`)} />
      <ReasonDialog open={dialog === "suspend"} title="Suspend this account?" confirmLabel="Suspend" busy={busy} error={actionError} onCancel={() => setDialog(null)}
        intro={<p>{c.name} is signed out of every device now and can&apos;t sign in until a staff member lifts the suspension. Bookings already made stay as they are.</p>}
        label="Why (audit log only; the customer is told to contact support)" placeholder="e.g. Repeated no-shows on confirmed rides; verifying identity"
        onConfirm={(reason) => act(() => adminApi.customers.suspend(id, reason), `${c.name}'s account is suspended.`)} />
      <ReasonDialog open={dialog === "unsuspend"} title="Lift the suspension?" confirmLabel="Lift suspension" busy={busy} error={actionError} onCancel={() => setDialog(null)}
        intro={<p>{c.name} can sign in again straight away.</p>} label="Why (audit log)" placeholder="e.g. Identity confirmed over the phone"
        onConfirm={(reason) => act(() => adminApi.customers.unsuspend(id, reason), `Suspension lifted for ${c.name}.`)} />
      <ReasonDialog open={dialog === "signout"} title="Sign out everywhere?" confirmLabel="Sign out all devices" busy={busy} error={actionError} onCancel={() => setDialog(null)}
        intro={<p>Ends {sessions} sign-in session{sessions === 1 ? "" : "s"}. The customer signs in again with an OTP on the devices they still have.</p>}
        label="Why (audit log)" placeholder="e.g. Customer reported a lost phone"
        onConfirm={(reason) => act(() => adminApi.customers.signOut(id, reason), `${c.name} was signed out everywhere.`)} />
      <ReasonDialog open={dialog === "undelete"} title="Cancel the scheduled deletion?" confirmLabel="Keep the account" busy={busy} error={actionError} onCancel={() => setDialog(null)}
        intro={<p>The account stays and is no longer erased after the 30-day grace. Do this only when the customer asked to keep it.</p>}
        label="Why (audit log)" placeholder="e.g. Customer called on 21 Nov and asked to keep the account"
        onConfirm={(reason) => act(() => adminApi.customers.cancelDeletion(id, reason), `Deletion cancelled; ${c.name}'s account stays.`)} />
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right text-fg">{v}</dd></div>;
}

function ViewPage() {
  const id = useSearchParams().get("id") ?? "";
  return (
    <>
      <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg mb-3"><ChevronLeft size={16} /> Customers</Link>
      {id ? <Detail id={id} /> : <ErrorBox message="No customer selected." />}
    </>
  );
}

export default function Page() {
  return (
    <RequireAdmin permission="customers.view">
      <Suspense fallback={null}><ViewPage /></Suspense>
    </RequireAdmin>
  );
}
