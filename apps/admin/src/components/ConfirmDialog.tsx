"use client";
// A small modal for "are you sure?" moments (delete, reset). Escape or the backdrop cancels.
import { useEffect, useRef } from "react";
import { Button } from "./ui";

export function ConfirmDialog({
  open, title, children, confirmLabel, onConfirm, onCancel, busy, danger,
}: {
  open: boolean; title: string; children: React.ReactNode; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void; busy?: boolean; danger?: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center p-0 sm:p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="absolute inset-0 bg-overlay" onClick={() => !busy && onCancel()} />
      <div className="relative card w-full sm:max-w-md p-5 rounded-b-none sm:rounded-b-[var(--card-radius)]">
        <h2 id="confirm-title" className="font-semibold text-strong text-lg">{title}</h2>
        <div className="text-sm text-muted mt-2">{children}</div>
        <div className="flex justify-end gap-2 mt-5">
          <Button ref={cancelRef} onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
