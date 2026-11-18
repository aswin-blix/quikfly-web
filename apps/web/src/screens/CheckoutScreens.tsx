"use client";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BadgePercent, Building2, CarTaxiFront, ChevronDown, CreditCard, FileText, Info, Lock, Route, ShieldCheck, Smartphone, Ticket, UserRound, Wallet } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { TweenNumber } from "@/components/motion";
import { Empty, GhostLink, GoldButton, Spinner } from "@/components/ui";
import { api, DEMO_MODE } from "@/lib/api";
import { cx, inr, prettyDateTime } from "@/lib/format";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { Link, qs, useNav, useQuery } from "@/lib/nav";
import { serviceByKey } from "@/lib/services";
import { RIDE_SCHEDULE, cancelPolicyFor, formatLicence, minutesUntilStart, refundAmount, refundPercent, rideCancelFee, type Booking, type BookingStatus, type PaymentMethod, type Traveller } from "@quikfly/shared";
import { useConfig, useSettings } from "@/components/ConfigProvider";
import { bookingWhen, rideOffer } from "@/lib/trips";
import { LicenceBadge, LicenceForm, licenceMessage, useLicencePolling } from "@/components/account/LicenceSection";
import { GSTIN_LINE } from "@/lib/invoice";

/* ───────────── /checkout ───────────── */

