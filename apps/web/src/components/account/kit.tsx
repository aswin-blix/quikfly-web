"use client";
// Building blocks shared by the account sections.
import { useCallback, useState } from "react";
import { cx } from "@/lib/format";

/** A titled card for one account section. */
export function Section({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("panel p-5 sm:p-6", className)}>
      <h2 className="font-display text-xl text-strong">{title}</h2>
      {sub && <p className="text-sm text-muted mt-1">{sub}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Runs an async action with busy and error state; errors become a message instead of crashing. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }, []);
  return { run, busy, error, setError };
}

export function ErrorText({ children }: { children?: string }) {
  return children ? <p className="text-sm text-danger" role="alert">{children}</p> : null;
}

/** A labelled form field. */
export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="text-xs text-subtle mt-1">{hint}</p>}
    </div>
  );
}

/** A row in a saved-items list, with an optional trailing action. */
export function ItemRow({ icon, title, sub, action }: { icon?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-3">
      {icon && <span className="w-10 h-10 rounded-xl bg-gold/10 text-gold grid place-items-center shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-strong truncate">{title}</p>
        {sub && <p className="text-xs text-muted truncate">{sub}</p>}
      </div>
      {action}
    </li>
  );
}

/** On/off switch with a label, used for preferences. */
export function Toggle({ checked, onChange, label, sub, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string; disabled?: boolean }) {
  return (
    <label className={cx("flex items-start justify-between gap-4 cursor-pointer", disabled && "opacity-50 cursor-not-allowed")}>
      <span>
        <span className="block text-sm font-medium text-strong">{label}</span>
        {sub && <span className="block text-xs text-muted mt-0.5">{sub}</span>}
      </span>
      <input type="checkbox" role="switch" className="sr-only peer" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className="relative shrink-0 w-11 h-6 rounded-full bg-line peer-checked:bg-brand transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-gold
        after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-fg after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-on-brand" />
    </label>
  );
}
