"use client";
// One partner application: each section with its details and photo, approve or send back
// with a note; then approve the application, return it for changes, or reject it. During
// onboarding, staff mark the sticker and paint done, which puts the partner live.
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BadgeCheck, CheckCircle2, ChevronLeft, RotateCcw, Undo2, XCircle } from "lucide-react";
import {
  AUDIT_SLOT_LABEL, FUEL_LABEL, VENDOR_SECTION_LABEL, VENDOR_SECTIONS, VENDOR_VEHICLE_LABEL, formatRegNumber, vehicleAgeYears,
  type AdminVendorDetail, type SectionState, type VendorDocument, type VendorSection,
} from "@quikfly/shared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PrivatePhoto } from "@/components/PrivatePhoto";
import { ReasonDialog } from "@/components/ReasonDialog";
import { VendorFleet } from "@/components/VendorFleet";
import { Badge, Button, ErrorBox, PageHeader } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { VENDOR_TAB_LABEL, dateTime, inr } from "@/lib/format";
import { RequireAdmin } from "@/lib/session";
import { useLoad } from "@/lib/useLoad";

const STATE_STYLE: Record<SectionState, { label: string; cls: string }> = {
  pending: { label: "Not filled", cls: "bg-fg/5 text-muted" },
  filled: { label: "To review", cls: "bg-info/10 text-info" },
  changes: { label: "Sent back", cls: "bg-warning/10 text-warning" },
  approved: { label: "Approved", cls: "bg-success/10 text-success" },
};
const DOC_OF: Partial<Record<VendorSection, VendorDocument>> = { photo: "photo", rc: "rc", insurance: "insurance" };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-fg text-right">{v}</dd></div>;
}

/** A document photo, fetched with the staff token. */
function DocPhoto({ id, kind, version }: { id: string; kind: VendorDocument; version: string }) {
  return <PrivatePhoto load={() => adminApi.vendors.document(id, kind)} version={version}
    alt={kind === "photo" ? "Partner's profile photo" : kind === "rc" ? "Registration certificate" : "Insurance certificate"} />;
}

