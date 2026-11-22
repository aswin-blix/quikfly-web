"use client";
// Confirms one counter action: a note for most moves, the receiver's code to hand over, a reason
// to refuse. Mount it with a `key` per move, so a code never carries over to the next dialog.
import { useState } from "react";
import { PARCEL_RULES, type StaffMove } from "@quikfly/shared";
import { MOVE_CHECK, MOVE_LABEL } from "@/lib/parcels";
import { ConfirmDialog } from "./ConfirmDialog";

export function ParcelMoveDialog({ move, busy, error, onCancel, onConfirm }: {
  move: StaffMove; busy: boolean; error: string;
  onCancel: () => void; onConfirm: (input: { note?: string; otp?: string }) => void;
}) {
  const [note, setNote] = useState("");
  const [otp, setOtp] = useState("");
  const [problem, setProblem] = useState("");

  const submit = () => {
    if (move.needsOtp) {
      if (otp.length !== PARCEL_RULES.collectOtpDigits) return setProblem(`Enter the ${PARCEL_RULES.collectOtpDigits}-digit code.`);
      setProblem("");
      return onConfirm({ otp });
    }
    const text = note.trim();
    if ((move.refuses || text) && text.length < PARCEL_RULES.noteMin) return setProblem(`Write at least ${PARCEL_RULES.noteMin} characters.`);
    setProblem("");
    onConfirm({ note: text || undefined });
  };

  return (
    <ConfirmDialog open title={`${MOVE_LABEL[move.state]}?`} confirmLabel={MOVE_LABEL[move.state]}
      danger={move.refuses || move.state === "unclaimed"} busy={busy} onCancel={onCancel} onConfirm={submit}>
      <div className="grid gap-3">
        <p>{MOVE_CHECK[move.state]}</p>
        {move.needsOtp ? (
          <div>
            <label htmlFor="parcel-code" className="label block mb-1.5">Collection code</label>
            <input id="parcel-code" className="field sm:w-48 font-mono tracking-widest" inputMode="numeric" autoComplete="off"
              maxLength={PARCEL_RULES.collectOtpDigits} value={otp}
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "")); setProblem(""); }} />
            <p className="text-xs text-subtle mt-1">{PARCEL_RULES.otpMaxTries} wrong codes lock it for {PARCEL_RULES.otpLockMinutes} minutes.</p>
          </div>
        ) : (
          <div>
            <label htmlFor="parcel-note" className="label block mb-1.5">{move.refuses ? "Why it's refused" : "Note (optional)"}</label>
            <textarea id="parcel-note" className="field min-h-20 text-sm" maxLength={PARCEL_RULES.noteMax} value={note}
              onChange={(e) => { setNote(e.target.value); setProblem(""); }} />
            <p className="text-xs text-subtle mt-1">The sender sees this and it stays in the audit log, so leave out names, phone numbers and what&apos;s inside.</p>
          </div>
        )}
        {(problem || error) && <p className="text-sm text-danger" role="alert">{problem || error}</p>}
      </div>
    </ConfirmDialog>
  );
}
