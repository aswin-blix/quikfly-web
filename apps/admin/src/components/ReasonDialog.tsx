"use client";
// Confirmation that needs a written reason (staff cancellations, licence rejections).
// The reason is stored in the audit log, and for licences shown to the customer.
import { useEffect, useState } from "react";
import { ADMIN_RULES } from "@quikfly/shared";
import { ConfirmDialog } from "./ConfirmDialog";

export function ReasonDialog({
  open, title, intro, label, placeholder, confirmLabel, onConfirm, onCancel, busy, error,
}: {
  open: boolean; title: string; intro: React.ReactNode; label: string; placeholder: string; confirmLabel: string;
  onConfirm: (reason: string) => void; onCancel: () => void; busy?: boolean; error?: string;
}) {
  const [reason, setReason] = useState("");
  const [tooShort, setTooShort] = useState(false);
  useEffect(() => { if (open) { setReason(""); setTooShort(false); } }, [open]);

  const submit = () => {
    if (reason.trim().length < ADMIN_RULES.reasonMin) return setTooShort(true);
    onConfirm(reason.trim());
  };

  return (
    <ConfirmDialog open={open} title={title} confirmLabel={confirmLabel} danger busy={busy} onCancel={onCancel} onConfirm={submit}>
      <div className="grid gap-3">
        <div>{intro}</div>
        <div>
          <label htmlFor="reason" className="label block mb-1.5">{label}</label>
          <textarea id="reason" className="field min-h-20 text-sm" maxLength={ADMIN_RULES.reasonMax} placeholder={placeholder}
            value={reason} onChange={(e) => { setReason(e.target.value); setTooShort(false); }} />
          <p className="text-xs text-subtle mt-1">{reason.length}/{ADMIN_RULES.reasonMax}</p>
        </div>
        {(tooShort || error) && <p className="text-sm text-danger" role="alert">{tooShort ? `Write at least ${ADMIN_RULES.reasonMin} characters.` : error}</p>}
      </div>
    </ConfirmDialog>
  );
}
