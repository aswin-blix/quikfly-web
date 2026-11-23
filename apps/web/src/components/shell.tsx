"use client";
// Site chrome: header, footer, login modal, toasts, page transition.
import { AnimatePresence, motion, MotionConfig, useMotionValueEvent, useScroll } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { Bell, ChevronDown, CircleCheck, Download, HelpCircle, LayoutGrid, Ticket, TriangleAlert, User as UserIcon, Wallet } from "lucide-react";
import { AppProvider, useApp } from "./AppProvider";
import { LoginModal } from "./LoginModal";
import { PrivacyConsent } from "./PrivacyConsent";
import { LanguageMenu } from "./LanguageMenu";
import { LanguageProvider, useT } from "./LanguageProvider";
import { BottomNav, BottomNavProvider } from "./BottomNav";
import { ServicesSheet } from "./ServicesSheet";
import { ThemeProvider } from "./ThemeProvider";
import { ThemeToggle } from "./ThemeToggle";
import { GoldButton, Modal } from "./ui";
import { api, DEMO_MODE, DEMO_OTP } from "@/lib/api";
import { cx, inr } from "@/lib/format";
import { Link, usePath } from "@/lib/nav";
import { SERVICES } from "@/lib/services";
import { PausedGate, useOpenServices } from "./ServiceGate";
import { ANDROID_APP, AUTHOR } from "@/lib/site";
import { useTitleBadge } from "@/lib/title-badge";

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePath();
  const [servicesOpen, setServicesOpen] = useState(false);
  const openServices = useCallback(() => setServicesOpen(true), []);
  useEffect(() => setServicesOpen(false), [path]);

  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
      <AppProvider>
      <LanguageProvider>
      <BottomNavProvider>
        <Header onOpenServices={openServices} />
        <main className="min-h-[70vh]"><PausedGate path={path}>{children}</PausedGate></main>
        <Footer />
        <BottomNav servicesOpen={servicesOpen} onOpenServices={openServices} />
        <ServicesSheet open={servicesOpen} onClose={() => setServicesOpen(false)} />
        <LoginModal />
        <PrivacyConsent />
        <Toasts />
      </BottomNavProvider>
      </LanguageProvider>
      </AppProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}

