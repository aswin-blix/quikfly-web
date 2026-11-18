"use client";
// "All services" sheet: opened from the mobile bottom bar and the tablet header button.
import { ChevronRight, Handshake, HelpCircle } from "lucide-react";
import { Modal } from "./ui";
import { cx } from "@/lib/format";
import { Link, usePath } from "@/lib/nav";
import { SERVICES } from "@/lib/services";
import { useOpenServices } from "./ServiceGate";

export function ServicesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePath();
  const current = SERVICES.find((s) => path.startsWith(s.href))?.key;
  const openServices = useOpenServices();

  return (
    <Modal open={open} onClose={onClose} title="What would you like to book?">
      <ul className="grid grid-cols-2 gap-3">
        {openServices.map((s) => (
          <li key={s.key}>
            <Link href={s.href} onClick={onClose} aria-current={current === s.key ? "page" : undefined}
              className={cx("group block h-full rounded-2xl border overflow-hidden transition-colors active:scale-[.98]",
                current === s.key ? "border-gold bg-gold/[0.06]" : "border-line hover:border-gold/50")}>
              <div className="relative aspect-[16/9] overflow-hidden">
                <img src={s.image} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              </div>
              <div className="p-3">
                <p className="flex items-center gap-1.5 font-semibold text-sm text-strong"><s.icon size={16} className="text-gold shrink-0" />{s.action}</p>
                <p className="text-xs text-muted mt-1">{s.tagline}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-5 rounded-2xl border border-line divide-y divide-line">
        <SheetLink href="/help" icon={<HelpCircle size={18} />} label="Help centre" onClick={onClose} />
        <SheetLink href="/partner" icon={<Handshake size={18} />} label="Drive or list your fleet with QuikFly" onClick={onClose} />
      </div>
    </Modal>
  );
}

/** A full-width row link used in the mobile sheets. */
export function SheetLink({ href, icon, label, onClick }: { href: string; icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-3 px-4 py-3.5 text-sm hover:bg-fg/5 transition-colors first:rounded-t-2xl last:rounded-b-2xl">
      <span className="text-gold">{icon}</span>
      <span className="flex-1">{label}</span>
      <ChevronRight size={16} className="text-subtle" />
    </Link>
  );
}
