"use client";
// Signed-in account sheet for the mobile bottom bar.
import { BadgePercent, Handshake, HelpCircle, LogOut, Ticket, Wallet } from "lucide-react";
import { useApp } from "./AppProvider";
import { SheetLink } from "./ServicesSheet";
import { Modal } from "./ui";
import { inr } from "@/lib/format";

export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, setUser, toast } = useApp();
  if (!user) return null;

  const signOut = () => { setUser(null); toast("Signed out"); onClose(); };

  return (
    <Modal open={open} onClose={onClose} title="Your account">
      <div className="flex items-center gap-3">
        <span className="w-12 h-12 rounded-full btn-gold grid place-items-center text-lg shrink-0">{user.name[0]?.toUpperCase()}</span>
        <div className="min-w-0">
          <p className="font-semibold text-strong truncate">{user.name}</p>
          <p className="text-sm text-muted">{user.phone}</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-gold/30 bg-gold/[0.06] p-4 flex items-center gap-3">
        <Wallet className="text-gold" size={22} />
        <div>
          <p className="text-xs text-muted">QuikFly wallet</p>
          <p className="font-display text-xl text-strong">{inr(user.walletBalance)}</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-line divide-y divide-line">
        <SheetLink href="/bookings" icon={<Ticket size={18} />} label="My trips" onClick={onClose} />
        <SheetLink href="/offers" icon={<BadgePercent size={18} />} label="Offers & coupons" onClick={onClose} />
        <SheetLink href="/help" icon={<HelpCircle size={18} />} label="Help centre" onClick={onClose} />
        <SheetLink href="/partner" icon={<Handshake size={18} />} label="Become a partner" onClick={onClose} />
      </div>

      <button type="button" onClick={signOut}
        className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl border border-danger/30 text-danger py-3 text-sm font-semibold hover:bg-danger/10 transition-colors">
        <LogOut size={16} /> Sign out
      </button>
    </Modal>
  );
}
