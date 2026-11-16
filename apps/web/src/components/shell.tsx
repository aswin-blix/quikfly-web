"use client";
// Site chrome: header, footer, login modal, toasts, page transition.
import { AnimatePresence, motion, MotionConfig, useMotionValueEvent, useScroll } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { CircleCheck, HelpCircle, LayoutGrid, LogOut, Ticket, TriangleAlert, User as UserIcon, Wallet } from "lucide-react";
import { AppProvider, useApp } from "./AppProvider";
import { BottomNav, BottomNavProvider } from "./BottomNav";
import { ServicesSheet } from "./ServicesSheet";
import { ThemeProvider } from "./ThemeProvider";
import { ThemeToggle } from "./ThemeToggle";
import { GoldButton, Modal } from "./ui";
import { api, DEMO_MODE, DEMO_OTP } from "@/lib/api";
import { cx, inr } from "@/lib/format";
import { Link, usePath } from "@/lib/nav";
import { SERVICES } from "@/lib/services";
import { AUTHOR } from "@/lib/site";

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePath();
  const [servicesOpen, setServicesOpen] = useState(false);
  const openServices = useCallback(() => setServicesOpen(true), []);
  useEffect(() => setServicesOpen(false), [path]);

  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
      <AppProvider>
      <BottomNavProvider>
        <Header onOpenServices={openServices} />
        <main className="min-h-[70vh]">{children}</main>
        <Footer />
        <BottomNav servicesOpen={servicesOpen} onOpenServices={openServices} />
        <ServicesSheet open={servicesOpen} onClose={() => setServicesOpen(false)} />
        <LoginModal />
        <Toasts />
      </BottomNavProvider>
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

