"use client";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight, ArrowRight, BusFront, ChevronLeft, ChevronRight, Moon, Navigation, RotateCcw, Search, SlidersHorizontal, Star, Sun, Sunrise, Sunset, Ticket, Users,
} from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { Select } from "@/components/BookingWidget";
import { fadeUp, Marquee, Reveal, StaggerGroup } from "@/components/motion";
import { Accordion, Empty, GoldButton, PageHeader, SectionTitle, Segmented, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { cx, inr, prettyDate, shiftISO, todayISO } from "@/lib/format";
import { Link, qs, useNav, useQuery } from "@/lib/nav";
import { GENDERS, cancelPolicyText, rescheduleAmounts, type Booking, type Bus, type Gender, type PriceQuote, type Seat } from "@quikfly/shared";
import { useConfig, useSettings } from "@/components/ConfigProvider";
import { serviceByKey } from "@/lib/services";

/* ───────────── /bus — landing ───────────── */

export function BusScreen() {
  const BUS_OPERATORS = (useConfig()?.busOperators ?? []).map((o) => o.name);
  const FAQS = useConfig()?.faqs ?? [];
  const POPULAR_ROUTES = (useConfig()?.popularRoutes ?? []).map((r) => [r.from, r.to] as [string, string]);
  return (
    <>
      <PageHeader crumbs={[["Home", "/"], ["Bus"]]} title="Bus tickets" icon={<BusFront className="text-gold" size={36} />}
        sub="Live seat maps, women-first seating and instant wallet refunds.">
        <div className="mt-8"><BusSearchBar /></div>
      </PageHeader>

      <section className="max-w-7xl mx-auto px-4 pt-10">
        <SectionTitle eyebrow="Popular routes" title="Where India travels by bus" />
        <StaggerGroup className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {POPULAR_ROUTES.map(([a, b], i) => (
            <motion.div key={a + b} variants={fadeUp}>
              <Link href={`/bus/search${qs({ from: a, to: b, date: todayISO(1) })}`} className="group panel p-5 flex flex-col gap-3 hover:border-gold/50 transition-colors">
                <div className="flex items-center justify-between"><span className="text-xs text-subtle">{6 + (i % 4) * 2}h journey</span><BusFront size={16} className="text-gold" /></div>
                <p className="font-semibold">{a}</p>
                <div className="flex items-center gap-2 text-subtle"><span className="flex-1 border-t border-dashed border-line" /><ArrowRight size={14} className="group-hover:text-gold group-hover:translate-x-1 transition-all" /></div>
                <p className="font-semibold">{b}</p>
                <p className="text-xs text-gold">from {inr(499 + i * 60)}</p>
              </Link>
            </motion.div>
          ))}
        </StaggerGroup>
      </section>

      <section className="max-w-7xl mx-auto px-4 pt-20">
        <SectionTitle eyebrow="Why QuikFly bus" title="Every detail before you pay" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[[Ticket, "Choose your seat", "Live seat layout with lower/upper berth prices."], [Navigation, "Exact boarding points", "Landmarks and timings for every pickup point."], [Users, "Women-first seating", "Once a woman books, the seat beside her is for women only."], [RotateCcw, "Instant refunds", "Cancel online, refund to wallet instantly."]].map(([I, t, d], i) => {
            const Icon = I as typeof Ticket;
            return <Reveal key={t as string} delay={i * 0.08}><div className="panel p-6 h-full"><Icon className="text-gold" /><p className="font-semibold mt-4">{t as string}</p><p className="text-sm text-muted mt-1">{d as string}</p></div></Reveal>;
          })}
        </div>
      </section>

      <section className="pt-20">
        <div className="max-w-7xl mx-auto px-4"><p className="label mb-4">Top operators</p></div>
        <Marquee speed={35}>
          {BUS_OPERATORS.map((o) => <span key={o} className="px-6 py-3 rounded-xl border border-line text-soft whitespace-nowrap">{o}</span>)}
        </Marquee>
      </section>

      <section className="max-w-4xl mx-auto px-4 pt-20">
        <SectionTitle center eyebrow="FAQ" title="Bus booking help" />
        <Accordion items={FAQS.filter((f) => f.category === "Bus" || f.category === "Payments").map((f) => ({ q: f.q, a: f.a }))} />
      </section>
    </>
  );
}