function Detail({ id }: { id: string }) {
  const { data, setData, error, reload } = useLoad(() => adminApi.vendors.get(id), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [sendBack, setSendBack] = useState<VendorSection | null>(null);
  const [dialog, setDialog] = useState<"approve" | "changes" | "reject" | "sticker" | null>(null);

  const act = async (key: string, fn: () => Promise<AdminVendorDetail>, done: string) => {
    setBusy(key); setActionError(""); setNotice("");
    try { setData(await fn()); setDialog(null); setSendBack(null); setNotice(done); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Couldn't update the application."); }
    finally { setBusy(null); }
  };

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <div className="card p-6 grid gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-10" />)}</div>;
  const a = data.application;
  const ve = a.vehicle;
  const reviewing = a.status === "submitted";
  const allApproved = VENDOR_SECTIONS.every((s) => a.sections[s].state === "approved");
  const anySentBack = VENDOR_SECTIONS.some((s) => a.sections[s].state === "changes");
  const version = a.reviewedAt ?? a.submittedAt ?? "";

  const body = (s: VendorSection): React.ReactNode => {
    switch (s) {
      case "vehicle": return ve ? (
        <dl className="grid gap-1.5 text-sm">
          <Row k="City" v={a.city} />
          <Row k="Vehicle" v={VENDOR_VEHICLE_LABEL[ve.type]} />
          <Row k="Fuel" v={FUEL_LABEL[ve.fuel]} />
          <Row k="Registration" v={<span className="font-mono">{formatRegNumber(ve.regNumber)}</span>} />
          <Row k="Purchased" v={`${ve.purchaseDate} (${vehicleAgeYears(ve.purchaseDate)} yr old)`} />
        </dl>
      ) : null;
      case "photo": return a.hasPhoto ? <DocPhoto id={a.id} kind="photo" version={version} /> : null;
      case "bank": return a.bank ? (
        <dl className="grid gap-1.5 text-sm">
          <Row k="Account holder" v={a.bank.holder} />
          <Row k="Account number" v={<span className="font-mono">{data.bankAccount}</span>} />
          <Row k="IFSC" v={<span className="font-mono">{a.bank.ifsc}</span>} />
        </dl>
      ) : null;
      case "rc": return ve?.rc ? (
        <div className="grid gap-3">
          <dl className="grid gap-1.5 text-sm"><Row k="Owner as on RC" v={ve.rc.ownerName} /><Row k="Valid till" v={ve.rc.validTill} /></dl>
          {ve.rc.hasPhoto && <DocPhoto id={a.id} kind="rc" version={version} />}
        </div>
      ) : null;
      case "insurance": return ve?.insurance ? (
        <div className="grid gap-3">
          <dl className="grid gap-1.5 text-sm"><Row k="Insurer" v={ve.insurance.insurer} /><Row k="Policy number" v={<span className="font-mono">{ve.insurance.policyNumber}</span>} /><Row k="Valid till" v={ve.insurance.validTill} /></dl>
          {ve.insurance.hasPhoto && <DocPhoto id={a.id} kind="insurance" version={version} />}
        </div>
      ) : null;
      case "audit": return ve?.audit ? (
        <dl className="grid gap-1.5 text-sm">
          <Row k="Booked for" v={`${ve.audit.date}, ${AUDIT_SLOT_LABEL[ve.audit.slot]}`} />
          <Row k="Result" v={ve.audit.result === "booked" ? "Not audited yet" : ve.audit.result === "passed" ? "Passed" : "Failed"} />
        </dl>
      ) : null;
    }
  };

  return (
    <>
      <Link href="/vendors" className="text-sm text-muted hover:text-fg inline-flex items-center gap-1 mb-3"><ChevronLeft size={16} /> All partners</Link>
      <PageHeader
        title={a.name}
        sub={<>{a.phone}{ve && <> · <span className="font-mono">{formatRegNumber(ve.regNumber)}</span></>}{a.submittedAt && <> · sent {dateTime(a.submittedAt)}</>}</>}
        actions={reviewing && (
          <>
            <Button variant="danger" onClick={() => setDialog("reject")}><XCircle size={16} /> Reject</Button>
            <Button onClick={() => setDialog("changes")} disabled={!anySentBack} title={anySentBack ? undefined : "Send at least one section back first"}><Undo2 size={16} /> Return for changes</Button>
            <Button variant="primary" onClick={() => setDialog("approve")} disabled={!allApproved} title={allApproved ? undefined : "Approve every section first"}><BadgeCheck size={16} /> Approve application</Button>
          </>
        )}
      />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Badge className="bg-accent/10 text-accent">{VENDOR_TAB_LABEL[a.status]}</Badge>
        {a.note && <p className="text-sm text-danger">Reason given: {a.note}</p>}
      </div>
      {notice && <p className="text-sm text-success mb-3" role="status">{notice}</p>}
      {actionError && !dialog && !sendBack && <div className="mb-3"><ErrorBox message={actionError} /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {VENDOR_SECTIONS.map((s) => {
          const st = a.sections[s];
          return (
            <section key={s} className="card p-5 flex flex-col gap-3" aria-labelledby={`sec-${s}`}>
              <div className="flex items-center justify-between gap-3">
                <h2 id={`sec-${s}`} className="font-semibold text-strong">{VENDOR_SECTION_LABEL[s]}</h2>
                <Badge className={STATE_STYLE[st.state].cls}>{STATE_STYLE[st.state].label}</Badge>
              </div>
              {body(s) ?? <p className="text-sm text-muted">Not filled in yet.</p>}
              {st.note && <p className="text-xs text-warning">Note to partner: {st.note}</p>}
              {reviewing && st.state !== "pending" && (
                <div className="flex gap-2 mt-auto pt-1">
                  <Button size="sm" onClick={() => { setActionError(""); setSendBack(s); }} disabled={!!busy}><RotateCcw size={14} /> {s === "audit" ? "Failed / redo" : "Send back"}</Button>
                  {st.state !== "approved" && (
                    <Button size="sm" variant="primary" loading={busy === s} onClick={() => act(s, () => adminApi.vendors.section(a.id, s, "approve"), `${VENDOR_SECTION_LABEL[s]} approved.`)}>
                      <CheckCircle2 size={14} /> {s === "audit" ? "Audit passed" : "Approve"}
                    </Button>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {(a.status === "onboarding" || a.status === "active") && (
          <section className="card p-5 lg:col-span-2" aria-labelledby="onb">
            <h2 id="onb" className="font-semibold text-strong mb-3">Onboarding (step 2)</h2>
            <dl className="grid gap-1.5 text-sm max-w-xl">
              <Row k="Joining fee" v={a.onboarding.fee ? `${inr(a.onboarding.fee)} · ${a.onboarding.paidAt ? `marked paid ${dateTime(a.onboarding.paidAt)} (demo: not collected)` : "not paid yet"}` : "None"} />
              <Row k="Agreement" v={a.onboarding.agreementAt ? `Accepted by ${a.onboarding.agreementName}, ${dateTime(a.onboarding.agreementAt)}` : "Not accepted yet"} />
              <Row k="Sticker & paint" v={a.onboarding.stickerDoneAt ? `Done ${dateTime(a.onboarding.stickerDoneAt)}` : a.onboarding.stickerRequestedAt ? `Requested ${dateTime(a.onboarding.stickerRequestedAt)}` : "Not requested yet"} />
            </dl>
            {a.status === "onboarding" && (
              <Button className="mt-4" variant="primary" onClick={() => setDialog("sticker")} disabled={!a.onboarding.agreementAt} title={a.onboarding.agreementAt ? undefined : "Waiting for the agreement"}>
                <BadgeCheck size={16} /> Sticker & paint done: go live
              </Button>
            )}
          </section>
        )}

        {a.status === "active" && <VendorFleet detail={data} onChange={setData} />}
      </div>

      <ReasonDialog
        open={!!sendBack} title={`Send back: ${sendBack ? VENDOR_SECTION_LABEL[sendBack] : ""}`} confirmLabel="Send back" busy={!!sendBack && busy === sendBack} error={actionError}
        label="What needs changing (the partner sees this)" placeholder={sendBack === "audit" ? "e.g. Brakes need servicing. Book a new audit after the repair." : "e.g. The photo is blurry. Please retake it in daylight."}
        intro={<>When you&apos;ve reviewed every section, use <b>Return for changes</b> so the partner can fix this and send the application again.</>}
        onCancel={() => { setSendBack(null); setActionError(""); }}
        onConfirm={(note) => sendBack && act(sendBack, () => adminApi.vendors.section(a.id, sendBack, "changes", note), `${VENDOR_SECTION_LABEL[sendBack]} sent back.`)}
      />
      <ReasonDialog
        open={dialog === "reject"} title="Reject this application?" confirmLabel="Reject application" busy={busy === "reject"} error={actionError}
        label="Reason (the partner sees this)" placeholder="e.g. The vehicle's permit doesn't allow commercial trips."
        intro={<>{a.name} will see your reason in the Partner app. They can't send this application again.</>}
        onCancel={() => { setDialog(null); setActionError(""); }}
        onConfirm={(note) => act("reject", () => adminApi.vendors.review(a.id, "reject", note), "Application rejected.")}
      />
      <ConfirmDialog open={dialog === "approve"} title="Approve this application?" confirmLabel="Approve" busy={busy === "approve"} onCancel={() => setDialog(null)}
        onConfirm={() => act("approve", () => adminApi.vendors.review(a.id, "approve"), "Approved. The partner can now finish onboarding in the app.")}>
        {a.name} moves to onboarding: joining fee, agreement, then sticker and paint.{actionError && <p className="text-danger text-sm mt-2">{actionError}</p>}
      </ConfirmDialog>
      <ConfirmDialog open={dialog === "changes"} title="Return for changes?" confirmLabel="Return to partner" busy={busy === "changes"} onCancel={() => setDialog(null)}
        onConfirm={() => act("changes", () => adminApi.vendors.review(a.id, "changes"), "Returned. The partner will see what to fix.")}>
        {a.name} gets a notification listing the sections you sent back, fixes them, and sends the application again.{actionError && <p className="text-danger text-sm mt-2">{actionError}</p>}
      </ConfirmDialog>
      <ConfirmDialog open={dialog === "sticker"} title="Sticker and paint done?" confirmLabel="Go live" busy={busy === "sticker"} onCancel={() => setDialog(null)}
        onConfirm={() => act("sticker", () => adminApi.vendors.sticker(a.id), "The partner is live.")}>
        This makes {a.name} and their vehicle live on QuikFly.{actionError && <p className="text-danger text-sm mt-2">{actionError}</p>}
      </ConfirmDialog>
    </>
  );
}

function WithId() {
  const id = useSearchParams().get("id");
  if (!id) return <ErrorBox message="No partner selected." />;
  return <Detail id={id} />;
}

export default function Page() {
  return <RequireAdmin permission="vendors.review"><Suspense><WithId /></Suspense></RequireAdmin>;
}