function Header({ onOpenServices }: { onOpenServices: () => void }) {
  const path = usePath();
  const { user, requireAuth, signOut, bookings, toast } = useApp();
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

  return (
    <motion.header
      animate={{ y: hidden ? "-100%" : "0%" }} transition={{ duration: 0.3, ease: "easeOut" }}
      className={cx("sticky top-0 z-40 transition-colors duration-300", scrolled ? "bg-ink/85 backdrop-blur-xl border-b border-fg/5" : "bg-transparent")}>
      {DEMO_OTP && (
        <div className="text-center text-[11px] tracking-wide py-1 bg-gold/10 text-gold-pale border-b border-gold/10">
          {DEMO_MODE ? "DEMO MODE · sample data" : "PREVIEW"} · login OTP is <b>{DEMO_OTP}</b>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3">
        <Link href="/" className="shrink-0" aria-label="QuikFly home">
          <img src="/assets/logo.png" alt="QuikFly" className="h-10 sm:h-11 w-auto rounded-md" />
        </Link>
        <nav className="hidden xl:flex items-center ml-4" aria-label="Services">
          {SERVICES.map((s) => (
            <Link key={s.key} href={s.href}
              className={cx("relative px-3 py-2 text-sm rounded-lg transition-colors", activeKey === s.key ? "text-gold" : "text-soft hover:text-strong")}>
              {activeKey === s.key && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-gold/10 border border-gold/20" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
              <span className="relative">{s.nav}</span>
            </Link>
          ))}
          <Link href="/offers" className={cx("px-3 py-2 text-sm", path === "/offers" ? "text-gold" : "text-soft hover:text-strong")}>Offers</Link>
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          {/* Below lg these live in the bottom bar (BottomNav). */}
          <Link href="/help" className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-soft hover:bg-fg/5"><HelpCircle size={17} />Help</Link>
          <Link href="/bookings" className="relative hidden lg:flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-soft hover:bg-fg/5">
            <Ticket size={18} /><span>My Trips</span>
            <AnimatePresence>
              {live > 0 && (
                <motion.span key={live} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                  className="absolute -top-0.5 right-0.5 bg-brand text-on-brand text-[10px] font-bold rounded-full w-4 h-4 grid place-items-center">{live}</motion.span>
              )}
            </AnimatePresence>
          </Link>
          {user ? (
            <div className="hidden lg:flex items-center gap-2">
              <span className="hidden lg:flex items-center gap-1.5 text-xs text-gold-pale bg-gold/10 px-2.5 py-1.5 rounded-lg"><Wallet size={14} />{inr(user.walletBalance)}</span>
              <button onClick={() => { signOut(); toast("Signed out"); }} title="Sign out"
                className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-line hover:border-gold/50 text-sm">
                <span className="w-7 h-7 rounded-full btn-gold grid place-items-center text-xs">{user.name[0]?.toUpperCase()}</span>
                <span className="hidden sm:inline max-w-24 truncate">{user.name}</span><LogOut size={14} className="text-subtle" />
              </button>
            </div>
          ) : (
            <div className="hidden lg:block">
              <GoldButton className="!py-2 !px-4 text-sm" onClick={() => requireAuth(() => toast("Welcome to QuikFly!"))}>
                <UserIcon size={16} /> Login
              </GoldButton>
            </div>
          )}
          {/* lg–xl: no room for the service links, so open the services sheet instead. */}
          <button type="button" className="hidden lg:grid xl:hidden place-items-center w-10 h-10 rounded-lg text-soft hover:bg-fg/5 hover:text-gold"
            onClick={onOpenServices} aria-label="All services" aria-haspopup="dialog"><LayoutGrid size={20} /></button>
        </div>
      </div>
    </motion.header>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-coal/40">
      <div className="max-w-7xl mx-auto px-4 py-14 grid sm:grid-cols-2 lg:grid-cols-5 gap-10 text-sm">
        <div className="lg:col-span-2">
          <img src="/assets/logo.png" alt="QuikFly" className="h-14 rounded-lg" />
          <p className="text-muted mt-4 max-w-sm">Rides, buses, holidays and rentals in one app. One login, one wallet, every journey.</p>
          <div className="flex gap-3 mt-5">
            {["Google Play", "App Store"].map((s) => <span key={s} className="px-3 py-2 rounded-lg border border-line text-xs text-soft">Get it on {s}</span>)}
          </div>
        </div>
        <FooterCol title="Services" links={SERVICES.map((s) => [s.action, s.href])} />
        <FooterCol title="Company" links={[["Offers", "/offers"], ["Become a partner", "/partner"], ["My trips", "/bookings"]]} />
        <FooterCol title="Support" links={[["Help centre", "/help"], ["Safety", "/help"], ["Cancellation & refunds", "/help"]]} />
      </div>
      <div className="border-t border-line">
        <p className="max-w-7xl mx-auto px-4 py-5 text-xs text-subtle flex flex-wrap justify-between gap-2">
          <span>© {new Date().getFullYear()} QuikFly. All rights reserved.</span><span>Made in Chennai · Designed &amp; built by <a href={AUTHOR.url} target="_blank" rel="noopener author" className="text-muted hover:text-gold transition-colors underline-offset-4 hover:underline">{AUTHOR.name}</a></span>
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

function LoginModal() {
  const { loginOpen, closeLogin, setUser, toast } = useApp();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const close = (ok: boolean) => { closeLogin(ok); setStep("phone"); setOtp(""); setErr(""); };

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{10}$/.test(phone)) return setErr("Enter a valid 10-digit mobile number");
    setErr(""); setBusy(true);
    try {
      await api.auth.sendOtp(phone);
      setStep("otp");
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const { user } = await api.auth.verifyOtp(`+91 ${phone}`, otp, name.trim() || undefined);
      setUser(user); toast(`Welcome, ${user.name}!`); close(true);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <Modal open={loginOpen} onClose={() => close(false)} title={step === "phone" ? "Login or sign up" : "Verify OTP"}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, x: step === "otp" ? 30 : -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: step === "otp" ? -30 : 30 }} transition={{ duration: 0.25 }}>
          {step === "phone" ? (
            <form onSubmit={send} className="space-y-4">
              <p className="text-sm text-muted">One account for rides, buses, holidays and rentals.</p>
              <div>
                <label className="label" htmlFor="ln">Your name</label>
                <input id="ln" className="field mt-1.5" placeholder="e.g. Priya" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="lp">Mobile number</label>
                <div className="flex mt-1.5 gap-2">
                  <span className="field !w-auto text-muted">+91</span>
                  <input id="lp" className="field" inputMode="numeric" maxLength={10} placeholder="98765 43210" autoFocus
                    value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
                </div>
              </div>
              {err && <p className="text-danger text-sm">{err}</p>}
              <GoldButton className="w-full" loading={busy}>Send OTP</GoldButton>
              <p className="text-[11px] text-subtle text-center">By continuing you agree to QuikFly&apos;s Terms & Privacy Policy.</p>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-sm text-muted">Enter the 4-digit code sent to +91 {phone}. <button type="button" className="text-gold" onClick={() => setStep("phone")}>Change</button></p>
              <OtpInput value={otp} onChange={setOtp} />
              {DEMO_OTP && <p className="text-xs text-gold-pale/80">Demo: use OTP <b>{DEMO_OTP}</b></p>}
              {err && <motion.p initial={{ x: -8 }} animate={{ x: [8, -6, 4, 0] }} className="text-danger text-sm">{err}</motion.p>}
              <GoldButton className="w-full" loading={busy} disabled={otp.length !== 4}>Verify & continue</GoldButton>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
}

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input aria-label="OTP" className="absolute inset-0 opacity-0" inputMode="numeric" maxLength={4} autoFocus
        value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))} />
      <div className="grid grid-cols-4 gap-3 pointer-events-none">
        {[0, 1, 2, 3].map((i) => (
          <motion.div key={i} animate={{ scale: value.length === i ? 1.05 : 1 }}
            className={cx("h-14 rounded-xl border bg-ink grid place-items-center text-2xl font-bold transition-colors", value.length === i ? "border-gold" : "border-line")}>
            {value[i] ?? ""}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="fixed bottom-[calc(var(--bottom-nav-offset)+1.25rem)] left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center pointer-events-none" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-smoke border border-line shadow-xl text-sm">
            {t.tone === "ok" ? <CircleCheck size={16} className="text-success" /> : <TriangleAlert size={16} className="text-danger" />}
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