function BusSearchBar({ initial }: { initial?: { from: string; to: string; date: string } }) {
  const CITIES = (useConfig()?.cities ?? []).map((c) => c.name);
  const nav = useNav();
  const [from, setFrom] = useState(initial?.from ?? "Chennai");
  const [to, setTo] = useState(initial?.to ?? "Bengaluru");
  const [date, setDate] = useState(initial?.date ?? todayISO(1));
  useEffect(() => { if (initial) { setFrom(initial.from); setTo(initial.to); setDate(initial.date); } }, [initial?.from, initial?.to, initial?.date]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form onSubmit={(e) => { e.preventDefault(); nav.push(`/bus/search${qs({ from, to, date })}`); }}
      className="panel gold-border p-4 grid md:grid-cols-[1fr_auto_1fr_200px_auto] gap-3 items-end">
      <Select label="From" value={from} onChange={setFrom} options={CITIES.map((c) => [c, c])} />
      <motion.button type="button" whileTap={{ rotate: 180 }} onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap"
        className="hidden md:grid w-10 h-10 mb-1 rounded-full border border-line place-items-center hover:border-gold"><ArrowLeftRight size={16} /></motion.button>
      <Select label="To" value={to} onChange={setTo} options={CITIES.filter((c) => c !== from).map((c) => [c, c])} />
      <div><label className="label">Date of journey</label><input type="date" className="field mt-1.5" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <GoldButton disabled={from === to}><Search size={18} />Search</GoldButton>
    </form>
  );
}

/* ───────────── /bus/search — results ───────────── */

/** Date strip on the results page: how many days it shows, and how many before the searched date. */
const DATE_STRIP_DAYS = 7;
const DATE_STRIP_BEFORE = 3;

type Slot = "early" | "morning" | "afternoon" | "night";
const SLOTS: [Slot, string, typeof Sun, (h: number) => boolean][] = [
  ["early", "Before 6 AM", Sunrise, (h) => h < 6],
  ["morning", "6 AM – 12 PM", Sun, (h) => h >= 6 && h < 12],
  ["afternoon", "12 PM – 6 PM", Sunset, (h) => h >= 12 && h < 18],
  ["night", "After 6 PM", Moon, (h) => h >= 18],
];

