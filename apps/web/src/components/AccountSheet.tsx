"use client";
// Signed-in account sheet for the mobile bottom bar: shortcuts into /account and the rest of the app.
import { BadgePercent, ChevronRight, Gift, Handshake, HelpCircle, LogOut, Settings, ShieldCheck, Ticket, Wallet } from "lucide-react";
import { useApp } from "./AppProvider";
import { SheetLink } from "./ServicesSheet";
import { Modal } from "./ui";
import { inr } from "@/lib/format";
import { Link } from "@/lib/nav";

export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, signOut: endSession, toast } = useApp();
  if (!user) return null;

  const signOut = () => { endSession(); toast("Signed out"); onClose(); };

  return (
    <Modal open={open} onClose={onClose} title="Your account">
      <Link href="/account?tab=profile" onClick={onClose} className="flex items-center gap-3 rounded-2xl -m-2 p-2 hover:bg-fg/5">
        <span className="w-12 h-12 rounded-full btn-gold grid place-items-center text-lg shrink-0">{user.name[0]?.toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-strong truncate">{user.name}</p>
          <p className="text-sm text-muted">{user.phone} · <span className="text-gold">Edit profile</span></p>
        </div>
        <ChevronRight size={18} className="text-subtle" />
      </Link>

      <Link href="/account?tab=wallet" onClick={onClose} className="mt-5 rounded-2xl border border-gold/30 bg-gold/[0.06] p-4 flex items-center gap-3 hover:bg-gold/10">
        <Wallet className="text-gold" size={22} />
        <div className="flex-1">
          <p className="text-xs text-muted">QuikFly wallet</p>
          <p className="font-display text-xl text-strong">{inr(user.walletBalance)}</p>
        </div>
        <span className="text-xs text-gold">History</span>
      </Link>

      <div className="mt-5 rounded-2xl border border-line divide-y divide-line">
        <SheetLink href="/bookings" icon={<Ticket size={18} />} label="My trips" onClick={onClose} />
        <SheetLink href="/account?tab=refer" icon={<Gift size={18} />} label="Refer & earn" onClick={onClose} />
        <SheetLink href="/account?tab=safety" icon={<ShieldCheck size={18} />} label="Safety & emergency contacts" onClick={onClose} />
        <SheetLink href="/account" icon={<Settings size={18} />} label="All account settings" onClick={onClose} />
      </div>

      <div className="mt-3 rounded-2xl border border-line divide-y divide-line">
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
