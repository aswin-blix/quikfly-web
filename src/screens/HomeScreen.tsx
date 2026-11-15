"use client";
import { motion } from "framer-motion";
import { useRef, useState } from "react";
import {
  ArrowRight, BadgePercent, Headphones, IndianRupee, MapPin, PhoneCall, Quote, Route, ShieldCheck, Share2, Smartphone, Sparkles, Star, Timer, UserCheck, Wallet,
} from "lucide-react";
import { BookingWidget } from "@/components/BookingWidget";
import { SceneArt } from "@/components/SceneArt";
import { CountUp, fadeUp, Magnetic, Marquee, Parallax, Reveal, SplitHeadline, StaggerGroup, Tilt } from "@/components/motion";
import { Accordion, GhostLink, SectionTitle } from "@/components/ui";
import { FAQS, OFFERS, POPULAR_ROUTES, TOURS } from "@/lib/api/data";
import { inr, todayISO } from "@/lib/format";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { Link, qs } from "@/lib/nav";
import { SERVICES } from "@/lib/services";
import { useApp } from "@/components/AppProvider";

export function HomeScreen() {
  return (
    <>
      <Hero />
      <ServicesGrid />
      <ServiceShowcase />
      <Stats />
      <Offers />
      <Popular />
      <Safety />
      <Testimonials />
      <AppDownload />
      <FaqTeaser />
    </>
  );
}

/* ── Hero: GSAP split headline + flying-plane route, Framer booking widget ── */
function Hero() {
  const ref = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.from(".hero-eyebrow", { y: 20, opacity: 0, duration: 0.6 })
      .from(".hero-sub", { y: 20, opacity: 0, duration: 0.7 }, 0.55)
      .from(".hero-cta > *", { y: 20, opacity: 0, stagger: 0.1, duration: 0.6 }, 0.7)
      .from(".hero-widget", { y: 50, opacity: 0, duration: 0.9 }, 0.35)
      .from(".hero-route", { strokeDashoffset: 1600, duration: 2.2, ease: "power2.inOut" }, 0.2);
    gsap.to(".hero-plane", {
      motionPath: { path: ".hero-route", align: ".hero-route", alignOrigin: [0.5, 0.5], autoRotate: true },
      duration: 9, repeat: -1, ease: "none",
    });
    gsap.to(".hero-orb", { y: -30, x: 20, duration: 6, yoyo: true, repeat: -1, ease: "sine.inOut", stagger: 1.5 });
    // Fade hero art as you scroll away
    gsap.to(".hero-art", { opacity: 0.2, y: 120, scrollTrigger: { trigger: ref.current, start: "top top", end: "bottom top", scrub: true } });
  }, { scope: ref });

  return (
    <section ref={ref} className="relative overflow-hidden -mt-16 pt-16">
      <div className="hero-art absolute inset-0 pointer-events-none">
        <div className="hero-orb absolute -top-20 right-[10%] w-[520px] h-[520px] rounded-full bg-gold/20 blur-[120px]" />
        <div className="hero-orb absolute bottom-0 -left-20 w-[380px] h-[380px] rounded-full bg-gold-deep/15 blur-[100px]" />
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1440 800" preserveAspectRatio="none">
          <path className="hero-route" d="M-40 640 C 240 520, 420 700, 700 560 S 1120 260, 1480 180" fill="none" stroke="url(#rg)" strokeWidth="2" strokeDasharray="1600" strokeDashoffset="0" />
          <defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stopColor="#f2c14e" stopOpacity="0" /><stop offset=".5" stopColor="#f2c14e" stopOpacity=".55" /><stop offset="1" stopColor="#f2c14e" stopOpacity="0" /></linearGradient></defs>
          <g className="hero-plane"><path d="M0 -6 L20 0 L0 6 L4 0Z" fill="#ffe7a3" /></g>
        </svg>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 pt-12 sm:pt-20 pb-16 grid grid-cols-1 [&>*]:min-w-0 lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-14 items-center">
        <div>
          <p className="hero-eyebrow inline-flex items-center gap-2 text-xs text-gold-pale border border-gold/30 bg-gold/5 rounded-full px-3 py-1.5">
            <Sparkles size={13} />India&apos;s all-in-one travel super app
          </p>
          <SplitHeadline className="font-display text-[2.6rem] leading-[1.02] sm:text-6xl xl:text-7xl mt-6 tracking-tight" delay={0.15}>
            Every journey. <span className="gold-text">One super app.</span>
          </SplitHeadline>
          <p className="hero-sub text-zinc-400 text-lg mt-6 max-w-lg">
            Bike taxis in minutes, cabs across town, sleeper buses between cities, holidays abroad and rentals for the whole gang. One login, one wallet.
          </p>
          <div className="hero-cta flex flex-wrap gap-3 mt-8">
            <Magnetic><Link href="/cab" className="btn-gold rounded-xl px-6 py-3.5 text-base inline-flex items-center gap-2">Book a ride <ArrowRight size={18} /></Link></Magnetic>
            <Magnetic><GhostLink href="/holidays" className="text-base py-3.5">Plan a holiday</GhostLink></Magnetic>
          </div>
          <div className="hero-cta flex items-center gap-4 mt-10">
            <div className="flex -space-x-2">
              {["A", "P", "R", "S"].map((c, i) => <span key={c} className="w-9 h-9 rounded-full border-2 border-ink grid place-items-center text-xs font-bold text-black" style={{ background: `hsl(${40 + i * 8} 80% ${60 - i * 5}%)` }}>{c}</span>)}
            </div>
            <div className="text-sm"><p className="flex items-center gap-1 text-gold"><Star size={14} className="fill-gold" />4.8 <span className="text-zinc-400">from 1.2L+ reviews</span></p><p className="text-zinc-500">Trusted by riders in 120+ cities</p></div>
          </div>
        </div>
        <div className="hero-widget"><BookingWidget /></div>
      </div>
    </section>
  );
}

