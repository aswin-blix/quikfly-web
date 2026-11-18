"use client";
// A live partner's vehicles and drivers on the partner page: review added vehicles and new
// drivers, accept renewed documents, block and unblock. Notes and reasons reach the partner.
import { useState } from "react";
import { BadgeCheck, Ban, CheckCircle2, RotateCcw, ShieldCheck, Undo2, XCircle } from "lucide-react";
import {
  AUDIT_SLOT_LABEL, FUEL_LABEL, VENDOR_VEHICLE_LABEL, formatLicence, formatRegNumber,
  type AdminVendorDetail, type VendorDriver, type VendorVehicle,
} from "@quikfly/shared";
import { ConfirmDialog } from "./ConfirmDialog";
import { PrivatePhoto } from "./PrivatePhoto";
import { ReasonDialog } from "./ReasonDialog";
import { Badge, Button, ErrorBox } from "./ui";
import { adminApi } from "@/lib/api";
import { dateTime } from "@/lib/format";

const VEHICLE_STATUS: Record<VendorVehicle["status"], { label: string; cls: string }> = {
  pending: { label: "In application", cls: "bg-fg/5 text-muted" },
  draft: { label: "Being filled", cls: "bg-fg/5 text-muted" },
  submitted: { label: "To review", cls: "bg-info/10 text-info" },
  approved: { label: "Waiting for sticker", cls: "bg-warning/10 text-warning" },
  active: { label: "Live", cls: "bg-success/10 text-success" },
  inactive: { label: "Off duty", cls: "bg-fg/5 text-muted" },
  blocked: { label: "Blocked", cls: "bg-danger/10 text-danger" },
  rejected: { label: "Rejected", cls: "bg-danger/10 text-danger" },
};
const DRIVER_STATUS: Record<VendorDriver["status"], { label: string; cls: string }> = {
  submitted: { label: "To review", cls: "bg-info/10 text-info" },
  active: { label: "Approved", cls: "bg-success/10 text-success" },
  rejected: { label: "Rejected", cls: "bg-danger/10 text-danger" },
  blocked: { label: "Blocked", cls: "bg-danger/10 text-danger" },
};

function Row({ k, v, warn }: { k: string; v: React.ReactNode; warn?: boolean }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className={warn ? "text-danger text-right" : "text-fg text-right"}>{v}</dd></div>;
}
const todayIndia = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

type Pending =
  | { kind: "vehicle"; v: VendorVehicle; action: "changes" | "reject" | "block" | "docs-changes" }
  | { kind: "driver"; d: VendorDriver; action: "reject" | "block" | "docs-changes" };