export function BusResultsScreen() {
  const q = useQuery();
  const nav = useNav();
  const from = q.get("from") || "Chennai", to = q.get("to") || "Bengaluru", date = q.get("date") || todayISO(1);
  // ?change=<booking id>: moving a bus booking to another bus or date (see My Trips).
  const changeId = q.get("change");
  const { bookings } = useApp();
  const changing = changeId ? bookings.find((b) => b.id === changeId && b.service === "bus" && b.status === "confirmed") ?? null : null;
  const [buses, setBuses] = useState<Bus[] | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [ops, setOps] = useState<string[]>([]);
  const [maxPrice, setMaxPrice] = useState(3000);
  const [rated, setRated] = useState(false);
  const [sort, setSort] = useState<"depart" | "price" | "rating">("depart");
  const [open, setOpen] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setBuses(null); setOpen(null);
    api.buses.search(from, to, date).then((b) => { setBuses(b); setMaxPrice(Math.max(...b.map((x) => x.fare)) + 100); });
  }, [from, to, date]);

  const shown = useMemo(() => {
    let l = [...(buses ?? [])];
    if (slots.length) l = l.filter((b) => slots.some((s) => SLOTS.find((x) => x[0] === s)![3](+b.depart.slice(0, 2))));
    if (types.includes("AC")) l = l.filter((b) => b.ac);
    if (types.includes("Non AC")) l = l.filter((b) => !b.ac);
    if (types.includes("Sleeper")) l = l.filter((b) => b.sleeper);
    if (types.includes("Seater")) l = l.filter((b) => !b.sleeper);
    if (ops.length) l = l.filter((b) => ops.includes(b.operator));
    if (rated) l = l.filter((b) => b.rating >= 4.3);
    l = l.filter((b) => b.fare <= maxPrice);
    return l.sort((a, b) => sort === "price" ? a.fare - b.fare : sort === "rating" ? b.rating - a.rating : a.depart.localeCompare(b.depart));
  }, [buses, slots, types, ops, rated, maxPrice, sort]);

  const toggle = <T,>(arr: T[], v: T, set: (x: T[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const operators = Array.from(new Set((buses ?? []).map((b) => b.operator)));
  const activeCount = slots.length + types.length + ops.length + (rated ? 1 : 0);
  // A week around the searched date, never starting before today.
  const today = todayISO();
  const stripStart = [shiftISO(date, -DATE_STRIP_BEFORE), today].sort()[1];
  const days = Array.from({ length: DATE_STRIP_DAYS }, (_, i) => shiftISO(stripStart, i));
  const go = (d: string) => nav.replace(`/bus/search${qs(changeId ? { from, to, date: d, change: changeId } : { from, to, date: d })}`);

  const clear = () => { setSlots([]); setTypes([]); setOps([]); setRated(false); if (buses) setMaxPrice(Math.max(...buses.map((x) => x.fare)) + 100); };

  const filters = (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><p className="font-semibold flex items-center gap-2"><SlidersHorizontal size={16} />Filters</p>
        {activeCount > 0 && <button onClick={clear} className="text-xs text-gold">Clear all ({activeCount})</button>}</div>
      <div>
        <p className="label mb-2">Departure time</p>
        <div className="grid grid-cols-2 gap-2">
          {SLOTS.map(([k, l, I]) => (
            <button key={k} onClick={() => toggle(slots, k, setSlots)} data-on={slots.includes(k)}
              className="chip !rounded-xl flex flex-col items-center gap-1 py-2 !text-xs"><I size={16} />{l}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="label mb-2">Bus type</p>
        <div className="flex flex-wrap gap-2">{["AC", "Non AC", "Sleeper", "Seater"].map((t) => <button key={t} data-on={types.includes(t)} onClick={() => toggle(types, t, setTypes)} className="chip !text-xs">{t}</button>)}</div>
      </div>
      <div>
        <p className="label mb-2 flex justify-between">Max price <span className="text-gold normal-case tracking-normal">{inr(maxPrice)}</span></p>
        <input type="range" min={400} max={3000} step={50} value={maxPrice} onChange={(e) => setMaxPrice(+e.target.value)} className="w-full accent-brand" />
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={rated} onChange={(e) => setRated(e.target.checked)} className="accent-brand" />Highly rated (4.3+)</label>
      <div>
        <p className="label mb-2">Operators</p>
        <div className="space-y-2">{operators.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm cursor-pointer text-soft"><input type="checkbox" checked={ops.includes(o)} onChange={() => toggle(ops, o, setOps)} className="accent-brand" />{o}</label>
        ))}</div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 pt-6">
      {changing ? (
        <div className="panel p-4 flex flex-wrap items-center gap-3 border-gold/40" role="note">
          <RotateCcw size={18} className="text-gold shrink-0" />
          <p className="text-sm flex-1 min-w-[12rem]">
            <b className="text-strong">Changing booking {changing.id}</b> ({from} → {to}). Pick {changing.seats.length} seat{changing.seats.length > 1 ? "s" : ""} on another bus or date; the fare difference is settled when you confirm. A ticket can be changed once.
          </p>
          <Link href="/bookings" className="text-sm text-muted hover:text-strong">Cancel change</Link>
        </div>
      ) : <BusSearchBar initial={{ from, to, date }} />}

      <div className="flex items-center gap-2 mt-4">
        <button onClick={() => go(shiftISO(date, -1))} disabled={date <= today} className="p-2 rounded-lg border border-line hover:border-gold disabled:opacity-40 disabled:hover:border-line" aria-label="Previous day"><ChevronLeft size={16} /></button>
        <div className="flex-1 grid grid-cols-7 gap-1 overflow-x-auto">
          {days.map((d) => (
            <button key={d} onClick={() => go(d)} className={cx("relative py-2 rounded-lg text-xs sm:text-sm transition-colors", d === date ? "text-on-brand font-semibold" : "text-muted hover:text-strong")}>
              {d === date && <motion.span layoutId="date-pill" className="absolute inset-0 btn-gold rounded-lg" />}
              <span className="relative">{prettyDate(d)}</span>
            </button>
          ))}
        </div>
        <button onClick={() => go(shiftISO(date, 1))} className="p-2 rounded-lg border border-line hover:border-gold" aria-label="Next day"><ChevronRight size={16} /></button>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr] gap-6 mt-6">
        <aside className="hidden lg:block panel p-5 h-fit sticky top-24">{filters}</aside>
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <p className="text-sm text-muted mr-auto"><b className="text-strong">{buses ? shown.length : "…"} buses</b> · {from} → {to} · {prettyDate(date)}</p>
            <button className="lg:hidden chip flex items-center gap-1" onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal size={14} />Filters{activeCount ? ` (${activeCount})` : ""}</button>
            <Segmented id="bus-sort" value={sort} onChange={setSort} options={[["depart", "Departure"], ["price", "Cheapest"], ["rating", "Top rated"]]} />
          </div>
          <AnimatePresence>{showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="lg:hidden overflow-hidden"><div className="panel p-5 mb-4">{filters}</div></motion.div>
          )}</AnimatePresence>

          {!buses && <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-32" />)}</div>}
          {buses && shown.length === 0 && <div className="panel"><Empty icon={<BusFront size={40} />} text="No buses match these filters." action={<button onClick={clear} className="text-gold text-sm">Clear filters</button>} /></div>}

          <LayoutGroup>
            <div className="space-y-3">
              <AnimatePresence>
                {shown.map((b) => (
                  <motion.div key={b.id} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.3 }}
                    className={cx("panel overflow-hidden", b.operator === "QuikFly Travels" && "gold-border", open === b.id && "!border-gold/60")}>
                    <div className="p-5 grid sm:grid-cols-[1.3fr_1.6fr_auto] gap-4 items-center">
                      <div>
                        <p className="font-semibold flex items-center gap-2 flex-wrap">{b.operator}
                          {b.operator === "QuikFly Travels" && <span className="text-[10px] bg-brand text-on-brand px-1.5 py-0.5 rounded font-bold">OWN FLEET</span>}</p>
                        <p className="text-xs text-muted">{b.type}</p>
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 bg-success/15 text-success px-2 py-0.5 rounded"><Star size={11} className="fill-current" />{b.rating}</span>
                          {b.amenities.length > 0 && <span className="text-subtle truncate">{b.amenities.slice(0, 3).join(" · ")}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div><p className="text-xl font-bold">{b.depart}</p><p className="text-xs text-subtle">{from}</p></div>
                        <div className="flex-1 text-center text-xs text-subtle"><div className="relative h-px bg-line my-1"><span className="absolute left-0 -top-1 w-2 h-2 rounded-full bg-success" /><span className="absolute right-0 -top-1 w-2 h-2 rounded-full bg-brand" /></div>{b.duration}</div>
                        <div className="text-right"><p className="text-xl font-bold">{b.arrive}</p><p className="text-xs text-subtle">{to}</p></div>
                      </div>
                      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2">
                        <div className="sm:text-right"><p className="text-[11px] text-subtle">Starts from</p><p className="text-2xl font-bold text-gold">{inr(b.fare)}</p>
                          <p className={cx("text-xs", b.seatsLeft < 10 ? "text-warning" : "text-muted")}>{b.seatsLeft} seats left</p></div>
                        <GoldButton className="!py-2 text-sm" onClick={() => setOpen(open === b.id ? null : b.id)}>{open === b.id ? "Hide seats" : "View seats"}</GoldButton>
                      </div>
                    </div>
                    <AnimatePresence initial={false}>
                      {open === b.id && (
                        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden border-t border-line">
                          <SeatSelector bus={b} from={from} to={to} date={date} change={changing} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </LayoutGroup>
        </div>
      </div>
    </div>
  );
}

function SeatSelector({ bus, from, to, date, change }: { bus: Bus; from: string; to: string; date: string; change?: Booking | null }) {
  const { setDraft, toast, refreshBookings } = useApp();
  /** Change mode: the new bus's price, shown with the difference before confirming. */
  const [changeQuote, setChangeQuote] = useState<PriceQuote | null>(null);
  const [changing, setChanging] = useState(false);
  const maxSeats = change ? change.seats.length : 6;
  const settings = useSettings();
  const [pricing, setPricing] = useState(false);
  const nav = useNav();
  const [seats, setSeats] = useState<Seat[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  /** Who sits in each picked seat; women-only seats need "female" (the API checks too). */
  const [genders, setGenders] = useState<Record<string, Gender>>({});
  const [priceFilter, setPriceFilter] = useState<"all" | "lower" | "upper">("all");
  const [boarding, setBoarding] = useState(0);
  const [dropping, setDropping] = useState(0);
  useEffect(() => { api.buses.seats({ id: bus.id, from, to }, date).then(setSeats).catch((e: Error) => { toast(e.message, "err"); setSeats([]); }); }, [bus.id, from, to, date, toast]);

  const chosen = (seats ?? []).filter((s) => picked.includes(s.id));
  const total = chosen.reduce((a, s) => a + s.price, 0);
  const decks = (["lower", "upper"] as const).filter((d) => (seats ?? []).some((s) => s.deck === d));
  const deckPrice = (d: "lower" | "upper") => Math.min(...(seats ?? []).filter((s) => s.deck === d).map((s) => s.price));
  const allNamed = chosen.every((s) => genders[s.id]);

  function toggle(s: Seat) {
    setChangeQuote(null);
    if (picked.includes(s.id)) { setPicked((p) => p.filter((x) => x !== s.id)); return; }
    if (picked.length >= maxSeats) { toast(change ? `Pick ${maxSeats} seat${maxSeats > 1 ? "s" : ""}, one for each traveller.` : "You can book up to 6 seats at a time.", "err"); return; }
    setPicked((p) => [...p, s.id]);
    // A change keeps the same travellers: each new seat takes the next traveller's gender.
    const g = s.ladies ? "female" : change?.seats[picked.length]?.gender;
    if (g) setGenders((x) => ({ ...x, [s.id]: g }));
  }
  const drops = [`${to} – Main Bus Stand`, `${to} – Ring Road`, `${to} – City Center`];
  const bTimes = [bus.depart, addMin(bus.depart, 20), addMin(bus.depart, 45)];
  const dTimes = drops.map((_, i) => addMin(bus.arrive, i * 15));

  const tripLines = (): [string, string][] => [["Date", prettyDate(date)], ["Departure", `${bTimes[boarding]} from ${bus.boardingPoints[boarding]}`], ["Arrival", `${dTimes[dropping]} at ${drops[dropping]}`], ["Seats", chosen.map((s) => s.label).join(", ")]];

  /** Moves the booking being changed to these seats (the API settles the difference). */
  async function confirmChange() {
    if (!change || !changeQuote) return;
    setChanging(true);
    try {
      const r = await api.bookings.reschedule(change.id, { quoteId: changeQuote.id, subtitle: `${bus.operator} · ${bus.type}`, lines: tripLines() });
      await refreshBookings();
      const money = r.charged ? `Paid ${inr(r.charged)} more.` : r.refunded ? `${inr(r.refunded)} ${r.booking.payment === "wallet" ? "is back in your wallet" : "refund due"}.` : "Same price.";
      toast(`Booking moved to ${bus.operator}, ${prettyDate(date)} ${bus.depart}. ${money}`);
      nav.replace("/bookings");
    } catch (e) {
      toast((e as Error).message, "err");
      setChangeQuote(null);
    }
    setChanging(false);
  }

  /** Gets the API's price for the chosen seats, then opens checkout with it (or shows the difference when changing). */
  async function proceed() {
    setPricing(true);
    let quote;
    try {
      quote = await api.quotes.create({ service: "bus", busId: bus.id, from, to, date, seatIds: chosen.map((s) => s.id), genders: chosen.map((s) => genders[s.id]) });
    } catch (e) {
      toast((e as Error).message, "err");
      setPricing(false);
      return;
    }
    if (change) { setChangeQuote(quote); setPricing(false); return; }
    setDraft({
      service: "bus", title: `${from} → ${to}`, subtitle: `${bus.operator} · ${bus.type}`, image: serviceByKey("bus").image,
      summary: [["Date", prettyDate(date)], ["Departure", `${bTimes[boarding]} from ${bus.boardingPoints[boarding]}`], ["Arrival", `${dTimes[dropping]} at ${drops[dropping]}`], ["Seats", chosen.map((s) => s.label).join(", ")]],
      quote,
      travellers: chosen.map((s) => `Seat ${s.label} · ${GENDER_LABEL[genders[s.id]]}`),
      policy: cancelPolicyText(settings, "bus"),
    });
    nav.push("/checkout");
  }

  if (!seats) return <div className="py-12 text-center text-gold"><Spinner size={26} /></div>;
  return (
    <div className="p-5 grid xl:grid-cols-[1fr_300px] gap-6 bg-ink/40">
      <div>
        {decks.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="label mr-1">Seat price</span>
            {([["all", "All"], ...decks.map((d) => [d, inr(deckPrice(d))] as const)] as const).map(([k, l]) => (
              <button key={k} data-on={priceFilter === k} onClick={() => setPriceFilter(k as typeof priceFilter)} className="chip !text-xs">{l}</button>
            ))}
          </div>
        )}
        <div className={cx("grid gap-4", decks.length > 1 && "sm:grid-cols-2")}>
          {decks.map((deck) => {
            const deckSeats = seats.filter((s) => s.deck === deck);
            const four = deckSeats.some((s) => s.col === 3);
            return (
              <div key={deck} className={cx("rounded-2xl border border-line p-4 transition-opacity", decks.length === 1 && "max-w-md", priceFilter !== "all" && priceFilter !== deck && "opacity-30")}>
                <div className="flex justify-between items-center mb-3">
                  <p className="label">{decks.length > 1 ? `${deck} deck` : "Seats"} · {inr(deckPrice(deck))}{deckSeats[0]?.sleeper ? " · sleeper" : " · seater"}</p>
                  {deck === "lower" && <span className="text-[10px] text-subtle border border-line rounded px-1.5">Driver</span>}
                </div>
                <div className={cx("grid gap-2", four ? "grid-cols-[1fr_1fr_14px_1fr_1fr]" : "grid-cols-[1fr_1fr_14px_1fr]")}>
                  {deckSeats.map((s) => {
                    const on = picked.includes(s.id);
                    const byWoman = s.booked && s.bookedGender === "female";
                    return (
                      <motion.button key={s.id} disabled={s.booked} whileTap={{ scale: 0.9 }} animate={on ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                        onClick={() => toggle(s)}
                        style={{ gridColumn: s.col < 2 ? s.col + 1 : s.col + 2 }}
                        aria-label={`Seat ${s.label}${s.booked ? (byWoman ? ", sold, booked by a woman" : ", sold") : s.ladies ? ", women only" : ""}, ${inr(s.price)}`} aria-pressed={on}
                        className={cx("rounded-lg border text-[10px] flex flex-col items-center justify-end pb-1 transition-colors", s.sleeper ? "h-16" : "h-11",
                          s.booked ? cx("bg-line/60 text-faint cursor-not-allowed", byWoman ? "border-highlight/50" : "border-line")
                            : on ? "bg-brand border-gold text-on-brand font-bold"
                            : s.ladies ? "border-highlight/60 text-highlight hover:bg-highlight/10"
                            : "border-line-strong hover:border-gold text-soft")}>
                        <span className={cx("w-6 h-1 rounded mb-auto mt-1.5", on ? "bg-black/40" : "bg-current opacity-40")} />
                        {s.booked ? "Sold" : s.label}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted mt-3">
          {[["border-line-strong", "Available"], ["bg-brand border-gold", "Selected"], ["bg-line border-line", "Sold"], ["bg-line border-highlight/50", "Booked by a woman"], ["border-highlight/60", "Women only (next to a woman)"]].map(([c, t]) => (
            <span key={t} className="flex items-center gap-1.5"><span className={cx("w-4 h-4 rounded border", c)} />{t}</span>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <PointList title="Boarding point" items={bus.boardingPoints.map((p, i) => [p, bTimes[i]])} value={boarding} onChange={setBoarding} />
        <PointList title="Dropping point" items={drops.map((p, i) => [p, dTimes[i]])} value={dropping} onChange={setDropping} />
        <div className="rounded-2xl bg-coal border border-line p-4 text-sm space-y-2">
          <div className="flex justify-between"><span className="text-muted">Seats</span><span>{chosen.map((s) => s.label).join(", ") || "—"}</span></div>
          {chosen.length > 0 && (
            <div className="border-t border-line pt-2 space-y-2" role="group" aria-label="Who sits in each seat">
              <p className="text-xs text-muted">Who sits here? Seats next to a woman are for women only.</p>
              {chosen.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <span className="text-xs w-10 shrink-0">{s.label}</span>
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {(s.ladies ? (["female"] as const) : GENDERS).map((g) => (
                      <button key={g} type="button" data-on={genders[s.id] === g} aria-pressed={genders[s.id] === g}
                        onClick={() => setGenders((x) => ({ ...x, [s.id]: g }))} className="chip !text-[11px] !py-1 !px-2.5">{GENDER_LABEL[g]}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between font-bold text-lg"><span>{change ? "New fare (before GST)" : "Amount"}</span><span className="text-gold">{inr(total)}</span></div>
          {change && changeQuote ? (() => {
            const m = rescheduleAmounts(settings, change, changeQuote.total);
            return (
              <div className="border-t border-line pt-2 space-y-2">
                <p className="text-sm text-soft" role="status">
                  New total {inr(changeQuote.total)}{m.fee ? ` plus a ${inr(m.fee)} change fee` : ""}.{" "}
                  {m.charge ? <b className="text-strong">You pay {inr(m.charge)} more{change.payment === "wallet" ? " from your wallet" : ""}.</b>
                    : m.refund ? <b className="text-strong">{inr(m.refund)} {change.payment === "wallet" ? "comes back to your wallet" : "is due back to you"}.</b>
                    : <b className="text-strong">Nothing more to pay.</b>}
                </p>
                <GoldButton className="w-full" loading={changing} onClick={confirmChange}>Change to this bus <ArrowRight size={16} /></GoldButton>
              </div>
            );
          })() : (
            <GoldButton className="w-full" disabled={chosen.length !== (change ? maxSeats : chosen.length) || !chosen.length || !allNamed} loading={pricing} onClick={proceed}>
              {change ? "Check the price" : "Proceed to book"} <ArrowRight size={16} />
            </GoldButton>
          )}
          {!chosen.length && <p className="text-[11px] text-subtle text-center">{change ? `Select ${maxSeats} seat${maxSeats > 1 ? "s" : ""}` : "Select up to 6 seats"}</p>}
          {chosen.length > 0 && !allNamed && <p className="text-[11px] text-subtle text-center">Choose who sits in each seat</p>}
        </div>
      </div>
    </div>
  );
}

function PointList({ title, items, value, onChange }: { title: string; items: [string, string][]; value: number; onChange: (i: number) => void }) {
  return (
    <div>
      <p className="label mb-2">{title}</p>
      <div className="space-y-1.5">
        {items.map(([p, t], i) => (
          <label key={p} className={cx("flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer text-sm transition-colors", value === i ? "border-gold/60 bg-gold/5" : "border-line")}>
            <input type="radio" checked={value === i} onChange={() => onChange(i)} className="accent-brand" />
            <span className="flex-1">{p}</span><span className="text-xs text-muted">{t}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

const GENDER_LABEL: Record<Gender, string> = { female: "Female", male: "Male", other: "Other" };

function addMin(hhmm: string, m: number) {
  const [h, mm] = hhmm.split(":").map(Number);
  const t = (h * 60 + mm + m) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
