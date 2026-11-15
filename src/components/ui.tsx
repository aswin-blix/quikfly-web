"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/format";
import { Link } from "@/lib/nav";

export function Modal({
  open, onClose, title, children, wide,
}: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; wide?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!mounted) return null;
  // Portal to <body> so animated (transformed) parents don't trap the fixed overlay.
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className={cx("relative panel w-full max-h-[92vh] overflow-y-auto scrollbar-thin rounded-b-none sm:rounded-b-[1.25rem]", wide ? "sm:max-w-3xl" : "sm:max-w-md")}>
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-line bg-coal/95 backdrop-blur">
              <h3 className="font-semibold text-lg">{title}</h3>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-fg/10" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <span className="inline-block rounded-full border-2 border-current border-r-transparent animate-spin align-[-3px]" style={{ width: size, height: size }} />;
}

export function GoldButton({
  children, loading, className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || loading} className={cx("btn-gold rounded-xl px-5 py-3 inline-flex items-center justify-center gap-2", className)}>
      {loading && <Spinner />}{children}
    </button>
  );
}

export function GhostLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return <Link href={href} className={cx("rounded-xl px-5 py-3 border border-line hover:border-gold/60 inline-flex items-center gap-2 transition-colors", className)}>{children}</Link>;
}

export function Empty({ icon, text, action }: { icon: React.ReactNode; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 text-subtle gap-3">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-gold/60">{icon}</motion.div>
      <p className="text-sm max-w-xs">{text}</p>
      {action}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, sub, center }: { eyebrow: string; title: string; sub?: string; center?: boolean }) {
  return (
    <motion.div className={cx("mb-10", center && "text-center mx-auto")} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
      <p className="label !text-gold mb-2">{eyebrow}</p>
      <h2 className="font-display text-3xl sm:text-4xl tracking-tight">{title}</h2>
      {sub && <p className={cx("text-muted mt-3 max-w-2xl", center && "mx-auto")}>{sub}</p>}
    </motion.div>
  );
}

export function Breadcrumbs({ items }: { items: [string, string?][] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-subtle flex-wrap">
      {items.map(([label, href], i) => (
        <span key={label} className="flex items-center gap-1">
          {href ? <Link href={href} className="hover:text-gold">{label}</Link> : <span className="text-soft">{label}</span>}
          {i < items.length - 1 && <ChevronRight size={12} />}
        </span>
      ))}
    </nav>
  );
}

/** Segmented tabs with a sliding pill (Framer Motion layoutId). */
export function Segmented<T extends string>({ options, value, onChange, id, className }: {
  options: [T, React.ReactNode][]; value: T; onChange: (v: T) => void; id: string; className?: string;
}) {
  return (
    <div className={cx("inline-flex max-w-full overflow-x-auto scrollbar-thin rounded-xl border border-line p-1 bg-ink/60", className)} role="tablist">
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}
          className={cx("relative px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors", value === v ? "text-on-brand font-semibold" : "text-muted hover:text-strong")}>
          {value === v && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-lg btn-gold" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
          <span className="relative flex items-center gap-1.5">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function Accordion({ items, defaultOpen = -1 }: { items: { q: React.ReactNode; a: React.ReactNode }[]; defaultOpen?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className={cx("rounded-2xl border transition-colors", open === i ? "border-gold/40 bg-gold/[0.03]" : "border-line")}>
          <button className="w-full flex items-center justify-between gap-4 text-left px-5 py-4" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
            <span className="font-medium">{it.q}</span>
            <motion.span animate={{ rotate: open === i ? 180 : 0 }}><ChevronDown size={18} className="text-gold" /></motion.span>
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-5 pb-4 text-sm text-muted">{it.a}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

export function Counter({ label, value, min, max = 20, onChange }: { label: string; value: number; min: number; max?: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      {label && <span className="text-sm">{label}</span>}
      <div className="flex items-center gap-3">
        <motion.button whileTap={{ scale: 0.85 }} type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - 1))} className="w-8 h-8 rounded-full border border-line grid place-items-center hover:border-gold">−</motion.button>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={value} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} className="w-6 text-center font-semibold">{value}</motion.span>
        </AnimatePresence>
        <motion.button whileTap={{ scale: 0.85 }} type="button" aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, value + 1))} className="w-8 h-8 rounded-full border border-line grid place-items-center hover:border-gold">+</motion.button>
      </div>
    </div>
  );
}

/** Generic page header for inner pages. */
export function PageHeader({ crumbs, title, sub, icon, children }: { crumbs: [string, string?][]; title: string; sub?: string; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 hero-glow opacity-70 pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-4 pt-8 pb-8">
        <Breadcrumbs items={crumbs} />
        <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="font-display text-3xl sm:text-5xl tracking-tight mt-4 flex items-center gap-3">
          {icon}{title}
        </motion.h1>
        {sub && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="text-muted mt-3 max-w-2xl text-lg">{sub}</motion.p>}
        {children}
      </div>
    </section>
  );
}
