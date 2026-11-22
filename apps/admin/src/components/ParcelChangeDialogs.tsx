"use client";
// What staff correct before a parcel leaves (its bus, its weight), and sending an unclaimed one back.
// The API works out and re-checks every amount; these only show it.
import { useEffect, useState } from "react";
import { PARCEL_LR, PARCEL_RULES, PARCEL_WEIGHT_BANDS, parcelBandLabel, parcelTime, type AdminParcel, type ParcelWeightBand, type WeightChange } from "@quikfly/shared";
import { adminApi } from "@/lib/api";
import { inr } from "@/lib/format";
import { useLoad } from "@/lib/useLoad";
import { ConfirmDialog } from "./ConfirmDialog";

interface Props<T> {
  parcel: AdminParcel;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (value: T) => void;
}

const Problem = ({ text }: { text: string }) => (text ? <p className="text-sm text-danger" role="alert">{text}</p> : null);

export function BusDialog({ parcel, busy, error, onCancel, onConfirm }: Props<{ busId: string; departAt: string; note: string }>) {
  const buses = useLoad(() => adminApi.parcels.buses(parcel.bookingId), [parcel.bookingId]);
  const [pick, setPick] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const chosen = buses.data?.find((d) => `${d.busId}@${d.departAt}` === pick);

  const submit = () => {
    if (!chosen) return setProblem("Pick the bus it moves to.");
    if (note.trim().length < PARCEL_RULES.noteMin) return setProblem(`Write at least ${PARCEL_RULES.noteMin} characters.`);
    setProblem("");
    onConfirm({ busId: chosen.busId, departAt: chosen.departAt, note: note.trim() });
  };

  return (
    <ConfirmDialog open title="Change the bus?" confirmLabel="Change the bus" busy={busy} onCancel={onCancel} onConfirm={submit}>
      <div className="grid gap-3">
        <p>The LR number and the price stay. A refund still counts to whichever departure is later.</p>
        <div>
          <label htmlFor="parcel-bus" className="label block mb-1.5">New departure</label>
          <select id="parcel-bus" className="field" value={pick} onChange={(e) => { setPick(e.target.value); setProblem(""); }}>
            <option value="">{buses.loading ? "Loading buses…" : buses.data?.length ? "Pick a departure" : "No other bus is taking parcels"}</option>
            {buses.data?.map((d) => <option key={`${d.busId}@${d.departAt}`} value={`${d.busId}@${d.departAt}`}>{parcelTime(d.departAt)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="parcel-bus-note" className="label block mb-1.5">Why (the sender sees it)</label>
          <textarea id="parcel-bus-note" className="field min-h-20 text-sm" maxLength={PARCEL_RULES.noteMax} value={note}
            onChange={(e) => { setNote(e.target.value); setProblem(""); }} />
        </div>
        <Problem text={problem || error || buses.error || ""} />
      </div>
    </ConfirmDialog>
  );
}

export function WeightDialog({ parcel, busy, error, onCancel, onConfirm }: Props<WeightChange & { senderAgreed: boolean }>) {
  const [band, setBand] = useState<ParcelWeightBand | "">("");
  const [change, setChange] = useState<WeightChange | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    setChange(null); setAgreed(false); setProblem("");
    if (!band) return;
    let live = true;
    adminApi.parcels.weight(parcel.bookingId, band).then((c) => live && setChange(c), (e: Error) => live && setProblem(e.message));
    return () => { live = false; };
  }, [band, parcel.bookingId]);

  const wallet = parcel.payment === "wallet";
  const submit = () => {
    if (!change) return setProblem(band ? "Wait for the difference." : "Pick the weight it really is.");
    if (change.charge && !wallet) return setProblem("This parcel wasn't paid from the wallet. Refuse it instead, with a full refund.");
    if (change.charge && !agreed) return setProblem("Confirm that the sender agreed to pay the difference.");
    setProblem("");
    onConfirm({ ...change, senderAgreed: agreed });
  };

  return (
    <ConfirmDialog open title="Correct the weight?" confirmLabel="Save the weight" busy={busy} onCancel={onCancel} onConfirm={submit}>
      <div className="grid gap-3">
        <p>Booked {parcelBandLabel(parcel.weightBand)}.</p>
        <div>
          <label htmlFor="parcel-band" className="label block mb-1.5">It weighs</label>
          <select id="parcel-band" className="field" value={band} onChange={(e) => setBand(e.target.value as ParcelWeightBand | "")}>
            <option value="">Pick a weight</option>
            {PARCEL_WEIGHT_BANDS.filter((b) => b !== parcel.weightBand).map((b) => <option key={b} value={b}>{parcelBandLabel(b)}</option>)}
          </select>
        </div>
        {change && (
          <p className="text-fg" role="status">
            {change.charge
              ? wallet ? `${inr(change.charge)} more, from the sender's wallet.` : `${inr(change.charge)} more can't be charged: it wasn't paid from the wallet. Refuse it instead.`
              : change.refund ? `${inr(change.refund)} ${wallet ? "goes back to the sender's wallet" : "is due back, outside QuikFly"}.` : "The price stays the same."}
          </p>
        )}
        {!!change?.charge && wallet && (
          <label className="flex items-start gap-2 text-fg">
            <input id="parcel-agreed" type="checkbox" className="mt-1" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setProblem(""); }} />
            <span>The sender agreed to pay {inr(change.charge)} more. This is kept in the audit log.</span>
          </label>
        )}
        <Problem text={problem || error} />
      </div>
    </ConfirmDialog>
  );
}

export function ReturnDialog({ parcel, busy, error, onCancel, onConfirm }: Props<string>) {
  const [lr, setLr] = useState("");
  const [problem, setProblem] = useState("");
  const submit = () => {
    if (!PARCEL_LR.pattern.test(lr.trim())) return setProblem("Enter the LR number of the return parcel.");
    setProblem("");
    onConfirm(lr.trim());
  };

  return (
    <ConfirmDialog open title="Send it back?" confirmLabel="Send back" busy={busy} onCancel={onCancel} onConfirm={submit}>
      <div className="grid gap-3">
        <p>
          The sender first books and pays for a bus parcel from {parcel.to} to {parcel.from}. This parcel then closes as returned and travels under that LR. It can&apos;t be undone.
        </p>
        <div>
          <label htmlFor="parcel-return-lr" className="label block mb-1.5">The return parcel&apos;s LR number</label>
          <input id="parcel-return-lr" className="field font-mono uppercase" maxLength={30} autoComplete="off" value={lr}
            onChange={(e) => { setLr(e.target.value.toUpperCase()); setProblem(""); }} />
        </div>
        <Problem text={problem || error} />
      </div>
    </ConfirmDialog>
  );
}
