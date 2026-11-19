"use client";
// Mobile bottom tab bar (below the `lg` breakpoint). Desktop keeps the header nav.
// Spacing for other fixed elements comes from --bottom-nav-offset (styles/components.css).
import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BadgePercent, CircleUser, House, LayoutGrid, Ticket, type LucideIcon } from "lucide-react";
import { useApp } from "./AppProvider";
import { AccountSheet } from "./AccountSheet";
import { useT } from "./LanguageProvider";
import { cx } from "@/lib/format";
import { Link, usePath } from "@/lib/nav";
import { SERVICES } from "@/lib/services";

/** Routes where the bar would compete with the page's own primary action. */
const HIDDEN_ON = ["/checkout"];
const BAR_ATTRIBUTE = "data-bottom-nav";

/* ── Visibility: screens can hide the bar while a focused flow is running ── */

const HideCtx = createContext<{ hidden: boolean; change: (delta: 1 | -1) => void }>({ hidden: false, change: () => {} });

export function BottomNavProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState(0);
  const change = useCallback((delta: 1 | -1) => setRequests((n) => Math.max(0, n + delta)), []);
  const value = useMemo(() => ({ hidden: requests > 0, change }), [requests, change]);
  return <HideCtx.Provider value={value}>{children}</HideCtx.Provider>;
}

/** Hide the bottom bar while `when` is true (e.g. during a live ride). */
export function useHideBottomNav(when: boolean) {
  const { change } = useContext(HideCtx);
  useEffect(() => {
    if (!when) return;
    change(1);
    return () => change(-1);
  }, [when, change]);
}

/* ── The bar ── */

type TabKey = "home" | "services" | "offers" | "trips" | "account";
interface Tab { key: TabKey; label: string; icon: LucideIcon; href?: string; onSelect?: () => void; badge?: number; avatar?: string }

export function BottomNav({ servicesOpen, onOpenServices }: { servicesOpen: boolean; onOpenServices: () => void }) {
  const path = usePath();
  const { user, bookings, requireAuth, toast } = useApp();
  const t = useT();
  const { hidden } = useContext(HideCtx);
  const [accountOpen, setAccountOpen] = useState(false);
  const visible = !hidden && !HIDDEN_ON.includes(path);
  const live = bookings.filter((b) => b.status === "confirmed").length;

  useEffect(() => setAccountOpen(false), [path]);

  // Lets CSS reserve space for the bar only while it is on screen.
  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.setAttribute(BAR_ATTRIBUTE, "on");
    else root.removeAttribute(BAR_ATTRIBUTE);
    return () => root.removeAttribute(BAR_ATTRIBUTE);
  }, [visible]);

  const tabs: Tab[] = [
    { key: "home", label: t("navHome"), icon: House, href: "/" },
    { key: "services", label: t("navServices"), icon: LayoutGrid, onSelect: onOpenServices },
    { key: "offers", label: t("navOffers"), icon: BadgePercent, href: "/offers" },
    { key: "trips", label: t("navMyTrips"), icon: Ticket, href: "/bookings", badge: live },
    user
      ? { key: "account", label: t("navAccount"), icon: CircleUser, onSelect: () => setAccountOpen(true), avatar: user.name[0]?.toUpperCase() }
      : { key: "account", label: t("navLogin"), icon: CircleUser, onSelect: () => requireAuth(() => undefined) },
  ];

  const active: TabKey | null =
    servicesOpen ? "services"
    : accountOpen ? "account"
    : path === "/" ? "home"
    : path === "/offers" ? "offers"
    : path === "/bookings" ? "trips"
    : SERVICES.some((s) => path.startsWith(s.href)) ? "services"
    : null;

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.nav key="bottom-nav" aria-label={t("navMain")}
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 0.25, ease: "easeOut" }}
            className="no-print lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
            <ul className="grid grid-cols-5 max-w-xl mx-auto h-[var(--bottom-nav-height)]">
              {tabs.map((tab) => {
                const isActive = active === tab.key;
                const cls = cx(
                  "w-full h-full flex flex-col items-center justify-center gap-1 select-none [-webkit-tap-highlight-color:transparent]",
                  "transition-[color,transform] active:scale-95 focus-visible:outline-none focus-visible:text-gold",
                  isActive ? "text-gold" : "text-muted hover:text-fg",
                );
                const content = <TabContent tab={tab} active={isActive} />;
                return (
                  <li key={tab.key} className="h-full">
                    {tab.href ? (
                      <Link href={tab.href} className={cls} aria-current={isActive ? "page" : undefined}>{content}</Link>
                    ) : (
                      <button type="button" onClick={tab.onSelect} className={cls} aria-haspopup="dialog" aria-expanded={isActive}>{content}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </>
  );
}

function TabContent({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = tab.icon;
  const t = useT();
  return (
    <>
      <span className="relative grid place-items-center w-14 h-8">
        {active && (
          <motion.span layoutId="bottom-nav-pill" className="absolute inset-0 rounded-full bg-gold/15"
            transition={{ type: "spring", stiffness: 420, damping: 34 }} />
        )}
        {tab.avatar
          ? <span className="relative w-6 h-6 rounded-full btn-gold grid place-items-center text-[11px]">{tab.avatar}</span>
          : <Icon size={22} strokeWidth={active ? 2.3 : 1.8} className="relative" />}
        {!!tab.badge && (
          <span className="absolute top-0 right-2.5 min-w-4 h-4 px-1 rounded-full bg-brand text-on-brand text-[10px] font-bold grid place-items-center"
            aria-label={t("navUpcoming", { count: tab.badge })}>{tab.badge}</span>
        )}
      </span>
      <span className={cx("text-[11px] leading-none", active ? "font-semibold" : "font-medium")}>{tab.label}</span>
    </>
  );
}
