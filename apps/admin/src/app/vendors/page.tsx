"use client";
// Partner applications from the QuikFly Partner app, by status. Waiting for review is
// oldest first; open one to review it section by section.
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Handshake } from "lucide-react";
import { VENDOR_VEHICLE_LABEL, formatRegNumber, inrPaise, type AdminPayout, type FleetReviewItem, type VendorStatus } from "@quikfly/shared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ReasonDialog } from "@/components/ReasonDialog";
import { Button, Empty, ErrorBox, PageHeader, Segmented } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { VENDOR_TAB_LABEL, cx, timeAgo } from "@/lib/format";
import { RequireAdmin } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

type Tab = VendorStatus | "fleet" | "payouts";
const TABS: Tab[] = ["submitted", "fleet", "payouts", "onboarding", "active", "draft", "rejected"];
const TAB_EXTRA: Partial<Record<Tab, string>> = { fleet: "Fleet to review", payouts: "Payouts" };

/** Payout requests: pay outside the app, then record the bank reference here (or reject with a reason). */
function Payouts() {
  const { data, setData, error, reload } = useLoad(() => adminApi.vendors.payouts("requested"), []);
  const [paying, setPaying] = useState<AdminPayout | null>(null);
  const [rejecting, setRejecting] = useState<AdminPayout | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const decide = async (p: AdminPayout, decision: "paid" | "rejected", body: { reference?: string; note?: string }) => {
    setBusy(true); setActionError("");
    try { setData(await adminApi.vendors.decidePayout(p.id, decision, body)); setPaying(null); setRejecting(null); setNotice(decision === "paid" ? `Recorded ${inrPaise(p.amountPaise)} paid to ${p.vendorName}.` : "Request rejected."); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Couldn't update."); }
    finally { setBusy(false); }
  };
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <div className="card p-5 grid gap-3">{[0, 1].map((i) => <div key={i} className="skeleton h-14" />)}</div>;
  return (
    <>
      <p className="text-sm text-muted mb-3">No payment gateway yet: transfer the amount from the company account, then record the bank reference (UTR). The partner is notified.</p>
      {notice && <p className="text-sm text-success mb-3" role="status">{notice}</p>}
      <div className="card">
        {data.length === 0 ? <Empty icon={Handshake} title="No payout requests" sub="Partners request payouts from the app once they're owed at least the minimum." /> : (
          <ul className="divide-y divide-line">
            {data.map((p) => (
              <li key={p.id} className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg"><Link href={`/vendors/view?id=${encodeURIComponent(p.vendorId)}`} className="hover:underline">{p.vendorName}</Link> · <span className="text-strong">{inrPaise(p.amountPaise)}</span></p>
                  <p className="text-xs text-subtle">{p.bank ? <span className="font-mono">{p.bank.holder} · {p.bank.account} · {p.bank.ifsc}</span> : "No bank account"} · requested {timeAgo(p.requestedAt)}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="danger" onClick={() => { setActionError(""); setRejecting(p); }}>Reject</Button>
                  <Button variant="primary" onClick={() => { setActionError(""); setReference(""); setPaying(p); }}>Record payment</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog open={!!paying} title={`Record ${paying ? inrPaise(paying.amountPaise) : ""} paid?`} confirmLabel="Record payment" busy={busy}
        onCancel={() => setPaying(null)} onConfirm={() => paying && decide(paying, "paid", { reference: reference.trim() })}>
        <div className="grid gap-2 text-sm">
          <p>Only after the transfer to {paying?.vendorName} has gone through.</p>
          <label className="label" htmlFor="utr">Bank reference (UTR)</label>
          <input id="utr" className="field font-mono" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 432112345678" />
          {actionError && <p className="text-danger">{actionError}</p>}
        </div>
      </ConfirmDialog>
      <ReasonDialog open={!!rejecting} title="Reject this payout request?" confirmLabel="Reject" busy={busy} error={actionError}
        label="Reason (the partner sees this)" placeholder="e.g. The bank account details don't match. Please check them."
        intro={<>{rejecting?.vendorName} can request again after fixing it.</>}
        onCancel={() => setRejecting(null)} onConfirm={(note) => rejecting && decide(rejecting, "rejected", { note })} />
    </>
  );
}
const FLEET_KIND: Record<FleetReviewItem["kind"], string> = {
  vehicle: "New vehicle to review", vehicle_sticker: "Vehicle waiting for sticker & paint", vehicle_docs: "Renewed vehicle document",
  driver: "New driver to review", driver_docs: "Renewed driving licence",
};

/** Live partners' vehicles and drivers waiting for staff. */
function FleetQueue() {
  const { data, error, reload } = useLoad(() => adminApi.vendors.fleetQueue(), []);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <div className="card p-5 grid gap-3">{[0, 1].map((i) => <div key={i} className="skeleton h-14" />)}</div>;
  return (
    <div className="card">
      {data.length === 0 ? <Empty icon={Handshake} title="Nothing waiting" sub="Vehicles and drivers that live partners add appear here, oldest first." /> : (
        <ul className="divide-y divide-line">
          {data.map((x) => (
            <li key={`${x.kind}-${x.id}`}>
              <Link href={`/vendors/view?id=${encodeURIComponent(x.vendorId)}`} className="px-4 sm:px-5 py-4 flex items-center gap-3 hover:bg-fg/[0.03]">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg">{FLEET_KIND[x.kind]}: <span className={x.kind.startsWith("vehicle") ? "font-mono" : ""}>{x.label}</span></p>
                  <p className="text-xs text-subtle">{x.vendorName} · {timeAgo(x.since)}</p>
                </div>
                <ChevronRight size={18} className="text-subtle shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Queue() {
  const [tab, setTab] = useState<Tab>("submitted");
  const status: VendorStatus = tab === "fleet" || tab === "payouts" ? "submitted" : tab;
  const { data, error, loading, reload } = useLoad(() => adminApi.vendors.list(status), [status]);

  return (
    <>
      <PageHeader title="Partners" sub="Vehicle owners who apply in the QuikFly Partner app. Review each section, then approve, send back for changes, or reject." />
      <div className="mb-4"><Segmented label="Show" value={tab} onChange={setTab} options={TABS.map((s) => ({ value: s, label: TAB_EXTRA[s] ?? VENDOR_TAB_LABEL[s as VendorStatus] }))} /></div>
      {tab === "fleet" ? <FleetQueue /> : tab === "payouts" ? <Payouts /> : <>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <div className="card p-5 grid gap-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>}
      {data && (
        <div className={cx("card transition-opacity", loading && "opacity-60")}>
          {data.length === 0 ? (
            <Empty icon={Handshake} title={tab === "submitted" ? "Nothing to review" : `No partners ${VENDOR_TAB_LABEL[status].toLowerCase()}`}
              sub={tab === "submitted" ? "Applications appear here, oldest first, once a partner sends them." : undefined} />
          ) : (
            <ul className="divide-y divide-line">
              {data.map((v) => (
                <li key={v.id}>
                  <Link href={`/vendors/view?id=${encodeURIComponent(v.id)}`} className="px-4 sm:px-5 py-4 flex items-center gap-3 hover:bg-fg/[0.03]">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-fg">{v.name} <span className="text-subtle font-normal">· {v.phone}</span></p>
                      <p className="text-sm text-strong mt-0.5">
                        {v.vehicle ? <><span className="font-mono">{formatRegNumber(v.vehicle.regNumber)}</span> · {VENDOR_VEHICLE_LABEL[v.vehicle.type]}</> : "No vehicle yet"}
                        {v.city && <span className="text-muted"> · {v.city}</span>}
                      </p>
                      <p className="text-xs text-subtle">
                        {v.submittedAt ? `Sent ${timeAgo(v.submittedAt)}` : `Updated ${timeAgo(v.updatedAt)}`}
                        {tab === "submitted" && ` · ${v.open} of 6 sections to review`}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-subtle shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      </>}
    </>
  );
}

export default function Page() {
  return <RequireAdmin permission="vendors.review"><Queue /></RequireAdmin>;
}