export function CheckoutScreen() {
  const { draft, setDraft, user, requireAuth, refreshBookings, toast } = useApp();
  const nav = useNav();
  const [step, setStep] = useState<1 | 2>(1);
  const [names, setNames] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gstInvoice, setGstInvoice] = useState(false);
  const [savedTravellers, setSavedTravellers] = useState<Traveller[]>([]);
  const [method, setMethod] = useState<Exclude<PaymentMethod, "cash">>("upi");
  const [code, setCode] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; off: number } | null>(null);
  const [couponErr, setCouponErr] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { if (draft) setNames((n) => draft.travellers.map((_, i) => n[i] ?? (i === 0 ? user?.name ?? "" : ""))); }, [draft, user]);
  useEffect(() => { if (user && !phone) setPhone(user.phone.replace("+91 ", "")); }, [user, phone]);
  useEffect(() => { if (user?.email && !email) setEmail(user.email); }, [user, email]);
  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn) return setSavedTravellers([]);
    api.travellers.list().then(setSavedTravellers, () => setSavedTravellers([]));
  }, [signedIn]);
  useLicencePolling();

  if (!draft) {
    return <div className="max-w-3xl mx-auto px-4 py-24"><div className="panel"><Empty icon={<Ticket size={40} />} text="Nothing to check out yet. Pick a ride, bus, holiday or rental first." action={<GhostLink href="/">Explore services</GhostLink>} /></div></div>;
  }

  const svc = serviceByKey(draft.service);
  // The API priced this booking (draft.quote) and checks coupons against that price.
  const subtotal = draft.quote.total;
  const total = Math.max(0, subtotal - (coupon?.off ?? 0));

  /** Asks the API what the code takes off this quote. Coupons have per-customer limits, so sign in first. */
  function applyCoupon() {
    const entered = code.trim();
    setCouponErr("");
    if (!entered) return setCouponErr("Enter a coupon code");
    requireAuth(async () => {
      setCouponBusy(true);
      try {
        const r = await api.offers.check(entered, { quoteId: draft!.quote.id });
        setCoupon({ code: r.code, off: r.discount });
        toast(`Coupon applied · you save ${inr(r.discount)}`);
      } catch (e) {
        setCouponErr((e as Error).message);
      } finally {
        setCouponBusy(false);
      }
    });
  }

  function next() {
    const e: Record<string, string> = {};
    names.forEach((n, i) => { if (!n.trim()) e[`n${i}`] = "Required"; });
    if (!/^\d{10}$/.test(phone)) e.phone = "Enter a 10-digit mobile number";
    if (email && !/^\S+@\S+\.\S+$/.test(email)) e.email = "Enter a valid email";
    if (draft!.needsLicence && user?.licence.status === "none") e.licence = "Add your driving licence to book a self-drive car";
    if (draft!.needsLicence && user?.licence.status === "rejected") e.licence = "Your licence wasn't approved. Submit it again to book a self-drive car";
    setErrors(e);
    if (Object.keys(e).length) return;
    // Self-drive needs the licence on the account, so sign in first and let them add it here.
    if (draft!.needsLicence && !user) return requireAuth(() => toast("Signed in. Add your driving licence below to continue."));
    requireAuth(() => { setStep(2); window.scrollTo({ top: 0, behavior: "smooth" }); });
  }

  /** Tap a saved traveller: fills the next empty name, or removes them if already added. */
  function toggleTraveller(name: string) {
    setNames((n) => {
      const at = n.indexOf(name);
      if (at >= 0) return n.map((x, i) => (i === at ? "" : x));
      const empty = n.findIndex((x) => !x.trim());
      return empty < 0 ? n : n.map((x, i) => (i === empty ? name : x));
    });
  }

  const walletShort = !!user && user.walletBalance < total;

  async function pay() {
    setPaying(true);
    try {
      await new Promise((r) => setTimeout(r, 1400));
      const b = await api.bookings.create({
        service: draft!.service, title: draft!.title, subtitle: draft!.subtitle, payment: method,
        quoteId: draft!.quote.id, couponCode: coupon?.code,
        lines: [
          ...draft!.summary, ["Traveller names", names.join(", ")], ["Paid via", method.toUpperCase()],
          ...(gstInvoice && user?.gst ? [[GSTIN_LINE, `${user.gst.gstin} · ${user.gst.name}`] as [string, string]] : []),
        ],
      });
      await refreshBookings();
      setDraft(null);
      nav.replace(`/booking-confirmed${qs({ id: b.id })}`);
    } catch (e) {
      toast((e as Error).message, "err");
      setPaying(false);
    }
  }

  const methods = [["upi", "UPI", Smartphone, "GPay, PhonePe, Paytm"], ["card", "Card", CreditCard, "Credit / debit"], ["netbanking", "Net banking", Building2, "All major banks"],
    ["wallet", "QuikFly wallet", Wallet, user ? `Balance ${inr(user.walletBalance)}${walletShort ? " · not enough" : ""}` : "Instant refunds"]] as const;

  return (
    <div className="max-w-6xl mx-auto px-4 pt-8">
      <button onClick={() => (step === 2 ? setStep(1) : nav.back())} className="text-sm text-muted hover:text-strong flex items-center gap-1"><ArrowLeft size={16} />Back</button>
      <div className="mt-4 mb-8">
        <h1 className="font-display text-3xl sm:text-4xl">Review & pay</h1>
        <div className="mt-5 flex items-center gap-3 max-w-md">
          {["Traveller details", "Payment"].map((l, i) => (
            <div key={l} className="flex-1">
              <div className="h-1.5 rounded-full bg-line overflow-hidden"><motion.div className="h-full bg-gradient-to-r from-gold-deep to-gold" initial={false} animate={{ width: step > i ? "100%" : "0%" }} transition={{ duration: 0.5 }} /></div>
              <p className={cx("text-xs mt-2", step > i ? "text-gold" : "text-subtle")}>{i + 1}. {l}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-8">
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            {step === 1 ? (
              <motion.div key="s1" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-5">
                <div className="panel p-5 space-y-4">
                  <p className="font-semibold">Traveller details</p>
                  {savedTravellers.length > 0 && (
                    <div>
                      <p className="text-xs text-muted mb-2">Saved travellers: tap to add</p>
                      <div className="flex flex-wrap gap-2">
                        {savedTravellers.map((t) => (
                          <button key={t.id} type="button" data-on={names.includes(t.name)} onClick={() => toggleTraveller(t.name)} className="chip flex items-center gap-1.5 !text-xs">
                            <UserRound size={13} />{t.name}<span className="text-subtle">· {t.age}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {draft.travellers.map((label, i) => (
                    <div key={label} className="grid sm:grid-cols-[120px_1fr] items-start gap-2 sm:gap-3">
                      <label htmlFor={`t${i}`} className="text-sm text-gold pt-3">{label}</label>
                      <div>
                        <input id={`t${i}`} className={cx("field", errors[`n${i}`] && "!border-danger/60")} placeholder="Full name as per ID" value={names[i] ?? ""}
                          onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />
                        {errors[`n${i}`] && <p className="text-xs text-danger mt-1">{errors[`n${i}`]}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="panel p-5 grid sm:grid-cols-2 gap-4">
                  <p className="font-semibold sm:col-span-2">Contact details <span className="text-xs text-subtle font-normal">· ticket & updates are sent here</span></p>
                  <div><label className="label" htmlFor="cp">Mobile</label><input id="cp" className={cx("field mt-1.5", errors.phone && "!border-danger/60")} inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="98765 43210" />{errors.phone && <p className="text-xs text-danger mt-1">{errors.phone}</p>}</div>
                  <div><label className="label" htmlFor="ce">Email (optional)</label><input id="ce" className={cx("field mt-1.5", errors.email && "!border-danger/60")} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />{errors.email && <p className="text-xs text-danger mt-1">{errors.email}</p>}</div>
                </div>
                {draft.needsLicence && (
                  <div className={cx("panel p-5 space-y-4", errors.licence && "!border-danger/60")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">Driving licence</p>
                      {user && <LicenceBadge user={user} />}
                    </div>
                    {!user ? (
                      <p className="text-sm text-muted">Self-drive needs a verified licence. You&apos;ll add it after signing in.</p>
                    ) : user.licence.status === "none" || user.licence.status === "rejected" ? (
                      <>
                        {user.licence.status === "rejected" && <p className="text-sm text-danger">{licenceMessage(user)}</p>}
                        <LicenceForm onSaved={() => setErrors(({ licence: _, ...rest }) => rest)} />
                      </>
                    ) : (
                      <p className="text-sm text-muted">
                        {user.licence.number && <span className="font-mono text-soft">{formatLicence(user.licence.number)} · </span>}
                        {licenceMessage(user)}
                      </p>
                    )}
                    {errors.licence && <p className="text-xs text-danger">{errors.licence}</p>}
                  </div>
                )}
                {user?.gst ? (
                  <label className="panel p-5 flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" className="mt-1 accent-brand" checked={gstInvoice} onChange={(e) => setGstInvoice(e.target.checked)} />
                    <span className="text-sm text-soft">Get a GST invoice for <b>{user.gst.name}</b> <span className="font-mono text-xs text-subtle">({user.gst.gstin})</span></span>
                  </label>
                ) : user && (
                  <p className="text-xs text-muted">Travelling for work? <Link href="/account?tab=business" className="text-gold">Add GST details</Link> to get a GST invoice.</p>
                )}
                <div className="flex items-start gap-2 text-xs text-muted"><Info size={14} className="shrink-0 mt-0.5 text-gold" />{draft.policy}</div>
                <GoldButton className="w-full sm:w-auto" onClick={next}>Continue to payment</GoldButton>
              </motion.div>
            ) : (
              <motion.div key="s2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} className="space-y-5">
                <div className="panel p-5">
                  <p className="font-semibold mb-4">Choose a payment method</p>
                  <LayoutGroup>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {methods.map(([k, l, I, sub]) => (
                        <button key={k} onClick={() => setMethod(k)} disabled={k === "wallet" && walletShort}
                          className="relative text-left rounded-2xl border border-line p-4 flex items-center gap-3 hover:border-line-strong disabled:opacity-50 disabled:cursor-not-allowed" aria-pressed={method === k}>
                          {method === k && <motion.span layoutId="pay-method" className="absolute inset-0 rounded-2xl border-2 border-gold bg-gold/[0.06]" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                          <I className="relative text-gold" size={22} />
                          <span className="relative"><span className="block font-semibold text-sm">{l}</span><span className="block text-xs text-muted">{sub}</span></span>
                        </button>
                      ))}
                    </div>
                  </LayoutGroup>
                  {DEMO_MODE && <p className="text-xs text-gold-pale/80 mt-4">Demo mode: no payment is taken. The live site will redirect to the payment gateway (e.g. Razorpay) here.</p>}
                </div>
                <GoldButton className="w-full text-base !py-4" loading={paying} onClick={pay}>
                  {paying ? "Processing payment…" : <><Lock size={16} />Pay {inr(total)}</>}
                </GoldButton>
                <p className="text-xs text-subtle flex items-center justify-center gap-1"><ShieldCheck size={13} className="text-success" />256-bit secure · PCI-DSS compliant gateway</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="lg:sticky lg:top-24 h-fit space-y-4">
          <div className="panel overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-line">
              <img src={draft.image ?? svc.image} alt="" className="w-16 h-12 object-cover rounded-lg" />
              <div className="min-w-0"><p className="font-semibold truncate">{draft.title}</p><p className="text-xs text-muted truncate">{draft.subtitle}</p></div>
            </div>
            <dl className="p-4 space-y-1.5 text-sm border-b border-line">
              {draft.summary.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-subtle shrink-0">{k}</dt><dd className="text-right">{v}</dd></div>)}
            </dl>
            <div className="p-4 space-y-1.5 text-sm">
              {draft.quote.lines.map((f) => <div key={f.label} className="flex justify-between gap-3"><span className="text-muted">{f.label}</span><span>{inr(f.amount)}</span></div>)}
              <AnimatePresence>
                {coupon && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex justify-between text-success">
                    <span>Coupon {coupon.code} <button className="text-xs text-subtle underline ml-1" onClick={() => setCoupon(null)}>remove</button></span><span>−{inr(coupon.off)}</span>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex justify-between items-end pt-3 mt-2 border-t border-line">
                <span className="font-semibold">Total</span><TweenNumber value={total} format={inr} className="text-2xl font-bold text-gold" />
              </div>
            </div>
          </div>
          {!coupon && (
            <div className="panel p-4">
              <p className="text-sm font-semibold flex items-center gap-2 mb-2"><BadgePercent size={16} className="text-gold" />Have a coupon?</p>
              <div className="flex gap-2">
                <input className="field !py-2 uppercase" placeholder="e.g. BUS150" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Coupon code" />
                <button onClick={applyCoupon} disabled={couponBusy} className="px-4 rounded-xl border border-gold/50 text-gold text-sm hover:bg-gold/10 disabled:opacity-60">{couponBusy ? <Spinner size={14} /> : "Apply"}</button>
              </div>
              {couponErr && <motion.p initial={{ x: -6 }} animate={{ x: [6, -4, 2, 0] }} className="text-xs text-danger mt-2">{couponErr}</motion.p>}
              <Link href="/offers" className="text-xs text-subtle hover:text-gold mt-2 inline-block">See all offers →</Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ───────────── /booking-confirmed ───────────── */

export function ConfirmedScreen() {
  const q = useQuery();
  const id = q.get("id");
  const { bookings } = useApp();
  const b = bookings.find((x) => x.id === id);
  const ref = useRef<HTMLDivElement>(null);
  const settings = useSettings();
  const places = useConfig()?.places ?? [];

  useGSAP(() => {
    if (!b || prefersReducedMotion()) return;
    const bits = gsap.utils.toArray<HTMLElement>(".confetti");
    bits.forEach((el) => {
      gsap.fromTo(el, { x: 0, y: 0, opacity: 1, rotate: 0, scale: gsap.utils.random(0.6, 1.2) }, {
        x: gsap.utils.random(-260, 260), y: gsap.utils.random(-220, 140), rotate: gsap.utils.random(-360, 360), opacity: 0,
        duration: gsap.utils.random(1.2, 2), ease: "power3.out", delay: 0.5,
      });
    });
  }, { scope: ref, dependencies: [!!b] });

  const [waited, setWaited] = useState(false);
  useEffect(() => { const t = setTimeout(() => setWaited(true), 1500); return () => clearTimeout(t); }, []);

  if (!b) {
    if (!waited) return <div className="max-w-3xl mx-auto px-4 py-24 text-center text-gold"><Spinner size={28} /></div>;
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="font-display text-3xl">We couldn&apos;t find that booking</h1>
        <p className="text-muted mt-2">It may have been made on another device. Your trips are listed under My Trips.</p>
        <div className="flex justify-center gap-3 mt-8">
          <Link href="/bookings" className="btn-gold rounded-xl px-5 py-3">View my trips</Link>
          <Link href="/" className="rounded-xl px-5 py-3 border border-line hover:border-gold/60">Back to home</Link>
        </div>
      </div>
    );
  }
  const svc = serviceByKey(b.service);

  return (
    <div ref={ref} className="max-w-2xl mx-auto px-4 pt-14 text-center relative">
      <div className="relative mx-auto w-28 h-28">
        {[...Array(24)].map((_, i) => <span key={i} className="confetti absolute left-1/2 top-1/2 w-2 h-3 rounded-sm opacity-0" style={{ background: i % 3 ? "var(--brand)" : i % 2 ? "var(--brand-light)" : "var(--success)" }} />)}
        <motion.svg viewBox="0 0 100 100" className="w-28 h-28" initial="hidden" animate="show">
          <motion.circle cx="50" cy="50" r="44" fill="none" stroke="var(--success)" strokeWidth="5" variants={{ hidden: { pathLength: 0 }, show: { pathLength: 1, transition: { duration: 0.6 } } }} />
          <motion.path d="M30 52 L45 66 L72 38" fill="none" stroke="var(--success)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
            variants={{ hidden: { pathLength: 0 }, show: { pathLength: 1, transition: { duration: 0.4, delay: 0.55 } } }} />
        </motion.svg>
      </div>
      <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="font-display text-3xl sm:text-4xl mt-6">Booking confirmed!</motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="text-muted mt-2">We&apos;ve sent the details to your phone. Have a great trip!</motion.p>

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, type: "spring" }} className="panel gold-border text-left mt-8 overflow-hidden">
        <div className="flex items-center gap-3 p-5 border-b border-dashed border-line">
          <span className="w-11 h-11 rounded-xl bg-gold/10 text-gold grid place-items-center"><svc.icon size={22} /></span>
          <div className="flex-1 min-w-0"><p className="font-semibold truncate">{b.title}</p><p className="text-xs text-muted truncate">{b.subtitle}</p></div>
          <div className="text-right"><p className="text-[11px] text-subtle">Booking ID</p><p className="font-mono text-gold text-sm">{b.id}</p></div>
        </div>
        <dl className="p-5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {b.lines.map(([k, v]) => <div key={k} className="contents"><dt className="text-subtle">{k}</dt><dd className="text-right">{v}</dd></div>)}
          <dt className="text-subtle border-t border-line pt-2">Amount paid</dt><dd className="text-right font-bold text-gold border-t border-line pt-2">{inr(b.amount)}</dd>
        </dl>
      </motion.div>
      {(() => {
        const offer = rideOffer(b, settings, (pid) => places.find((p) => p.id === pid)?.name);
        if (!offer) return null;
        return (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.3 }} className="panel text-left mt-4 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <span className="w-11 h-11 shrink-0 rounded-xl bg-gold/10 text-gold grid place-items-center"><CarTaxiFront size={22} /></span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{offer.title}</p>
              <p className="text-sm text-muted">{offer.text}</p>
            </div>
            <Link href={offer.href} className="btn-gold rounded-xl px-5 py-2.5 text-sm text-center shrink-0">Add a ride</Link>
          </motion.div>
        );
      })()}
      <div className="flex flex-wrap justify-center gap-3 mt-8">
        <Link href="/bookings" className="btn-gold rounded-xl px-6 py-3">View my trips</Link>
        <GhostLink href={`/invoice${qs({ id: b.id })}`}>Invoice</GhostLink>
        <GhostLink href="/">Back to home</GhostLink>
      </div>
    </div>
  );
}

/* ───────────── /bookings ───────────── */

const STATUS_STYLE: Record<BookingStatus, string> = {
  confirmed: "bg-success/10 text-success",
  ongoing: "bg-success/10 text-success",
  completed: "bg-fg/5 text-muted",
  cancelled: "bg-danger/10 text-danger",
};

export function BookingsScreen() {
  const { bookings, refreshBookings, toast, user, requireAuth } = useApp();
  const settings = useSettings();
  const [tab, setTab] = useState<"upcoming" | "past" | "cancelled">("upcoming");
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const match: Record<typeof tab, BookingStatus[]> = { upcoming: ["confirmed", "ongoing"], past: ["completed"], cancelled: ["cancelled"] };
  const list = bookings.filter((b) => match[tab].includes(b.status));
  const tripSize = (tripId: string) => bookings.filter((x) => x.tripId === tripId).length;
  const inTrip = (b: Booking) => !!b.tripId && tripSize(b.tripId) > 1;
  // A trip's bookings stay together (in time order) where its first booking appears.
  const ordered = list.flatMap((b, i) => {
    if (!inTrip(b)) return [b];
    if (list.findIndex((x) => x.tripId === b.tripId) !== i) return [];
    return list.filter((x) => x.tripId === b.tripId).sort((x, y) => bookingWhen(x).localeCompare(bookingWhen(y)));
  });

  /** What cancelling now gives back under the service's policy (the API applies the same rule). */
  function preview(b: Booking) {
    if (b.service === "bike" || b.service === "car") {
      // No reason from My Trips, so the fee applies after the free minutes.
      const fee = rideCancelFee(settings, b.amount, null, b.createdAt, Date.now(), b.startsAt);
      return { percent: 100, refund: b.amount - fee, fee };
    }
    const percent = refundPercent(cancelPolicyFor(settings, b.service), b.startsAt);
    return { percent, refund: refundAmount(b.amount, percent, b.deposit ?? 0), fee: 0 };
  }
  function confirmText(b: Booking) {
    const { percent, refund, fee } = preview(b);
    if (fee > 0) return `Cancel? A ${inr(fee)} cancellation fee applies${b.payment === "wallet" ? `; ${inr(refund)} comes back to your wallet.` : " (demo: not collected)."}`;
    if (refund === 0) return "Cancel? It's too close to the start for a refund.";
    if (b.payment !== "wallet") return `Cancel? ${inr(refund)}${percent < 100 ? ` (${percent}%)` : ""} is due back under the cancellation policy.`;
    return `Cancel and get ${inr(refund)}${percent < 100 ? ` (${percent}%)` : ""} back in your wallet?`;
  }

  async function cancel(b: Booking) {
    setBusy(true);
    try {
      const done = await api.bookings.cancel(b.id);
      toast(done.payment === "wallet"
        ? done.refundAmount ? `Booking cancelled. ${inr(done.refundAmount)} refunded to your wallet.` : "Booking cancelled. No refund under the cancellation policy."
        : done.refundAmount ? `Booking cancelled. Refund due: ${inr(done.refundAmount)}.` : "Booking cancelled.");
    } catch (e) {
      toast((e as Error).message, "err");
    }
    await refreshBookings();
    setBusy(false); setConfirming(null);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 pt-10">
      <h1 className="font-display text-3xl sm:text-4xl">My trips</h1>
      <p className="text-muted mt-1">{user ? `Hi ${user.name}, here's everything you've booked.` : "Your rides, tickets, holidays and rentals in one place."}</p>
      {!user && <button onClick={() => requireAuth(() => undefined)} className="text-gold text-sm mt-2">Log in to sync trips across devices →</button>}

      <div className="flex gap-6 mt-8 border-b border-line" role="tablist">
        {(["upcoming", "past", "cancelled"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("relative pb-3 text-sm capitalize", tab === t ? "text-gold" : "text-muted hover:text-strong")}>
            {t} <span className="text-xs text-subtle">({bookings.filter((b) => match[t].includes(b.status)).length})</span>
            {tab === t && <motion.span layoutId="trip-tab" className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand" />}
          </button>
        ))}
      </div>

      <LayoutGroup>
        <motion.div layout className="mt-6 space-y-3">
          <AnimatePresence mode="popLayout">
            {list.length === 0 && (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="panel">
                <Empty icon={<Ticket size={40} />} text={tab === "upcoming" ? "No upcoming trips. Where to next?" : `No ${tab} bookings.`} action={tab === "upcoming" ? <GhostLink href="/">Book something</GhostLink> : undefined} />
              </motion.div>
            )}
            {ordered.flatMap((b, i) => {
              const s = serviceByKey(b.service);
              const isOpen = open === b.id;
              const grouped = inTrip(b);
              const header = grouped && (i === 0 || ordered[i - 1].tripId !== b.tripId) ? (
                <motion.div key={`trip-${b.tripId}`} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-between gap-3 pt-2 text-sm">
                  <span className="flex items-center gap-2 font-semibold"><Route size={16} className="text-gold" />Trip · {tripSize(b.tripId!)} bookings</span>
                  <Link href={`/trip${qs({ id: b.tripId! })}`} className="text-gold">Trip summary →</Link>
                </motion.div>
              ) : null;
              return [header, (
                <motion.div key={b.id} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40 }} className={cx("panel overflow-hidden", grouped && "ml-3 border-l-2 !border-l-gold/60")}>
                  <button className="w-full flex items-center gap-4 p-4 text-left" onClick={() => setOpen(isOpen ? null : b.id)} aria-expanded={isOpen}>
                    <img src={s.image} alt="" className="w-14 h-14 rounded-xl object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{b.title}</p>
                      <p className="text-xs text-muted truncate">{b.subtitle}</p>
                      <p className="text-[11px] text-subtle mt-1">{s.action} · {b.id} · {prettyDateTime(b.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gold">{inr(b.amount)}</p>
                      <span className={cx("text-[11px] px-2 py-0.5 rounded-full capitalize", STATUS_STYLE[b.status])}>{b.status}</span>
                    </div>
                    <motion.span animate={{ rotate: isOpen ? 180 : 0 }}><ChevronDown size={18} className="text-subtle" /></motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-4 border-t border-line pt-4">
                          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                            {b.lines.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-subtle">{k}</dt><dd className="text-right">{v}</dd></div>)}
                            {b.startsAt && !b.lines.some(([k]) => k === "Pickup time") && <div className="flex justify-between gap-3"><dt className="text-subtle">Starts</dt><dd className="text-right">{prettyDateTime(b.startsAt)}</dd></div>}
                            {b.deposit > 0 && b.status !== "cancelled" && <div className="flex justify-between gap-3"><dt className="text-subtle">Refundable deposit</dt><dd className="text-right">{b.status === "completed" ? `${inr(b.deposit)} ${b.payment === "wallet" ? "returned to wallet" : "due back"}` : `${inr(b.deposit)} (back after return)`}</dd></div>}
                            {b.status === "cancelled" && b.cancelFee > 0 && <div className="flex justify-between gap-3"><dt className="text-subtle">Cancellation fee</dt><dd className="text-right">{inr(b.cancelFee)}{b.payment === "wallet" ? " (kept)" : " (demo: not collected)"}</dd></div>}
                            {b.status === "cancelled" && b.refundAmount !== null && <div className="flex justify-between gap-3"><dt className="text-subtle">{b.payment === "wallet" ? "Refunded to wallet" : "Refund due"}</dt><dd className="text-right">{b.refundAmount ? inr(b.refundAmount) : "Nothing (cancelled too late)"}</dd></div>}
                          </dl>
                          {b.status !== "cancelled" && (
                            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
                              {/* A ride booked ahead starts from here once the driver is assigned. */}
                              {b.status === "confirmed" && b.rideId && b.startsAt && (b.service === "bike" || b.service === "car") && (
                                minutesUntilStart(b.startsAt, RIDE_SCHEDULE.startWindowMinutes) <= 0
                                  ? <Link href={`${serviceByKey(b.service).href}${qs({ ride: b.rideId, booking: b.id })}`} className="btn-gold rounded-lg px-3 py-1.5 text-sm">Start ride</Link>
                                  : <span className="text-xs text-muted">Driver assigned {RIDE_SCHEDULE.startWindowMinutes} min before pickup; start the ride here then.</span>
                              )}
                              <Link href={`/invoice${qs({ id: b.id })}`} className="text-sm text-gold flex items-center gap-1.5"><FileText size={15} />Invoice</Link>
                              {b.status === "confirmed" && (confirming === b.id ? (
                                <>
                                  <span className="text-sm text-soft">{confirmText(b)}</span>
                                  <button disabled={busy} onClick={() => cancel(b)} className="text-sm px-3 py-1.5 rounded-lg bg-danger/15 text-danger hover:bg-danger/25">{busy ? "Cancelling…" : "Yes, cancel"}</button>
                                  <button onClick={() => setConfirming(null)} className="text-sm text-muted">Keep it</button>
                                </>
                              ) : <button onClick={() => setConfirming(b.id)} className="text-sm text-danger hover:text-danger">Cancel booking</button>)}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )].filter(Boolean);
            })}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
    </div>
  );
}