/* ── Services grid: Framer stagger + tilt ── */
function ServicesGrid() {
  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      <SectionTitle eyebrow="Our services" title="Where do you want to go today?" />
      <StaggerGroup className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {SERVICES.map((s) => (
          <motion.div key={s.key} variants={fadeUp}>
            <Tilt>
              <Link href={s.href} className="group block gold-border rounded-2xl overflow-hidden">
                <p className="font-display text-center text-sm sm:text-base tracking-wide py-2 gold-text uppercase">{s.title}</p>
                <div className="relative aspect-[3/2] overflow-hidden">
                  <img src={s.image} alt={s.action} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] text-white/90 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all whitespace-nowrap">{s.tagline}</span>
                </div>
                <p className="flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold py-2.5 border-t border-gold/20 group-hover:text-gold transition-colors"><s.icon size={15} />{s.action}</p>
              </Link>
            </Tilt>
          </motion.div>
        ))}
      </StaggerGroup>
    </section>
  );
}

/* ── Pinned horizontal showcase (GSAP ScrollTrigger, desktop only) ── */
function ServiceShowcase() {
  const ref = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
      const el = track.current!;
      const dist = () => el.scrollWidth - window.innerWidth + 64;
      const tween = gsap.to(el, {
        x: () => -dist(), ease: "none",
        scrollTrigger: { trigger: ref.current, start: "top top", end: () => `+=${dist()}`, scrub: 0.6, pin: true, invalidateOnRefresh: true },
      });
      gsap.utils.toArray<HTMLElement>(".show-img").forEach((img) => {
        gsap.fromTo(img, { scale: 1.25 }, { scale: 1, ease: "none", scrollTrigger: { trigger: img, containerAnimation: tween, start: "left right", end: "right left", scrub: true } });
      });
    });
    return () => mm.revert();
  }, { scope: ref });

  return (
    <section ref={ref} className="relative py-16 lg:py-0 lg:h-screen lg:flex lg:flex-col lg:justify-center overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 w-full">
        <SectionTitle eyebrow="One app" title="Six ways to move. Zero app switching." sub="Scroll through everything QuikFly can do for you." />
      </div>
      <div ref={track} className="flex flex-col lg:flex-row gap-5 px-4 lg:pl-[max(1rem,calc((100vw-80rem)/2+1rem))] lg:w-max">
        {SERVICES.map((s, i) => (
          <article key={s.key} className="panel overflow-hidden lg:w-[560px] shrink-0 grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-[1.1fr_1fr]">
            <div className="relative h-56 sm:h-full lg:h-56 xl:h-full overflow-hidden min-h-[220px]">
              <img src={s.image} alt="" className="show-img absolute inset-0 w-full h-full object-cover" />
              <span className="absolute top-3 left-3 font-display text-5xl text-white/20">0{i + 1}</span>
            </div>
            <div className="p-6 flex flex-col">
              <s.icon className="text-gold" size={28} />
              <h3 className="font-display text-2xl mt-3">{s.action}</h3>
              <p className="text-zinc-400 mt-2 text-sm flex-1">{s.blurb}</p>
              <Link href={s.href} className="mt-5 inline-flex items-center gap-2 text-gold text-sm font-semibold group">
                Explore {s.nav} <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Stats() {
  const items: [number, number, string, string][] = [[2, 0, "M+", "Rides completed"], [120, 0, "+", "Cities served"], [4.8, 1, "★", "Average rating"], [15000, 0, "+", "Partner drivers"]];
  return (
    <section className="max-w-7xl mx-auto px-4 py-16">
      <div className="panel gold-border grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-line">
        {items.map(([n, d, suf, l]) => (
          <div key={l} className="p-6 sm:p-8 text-center">
            <CountUp to={n} decimals={d} suffix={suf} className="font-display text-3xl sm:text-5xl gold-text" />
            <p className="text-zinc-400 text-sm mt-2">{l}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Offers: draggable carousel (Framer Motion drag) ── */
function Offers() {
  const wrap = useRef<HTMLDivElement>(null);
  const { toast } = useApp();
  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex items-end justify-between">
        <SectionTitle eyebrow="Offers" title="Deals worth the trip" />
        <Link href="/offers" className="text-gold text-sm mb-10 hidden sm:flex items-center gap-1">View all <ArrowRight size={14} /></Link>
      </div>
      <div ref={wrap} className="overflow-hidden -mx-4 px-4">
        <motion.div drag="x" dragConstraints={wrap} className="flex gap-4 w-max cursor-grab active:cursor-grabbing">
          {OFFERS.map((o) => {
            const s = SERVICES.find((x) => x.key === o.service);
            return (
              <motion.div key={o.id} whileHover={{ y: -6 }} className="w-[300px] sm:w-[340px] rounded-2xl p-6 relative overflow-hidden border border-line select-none"
                style={{ background: `radial-gradient(120% 90% at 100% 0%, hsl(${o.hue} 70% 40% / .35), transparent 60%), #111116` }}>
                <BadgePercent className="text-gold" />
                <p className="font-display text-xl mt-4 leading-tight">{o.title}</p>
                <p className="text-sm text-zinc-400 mt-2">{o.description}</p>
                <div className="flex items-center justify-between mt-6">
                  <button onClick={() => { try { navigator.clipboard.writeText(o.code); } catch { /* ignore */ } toast(`Code ${o.code} copied`); }}
                    className="font-mono text-sm border border-dashed border-gold/60 text-gold px-3 py-1.5 rounded-lg hover:bg-gold/10">{o.code}</button>
                  {s && <Link href={s.href} className="text-xs text-zinc-300 hover:text-gold">Use on {s.nav} →</Link>}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
      <p className="text-xs text-zinc-600 mt-3">Drag to see more →</p>
    </section>
  );
}

function Popular() {
  return (
    <section className="max-w-7xl mx-auto px-4 py-12 grid lg:grid-cols-2 gap-8">
      <Reveal>
        <div className="panel p-6 h-full">
          <p className="label !text-gold mb-1">Popular bus routes</p>
          <h3 className="font-display text-2xl mb-5">Book your next intercity trip</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {POPULAR_ROUTES.map(([a, b]) => (
              <Link key={a + b} href={`/bus/search${qs({ from: a, to: b, date: todayISO(1) })}`}
                className="group flex items-center justify-between px-4 py-3 rounded-xl border border-line hover:border-gold/50 hover:bg-gold/[0.04] transition-colors text-sm">
                <span>{a} <span className="text-zinc-500">→</span> {b}</span><ArrowRight size={14} className="text-zinc-600 group-hover:text-gold group-hover:translate-x-1 transition-all" />
              </Link>
            ))}
          </div>
        </div>
      </Reveal>
      <Reveal delay={0.1}>
        <div className="panel p-6 h-full">
          <p className="label !text-gold mb-1">Trending holidays</p>
          <h3 className="font-display text-2xl mb-5">Where everyone is heading</h3>
          <div className="grid grid-cols-2 gap-3">
            {TOURS.slice(0, 4).map((t) => (
              <Link key={t.id} href={`/holidays/${t.slug}`} className="group relative rounded-xl overflow-hidden aspect-[4/3]">
                <SceneArt tour={t} className="absolute inset-0 w-full h-full transition-transform duration-700 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="absolute bottom-0 p-3"><p className="text-sm font-semibold leading-tight">{t.title}</p><p className="text-xs text-gold">from {inr(t.price)}</p></div>
              </Link>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ── Safety: GSAP scroll-scrubbed progress line ── */
function Safety() {
  const ref = useRef<HTMLElement>(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    gsap.from(".safety-line", { scaleY: 0, transformOrigin: "top", ease: "none", scrollTrigger: { trigger: ref.current, start: "top 70%", end: "bottom 60%", scrub: true } });
    gsap.utils.toArray<HTMLElement>(".safety-item").forEach((el) => {
      gsap.from(el, { x: -30, opacity: 0, duration: 0.6, scrollTrigger: { trigger: el, start: "top 85%" } });
    });
  }, { scope: ref });
  const items: [typeof ShieldCheck, string, string][] = [
    [UserCheck, "Verified drivers", "Background-checked partners with police verification and training."],
    [Share2, "Share live trip", "Family can follow your ride in real time with one tap."],
    [PhoneCall, "24×7 SOS", "Emergency button connects you to our safety team and local police."],
    [ShieldCheck, "Ride insurance", "Every trip is insured for you and your belongings."],
  ];
  return (
    <section ref={ref} className="max-w-7xl mx-auto px-4 py-16 grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <SectionTitle eyebrow="Safety first" title="Built so your family sleeps easy" sub="Safety isn't a feature we bolted on. It's in every ride, every bus and every rental." />
        <div className="relative pl-8">
          <span className="safety-line absolute left-[11px] top-2 bottom-2 w-px bg-gradient-to-b from-gold to-gold-deep/20" />
          <div className="space-y-6">
            {items.map(([I, t, d]) => (
              <div key={t} className="safety-item relative">
                <span className="absolute -left-8 top-0 w-6 h-6 rounded-full bg-ink border border-gold grid place-items-center"><I size={12} className="text-gold" /></span>
                <p className="font-semibold">{t}</p><p className="text-sm text-zinc-400 mt-0.5">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Parallax amount={80}>
        <div className="relative rounded-3xl overflow-hidden border border-gold/20">
          <img src="/assets/s0.jpg" alt="" className="w-full aspect-[4/3] object-cover" />
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }}
            className="absolute bottom-4 left-4 right-4 sm:right-auto panel p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-300 grid place-items-center"><ShieldCheck size={20} /></span>
            <div><p className="text-sm font-semibold">Trip shared with Amma</p><p className="text-xs text-zinc-400">Live location · ETA 12 min</p></div>
          </motion.div>
        </div>
      </Parallax>
    </section>
  );
}

function Testimonials() {
  const reviews: [string, string, string][] = [
    ["Priya, Chennai", "Bike taxi to office every day. Captain arrives in 3 minutes, helmet always clean.", "Bike Taxi"],
    ["Karthik, Coimbatore", "Booked a sleeper bus and a cab to the bus stand in the same app. Super convenient!", "Bus"],
    ["Fathima, Madurai", "Our Munnar package was perfectly planned. The houseboat night was magical.", "Holidays"],
    ["Rahul, Bengaluru", "Self-drive Creta for a weekend in Coorg. Doorstep delivery, zero hassle.", "Rent a Car"],
    ["Divya, Trichy", "Tempo traveller for 14 of us to Tirupati. Driver was polite and on time.", "Group Travel"],
    ["Arun, Chennai", "Fares are upfront. No arguing with auto drivers anymore.", "Cabs"],
  ];
  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4"><SectionTitle eyebrow="Loved by travellers" title="Real trips. Real people." /></div>
      <Marquee speed={45}>
        {reviews.map(([who, text, svc]) => (
          <figure key={who} className="panel p-6 w-[340px] shrink-0">
            <Quote className="text-gold/60" size={22} />
            <blockquote className="text-sm text-zinc-300 mt-3 leading-relaxed">{text}</blockquote>
            <figcaption className="mt-4 flex items-center justify-between text-xs">
              <span className="text-zinc-400">{who}</span><span className="text-gold border border-gold/30 rounded-full px-2 py-0.5">{svc}</span>
            </figcaption>
          </figure>
        ))}
      </Marquee>
    </section>
  );
}

function AppDownload() {
  return (
    <section className="max-w-7xl mx-auto px-4 py-16">
      <div className="panel gold-border overflow-hidden grid lg:grid-cols-2 items-center">
        <div className="p-8 sm:p-12">
          <Smartphone className="text-gold" size={30} />
          <h2 className="font-display text-3xl sm:text-4xl mt-4">Your next trip is one tap away</h2>
          <p className="text-zinc-400 mt-3">Live tracking, instant OTP, wallet cashback and app-only offers. Android & iOS apps launching soon.</p>
          <ul className="mt-6 space-y-2 text-sm text-zinc-300">
            {[[Timer, "Rides in under 5 minutes"], [Wallet, "QuikFly wallet with instant refunds"], [Headphones, "In-app 24×7 support"]].map(([I, t]) => {
              const Icon = I as typeof Timer;
              return <li key={t as string} className="flex items-center gap-2"><Icon size={16} className="text-gold" />{t as string}</li>;
            })}
          </ul>
          <div className="flex gap-3 mt-8">
            {["Google Play", "App Store"].map((s) => (
              <motion.span key={s} whileHover={{ y: -3 }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold"><Smartphone size={16} />{s}</motion.span>
            ))}
          </div>
        </div>
        <div className="relative h-[420px] flex items-end justify-center overflow-hidden bg-gradient-to-br from-gold/10 to-transparent">
          <Parallax amount={100} className="w-[230px]">
            <PhoneMock />
          </Parallax>
        </div>
      </div>
    </section>
  );
}

function PhoneMock() {
  return (
    <div className="w-[230px] h-[460px] rounded-[2.4rem] border-[6px] border-zinc-800 bg-ink shadow-2xl overflow-hidden mx-auto translate-y-16">
      <div className="h-6 flex justify-center"><span className="w-20 h-4 bg-zinc-800 rounded-b-xl" /></div>
      <div className="p-3 space-y-2">
        <img src="/assets/logo.jpg" alt="" className="rounded-lg" />
        <div className="grid grid-cols-3 gap-1.5">
          {SERVICES.map((s) => <div key={s.key} className="rounded-lg overflow-hidden border border-gold/20"><img src={s.image} alt="" className="aspect-square object-cover" /><p className="text-[8px] text-center py-0.5">{s.nav}</p></div>)}
        </div>
        <div className="rounded-lg bg-smoke p-2 text-[9px] space-y-1">
          <p className="flex items-center gap-1"><MapPin size={9} className="text-emerald-400" />T. Nagar</p>
          <p className="flex items-center gap-1"><Route size={9} className="text-gold" />Chennai Airport</p>
        </div>
        <div className="btn-gold rounded-lg text-[10px] text-center py-1.5 flex items-center justify-center gap-1"><IndianRupee size={9} />Book Mini · ₹313</div>
      </div>
    </div>
  );
}

function FaqTeaser() {
  const [items] = useState(() => FAQS.filter((_, i) => [0, 3, 6, 8].includes(i)));
  return (
    <section className="max-w-4xl mx-auto px-4 py-16">
      <SectionTitle center eyebrow="Questions" title="Good to know" />
      <Accordion items={items.map((f) => ({ q: f.q, a: f.a }))} defaultOpen={0} />
      <p className="text-center mt-6"><Link href="/help" className="text-gold text-sm">Visit the help centre →</Link></p>
    </section>
  );
}