/** Enter animation for every page (Framer Motion). */
export function PageTransition({ children, k }: { children: React.ReactNode; k?: string }) {
  return (
    <motion.div key={k} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

/** More services than this don't fit in the header beside labelled Help, My Trips and account links. */
const CROWDED_SERVICES = 6;

function Header({ onOpenServices }: { onOpenServices: () => void }) {
  const path = usePath();
  const { user, requireAuth, signOut, bookings, toast, unread } = useApp();
  const t = useT();
  useTitleBadge(user ? unread : 0);
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  const live = bookings.filter((b) => b.status === "confirmed").length;

  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 12);
    setHidden(y > 240 && y > prev);
  });

  const activeKey = SERVICES.find((s) => path.startsWith(s.href))?.key;
  const open = useOpenServices();
  // The header never gets wider than 1280 px. Past six services the side links become icons to make room.
  const crowded = open.length > CROWDED_SERVICES;

  return (
    <motion.header
      animate={{ y: hidden ? "-100%" : "0%" }} transition={{ duration: 0.3, ease: "easeOut" }}
      className={cx("no-print sticky top-0 z-40 transition-colors duration-300", scrolled ? "bg-ink/85 backdrop-blur-xl border-b border-fg/5" : "bg-transparent")}>
      {DEMO_OTP && (
        <div className="text-center text-[11px] tracking-wide py-1 bg-gold/10 text-gold-pale border-b border-gold/10">
          {t(DEMO_MODE ? "bannerDemo" : "bannerPreview")} · {t("bannerOtp")} <b>{DEMO_OTP}</b>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3">
        <Link href="/" className="shrink-0" aria-label={t("navLogoHome")}>
          <img src="/assets/logo.svg" alt="QuikFly" width={2059} height={495} className="h-10 sm:h-11 w-auto" />
        </Link>
        <nav className="hidden xl:flex items-center ml-4" aria-label={t("navServices")}>
          {open.map((s) => (
            <Link key={s.key} href={s.href}
              className={cx("relative py-2 text-sm rounded-lg transition-colors", crowded ? "px-1.5 text-center" : "px-3", activeKey === s.key ? "text-gold" : "text-soft hover:text-strong")}>
              {activeKey === s.key && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-gold/10 border border-gold/20" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
              <span className="relative">{s.nav}</span>
            </Link>
          ))}
          <Link href="/offers" className={cx("py-2 text-sm", crowded ? "px-1.5" : "px-3", path === "/offers" ? "text-gold" : "text-soft hover:text-strong")}>{t("navOffers")}</Link>
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <LanguageMenu compact />
          <ThemeToggle />
          {user && (
            <Link href="/notifications" aria-label={unread ? t("navNotificationsUnread", { count: unread }) : t("navNotifications")} className="relative p-2 rounded-lg text-soft hover:bg-fg/5">
              <Bell size={18} />
              <AnimatePresence>
                {unread > 0 && (
                  <motion.span key={unread} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                    className="absolute top-0.5 right-0.5 bg-brand text-on-brand text-[10px] font-bold rounded-full min-w-4 h-4 px-1 grid place-items-center">{unread > 9 ? "9+" : unread}</motion.span>
                )}
              </AnimatePresence>
            </Link>
          )}
          {/* Below lg these live in the bottom bar (BottomNav). */}
          <Link href="/help" title={t("navHelp")} className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-soft hover:bg-fg/5"><HelpCircle size={17} /><span className={cx(crowded && "xl:sr-only")}>{t("navHelp")}</span></Link>
          <Link href="/bookings" title={t("navMyTrips")} className="relative hidden lg:flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-soft hover:bg-fg/5">
            <Ticket size={18} /><span className={cx(crowded && "xl:sr-only")}>{t("navMyTrips")}</span>
            <AnimatePresence>
              {live > 0 && (
                <motion.span key={live} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                  className="absolute -top-0.5 right-0.5 bg-brand text-on-brand text-[10px] font-bold rounded-full w-4 h-4 grid place-items-center">{live}</motion.span>
              )}
            </AnimatePresence>
          </Link>
          {user ? (
            <div className="hidden lg:flex items-center gap-2">
              <Link href="/account?tab=wallet" title={t("navWallet")} className="hidden lg:flex items-center gap-1.5 text-xs text-gold-pale bg-gold/10 px-2.5 py-1.5 rounded-lg hover:bg-gold/20"><Wallet size={14} />{inr(user.walletBalance)}</Link>
              <Link href="/account" title={t("navMyAccount")}
                className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-line hover:border-gold/50 text-sm">
                <span className="w-7 h-7 rounded-full btn-gold grid place-items-center text-xs">{user.name[0]?.toUpperCase()}</span>
                <span className={cx("hidden sm:inline max-w-24 truncate", crowded && "xl:sr-only")}>{user.name}</span><ChevronDown size={14} className="text-subtle" />
              </Link>
            </div>
          ) : (
            <div className="hidden lg:block">
              <GoldButton className="!py-2 !px-4 text-sm" onClick={() => requireAuth(() => undefined)}>
                <UserIcon size={16} /> {t("navLogin")}
              </GoldButton>
            </div>
          )}
          {/* lg–xl: no room for the service links, so open the services sheet instead. */}
          <button type="button" className="hidden lg:grid xl:hidden place-items-center w-10 h-10 rounded-lg text-soft hover:bg-fg/5 hover:text-gold"
            onClick={onOpenServices} aria-label={t("navAllServices")} aria-haspopup="dialog"><LayoutGrid size={20} /></button>
        </div>
      </div>
    </motion.header>
  );
}

function Footer() {
  const open = useOpenServices();
  const t = useT();
  return (
    <footer className="no-print mt-24 border-t border-line bg-coal/40">
      <div className="max-w-7xl mx-auto px-4 py-14 grid sm:grid-cols-2 lg:grid-cols-5 gap-10 text-sm">
        <div className="lg:col-span-2">
          <img src="/assets/logo.svg" alt="QuikFly" width={2059} height={495} className="h-14 w-auto" />
          <p className="text-muted mt-4 max-w-sm">{t("footerTagline")}</p>
          <div className="flex gap-3 mt-5">
            <a href={ANDROID_APP.downloadUrl} download className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gold/50 text-xs text-gold hover:bg-gold/10">
              <Download size={14} />{t("footerAndroid")}
            </a>
            <span className="px-3 py-2 rounded-lg border border-line text-xs text-muted">{t("footerIphone")}</span>
          </div>
          <LanguageMenu className="mt-4 w-fit" />
        </div>
        <FooterCol title={t("navServices")} links={open.map((s) => [s.action, s.href])} />
        <FooterCol title={t("footerCompany")} links={[[t("navOffers"), "/offers"], [t("linkBecomePartner"), "/partner"], [t("linkMyTrips"), "/bookings"]]} />
        <FooterCol title={t("footerSupport")} links={[[t("linkHelpCentre"), "/help"], [t("footerSafety"), "/help"], [t("footerCancellation"), "/help"], [t("linkPrivacyNotice"), "/privacy"]]} />
      </div>
      <div className="border-t border-line">
        <p className="max-w-7xl mx-auto px-4 py-5 text-xs text-subtle flex flex-wrap justify-between gap-2">
          <span>{t("footerRights", { year: new Date().getFullYear() })}</span><span>{t("footerMadeBy")} <a href={AUTHOR.url} target="_blank" rel="noopener author" className="text-muted hover:text-gold transition-colors underline-offset-4 hover:underline">{AUTHOR.name}</a></span>
        </p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: string[][] }) {
  return (
    <div>
      <p className="label mb-4">{title}</p>
      <ul className="space-y-2.5">{links.map(([l, h]) => <li key={l}><Link href={h} className="text-muted hover:text-gold transition-colors">{l}</Link></li>)}</ul>
    </div>
  );
}

function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="no-print fixed bottom-[calc(var(--bottom-nav-offset)+1.25rem)] left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center pointer-events-none" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className={cx("max-w-[calc(100vw-2rem)] rounded-full bg-smoke border border-line shadow-xl text-sm", t.href && "pointer-events-auto hover:border-gold/60")}>
            {t.href ? (
              <Link href={t.href} className="flex items-center gap-2 px-4 py-2.5">
                <Bell size={16} className="text-gold shrink-0" /><span className="truncate">{t.text}</span><span className="text-gold font-medium shrink-0">View</span>
              </Link>
            ) : (
              <span className="flex items-center gap-2 px-4 py-2.5">
                {t.tone === "ok" ? <CircleCheck size={16} className="text-success shrink-0" /> : <TriangleAlert size={16} className="text-danger shrink-0" />}
                {t.text}
              </span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

