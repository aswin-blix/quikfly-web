"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CalendarClock, Car, FileCheck2, Fuel, Gauge, Home, KeyRound, MapPin, Settings2, ShieldCheck, Star, Users } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { Select } from "@/components/BookingWidget";
import { Parallax, Reveal, TweenNumber } from "@/components/motion";
import { Breadcrumbs, Empty, GoldButton, PageHeader, Segmented } from "@/components/ui";
import { api } from "@/lib/api";
import { CITIES, RENTAL_CARS } from "@/lib/api/data";
import { cx, inr, nowLocal, prettyDateTime } from "@/lib/format";
import { Link, qs, useNav, useQuery } from "@/lib/nav";
import type { RentalCar } from "@/lib/types";

const carImg = (c: RentalCar) => (["SUV", "Luxury", "MUV"].includes(c.category) ? "/assets/s4.jpg" : "/assets/s1.jpg");
const hoursBetween = (a: string, b: string) => Math.max(4, Math.ceil((new Date(b).getTime() - new Date(a).getTime()) / 3600000) || 0);

function useTrip() {
  const q = useQuery();
  return {
    city: q.get("city") || "Chennai",
    start: q.get("start") || nowLocal(3),
    end: q.get("end") || nowLocal(27),
    mode: (q.get("mode") as "self" | "driver") || "self",
  };
}

/* ───────────── /rent-a-car ───────────── */

