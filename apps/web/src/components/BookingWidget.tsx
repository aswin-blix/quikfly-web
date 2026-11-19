"use client";
// Home-page quick search (MakeMyTrip/Ola pattern): one card, a tab per service,
// each tab hands its inputs to the dedicated service page via the URL.
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { ArrowLeftRight, ArrowRight, MapPin, Navigation } from "lucide-react";
import { cx, todayISO } from "@/lib/format";
import { defaultRentalWindow } from "@/lib/rentals";
import { qs, useNav } from "@/lib/nav";
import { SERVICES } from "@/lib/services";
import { useServiceOn } from "./ServiceGate";
import type { ServiceKey, TourTheme } from "@quikfly/shared";
import { GoldButton, Segmented } from "./ui";
import { useConfig } from "./ConfigProvider";

type Tab = "ride" | "bus" | "tours" | "rent" | "rentals";
const TABS: [Tab, ServiceKey, string][] = [["ride", "car", "Rides"], ["bus", "bus", "Bus"], ["tours", "tours", "Holidays"], ["rent", "rent", "Rent a Car"], ["rentals", "rentals", "Group"]];

export function BookingWidget() {
  const isOn = useServiceOn();
  // Rides stay while either bikes or cabs are open; paused services drop out.
  const tabs = TABS.filter(([k, sk]) => (k === "ride" ? isOn("car") || isOn("bike") : isOn(sk)));
  const [picked, setTab] = useState<Tab>("ride");
  const tab = tabs.some(([k]) => k === picked) ? picked : tabs[0]?.[0];
  if (!tab) return null;
  return (
    <div className="panel gold-border p-2 shadow-[0_40px_120px_-40px_var(--accent-glow)]">
      <div className="flex overflow-x-auto scrollbar-thin gap-1 p-1" role="tablist">
        {tabs.map(([k, sk, label]) => {
          const s = SERVICES.find((x) => x.key === sk)!;
          return (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cx("relative flex-1 min-w-[62px] sm:min-w-[84px] flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium transition-colors", tab === k ? "text-gold" : "text-muted hover:text-strong")}>
              {tab === k && <motion.span layoutId="widget-tab" className="absolute inset-0 rounded-xl bg-gold/10 border border-gold/30" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
              <s.icon size={20} className="relative" /><span className="relative">{label}</span>
            </button>
          );
        })}
      </div>
      <div className="p-4 sm:p-5 min-h-[248px]">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {tab === "ride" && <RideForm />}
            {tab === "bus" && <BusForm />}
            {tab === "tours" && <ToursForm />}
            {tab === "rent" && <RentForm />}
            {tab === "rentals" && <RentalsForm />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function RideForm() {
  const PLACES = useConfig()?.places ?? [];
  const nav = useNav();
  const isOn = useServiceOn();
  const kinds = ([["bike", "Bike / Auto"], ["cab", "Cab"]] as const).filter(([k]) => isOn(k === "bike" ? "bike" : "car"));
  const [picked, setKind] = useState<"bike" | "cab">("cab");
  const kind = kinds.some(([k]) => k === picked) ? picked : kinds[0][0];
  const [from, setFrom] = useState("p3");
  const [to, setTo] = useState("p2");
  return (
    <div className="space-y-3">
      {kinds.length > 1 && <Segmented id="ride-kind" value={kind} onChange={setKind} options={kinds.map(([k, l]) => [k, l] as [typeof k, string])} />}
      <div className="grid sm:grid-cols-2 gap-3">
        <Select label="Pickup" icon={<MapPin size={16} className="text-success" />} value={from} onChange={setFrom} options={PLACES.map((p) => [p.id, p.name])} />
        <Select label="Drop" icon={<Navigation size={16} className="text-gold" />} value={to} onChange={setTo} options={PLACES.filter((p) => p.id !== from).map((p) => [p.id, p.name])} />
      </div>
      <GoldButton className="w-full sm:w-auto" onClick={() => nav.push(`/${kind === "bike" ? "bike-taxi" : "cab"}${qs({ from, to })}`)}>See fares <ArrowRight size={18} /></GoldButton>
    </div>
  );
}

function BusForm() {
  const CITIES = (useConfig()?.cities ?? []).map((c) => c.name);
  const nav = useNav();
  const [from, setFrom] = useState("Chennai");
  const [to, setTo] = useState("Bengaluru");
  const [date, setDate] = useState(todayISO(1));
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
        <Select label="From" value={from} onChange={setFrom} options={CITIES.map((c) => [c, c])} />
        <motion.button whileTap={{ rotate: 180 }} onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap cities"
          className="hidden sm:grid w-10 h-10 mb-1 rounded-full border border-line place-items-center hover:border-gold"><ArrowLeftRight size={16} /></motion.button>
        <Select label="To" value={to} onChange={setTo} options={CITIES.filter((c) => c !== from).map((c) => [c, c])} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[160px]"><label className="label">Date</label><input type="date" className="field mt-1.5" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <GoldButton onClick={() => nav.push(`/bus/search${qs({ from, to, date })}`)}>Search buses <ArrowRight size={18} /></GoldButton>
      </div>
    </div>
  );
}

const THEMES: [TourTheme | "all", string][] = [["all", "All"], ["beach", "Beaches"], ["hills", "Hill stations"], ["spiritual", "Spiritual"], ["women", "Women only"], ["seniors", "Seniors"], ["international", "International"], ["weekend", "Weekend"], ["heritage", "Heritage"]];

function ToursForm() {
  const nav = useNav();
  const [theme, setTheme] = useState<TourTheme | "all">("all");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">What kind of holiday are you dreaming of?</p>
      <div className="flex flex-wrap gap-2">
        {THEMES.map(([k, l]) => <button key={k} data-on={theme === k} onClick={() => setTheme(k)} className="chip">{l}</button>)}
      </div>
      <GoldButton onClick={() => nav.push(`/holidays${qs({ theme: theme === "all" ? undefined : theme })}`)}>Explore packages <ArrowRight size={18} /></GoldButton>
    </div>
  );
}

function RentForm() {
  const CITIES = (useConfig()?.cities ?? []).map((c) => c.name);
  const nav = useNav();
  const [city, setCity] = useState("Chennai");
  const [start, setStart] = useState(() => defaultRentalWindow().start);
  const [end, setEnd] = useState(() => defaultRentalWindow().end);
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <Select label="City" value={city} onChange={setCity} options={CITIES.map((c) => [c, c])} />
        <div><label className="label">Pickup</label><input type="datetime-local" className="field mt-1.5" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div><label className="label">Return</label><input type="datetime-local" className="field mt-1.5" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      <GoldButton onClick={() => nav.push(`/rent-a-car${qs({ city, start, end })}`)}>Find cars <ArrowRight size={18} /></GoldButton>
    </div>
  );
}

function RentalsForm() {
  const nav = useNav();
  const [pax, setPax] = useState(10);
  const [date, setDate] = useState(todayISO(3));
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="label">Travel date</label><input type="date" className="field mt-1.5" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div>
          <label className="label">Passengers · {pax}</label>
          <input type="range" min={2} max={45} value={pax} onChange={(e) => setPax(+e.target.value)} className="w-full mt-4 accent-brand" />
        </div>
      </div>
      <GoldButton onClick={() => nav.push(`/travel-rentals${qs({ pax, date })}`)}>See vehicles <ArrowRight size={18} /></GoldButton>
    </div>
  );
}

export function Select({ label, value, onChange, options, icon }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; icon?: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative mt-1.5">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2">{icon}</span>}
        <select className={cx("field appearance-none", !!icon && "!pl-9")} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    </div>
  );
}
