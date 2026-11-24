"use client";
import { useState } from "react";
import { BadgeCheck, IdCard, ShieldX } from "lucide-react";
import { LICENCE_QUEUE_STATUSES, type LicenceQueueStatus, type LicenceReview } from "@quikfly/shared";
import { ReasonDialog } from "@/components/ReasonDialog";
import { Button, Empty, ErrorBox, PageHeader, Segmented } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { cx, dateTime, timeAgo } from "@/lib/format";
import { RequireAdmin } from "@/lib/session";
import { useAlertReload } from "@/lib/alerts";
import { useLoad } from "@/lib/useLoad";

const TAB_LABEL: Record<LicenceQueueStatus, string> = { pending: "To review", rejected: "Rejected", verified: "Approved" };
/** "TN0920190001234" → "TN09 20190001234", as printed on Indian licences. */
const pretty = (n: string) => `${n.slice(0, 4)} ${n.slice(4)}`;

function Queue() {
  const [tab, setTab] = useState<LicenceQueueStatus>("pending");
  const { data, setData, error, loading, reload } = useLoad(() => adminApi.licences.list(tab), [tab]);
  useAlertReload("/licences", reload);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<LicenceReview | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const done = (l: LicenceReview, message: string) => { setData((list) => list?.filter((x) => x.customer.id !== l.customer.id) ?? null); setNotice(message); };

  const approve = async (l: LicenceReview) => {
    setBusy(l.customer.id); setActionError(""); setNotice("");
    try { await adminApi.licences.approve(l.customer.id); done(l, `Approved ${l.customer.name}'s licence. They can now pick up self-drive cars.`); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Couldn't approve."); }
    finally { setBusy(null); }
  };
  const reject = async (reason: string) => {
    if (!rejecting) return;
    const l = rejecting;
    setBusy(l.customer.id); setActionError("");
    try { await adminApi.licences.reject(l.customer.id, reason); setRejecting(null); done(l, `Rejected ${l.customer.name}'s licence. They'll see your reason and can submit again.`); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Couldn't reject."); }
    finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader title="Licence reviews" sub="Self-drive customers submit their driving licence here. Check the number and expiry against the photo ID they show at pickup." />
      <div className="mb-4"><Segmented label="Show" value={tab} onChange={(t) => { setTab(t); setNotice(""); setActionError(""); }} options={LICENCE_QUEUE_STATUSES.map((s) => ({ value: s, label: TAB_LABEL[s] }))} /></div>
      {notice && <p className="text-sm text-success mb-3" role="status">{notice}</p>}
      {actionError && !rejecting && <div className="mb-3"><ErrorBox message={actionError} /></div>}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && !error && <div className="card p-5 grid gap-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>}
      {data && (
        <div className={cx("card transition-opacity", loading && "opacity-60")}>
          {data.length === 0 ? (
            <Empty icon={tab === "pending" ? BadgeCheck : IdCard} title={tab === "pending" ? "Nothing to review" : `No ${TAB_LABEL[tab].toLowerCase()} licences`} sub={tab === "pending" ? "New submissions appear here, oldest first." : undefined} />
          ) : (
            <ul className="divide-y divide-line">
              {data.map((l) => (
                <li key={l.customer.id} className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-fg">{l.customer.name} <span className="text-subtle font-normal">· {l.customer.phone}</span></p>
                    <p className="font-mono text-base text-strong mt-0.5">{pretty(l.number)}</p>
                    <p className="text-xs text-subtle">Valid till {l.expiry} · submitted {timeAgo(l.submittedAt)}{l.reviewedAt && ` · reviewed ${dateTime(l.reviewedAt)}`}</p>
                    {l.note && <p className="text-xs text-danger mt-1">Reason given: {l.note}</p>}
                  </div>
                  {tab === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <Button variant="danger" onClick={() => setRejecting(l)} disabled={busy === l.customer.id}><ShieldX size={16} /> Reject</Button>
                      <Button variant="primary" loading={busy === l.customer.id && !rejecting} onClick={() => approve(l)}><BadgeCheck size={16} /> Approve</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ReasonDialog
        open={!!rejecting} title="Reject this licence?" confirmLabel="Reject licence" busy={!!rejecting && busy === rejecting.customer.id} error={actionError}
        label="Reason (the customer sees this)" placeholder="e.g. The number doesn't match the licence format. Please check and submit again."
        intro={<>{rejecting?.customer.name} will see your reason in their account and at checkout, and can submit their licence again.</>}
        onCancel={() => { setRejecting(null); setActionError(""); }} onConfirm={reject}
      />
    </>
  );
}

export default function Page() {
  return <RequireAdmin permission="licences.review"><Queue /></RequireAdmin>;
}
