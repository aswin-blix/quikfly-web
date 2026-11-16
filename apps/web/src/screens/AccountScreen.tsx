"use client";
// /account: phones see a list of sections (tap one to open it); desktops get a sidebar.
// The open section is in the URL (?tab=), so it can be linked to and survives a reload.
import { ArrowLeft, Briefcase, ChevronRight, Gift, IdCard, MapPin, ShieldCheck, UserRound, Users, Wallet, KeyRound } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { BusinessSection } from "@/components/account/BusinessSection";
import { LicenceBadge, LicenceSection } from "@/components/account/LicenceSection";
import { PlacesSection } from "@/components/account/PlacesSection";
import { ProfileSection } from "@/components/account/ProfileSection";
import { ReferSection } from "@/components/account/ReferSection";
import { SafetySection } from "@/components/account/SafetySection";
import { SecuritySection } from "@/components/account/SecuritySection";
import { TravellersSection } from "@/components/account/TravellersSection";
import { WalletSection } from "@/components/account/WalletSection";
import { Empty, GoldButton } from "@/components/ui";
import { ACCOUNT_SECTIONS, type AccountSectionId } from "@/lib/account";
import { cx, inr } from "@/lib/format";
import { Link, qs, useQuery } from "@/lib/nav";

const ICONS: Record<AccountSectionId, typeof UserRound> = {
  profile: UserRound, wallet: Wallet, refer: Gift, places: MapPin, travellers: Users,
  safety: ShieldCheck, licence: IdCard, business: Briefcase, security: KeyRound,
};

const CONTENT: Record<AccountSectionId, () => React.ReactNode> = {
  profile: () => <ProfileSection />,
  wallet: () => <WalletSection />,
  refer: () => <ReferSection />,
  places: () => <PlacesSection />,
  travellers: () => <TravellersSection />,
  safety: () => <SafetySection />,
  licence: () => <LicenceSection />,
  business: () => <BusinessSection />,
  security: () => <SecuritySection />,
};

const isSection = (t: string | null): t is AccountSectionId => ACCOUNT_SECTIONS.some((s) => s.id === t);

export function AccountScreen() {
  const { user, requireAuth, signOut, toast } = useApp();
  const q = useQuery();
  const raw = q.get("tab");
  const tab = isSection(raw) ? raw : null;
  const active: AccountSectionId = tab ?? "profile";

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="panel">
          <Empty icon={<UserRound size={40} />} text="Sign in to manage your profile, wallet, saved places and safety settings."
            action={<GoldButton onClick={() => requireAuth(() => undefined)}>Login or sign up</GoldButton>} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pt-8 pb-16">
      <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* Section list: the whole page on phones until a section is opened; a sidebar on desktop. */}
        <aside className={cx("space-y-4 lg:sticky lg:top-24", tab && "hidden lg:block")}>
          <div className="panel p-5 flex items-center gap-4">
            <span className="w-14 h-14 rounded-full btn-gold grid place-items-center text-xl shrink-0">{user.name[0]?.toUpperCase()}</span>
            <div className="min-w-0">
              <h1 className="font-display text-xl text-strong truncate">{user.name}</h1>
              <p className="text-sm text-muted">{user.phone}</p>
              <p className="text-sm text-gold mt-0.5 flex items-center gap-1"><Wallet size={14} />{inr(user.walletBalance)}</p>
            </div>
          </div>
          <nav className="panel p-2" aria-label="Account sections">
            {ACCOUNT_SECTIONS.map((s) => {
              const Icon = ICONS[s.id];
              const on = active === s.id;
              return (
                <Link key={s.id} href={`/account${qs({ tab: s.id })}`} aria-current={on ? "page" : undefined}
                  className={cx("flex items-center gap-3 rounded-xl px-3 py-3 transition-colors", on ? "lg:bg-gold/10 lg:text-gold" : "hover:bg-fg/5")}>
                  <Icon size={18} className="text-gold shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-strong">{s.label}</span>
                    <span className="block text-xs text-subtle truncate">{s.id === "licence" ? null : s.hint}</span>
                    {s.id === "licence" && <span className="block mt-1"><LicenceBadge user={user} /></span>}
                  </span>
                  <ChevronRight size={16} className="text-subtle" />
                </Link>
              );
            })}
          </nav>
          <button type="button" onClick={() => { signOut(); toast("Signed out"); }}
            className="w-full panel py-3 text-sm font-semibold text-danger hover:bg-danger/10 transition-colors">Sign out</button>
        </aside>

        <div className={cx("min-w-0", !tab && "hidden lg:block")}>
          <Link href="/account" className="lg:hidden inline-flex items-center gap-1 text-sm text-muted hover:text-strong mb-4"><ArrowLeft size={16} />Account</Link>
          {CONTENT[active]()}
        </div>
      </div>
    </div>
  );
}
