"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Caravan, Check, Fuel, Route, ShieldCheck, Users, X } from "lucide-react";
import { useApp } from "@/components/AppProvider";
import { Reveal, TweenNumber } from "@/components/motion";
import { Counter, GoldButton, PageHeader, SectionTitle, Segmented } from "@/components/ui";
import { useConfig, useSettings } from "@/components/ConfigProvider";
import { useTravelVehicles } from "@/components/catalog-hooks";
import { api } from "@/lib/api";
import { cx, inr, prettyDate, todayISO } from "@/lib/format";
import { useNav, useQuery } from "@/lib/nav";
import { groupBillKm, priceGroup, sumLines, type TravelVehicle } from "@quikfly/shared";

const vehicleImg = (v: TravelVehicle) => (v.seats <= 7 ? "/assets/s4.jpg" : v.seats >= 26 ? "/assets/s2.jpg" : "/assets/s5.jpg");

export function TravelRentalsScreen() {
  const q = useQuery();
  const { setDraft, toast } = useApp();
  const nav = useNav();
  const settings = useSettings();
  const destinations = useConfig()?.groupDestinations ?? [];
  const [pricing, setPricing] = useState<string | null>(null);
  const [type, setType] = useState<"outstation" | "local">("outstation");
  const [dest, setDest] = useState("Pondicherry");
  const [date, setDate] = useState(q.get("date") || todayISO(2));
  const [days, setDays] = useState(2);
  const [pax, setPax] = useState(Number(q.get("pax")) || 10);
  const vehicles = useTravelVehicles() ?? [];
  const [compare, setCompare] = useState<string[]>([]);
  const destination = destinations.find((d) => d.name === dest) ?? destinations[0];
  const oneWayKm = destination?.km ?? 0;
  // Live estimates (same maths and settings as the API); book() charges the API's quote.
  const billKm = (v: TravelVehicle) => groupBillKm(v, type, oneWayKm, days, settings);
  const estimate = (v: TravelVehicle) => sumLines(priceGroup(v, type, oneWayKm, days, settings));
  const fits = vehicles.filter((v) => v.seats >= pax);

  async function book(v: TravelVehicle) {
    setPricing(v.id);
    let quote;
    try {
      quote = await api.quotes.create({ service: "rentals", vehicleId: v.id, trip: type, destinationId: type === "outstation" ? destination?.id : undefined, days });
    } catch (e) {
      toast((e as Error).message, "err");
      setPricing(null);
      return;
    }
    setDraft({
      service: "rentals", title: v.name, subtitle: type === "local" ? `Chennai local · ${days} day(s)` : `Chennai ⇄ ${dest} round trip`, image: vehicleImg(v),
      summary: [["Trip", type === "local" ? `Local · 8 hr / ${settings.groupLocalKmPerDay} km per day` : `Round trip to ${dest}`], ["Start", prettyDate(date)], ["Days", String(days)], ["Passengers", String(pax)], ["Billable distance", `${billKm(v)} km`]],
      quote,
      travellers: ["Lead traveller"],
      policy: "Free cancellation up to 48 hours before trip start. Tolls, parking & state permits paid on actuals.",
    });
    nav.push("/checkout");
  }

  const toggleCompare = (id: string) => setCompare((c) => c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? c : [...c, id]);
  const comparing = vehicles.filter((v) => compare.includes(v.id));

  return (
    <>
      <PageHeader crumbs={[["Home", "/"], ["Group Travel"]]} title="Travel rentals for groups" icon={<Caravan className="text-gold" size={36} />}
        sub="Family trips, pilgrimages, weddings and corporate outings. Tempo travellers to 45-seat coaches with experienced drivers.">
        <div className="panel gold-border p-4 mt-8 grid md:grid-cols-[auto_1fr_1fr_auto_auto] gap-4 items-end">
          <Segmented id="trip-type" value={type} onChange={setType} options={[["outstation", "Outstation"], ["local", "Local"]]} />
          {type === "outstation" ? (
            <div><label className="label" htmlFor="dst">Chennai to</label>
              <select id="dst" className="field mt-1.5" value={dest} onChange={(e) => setDest(e.target.value)}>{destinations.map((d) => <option key={d.id}>{d.name}</option>)}</select></div>
          ) : <div><p className="label">Package</p><div className="field mt-1.5 text-muted">8 hrs / {settings.groupLocalKmPerDay} km per day</div></div>}
          <div><label className="label" htmlFor="tdate">Start date</label><input id="tdate" type="date" className="field mt-1.5" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="min-w-[140px]"><p className="label mb-2">Days</p><Counter label="" value={days} min={1} max={15} onChange={setDays} /></div>
          <div className="min-w-[140px]"><p className="label mb-2">Passengers</p><Counter label="" value={pax} min={1} max={45} onChange={setPax} /></div>
        </div>
      </PageHeader>

      <section className="max-w-7xl mx-auto px-4">
        <p className="text-sm text-muted mb-4">{fits.length} vehicles seat {pax}+ {type === "outstation" && <>· ~{oneWayKm * 2} km round trip</>} · tolls & permits extra · tick up to 3 to compare</p>
        <motion.div layout className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          <AnimatePresence mode="popLayout">
            {fits.map((v) => (
              <motion.div key={v.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} whileHover={{ y: -6 }}
                className={cx("panel overflow-hidden flex flex-col group", compare.includes(v.id) && "!border-gold/60")}>
                <div className="on-media relative h-40 overflow-hidden">
                  <img src={vehicleImg(v)} alt={v.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  <label className="absolute top-3 right-3 flex items-center gap-1.5 text-xs bg-black/60 backdrop-blur px-2 py-1 rounded cursor-pointer">
                    <input type="checkbox" checked={compare.includes(v.id)} onChange={() => toggleCompare(v.id)} className="accent-brand" />Compare
                  </label>
                </div>
                <div className="p-5 flex-1 flex flex-col gap-3">
                  <div className="flex items-center justify-between"><p className="font-semibold text-lg">{v.name}</p><span className="text-xs flex items-center gap-1 text-muted"><Users size={12} />{v.seats}</span></div>
                  <div className="flex flex-wrap gap-1.5">{v.features.map((f) => <span key={f} className="text-[11px] text-muted border border-line rounded-full px-2 py-0.5">{f}</span>)}</div>
                  <p className="text-xs text-subtle">{type === "local" ? `${inr(v.localPackage)} per day` : `${inr(v.perKm)}/km · min ${v.minKmPerDay} km/day · bata ${inr(v.driverBataPerDay)}/day`}</p>
                  <div className="mt-auto pt-3 border-t border-line flex items-end justify-between">
                    <div><p className="text-[11px] text-subtle">Estimated fare</p><TweenNumber value={estimate(v)} format={inr} className="text-xl font-bold text-gold" /></div>
                    <GoldButton className="!py-2 !px-4 text-sm" loading={pricing === v.id} onClick={() => book(v)}>Book</GoldButton>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </section>

      <AnimatePresence>
        {comparing.length >= 2 && (
          <motion.div initial={{ y: 120 }} animate={{ y: 0 }} exit={{ y: 120 }} transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="fixed bottom-[var(--bottom-nav-offset)] inset-x-0 z-30 bg-coal/95 backdrop-blur-xl border-t border-gold/30">
            <div className="max-w-7xl mx-auto px-4 py-4 overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead><tr className="text-left text-subtle"><th className="font-normal pb-2">Compare</th>{comparing.map((v) => <th key={v.id} className="pb-2 font-semibold text-strong">{v.name}</th>)}<th className="w-8"><button onClick={() => setCompare([])} aria-label="Close compare"><X size={16} /></button></th></tr></thead>
                <tbody className="text-soft">
                  {[["Seats", (v: TravelVehicle) => v.seats], ["Per km", (v: TravelVehicle) => inr(v.perKm)], ["Driver bata/day", (v: TravelVehicle) => inr(v.driverBataPerDay)], ["Your estimate", (v: TravelVehicle) => <b className="text-gold">{inr(estimate(v))}</b>]].map(([l, f]) => (
                    <tr key={l as string} className="border-t border-line"><td className="py-1.5 text-subtle">{l as string}</td>{comparing.map((v) => <td key={v.id}>{(f as (v: TravelVehicle) => React.ReactNode)(v)}</td>)}<td /></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <section className="max-w-7xl mx-auto px-4 pt-20">
        <SectionTitle eyebrow="Why group travel with us" title="Everyone arrives together, happy" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[[ShieldCheck, "Experienced drivers", "10+ years on highways, verified & courteous."], [Route, "Transparent billing", "Per-km pricing with minimums shown upfront."], [Fuel, "Fuel included", "Fuel included in per-km rate; no surprise top-ups."], [Check, "Clean & checked", "Every vehicle inspected and cleaned before pickup."]].map(([I, t, d], i) => {
            const Icon = I as typeof Route;
            return <Reveal key={t as string} delay={i * 0.08}><div className="panel p-6 h-full"><Icon className="text-gold" /><p className="font-semibold mt-4">{t as string}</p><p className="text-sm text-muted mt-1">{d as string}</p></div></Reveal>;
          })}
        </div>
      </section>
    </>
  );
}
