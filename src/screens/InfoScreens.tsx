"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { BadgePercent, Bike, Bus, Car, CircleCheck, Compass, Copy, Headphones, IndianRupee, Mail, MessageCircle, Phone, Search, TrendingUp, Wallet } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { fadeUp, Reveal, StaggerGroup, Tilt, TweenNumber } from "@/components/motion";
import { Accordion, Empty, GhostLink, GoldButton, PageHeader, SectionTitle, Segmented } from "@/components/ui";
import { FAQS, OFFERS } from "@/lib/api/data";
import { cx, inr } from "@/lib/format";
import { Link } from "@/lib/nav";
import { SERVICES } from "@/lib/services";
import type { Faq } from "@/lib/types";

/* ───────────── /offers ───────────── */

export function OffersScreen() {
  const { toast } = useApp();
  const [filter, setFilter] = useState<string>("all");
  const shown = OFFERS.filter((o) => filter === "all" || o.service === filter);
  return (
    <>
      <PageHeader crumbs={[["Home", "/"], ["Offers"]]} title="Offers & coupons" icon={<BadgePercent className="text-gold" size={36} />} sub="Tap a code to copy it, then apply at checkout.">
        <div className="flex flex-wrap gap-2 mt-6">
          <button data-on={filter === "all"} onClick={() => setFilter("all")} className="chip">All</button>
          {SERVICES.map((s) => <button key={s.key} data-on={filter === s.key} onClick={() => setFilter(s.key)} className="chip">{s.nav}</button>)}
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

const RATES = { bike: 140, auto: 190, cab: 320, coach: 650 } as const;

export function PartnerScreen() {
  const { toast } = useApp();
  const [vehicle, setVehicle] = useState<keyof typeof RATES>("cab");
  const [hours, setHours] = useState(8);
  const [days, setDays] = useState(6);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", city: "Chennai", vehicle: "Cab", reg: "", dl: false, rc: false });
  const weekly = RATES[vehicle] * hours * days;

  const steps = ["About you", "Your vehicle", "Documents"];
  const canNext = step === 0 ? form.name.trim() && /^\d{10}$/.test(form.phone) : step === 1 ? form.reg.trim().length >= 6 : form.dl && form.rc;

  return (
    <>
      <PageHeader crumbs={[["Home", "/"], ["Become a partner"]]} title="Drive with QuikFly. Earn more." icon={<TrendingUp className="text-gold" size={36} />}
        sub="Bike, auto, cab, tempo traveller or bus — join 15,000+ partners earning on their own schedule with weekly payouts." />

      <section className="max-w-7xl mx-auto px-4 grid lg:grid-cols-2 gap-8">
        <Reveal>
          <div className="panel gold-border p-6 sm:p-8 h-full">
            <p className="label !text-gold">Earnings calculator</p>
            <h2 className="font-display text-2xl mt-2">How much could you earn?</h2>
            <div className="mt-6 space-y-6">
              <Segmented id="partner-vehicle" value={vehicle} onChange={setVehicle} className="flex-wrap"
                options={[["bike", <><Bike size={15} />Bike</>], ["auto", "Auto"], ["cab", <><Car size={15} />Cab</>], ["coach", <><Bus size={15} />Coach</>]]} />
              <Slider label="Hours per day" value={hours} min={2} max={14} onChange={setHours} />
              <Slider label="Days per week" value={days} min={1} max={7} onChange={setDays} />
              <div className="rounded-2xl bg-ink/60 border border-line p-5">
                <p className="text-sm text-muted">Estimated weekly earnings</p>
                <TweenNumber value={weekly} format={inr} className="font-display text-5xl gold-text block mt-1" />
                <p className="text-xs text-subtle mt-2">≈ {inr(weekly * 4.3)} per month · after QuikFly commission · varies by city & demand</p>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="panel p-6 sm:p-8 h-full">
            <p className="label !text-gold">Sign up in 3 steps</p>
            <div className="flex gap-2 mt-4">
              {steps.map((s, i) => (
                <div key={s} className="flex-1">
                  <div className="h-1.5 rounded-full bg-line overflow-hidden"><motion.div className="h-full bg-brand" animate={{ width: done || step > i ? "100%" : step === i ? "50%" : "0%" }} /></div>
                  <p className={cx("text-[11px] mt-1.5", step >= i ? "text-gold" : "text-subtle")}>{s}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 min-h-[230px]">
              <AnimatePresence mode="wait">
                {done ? (
                  <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
                    <CircleCheck className="mx-auto text-success" size={56} />
                    <p className="font-display text-2xl mt-4">Application received!</p>
                    <p className="text-sm text-muted mt-2">Our partner team will call {form.name.split(" ")[0]} on +91 {form.phone} within 24 hours.</p>
                  </motion.div>
                ) : (
                  <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-4">
                    {step === 0 && (<>
                      <div><label className="label" htmlFor="pn">Full name</label><input id="pn" className="field mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                      <div><label className="label" htmlFor="pp">Mobile number</label><input id="pp" className="field mt-1.5" inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })} /></div>
                      <div><label className="label" htmlFor="pc">City</label><select id="pc" className="field mt-1.5" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>{["Chennai", "Bengaluru", "Coimbatore", "Madurai", "Hyderabad"].map((c) => <option key={c}>{c}</option>)}</select></div>
                    </>)}
                    {step === 1 && (<>
                      <div><p className="label mb-2">Vehicle type</p><div className="flex flex-wrap gap-2">{["Bike", "Auto", "Cab", "Tempo Traveller", "Bus"].map((v) => <button key={v} type="button" data-on={form.vehicle === v} onClick={() => setForm({ ...form, vehicle: v })} className="chip">{v}</button>)}</div></div>
                      <div><label className="label" htmlFor="pr">Registration number</label><input id="pr" className="field mt-1.5 uppercase" placeholder="TN 09 AB 1234" value={form.reg} onChange={(e) => setForm({ ...form, reg: e.target.value })} /></div>
                    </>)}
                    {step === 2 && (<>
                      <p className="text-sm text-muted">Keep these ready. You&apos;ll upload them in the partner app after verification.</p>
                      {([["dl", "Driving licence"], ["rc", "Vehicle RC & insurance"]] as const).map(([k, l]) => (
                        <label key={k} className={cx("flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-colors", form[k] ? "border-gold/60 bg-gold/5" : "border-line")}>
                          <input type="checkbox" className="accent-brand" checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} />{l}
                        </label>
                      ))}
                    </>)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {!done && (
              <div className="flex justify-between items-center mt-4">
                <button className={cx("text-sm text-muted", step === 0 && "invisible")} onClick={() => setStep(step - 1)}>← Back</button>
                <GoldButton disabled={!canNext} onClick={() => { if (step < 2) setStep(step + 1); else { setDone(true); toast("Application submitted"); } }}>{step < 2 ? "Next" : "Submit application"}</GoldButton>
              </div>
            )}
          </div>
        </Reveal>
      </section>

      <section className="max-w-7xl mx-auto px-4 pt-20">
        <SectionTitle eyebrow="Partner perks" title="More than just rides" />
        <StaggerGroup className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[[Wallet, "Weekly payouts", "Earnings land in your bank every Monday."], [IndianRupee, "Low commission", "Keep more of every fare you earn."], [Headphones, "Partner support", "Dedicated 24×7 helpline for partners."], [Compass, "Smart routing", "Fewer empty km with demand heatmaps."]].map(([I, t, d]) => {
            const Icon = I as typeof Wallet;
            return <motion.div key={t as string} variants={fadeUp} className="panel p-6"><Icon className="text-gold" /><p className="font-semibold mt-4">{t as string}</p><p className="text-sm text-muted mt-1">{d as string}</p></motion.div>;
          })}
        </StaggerGroup>
      </section>
    </>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-2"><span className="text-soft">{label}</span><span className="text-gold font-semibold">{value}</span></div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full accent-brand" aria-label={label} />
    </div>
  );
}

/* ───────────── /help ───────────── */

const CATS: Faq["category"][] = ["Rides", "Bus", "Holidays", "Rentals", "Payments", "Account"];

export function HelpScreen() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<Faq["category"] | "All">("All");
  const shown = useMemo(() => FAQS.filter((f) => (cat === "All" || f.category === cat) && `${f.q} ${f.a}`.toLowerCase().includes(query.toLowerCase())), [query, cat]);

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
          {[[Phone, "Call us 24×7", "1800 123 4567"], [MessageCircle, "WhatsApp", "+91 90000 12345"], [Mail, "Email", "support@quikfly.in"]].map(([I, t, v], i) => {
            const Icon = I as typeof Phone;
            return (
              <Reveal key={t as string} delay={i * 0.08}>
                <div className="panel p-5 flex items-center gap-4">
                  <span className="w-11 h-11 rounded-xl bg-gold/10 text-gold grid place-items-center"><Icon size={20} /></span>
                  <div><p className="text-sm text-muted">{t as string}</p><p className="font-semibold select-all">{v as string}</p></div>
                </div>
              </Reveal>
            );
          })}
          <div className="panel p-5 text-sm text-muted">Have a booking issue? Open <Link href="/bookings" className="text-gold">My trips</Link> and choose the booking for faster help.</div>
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