export function VendorFleet({ detail, onChange }: { detail: AdminVendorDetail; onChange: (d: AdminVendorDetail) => void }) {
  const id = detail.application.id;
  const { vehicles, drivers } = detail.fleet;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState<Pending | null>(null);
  const [approving, setApproving] = useState<VendorDriver | null>(null);
  const [checks, setChecks] = useState({ police: false, training: false });
  const [photos, setPhotos] = useState<Record<string, boolean>>({});
  const today = todayIndia();

  const act = async (key: string, fn: () => Promise<AdminVendorDetail>, done: string) => {
    setBusy(key); setError(""); setNotice("");
    try { onChange(await fn()); setReason(null); setApproving(null); setNotice(done); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't update."); }
    finally { setBusy(null); }
  };
  const driverName = (driverId: string | null) => drivers.find((d) => d.id === driverId)?.name;
  const vehicleReg = (vehicleId: string | null) => { const v = vehicles.find((x) => x.id === vehicleId); return v ? formatRegNumber(v.regNumber) : null; };

  const submitReason = (note: string) => {
    if (!reason) return;
    if (reason.kind === "vehicle") {
      const v = reason.v;
      const call = reason.action === "block" ? () => adminApi.vendors.vehicle(id, v.id, "block", { block: true, note })
        : reason.action === "docs-changes" ? () => adminApi.vendors.vehicle(id, v.id, "docs", { decision: "changes", note })
        : () => adminApi.vendors.vehicle(id, v.id, "review", { decision: reason.action, note });
      act(`v-${v.id}`, call, reason.action === "block" ? `${formatRegNumber(v.regNumber)} blocked.` : "Sent back to the partner.");
    } else {
      const d = reason.d;
      const call = reason.action === "block" ? () => adminApi.vendors.driver(id, d.id, "block", { block: true, note })
        : reason.action === "docs-changes" ? () => adminApi.vendors.driver(id, d.id, "docs", { decision: "changes", note })
        : () => adminApi.vendors.driver(id, d.id, "review", { decision: "reject", note });
      act(`d-${d.id}`, call, reason.action === "block" ? `${d.name} blocked.` : `Sent back to the partner.`);
    }
  };

  return (
    <section className="card p-5 lg:col-span-2" aria-labelledby="fleet">
      <h2 id="fleet" className="font-semibold text-strong mb-1">Fleet</h2>
      <p className="text-sm text-muted mb-4">{vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"} · {drivers.length} driver{drivers.length === 1 ? "" : "s"}</p>
      {notice && <p className="text-sm text-success mb-3" role="status">{notice}</p>}
      {error && !reason && !approving && <div className="mb-3"><ErrorBox message={error} /></div>}

      <h3 className="label mb-2">Vehicles</h3>
      <ul className="grid gap-3 mb-6">
        {vehicles.map((v) => {
          const st = VEHICLE_STATUS[v.status];
          const k = `v-${v.id}`;
          return (
            <li key={v.id} className="rounded-xl border border-line p-4 grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-strong">{formatRegNumber(v.regNumber)}</span>
                <span className="text-sm text-muted">{VENDOR_VEHICLE_LABEL[v.type]} · {FUEL_LABEL[v.fuel]}</span>
                <Badge className={st.cls}>{st.label}</Badge>
                {v.docsPending && <Badge className="bg-warning/10 text-warning">Renewal to check</Badge>}
              </div>
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <Row k="RC valid till" v={v.rc?.validTill ?? "—"} warn={!!v.rc && v.rc.validTill < today} />
                <Row k="Insurance valid till" v={v.insurance ? `${v.insurance.validTill} · ${v.insurance.insurer}` : "—"} warn={!!v.insurance && v.insurance.validTill < today} />
                <Row k="Audit" v={v.audit ? `${v.audit.date}, ${AUDIT_SLOT_LABEL[v.audit.slot]} · ${v.audit.result}` : "—"} />
                <Row k="Driver" v={driverName(v.driverId) ?? "None"} />
              </dl>
              {v.blockedReason && <p className="text-sm text-danger">Blocked: {v.blockedReason}</p>}
              {v.reviewNote && <p className="text-xs text-warning">Note to partner: {v.reviewNote}</p>}
              {photos[v.id] ? (
                <div className="flex flex-wrap gap-3">
                  {v.rc?.hasPhoto && <PrivatePhoto alt={`RC of ${v.regNumber}`} version={v.rc.validTill} load={() => adminApi.vendors.vehicleDocument(id, v.id, "rc")} />}
                  {v.insurance?.hasPhoto && <PrivatePhoto alt={`Insurance of ${v.regNumber}`} version={v.insurance.validTill + v.insurance.policyNumber} load={() => adminApi.vendors.vehicleDocument(id, v.id, "insurance")} />}
                </div>
              ) : (v.rc?.hasPhoto || v.insurance?.hasPhoto) && v.status !== "pending" && (
                <button className="text-sm text-accent hover:underline justify-self-start" onClick={() => setPhotos((p) => ({ ...p, [v.id]: true }))}>Show RC and insurance photos</button>
              )}
              <div className="flex flex-wrap gap-2">
                {v.status === "submitted" && <>
                  <Button size="sm" variant="primary" loading={busy === k} onClick={() => act(k, () => adminApi.vendors.vehicle(id, v.id, "review", { decision: "approve" }), `${formatRegNumber(v.regNumber)} approved. Mark the sticker done once fitted.`)}><CheckCircle2 size={14} /> Audit passed: approve</Button>
                  <Button size="sm" onClick={() => setReason({ kind: "vehicle", v, action: "changes" })}><Undo2 size={14} /> Send back</Button>
                  <Button size="sm" variant="danger" onClick={() => setReason({ kind: "vehicle", v, action: "reject" })}><XCircle size={14} /> Reject</Button>
                </>}
                {v.status === "approved" && <Button size="sm" variant="primary" loading={busy === k} onClick={() => act(k, () => adminApi.vendors.vehicle(id, v.id, "sticker"), `${formatRegNumber(v.regNumber)} is live.`)}><BadgeCheck size={14} /> Sticker done: go live</Button>}
                {v.docsPending && <>
                  <Button size="sm" variant="primary" loading={busy === k} onClick={() => act(k, () => adminApi.vendors.vehicle(id, v.id, "docs", { decision: "approve" }), "Renewal accepted.")}><ShieldCheck size={14} /> Accept renewal</Button>
                  <Button size="sm" onClick={() => setReason({ kind: "vehicle", v, action: "docs-changes" })}><RotateCcw size={14} /> Ask again</Button>
                </>}
                {(v.status === "active" || v.status === "inactive") && <Button size="sm" variant="danger" onClick={() => setReason({ kind: "vehicle", v, action: "block" })}><Ban size={14} /> Block</Button>}
                {v.status === "blocked" && <Button size="sm" loading={busy === k} onClick={() => act(k, () => adminApi.vendors.vehicle(id, v.id, "block", { block: false }), `${formatRegNumber(v.regNumber)} unblocked.`)}>Unblock</Button>}
              </div>
            </li>
          );
        })}
      </ul>

      <h3 className="label mb-2">Drivers</h3>
      {drivers.length === 0 ? <p className="text-sm text-muted">No drivers registered yet.</p> : (
        <ul className="grid gap-3">
          {drivers.map((d) => {
            const st = DRIVER_STATUS[d.status];
            const k = `d-${d.id}`;
            return (
              <li key={d.id} className="rounded-xl border border-line p-4 grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-strong">{d.name}</span>
                  <span className="text-sm text-muted">{d.phone}</span>
                  <Badge className={st.cls}>{st.label}</Badge>
                  {d.self && <Badge className="bg-fg/5 text-muted">Partner drives</Badge>}
                  {d.docsPending && <Badge className="bg-warning/10 text-warning">Renewal to check</Badge>}
                </div>
                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <Row k="Licence" v={<span className="font-mono">{formatLicence(d.dlNumber)}</span>} />
                  <Row k="Valid till" v={d.dlValidTill} warn={d.dlValidTill < today} />
                  <Row k="Police verification" v={d.policeVerifiedAt ? dateTime(d.policeVerifiedAt) : "Not confirmed"} />
                  <Row k="Vehicle" v={vehicleReg(d.vehicleId) ?? "None"} />
                </dl>
                {d.blockedReason && <p className="text-sm text-danger">Blocked: {d.blockedReason}</p>}
                {d.reviewNote && <p className="text-xs text-warning">Note to partner: {d.reviewNote}</p>}
                {d.hasDlPhoto && (photos[d.id]
                  ? <PrivatePhoto alt={`Driving licence of ${d.name}`} version={d.dlNumber + d.dlValidTill} load={() => adminApi.vendors.driverLicence(id, d.id)} />
                  : <button className="text-sm text-accent hover:underline justify-self-start" onClick={() => setPhotos((p) => ({ ...p, [d.id]: true }))}>Show licence photo</button>)}
                <div className="flex flex-wrap gap-2">
                  {d.status === "submitted" && <>
                    <Button size="sm" variant="primary" onClick={() => { setChecks({ police: false, training: false }); setError(""); setApproving(d); }}><CheckCircle2 size={14} /> Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => setReason({ kind: "driver", d, action: "reject" })}><XCircle size={14} /> Reject</Button>
                  </>}
                  {d.docsPending && <>
                    <Button size="sm" variant="primary" loading={busy === k} onClick={() => act(k, () => adminApi.vendors.driver(id, d.id, "docs", { decision: "approve" }), "Renewal accepted.")}><ShieldCheck size={14} /> Accept renewal</Button>
                    <Button size="sm" onClick={() => setReason({ kind: "driver", d, action: "docs-changes" })}><RotateCcw size={14} /> Ask again</Button>
                  </>}
                  {d.status === "active" && <Button size="sm" variant="danger" onClick={() => setReason({ kind: "driver", d, action: "block" })}><Ban size={14} /> Block</Button>}
                  {d.status === "blocked" && <Button size="sm" loading={busy === k} onClick={() => act(k, () => adminApi.vendors.driver(id, d.id, "block", { block: false }), `${d.name} unblocked.`)}>Unblock</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ReasonDialog
        open={!!reason} busy={!!busy} error={error}
        title={!reason ? "" : reason.action === "block" ? "Block?" : reason.action === "reject" ? "Reject?" : reason.action === "docs-changes" ? "Ask for the document again?" : "Send back?"}
        confirmLabel={reason?.action === "block" ? "Block" : reason?.action === "reject" ? "Reject" : "Send to partner"}
        label={reason?.action === "block" ? "Reason (the partner sees this)" : "Note (the partner sees this)"}
        placeholder={reason?.action === "block" ? "e.g. Customer complaint being checked." : "e.g. The insurance photo is cut off. Please upload the full certificate."}
        intro={reason?.kind === "vehicle" ? <>Vehicle <b className="font-mono">{formatRegNumber(reason.v.regNumber)}</b>{reason.action === "block" ? " stops taking trips until you unblock it." : "."}</> : reason ? <>Driver <b>{reason.d.name}</b>{reason.action === "block" ? " is taken off their vehicle and can't drive until you unblock them." : "."}</> : null}
        onCancel={() => { setReason(null); setError(""); }} onConfirm={submitReason}
      />
      <ConfirmDialog open={!!approving} title={`Approve ${approving?.name ?? ""} as a driver?`} confirmLabel="Approve driver" busy={!!approving && busy === `d-${approving.id}`}
        onCancel={() => setApproving(null)}
        onConfirm={() => approving && act(`d-${approving.id}`, () => adminApi.vendors.driver(id, approving.id, "review", { decision: "approve", policeVerified: checks.police, trainingDone: checks.training }), `${approving.name} approved.`)}>
        <div className="grid gap-2 text-sm">
          <p>The 2025 aggregator guidelines need both before a driver takes trips:</p>
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-accent" checked={checks.police} onChange={(e) => setChecks((c) => ({ ...c, police: e.target.checked }))} /> Police verification is done</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-accent" checked={checks.training} onChange={(e) => setChecks((c) => ({ ...c, training: e.target.checked }))} /> Induction training is done</label>
          {error && <p className="text-danger">{error}</p>}
        </div>
      </ConfirmDialog>
    </section>
  );
}
