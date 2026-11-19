"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { BadgeCheck, BadgePercent, CarTaxiFront, CircleCheck, ClipboardList, Copy, Download, Handshake, Headphones, Mail, MessageCircle, Phone, PhoneCall, Search } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { Reveal, Tilt } from "@/components/motion";
import { Accordion, Empty, GhostLink, PageHeader } from "@/components/ui";
import { inr } from "@/lib/format";
import { Link } from "@/lib/nav";
import { SERVICES } from "@/lib/services";
import { VENDOR_VEHICLE_LABEL, VENDOR_VEHICLE_TYPES, whatsappLink, type Faq } from "@quikfly/shared";
import { CallbackForm } from "@/components/support/CallbackForm";
import { useConfig, useSettings } from "@/components/ConfigProvider";
import { PARTNER_APP } from "@/lib/site";
import { useOpenServices } from "@/components/ServiceGate";

/* ───────────── /offers ───────────── */

export function OffersScreen() {
  const OFFERS = useConfig()?.offers ?? [];
  const { toast } = useApp();
  const [filter, setFilter] = useState<string>("all");
  const open = useOpenServices();
  // Coupons for paused services can't be used, so they aren't shown.
  const shown = OFFERS.filter((o) => (o.service === "all" || open.some((s) => s.key === o.service)) && (filter === "all" || o.service === filter));
  return (
    <>
      <PageHeader crumbs={[["Home", "/"], ["Offers"]]} title="Offers & coupons" icon={<BadgePercent className="text-gold" size={36} />} sub="Tap a code to copy it, then apply at checkout.">
        <div className="flex flex-wrap gap-2 mt-6">
          <button data-on={filter === "all"} onClick={() => setFilter("all")} className="chip">All</button>
          {open.map((s) => <button key={s.key} data-on={filter === s.key} onClick={() => setFilter(s.key)} className="chip">{s.nav}</button>)}
        </div>
      </PageHeader>
      <section className="max-w-7xl mx-auto px-4">
        <motion.div layout className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence mode="popLayout">
            {shown.map((o) => {
              const s = SERVICES.find((x) => x.key === o.service)!;
              return (
                <motion.div key={o.id} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}>
                  <Tilt max={6}>
                    <div className="relative rounded-2xl overflow-hidden border border-line p-6 h-full" style={{ background: `radial-gradient(120% 90% at 100% 0%, hsl(${o.hue} 70% 40% / .35), transparent 60%), var(--surface)` }}>
                      <div className="flex items-center justify-between"><span className="label flex items-center gap-1.5"><s.icon size={14} />{s.action}</span><BadgePercent className="text-gold" /></div>
                      <p className="font-display text-2xl mt-4 leading-tight">{o.title}</p>
                      <p className="text-sm text-muted mt-2">{o.description}</p>
                      <div className="mt-6 flex items-center justify-between gap-3 border-t border-dashed border-line pt-4">
                        <motion.button whileTap={{ scale: 0.92 }} onClick={() => { try { navigator.clipboard.writeText(o.code); } catch { /* ignore */ } toast(`Code ${o.code} copied`); }}
                          className="flex items-center gap-2 font-mono border border-dashed border-gold/60 text-gold px-3 py-1.5 rounded-lg hover:bg-gold/10"><Copy size={14} />{o.code}</motion.button>
                        <Link href={s.href} className="text-sm text-soft hover:text-gold">Book now →</Link>
                      </div>
                    </div>
                  </Tilt>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </section>
    </>
  );
}

/* ───────────── /partner ───────────── */

/** Vehicle owners register in the QuikFly Partner app; this page explains how and links to it. */
export function PartnerScreen() {
  const settings = useSettings();
  const steps = [
    [ClipboardList, "Apply in the app", "City and vehicle, profile photo, bank account, RC, insurance, and a day for the vehicle audit. Save as you go."],
    [BadgeCheck, "QuikFly reviews each part", "If something needs fixing, the app shows exactly which part and why."],
    [Handshake, "Onboard", `Joining fee${settings.vendorJoiningFee ? ` (${inr(settings.vendorJoiningFee)})` : ""}, the partner agreement, then the QuikFly sticker and paint.`],
    [CarTaxiFront, "Go live", "Your vehicle takes QuikFly trips."],
  ] as const;
  const keepReady = [
    "Vehicle registration certificate (RC)",
    "Vehicle insurance certificate",
    "Bank account number and IFSC",
    "A clear photo of yourself",
    `A vehicle no older than ${settings.vendorMaxVehicleAgeYears} years`,
    `A morning or afternoon for the audit at ${settings.vendorAuditAddress}`,
  ];
  return (
    <>
      <PageHeader crumbs={[["Home", "/"], ["Become a partner"]]} title="Put your vehicle on QuikFly" icon={<Handshake className="text-gold" size={36} />}
        sub="Cab, auto, tempo traveller or bus owners apply here or in the QuikFly Partner app, get approved, and run their vehicle on QuikFly trips." />
      <section className="max-w-7xl mx-auto px-4 grid lg:grid-cols-2 gap-6 items-start">
        <Reveal>
          <div className="panel p-6 sm:p-8">
            <p className="label !text-gold">How it works</p>
            <ol className="mt-5 space-y-5">
              {steps.map(([Icon, title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span className="w-11 h-11 shrink-0 rounded-xl bg-gold/10 text-gold grid place-items-center"><Icon size={20} /></span>
                  <div><p className="font-semibold">{i + 1}. {title}</p><p className="text-sm text-muted mt-0.5">{body}</p></div>
                </li>
              ))}
            </ol>
            <p className="label mt-8 mb-2">Vehicles we take</p>
            <div className="flex flex-wrap gap-2">{VENDOR_VEHICLE_TYPES.map((t) => <span key={t} className="chip !text-xs">{VENDOR_VEHICLE_LABEL[t]}</span>)}</div>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="panel p-6 sm:p-8">
            <p className="label !text-gold">Keep these ready</p>
            <ul className="mt-4 space-y-2.5">
              {keepReady.map((t) => <li key={t} className="flex gap-2.5 text-sm"><CircleCheck size={17} className="text-success shrink-0 mt-0.5" />{t}</li>)}
            </ul>
            <div className="mt-8">
              <Link href="/partner/apply" className="btn-gold rounded-xl px-5 py-3 inline-flex items-center gap-2"><ClipboardList size={18} />Apply on the website</Link>
              <p className="text-sm text-muted mt-3 mb-6">Fill in your details and documents here, and onboard once approved. Your application also opens in the app.</p>
              {PARTNER_APP.downloadUrl ? (
                <>
                  <a href={PARTNER_APP.downloadUrl} className="chip !text-sm !py-2.5 !px-4 inline-flex items-center gap-2"><Download size={16} />Or get the QuikFly Partner app (Android)</a>
                  <p className="text-sm text-muted mt-3">Android 7.0+. Older phone or need install steps? <a className="text-gold" href={PARTNER_APP.releaseUrl} target="_blank" rel="noopener noreferrer">See the release page</a>.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold">The QuikFly Partner app is coming soon</p>
                  <p className="text-sm text-muted mt-1">It&apos;s being prepared for Android. Until then, call partner support on <a className="text-gold" href={`tel:${settings.companyPhone.replace(/\s/g, "")}`}>{settings.companyPhone}</a>.</p>
                </>
              )}
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}

/* ───────────── /help ───────────── */

const CATS: Faq["category"][] = ["Rides", "Bus", "Holidays", "Rentals", "Payments", "Account"];

export function HelpScreen() {
  const FAQS = useConfig()?.faqs ?? [];
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<Faq["category"] | "All">("All");
  const shown = useMemo(() => FAQS.filter((f) => (cat === "All" || f.category === cat) && `${f.q} ${f.a}`.toLowerCase().includes(query.toLowerCase())), [FAQS, query, cat]);
  const { user } = useApp();
  const settings = useSettings();
  const wa = whatsappLink(settings.whatsappNumber, "Hi QuikFly, I need help with ");
  const contacts = [
    { icon: Phone, label: "Call us", value: settings.companyPhone, href: `tel:${settings.companyPhone.replace(/[^\d+]/g, "")}` },
    ...(wa ? [{ icon: MessageCircle, label: "WhatsApp", value: settings.whatsappNumber, href: wa }] : []),
    { icon: Mail, label: "Email", value: settings.companyEmail, href: `mailto:${settings.companyEmail}` },
  ].filter((c) => c.value);

  return (
    <>
      <PageHeader crumbs={[["Home", "/"], ["Help centre"]]} title="How can we help?" icon={<Headphones className="text-gold" size={36} />}>
        <div className="relative mt-6 max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-subtle" size={18} />
          <input className="field !pl-11 !py-4 text-base" placeholder="Search e.g. refund, OTP, seat…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search help" />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {(["All", ...CATS] as const).map((c) => <button key={c} data-on={cat === c} onClick={() => setCat(c)} className="chip">{c}</button>)}
        </div>
      </PageHeader>

      <section className="max-w-7xl mx-auto px-4 grid lg:grid-cols-[1fr_340px] gap-8">
        <div>
          {shown.length ? <Accordion key={cat + query} items={shown.map((f) => ({ q: <span className="flex items-center gap-2"><span className="text-[10px] text-gold border border-gold/30 rounded px-1.5">{f.category}</span>{f.q}</span>, a: f.a }))} />
            : <div className="panel"><Empty icon={<Search size={36} />} text={`No answers for "${query}". Try another word or contact us.`} /></div>}
        </div>
        <aside className="space-y-3">
          {contacts.map(({ icon: Icon, label, value, href }, i) => (
            <Reveal key={label} delay={i * 0.08}>
              <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="panel p-5 flex items-center gap-4 hover:border-gold/50 transition-colors">
                <span className="w-11 h-11 rounded-xl bg-gold/10 text-gold grid place-items-center shrink-0"><Icon size={20} /></span>
                <div className="min-w-0"><p className="text-sm text-muted">{label}</p><p className="font-semibold break-words">{value}</p></div>
              </a>
            </Reveal>
          ))}
          <div className="panel p-5">
            <h2 className="font-display text-lg text-strong flex items-center gap-2"><PhoneCall size={18} className="text-gold" /> Request a callback</h2>
            <p className="text-sm text-muted mt-1 mb-4">Leave your number and we&apos;ll call you.</p>
            <CallbackForm idPrefix="help-cb" />
          </div>
          <div className="panel p-5 text-sm text-muted">Have a booking issue? {user ? <>Open a <Link href="/account?tab=support" className="text-gold">support ticket</Link>, or choose the booking in <Link href="/bookings" className="text-gold">My trips</Link> and tap Get help.</> : <>Sign in and open <Link href="/bookings" className="text-gold">My trips</Link>, then tap Get help on the booking.</>}</div>
        </aside>
      </section>
    </>
  );
}

/* ───────────── 404 ───────────── */

export function NotFoundScreen() {
  return (
    <div className="max-w-xl mx-auto px-4 py-24 text-center">
      <motion.p initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring" }} className="font-display text-8xl gold-text">404</motion.p>
      <p className="text-xl mt-4">Looks like this road doesn&apos;t exist.</p>
      <p className="text-muted mt-2">Let&apos;s get you back on route.</p>
      <div className="flex justify-center gap-3 mt-8"><Link href="/" className="btn-gold rounded-xl px-6 py-3">Go home</Link><GhostLink href="/help">Get help</GhostLink></div>
    </div>
  );
}
