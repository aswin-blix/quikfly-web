"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import { BedDouble, CalendarDays, Camera, Car, Check, Clock, Hotel, Palmtree, Plane, ShieldCheck, Star, Utensils } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { SceneArt } from "@/components/SceneArt";
import { Reveal, Tilt, TweenNumber } from "@/components/motion";
import { Breadcrumbs, Counter, Empty, GoldButton, PageHeader, SectionTitle, Segmented } from "@/components/ui";
import { TOURS } from "@/lib/api/data";
import { cx, inr, prettyDate, todayISO } from "@/lib/format";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { Link, useNav, useQuery } from "@/lib/nav";
import type { TourPackage, TourTheme } from "@/lib/types";

const THEMES: [TourTheme | "all", string][] = [["all", "All"], ["beach", "Beaches"], ["hills", "Hill stations"], ["international", "International"], ["weekend", "Weekend"], ["heritage", "Heritage"]];

/* ───────────── /holidays ───────────── */

export function HolidaysScreen() {
  const q = useQuery();
  const [theme, setTheme] = useState<TourTheme | "all">((q.get("theme") as TourTheme) || "all");
  const [dur, setDur] = useState<"any" | "short" | "mid" | "long">("any");
  const [budget, setBudget] = useState(70000);
  const [sort, setSort] = useState<"popular" | "price" | "duration">("popular");

  const shown = useMemo(() => {
    const l = TOURS.filter((t) =>
      (theme === "all" || t.themes.includes(theme)) &&
      (dur === "any" || (dur === "short" ? t.days <= 3 : dur === "mid" ? t.days >= 4 && t.days <= 5 : t.days >= 6)) &&
      t.price <= budget);
    return l.sort((a, b) => sort === "price" ? a.price - b.price : sort === "duration" ? a.days - b.days : b.rating - a.rating);
  }, [theme, dur, budget, sort]);

  return (
    <>
      <PageHeader crumbs={[["Home", "/"], ["Holidays"]]} title="Holiday packages" icon={<Palmtree className="text-gold" size={36} />}
        sub="Handpicked itineraries with hotels, transfers and sightseeing sorted. Just pack your bags.">
        <div className="mt-6 flex flex-wrap gap-2">
          {THEMES.map(([k, l]) => (
            <button key={k} onClick={() => setTheme(k)} className={cx("relative px-4 py-2 rounded-full text-sm border transition-colors", theme === k ? "text-black border-transparent font-semibold" : "border-line text-zinc-300 hover:border-zinc-500")}>
              {theme === k && <motion.span layoutId="theme-pill" className="absolute inset-0 rounded-full btn-gold" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
              <span className="relative">{l}</span>
            </button>
          ))}
        </div>
      </PageHeader>

      <section className="max-w-7xl mx-auto px-4">
        <div className="panel p-4 flex flex-wrap items-center gap-4 mb-6">
          <Segmented id="dur" value={dur} onChange={setDur} options={[["any", "Any length"], ["short", "1–3 days"], ["mid", "4–5 days"], ["long", "6+ days"]]} />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-zinc-400 whitespace-nowrap">Budget up to</span>
            <input type="range" min={5000} max={70000} step={1000} value={budget} onChange={(e) => setBudget(+e.target.value)} className="accent-[#f2c14e] w-36" aria-label="Budget" />
            <span className="text-gold font-semibold w-20">{inr(budget)}</span>
          </div>
          <select className="field !w-auto !py-2 text-sm ml-auto" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
            <option value="popular">Most popular</option><option value="price">Price: low to high</option><option value="duration">Shortest first</option>
          </select>
        </div>

        <p className="text-sm text-zinc-400 mb-4">{shown.length} package{shown.length !== 1 && "s"}</p>
        {shown.length === 0 && <div className="panel"><Empty icon={<Palmtree size={40} />} text="No packages match. Try a bigger budget or another theme." /></div>}
        <motion.div layout className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence mode="popLayout">
            {shown.map((t) => (
              <motion.div key={t.id} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }} transition={{ duration: 0.3 }}>
                <TourCard t={t} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </section>
    </>
  );
}

function TourCard({ t }: { t: TourPackage }) {
  return (
    <Tilt max={5}>
      <Link href={`/holidays/${t.slug}`} className="group panel overflow-hidden block hover:border-gold/50 transition-colors h-full">
        <div className="relative h-48 overflow-hidden">
          <SceneArt tour={t} className="absolute inset-0 w-full h-full transition-transform duration-700 group-hover:scale-110" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
          {t.tag && <span className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wide bg-gold text-black px-2 py-1 rounded">{t.tag}</span>}
          <span className="absolute top-3 right-3 text-xs flex items-center gap-1 bg-black/60 backdrop-blur px-2 py-1 rounded"><Star size={11} className="fill-gold text-gold" />{t.rating}</span>
          <div className="absolute bottom-3 left-4 right-4">
            <p className="text-xs text-white/70">{t.location}</p>
            <p className="font-display text-xl leading-tight group-hover:text-gold transition-colors">{t.title}</p>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1"><CalendarDays size={13} />{t.days}D / {t.nights}N</span>
            <span className="flex items-center gap-1"><Hotel size={13} />{t.hotelStars}★ hotels</span>
            <span className="flex items-center gap-1"><Utensils size={13} />{t.meals}</span>
          </div>
          <ul className="text-sm text-zinc-300 space-y-1">{t.highlights.map((h) => <li key={h} className="flex gap-2"><Check size={14} className="text-gold mt-0.5 shrink-0" />{h}</li>)}</ul>
          <div className="flex items-end justify-between pt-3 border-t border-line">
            <div><p className="text-[11px] text-zinc-500">per person</p><p className="text-xl font-bold text-gold">{inr(t.price)}</p></div>
            <span className="text-sm text-gold group-hover:translate-x-1 transition-transform">View details →</span>
          </div>
        </div>
      </Link>
    </Tilt>
  );
}

/* ───────────── /holidays/[slug] ───────────── */

export function HolidayDetailScreen({ slug }: { slug: string }) {
  const tour = TOURS.find((t) => t.slug === slug);
  const ref = useRef<HTMLDivElement>(null);
  const { setDraft } = useApp();
  const nav = useNav();
  const [date, setDate] = useState(todayISO(14));
  const [adults, setAdults] = useState(2);
  const [kids, setKids] = useState(0);
  const [tab, setTab] = useState<"itinerary" | "inclusions" | "policies">("itinerary");

  useGSAP(() => {
    if (prefersReducedMotion() || !ref.current) return;
    gsap.to(".detail-art", { yPercent: 25, ease: "none", scrollTrigger: { trigger: ".detail-hero", start: "top top", end: "bottom top", scrub: true } });
    gsap.from(".itin-line", { scaleY: 0, transformOrigin: "top", ease: "none", scrollTrigger: { trigger: ".itin", start: "top 75%", end: "bottom 70%", scrub: true } });
    gsap.utils.toArray<HTMLElement>(".itin-day").forEach((el) => gsap.from(el, { opacity: 0, x: 30, duration: 0.6, scrollTrigger: { trigger: el, start: "top 88%" } }));
  }, { scope: ref, dependencies: [tab] });

  if (!tour) return <div className="max-w-7xl mx-auto px-4 py-20"><Empty icon={<Palmtree size={40} />} text="Package not found." action={<Link href="/holidays" className="text-gold">Browse holidays</Link>} /></div>;

  const kidPrice = Math.round(tour.price * 0.6);
  const subtotal = tour.price * adults + kidPrice * kids;
  const taxes = Math.round(subtotal * 0.05);
  const similar = TOURS.filter((t) => t.id !== tour.id && t.themes.some((x) => tour.themes.includes(x))).slice(0, 3);

  function book() {
    setDraft({
      service: "tours", title: tour!.title, subtitle: `${tour!.location} · ${tour!.days}D/${tour!.nights}N`,
      summary: [["Start date", prettyDate(date)], ["Travellers", `${adults} adult${adults > 1 ? "s" : ""}${kids ? `, ${kids} child${kids > 1 ? "ren" : ""}` : ""}`], ["Hotels", `${tour!.hotelStars}★ · ${tour!.meals}`], ["Includes", tour!.includes.join(", ")]],
      fare: [{ label: `${adults} adult × ${inr(tour!.price)}`, amount: tour!.price * adults }, ...(kids ? [{ label: `${kids} child × ${inr(kidPrice)}`, amount: kidPrice * kids }] : []), { label: "GST (5%)", amount: taxes }],
      travellers: [...Array(adults).fill(0).map((_, i) => `Adult ${i + 1}`), ...Array(kids).fill(0).map((_, i) => `Child ${i + 1}`)],
      policy: tour!.cancellation,
    });
    nav.push("/checkout");
  }

  const facts: [typeof Hotel, string][] = [[Clock, `${tour.days} days / ${tour.nights} nights`], [BedDouble, `${tour.hotelStars}★ hotels`], [Utensils, tour.meals], [tour.includes.some((i) => /flight/i.test(i)) ? Plane : Car, tour.includes.some((i) => /flight/i.test(i)) ? "Flights included" : "Private cab"], [Camera, "Sightseeing"]];

  return (
    <div ref={ref}>
      <section className="detail-hero relative h-[380px] sm:h-[460px] overflow-hidden -mt-16">
        <div className="detail-art absolute inset-0"><SceneArt tour={tour} className="w-full h-full" /></div>
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <div className="relative h-full max-w-7xl mx-auto px-4 flex flex-col justify-end pb-10">
          <Breadcrumbs items={[["Home", "/"], ["Holidays", "/holidays"], [tour.title]]} />
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="font-display text-3xl sm:text-5xl mt-3">{tour.title}</motion.h1>
          <p className="text-zinc-300 mt-2 flex items-center gap-3">{tour.location}<span className="flex items-center gap-1 text-gold"><Star size={14} className="fill-gold" />{tour.rating}</span></p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 grid lg:grid-cols-[1fr_360px] gap-8 mt-6">
        <div className="min-w-0">
          <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }} className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {facts.map(([I, l]) => (
              <motion.div key={l} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }} className="panel p-3 flex flex-col items-center gap-2 text-center text-xs text-zinc-300">
                <I size={20} className="text-gold" />{l}
              </motion.div>
            ))}
          </motion.div>

          <div className="sticky top-16 z-10 bg-ink/90 backdrop-blur mt-8 py-3 -mx-1 px-1">
            <Segmented id="detail-tab" value={tab} onChange={setTab} options={[["itinerary", "Itinerary"], ["inclusions", "Inclusions"], ["policies", "Policies"]]} />
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }} className="mt-4">
              {tab === "itinerary" && (
                <ol className="itin relative pl-10 space-y-5">
                  <span className="itin-line absolute left-[15px] top-2 bottom-2 w-px bg-gradient-to-b from-gold via-gold/50 to-transparent" />
                  {tour.itinerary.map((d, i) => (
                    <li key={i} className="itin-day relative panel p-5">
                      <span className="absolute -left-10 top-5 w-8 h-8 rounded-full bg-ink border border-gold grid place-items-center text-xs text-gold font-bold">{i + 1}</span>
                      <p className="label !text-gold">Day {i + 1}</p>
                      <p className="mt-1">{d}</p>
                    </li>
                  ))}
                </ol>
              )}
              {tab === "inclusions" && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="panel p-5"><p className="font-semibold mb-3">Included</p><ul className="space-y-2 text-sm">{[...tour.includes, ...tour.highlights].map((x) => <li key={x} className="flex gap-2"><Check size={16} className="text-emerald-400 shrink-0" />{x}</li>)}</ul></div>
                  <div className="panel p-5"><p className="font-semibold mb-3">Not included</p><ul className="space-y-2 text-sm text-zinc-400">{["Personal expenses", "Entry tickets unless mentioned", "Lunch", "Travel insurance (add at checkout)"].map((x) => <li key={x}>• {x}</li>)}</ul></div>
                </div>
              )}
              {tab === "policies" && (
                <div className="panel p-5 space-y-4 text-sm">
                  <div><p className="font-semibold flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-400" />Cancellation</p><p className="text-zinc-400 mt-1">{tour.cancellation}</p></div>
                  <div><p className="font-semibold">Payment</p><p className="text-zinc-400 mt-1">Pay in full now, or 25% to block and the balance 15 days before travel.</p></div>
                  <div><p className="font-semibold">Customisation</p><p className="text-zinc-400 mt-1">A travel expert calls within 2 hours of booking to tailor hotels and activities.</p></div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <aside className="lg:sticky lg:top-24 h-fit">
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="panel gold-border p-5 space-y-4">
            <div><p className="text-xs text-zinc-500">Starting from</p><p className="text-3xl font-bold text-gold">{inr(tour.price)}<span className="text-sm text-zinc-400 font-normal"> /person</span></p></div>
            <div><label className="label" htmlFor="sd">Start date</label><input id="sd" type="date" className="field mt-1.5" min={todayISO(3)} value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <Counter label="Adults" value={adults} min={1} onChange={setAdults} />
            <Counter label="Children (5–11)" value={kids} min={0} onChange={setKids} />
            <div className="border-t border-line pt-3 flex justify-between items-end">
              <span className="text-sm text-zinc-400">Total incl. GST</span>
              <TweenNumber value={subtotal + taxes} format={inr} className="text-2xl font-bold" />
            </div>
            <GoldButton className="w-full" onClick={book}>Book now</GoldButton>
            <p className="text-[11px] text-zinc-500 text-center">No payment today in demo · Free expert call</p>
          </motion.div>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pt-20">
          <SectionTitle eyebrow="You may also like" title="Similar getaways" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{similar.map((t, i) => <Reveal key={t.id} delay={i * 0.08}><TourCard t={t} /></Reveal>)}</div>
        </section>
      )}
    </div>
  );
}
