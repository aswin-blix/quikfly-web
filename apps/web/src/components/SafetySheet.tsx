"use client";
// SOS / safety sheet opened from a live ride. Calls are real tel: links; alerts to
// contacts are simulated (no SMS provider yet) and say so.
import { useEffect, useState } from "react";
import { BellRing, PhoneCall, Share2, ShieldAlert, Siren } from "lucide-react";
import type { EmergencyContact } from "@quikfly/shared";
import { SAFETY } from "@/lib/account";
import { api } from "@/lib/api";
import { Link } from "@/lib/nav";
import { useApp } from "./AppProvider";
import { Modal } from "./ui";

export function SafetySheet({ open, onClose, onShare }: { open: boolean; onClose: () => void; onShare: () => void }) {
  const { toast } = useApp();
  const [contacts, setContacts] = useState<EmergencyContact[] | null>(null);

  useEffect(() => {
    if (open) api.contacts.list().then(setContacts, () => setContacts([]));
  }, [open]);

  const alertContacts = () => {
    if (!contacts?.length) return;
    toast(`Alert with your live location sent to ${contacts.map((c) => c.name.split(" ")[0]).join(", ")} (demo: no SMS sent)`);
    onShare();
    onClose();
  };

  const Row = ({ icon, title, sub, tone = "neutral" }: { icon: React.ReactNode; title: string; sub: string; tone?: "danger" | "neutral" }) => (
    <span className="flex items-center gap-3 text-left">
      <span className={tone === "danger" ? "w-11 h-11 rounded-full bg-danger text-on-brand grid place-items-center shrink-0" : "w-11 h-11 rounded-full bg-gold/10 text-gold grid place-items-center shrink-0"}>{icon}</span>
      <span><span className="block font-semibold text-strong">{title}</span><span className="block text-xs text-muted">{sub}</span></span>
    </span>
  );
  const rowCls = "w-full block rounded-2xl border border-line p-3 hover:border-line-strong transition-colors";

  return (
    <Modal open={open} onClose={onClose} title="Safety">
      <div className="space-y-3">
        <a href={`tel:${SAFETY.emergency}`} className={`${rowCls} !border-danger/40 bg-danger/[0.05]`}>
          <Row tone="danger" icon={<Siren size={20} />} title={`Call ${SAFETY.emergency} (emergency)`} sub="Police, ambulance and fire, anywhere in India" />
        </a>
        <a href={`tel:${SAFETY.safetyLine.replace(/\s/g, "")}`} className={rowCls}>
          <Row icon={<PhoneCall size={18} />} title="Call QuikFly safety line" sub={`${SAFETY.safetyLine} · 24×7, stays on the line with you`} />
        </a>
        <button type="button" className={rowCls} onClick={() => { onShare(); onClose(); }}>
          <Row icon={<Share2 size={18} />} title="Share live trip" sub="Send a link to follow this ride on a map" />
        </button>
        {contacts && contacts.length > 0 ? (
          <button type="button" className={rowCls} onClick={alertContacts}>
            <Row icon={<BellRing size={18} />} title="Alert my emergency contacts" sub={`Sends your trip link to ${contacts.length} contact${contacts.length > 1 ? "s" : ""}`} />
          </button>
        ) : contacts && (
          <Link href="/account?tab=safety" onClick={onClose} className={rowCls}>
            <Row icon={<ShieldAlert size={18} />} title="Add emergency contacts" sub="So we can alert them with one tap next time" />
          </Link>
        )}
      </div>
    </Modal>
  );
}
