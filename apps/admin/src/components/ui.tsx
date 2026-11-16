"use client";
// Small building blocks shared by every admin page. Colours come from tokens only.
import { AlertTriangle, Inbox } from "lucide-react";
import { cx } from "@/lib/format";

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block size-4 rounded-full border-2 border-current border-r-transparent animate-spin", className)} aria-hidden />;
}

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  size?: "sm" | "md";
};

export function Button({ variant = "secondary", loading, size = "md", className, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-field font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm",
        variant === "primary" && "btn-primary",
        variant === "secondary" && "border border-line bg-surface hover:bg-raised text-fg",
        variant === "danger" && "border border-danger/40 text-danger hover:bg-danger/10",
        variant === "ghost" && "text-muted hover:text-fg hover:bg-raised",
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-strong tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-muted mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cx("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap", className)}>{children}</span>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card p-4 flex items-start gap-3 border-danger/40" role="alert">
      <AlertTriangle size={18} className="text-danger mt-0.5 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="text-fg">{message}</p>
        {onRetry && <button onClick={onRetry} className="text-accent font-medium mt-1 hover:underline">Try again</button>}
      </div>
    </div>
  );
}

export function Empty({ title, sub, icon: Icon = Inbox }: { title: string; sub?: string; icon?: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <div className="text-center py-10 px-4">
      <Icon size={28} className="mx-auto text-subtle" />
      <p className="font-medium text-fg mt-3">{title}</p>
      {sub && <p className="text-sm text-muted mt-1">{sub}</p>}
    </div>
  );
}

/** One row of mutually exclusive choices (date presets, tabs). */
export function Segmented<T extends string | number>({
  options, value, onChange, label,
}: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-field border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx("px-3 py-1.5 text-sm rounded-[calc(var(--field-radius)-2px)] transition-colors",
            o.value === value ? "bg-nav-active text-strong font-semibold" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label block mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-subtle mt-1">{hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-brand-dark" : "bg-line-strong/50")}
    >
      <span className={cx("absolute top-0.5 size-5 rounded-full bg-knob shadow transition-transform", checked ? "translate-x-5.5" : "translate-x-0.5")} />
    </button>
  );
}

/** Previous / next pager for Page<T> results. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-4 text-sm">
      <span className="text-muted">Page {page} of {pages} · {total.toLocaleString("en-IN")} total</span>
      <div className="flex gap-2">
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