export function RentScreen() {
  const trip = useTrip();
  const [city, setCity] = useState(trip.city);
  const [start, setStart] = useState(trip.start);
  const [end, setEnd] = useState(trip.end);
  const [mode, setMode] = useState<"self" | "driver">(trip.mode);
  const [cars, setCars] = useState<RentalCar[] | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [trans, setTrans] = useState<"any" | "Manual" | "Automatic">("any");
  const [fuel, setFuel] = useState<string[]>([]);
  const [seats7, setSeats7] = useState(false);
  useEffect(() => { setCars(null); api.rentals.cars(city).then(setCars); }, [city]);

  const valid = new Date(end) > new Date(start);
  const hours = hoursBetween(start, end);
  const days = Math.max(1, Math.ceil(hours / 24));
  const price = (c: RentalCar) => c.pricePerHour * hours + (mode === "driver" ? c.driverPerDay * days : 0);
  const toggle = (arr: string[], v: string, set: (x: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const shown = useMemo(() => (cars ?? []).filter((c) =>
    (!cats.length || cats.includes(c.category)) && (trans === "any" || c.transmission === trans) && (!fuel.length || fuel.includes(c.fuel)) && (!seats7 || c.seats >= 7),
  ), [cars, cats, trans, fuel, seats7]);

  return (
    <>
      <PageHeader crumbs={[["Home", "/"], ["Rent a Car"]]} title="Rent a car" icon={<KeyRound className="text-gold" size={36} />}
        sub="Self-drive freedom or a chauffeur for the day. Doorstep delivery, flexible km plans, sanitised cars.">
        <div className="panel gold-border p-4 mt-8 grid md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
          <Select label="City" value={city} onChange={setCity} options={CITIES.map((c) => [c, c])} />
          <div><label className="label" htmlFor="rs">Pickup</label><input id="rs" type="datetime-local" className="field mt-1.5" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><label className="label" htmlFor="re">Return</label><input id="re" type="datetime-local" className="field mt-1.5" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          <Segmented id="rent-mode" value={mode} onChange={setMode} options={[["self", "Self-drive"], ["driver", "With driver"]]} />
          {!valid && <p className="md:col-span-4 text-sm text-danger">Return time must be after pickup.</p>}
        </div>
      </PageHeader>

      <div className="max-w-7xl mx-auto px-4 grid lg:grid-cols-[240px_1fr] gap-6">
        <aside className="panel p-5 h-fit lg:sticky lg:top-24 space-y-5">
          <div><p className="label mb-2">Car type</p><div className="flex flex-wrap gap-2">{["Hatchback", "Sedan", "SUV", "MUV", "Luxury"].map((c) => <button key={c} data-on={cats.includes(c)} onClick={() => toggle(cats, c, setCats)} className="chip !text-xs">{c}</button>)}</div></div>
          <div><p className="label mb-2">Transmission</p><div className="flex flex-wrap gap-2">{(["any", "Manual", "Automatic"] as const).map((t) => <button key={t} data-on={trans === t} onClick={() => setTrans(t)} className="chip !text-xs capitalize">{t}</button>)}</div></div>
          <div><p className="label mb-2">Fuel</p><div className="flex flex-wrap gap-2">{["Petrol", "Diesel", "EV"].map((f) => <button key={f} data-on={fuel.includes(f)} onClick={() => toggle(fuel, f, setFuel)} className="chip !text-xs">{f}</button>)}</div></div>
          <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" className="accent-brand" checked={seats7} onChange={(e) => setSeats7(e.target.checked)} />7 seats or more</label>
          <div className="text-xs text-subtle border-t border-line pt-4 space-y-1"><p>{hours} hrs · {days} day{days > 1 ? "s" : ""}</p><p>{mode === "self" ? "Fuel not included" : "Fuel & driver included"}</p></div>
        </aside>

        <div>
          {!cars && <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-72" />)}</div>}
          {cars && !shown.length && <div className="panel"><Empty icon={<Car size={40} />} text="No cars match these filters." /></div>}
          <motion.div layout className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {shown.map((c) => (
                <motion.div key={c.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} whileHover={{ y: -6 }}
                  className="panel overflow-hidden flex flex-col group">
                  <div className="on-media relative h-40 overflow-hidden">
                    <img src={carImg(c)} alt={c.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    <span className="absolute top-3 left-3 text-[10px] bg-black/60 backdrop-blur px-2 py-1 rounded">{c.category} · {c.year}</span>
                    <span className="absolute top-3 right-3 text-xs flex items-center gap-1 bg-black/60 backdrop-blur px-2 py-1 rounded"><Star size={11} className="fill-gold text-gold" />{c.rating}</span>
                  </div>
                  <div className="p-4 flex-1 flex flex-col gap-2">
                    <p className="font-semibold text-lg">{c.name}</p>
                    <div className="flex gap-3 text-xs text-muted">
                      <span className="flex items-center gap-1"><Users size={12} />{c.seats}</span><span className="flex items-center gap-1"><Settings2 size={12} />{c.transmission}</span><span className="flex items-center gap-1"><Fuel size={12} />{c.fuel}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">{c.features.map((f) => <span key={f} className="text-[10px] text-muted border border-line rounded-full px-2 py-0.5">{f}</span>)}</div>
                    <div className="mt-auto pt-3 border-t border-line flex items-end justify-between">
                      <div><p className="text-[11px] text-subtle">{inr(c.pricePerHour)}/hr</p><p className="text-xl font-bold text-gold">{inr(price(c))}</p></div>
                      <Link href={valid ? `/rent-a-car/${c.id}${qs({ city, start, end, mode })}` : "#"} aria-disabled={!valid}
                        className={cx("btn-gold rounded-xl px-4 py-2 text-sm", !valid && "pointer-events-none opacity-50")}>Select</Link>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </>
  );
}

/* ───────────── /rent-a-car/[id] ───────────── */

const KM_PLANS = [
  { id: "limited", label: "140 km/day", sub: "₹12/km beyond limit", mult: 1 },
  { id: "unlimited", label: "Unlimited km", sub: "Drive as much as you like", mult: 1.25 },
] as const;
const PROTECTION = [
  { id: "standard", label: "Standard", perDay: 199, sub: "You pay up to ₹10,000 for damage" },
  { id: "peace", label: "Peace of mind", perDay: 399, sub: "You pay up to ₹2,000 for damage" },
] as const;

export function RentDetailScreen({ id }: { id: string }) {
  const trip = useTrip();
  const car = RENTAL_CARS.find((c) => c.id === id);
  const { setDraft } = useApp();
  const nav = useNav();
  const [km, setKm] = useState<(typeof KM_PLANS)[number]["id"]>("limited");
  const [prot, setProt] = useState<(typeof PROTECTION)[number]["id"]>("standard");
  const [delivery, setDelivery] = useState<"pickup" | "doorstep">("pickup");

  if (!car) return <div className="max-w-7xl mx-auto px-4 py-20"><Empty icon={<Car size={40} />} text="Car not found." action={<Link href="/rent-a-car" className="text-gold">See all cars</Link>} /></div>;

  const self = trip.mode === "self";
  const hours = hoursBetween(trip.start, trip.end);
  const days = Math.max(1, Math.ceil(hours / 24));
  const plan = KM_PLANS.find((p) => p.id === km)!;
  const protection = PROTECTION.find((p) => p.id === prot)!;
  const rental = Math.round(car.pricePerHour * hours * (self ? plan.mult : 1));
  const lines = [
    { label: `Rental (${hours} hrs${self ? `, ${plan.label}` : ""})`, amount: rental },
    ...(self ? [{ label: `${protection.label} protection`, amount: protection.perDay * days }] : [{ label: `Driver (${days} day${days > 1 ? "s" : ""})`, amount: car.driverPerDay * days }]),
    ...(delivery === "doorstep" ? [{ label: "Doorstep delivery & pickup", amount: 299 }] : []),
    ...(self ? [{ label: "Refundable security deposit", amount: 2000 }] : []),
  ];
  const total = lines.reduce((a, l) => a + l.amount, 0);

  function book() {
    setDraft({
      service: "rent", title: `${car!.name} · ${self ? "Self-drive" : "With driver"}`, subtitle: `${trip.city} · ${car!.category}`, image: carImg(car!),
      summary: [["Pickup", prettyDateTime(trip.start)], ["Return", prettyDateTime(trip.end)], ["Delivery", delivery === "doorstep" ? "Doorstep" : `Self pickup · ${trip.city} hub`], ...(self ? [["Plan", `${plan.label} · ${protection.label}`] as [string, string]] : [])],
      fare: lines, travellers: ["Primary driver"], needsLicence: self,
      policy: "Free cancellation up to 24 hours before pickup. Deposit refunded within 48 hours of return.",
    });
    nav.push("/checkout");
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pt-8">
      <Breadcrumbs items={[["Home", "/"], ["Rent a Car", `/rent-a-car${qs(trip)}`], [car.name]]} />
      <div className="grid lg:grid-cols-[1fr_380px] gap-8 mt-5">
        <div className="space-y-8 min-w-0">
          <div className="on-media relative rounded-3xl overflow-hidden border border-line h-[300px] sm:h-[400px]">
            <Parallax amount={80} className="absolute -inset-y-10 inset-x-0"><img src={carImg(car)} alt={car.name} className="w-full h-full object-cover" /></Parallax>
            <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent" />
            <div className="absolute bottom-5 left-5">
              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="font-display text-3xl sm:text-4xl">{car.name}</motion.h1>
              <p className="text-sm text-soft mt-1 flex items-center gap-2"><Star size={14} className="fill-gold text-gold" />{car.rating} · {car.trips} trips · {car.year} model</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[[Users, `${car.seats} seats`], [Settings2, car.transmission], [Fuel, car.fuel], [Gauge, car.category]].map(([I, l]) => {
              const Icon = I as typeof Users;
              return <Reveal key={l as string}><div className="panel p-4 flex items-center gap-3 text-sm"><Icon size={18} className="text-gold" />{l as string}</div></Reveal>;
            })}
          </div>

          {self && (
            <OptionGroup title="Kilometre plan" id="km" value={km} onChange={setKm}
              options={KM_PLANS.map((p) => [p.id, p.label, p.sub, p.mult > 1 ? "+25%" : "Best value"])} />
          )}
          {self && (
            <OptionGroup title="Damage protection" id="prot" value={prot} onChange={setProt}
              options={PROTECTION.map((p) => [p.id, p.label, p.sub, `${inr(p.perDay)}/day`])} />
          )}
          <OptionGroup title="Delivery" id="del" value={delivery} onChange={setDelivery}
            options={[["pickup", "Self pickup", `QuikFly hub, ${trip.city}`, "Free"], ["doorstep", "Doorstep delivery", "Delivered & collected at your address", inr(299)]]} />

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="panel p-5"><p className="font-semibold flex items-center gap-2"><BadgeCheck size={18} className="text-gold" />Features</p>
              <ul className="mt-3 space-y-1.5 text-sm text-soft">{[...car.features, "Sanitised before every trip", "24×7 roadside assistance"].map((f) => <li key={f}>• {f}</li>)}</ul></div>
            {self ? (
              <div className="panel p-5"><p className="font-semibold flex items-center gap-2"><FileCheck2 size={18} className="text-gold" />Documents needed</p>
                <ul className="mt-3 space-y-1.5 text-sm text-soft"><li>• Driving licence (1+ year old)</li><li>• Aadhaar or passport</li><li>• Driver must be 21+</li></ul></div>
            ) : (
              <div className="panel p-5"><p className="font-semibold flex items-center gap-2"><ShieldCheck size={18} className="text-gold" />Your chauffeur</p>
                <ul className="mt-3 space-y-1.5 text-sm text-soft"><li>• Verified, uniformed driver</li><li>• Fuel & tolls on actuals</li><li>• Night charge ₹250 after 10 PM</li></ul></div>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 h-fit">
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="panel gold-border p-5 space-y-4">
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2"><MapPin size={15} className="text-gold" />{trip.city}</p>
              <p className="flex items-center gap-2"><CalendarClock size={15} className="text-gold" />{prettyDateTime(trip.start)} → {prettyDateTime(trip.end)}</p>
              <p className="flex items-center gap-2">{delivery === "doorstep" ? <Home size={15} className="text-gold" /> : <KeyRound size={15} className="text-gold" />}{self ? "Self-drive" : "With driver"}</p>
            </div>
            <div className="border-t border-line pt-3 space-y-1.5 text-sm">
              <AnimatePresence initial={false}>
                {lines.map((l) => (
                  <motion.div key={l.label} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex justify-between gap-3">
                    <span className="text-muted">{l.label}</span><span>{inr(l.amount)}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <div className="border-t border-line pt-3 flex justify-between items-end">
              <span className="text-sm text-muted">Total</span><TweenNumber value={total} format={inr} className="text-2xl font-bold text-gold" />
            </div>
            <GoldButton className="w-full" onClick={book}>Continue to book</GoldButton>
            <p className="text-[11px] text-subtle text-center">Free cancellation up to 24 hrs before pickup</p>
          </motion.div>
        </aside>
      </div>
    </div>
  );
}

function OptionGroup<T extends string>({ title, id, value, onChange, options }: { title: string; id: string; value: T; onChange: (v: T) => void; options: [T, string, string, string][] }) {
  return (
    <div>
      <p className="label mb-3">{title}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {options.map(([v, l, sub, badge]) => (
          <button key={v} onClick={() => onChange(v)} className="relative text-left rounded-2xl border border-line p-4 hover:border-line-strong transition-colors" aria-pressed={value === v}>
            {value === v && <motion.span layoutId={`opt-${id}`} className="absolute inset-0 rounded-2xl border-2 border-gold bg-gold/[0.06]" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
            <span className="relative flex justify-between gap-2"><span className="font-semibold">{l}</span><span className="text-xs text-gold">{badge}</span></span>
            <span className="relative block text-xs text-muted mt-1">{sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
