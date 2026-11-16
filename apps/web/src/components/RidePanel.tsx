"use client";
// Bike Taxi & Car Ride: pickup/drop → fare options → driver search → live trip.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useHideBottomNav } from "./BottomNav";
import { ArrowUpDown, Clock, MapPin, Navigation, Phone, ShieldCheck, Star, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import { PLACES } from "@quikfly/shared";
import type { FareQuote, PaymentMethod, Place, Ride } from "@quikfly/shared";
import { cx, inr } from "@/lib/format";
import { useApp } from "./AppProvider";
import { CityMap, routePoint, type Pt } from "./CityMap";
import { GoldButton, Spinner } from "./ui";

type Phase = "plan" | "searching" | "arriving" | "ontrip" | "done";

/** Payment options offered for rides (net banking is checkout-only). */
const RIDE_PAYMENTS: PaymentMethod[] = ["upi", "cash", "wallet", "card"];

const ARRIVE_MS = 9000;
const TRIP_MS = 12000;

export function RidePanel({ service, initialFrom, initialTo }: { service: "bike" | "car"; initialFrom?: string | null; initialTo?: string | null }) {
  const { user, requireAuth, refreshBookings, toast } = useApp();
  const [pickup, setPickup] = useState<Place | null>(PLACES.find((p) => p.id === initialFrom) ?? PLACES[2]);
  const [drop, setDrop] = useState<Place | null>(PLACES.find((p) => p.id === initialTo && p.id !== initialFrom) ?? null);
  const [quotes, setQuotes] = useState<FareQuote[] | null>(null);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [payment, setPayment] = useState<PaymentMethod>("upi");
  const [phase, setPhase] = useState<Phase>("plan");
  // Keep the screen focused on the ride once it is booked.
  useHideBottomNav(phase !== "plan");
  const [ride, setRide] = useState<Ride | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [rating, setRating] = useState(0);
  const raf = useRef<number>(0);


  useEffect(() => {
    if (!pickup || !drop || pickup.id === drop.id) { setQuotes(null); return; }
    let live = true;
    setLoadingQuotes(true);
    api.rides.quote(service, pickup.id, drop.id).then((q) => {
      if (!live) return;
      setQuotes(q); setSelected((s) => q.find((x) => x.option.id === s)?.option.id ?? q[0].option.id);
      setLoadingQuotes(false);
    });
    return () => { live = false; };
  }, [pickup, drop, service]);

  // Drive the vehicle animation for arriving / on-trip phases
  useEffect(() => {
    if (phase !== "arriving" && phase !== "ontrip") return;
    const dur = phase === "arriving" ? ARRIVE_MS : TRIP_MS;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setT(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setPhase(phase === "arriving" ? "ontrip" : "done");
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [phase]);

  // Trip over: move the booking from Upcoming to Past.
  useEffect(() => {
    if (phase !== "done" || !bookingId) return;
    api.bookings.complete(bookingId).then(() => refreshBookings(), () => { /* stays upcoming; nothing to show the rider */ });
  }, [phase, bookingId, refreshBookings]);

  const quote = quotes?.find((q) => q.option.id === selected);
  const driverStart: Pt | null = useMemo(() => pickup ? { x: Math.max(4, pickup.x - 14), y: Math.min(96, pickup.y + 12) } : null, [pickup]);
  const vehicle: Pt | null =
    phase === "arriving" && pickup && driverStart ? { x: driverStart.x + (pickup.x - driverStart.x) * t, y: driverStart.y + (pickup.y - driverStart.y) * t }
    : phase === "ontrip" && pickup && drop ? routePoint(pickup, drop, t)
    : phase === "done" && drop ? drop : null;

  function reset() {
    cancelAnimationFrame(raf.current);
    setPhase("plan"); setRide(null); setBookingId(null); setT(0); setRating(0);
  }

  const walletShort = !!user && !!quote && user.walletBalance < quote.fare;

  function book() {
    if (!pickup || !drop || !quote) return;
    requireAuth(async () => {
      setPhase("searching");
      let r: Ride | null = null;
      try {
        r = await api.rides.book({ optionId: quote.option.id, pickupId: pickup.id, dropId: drop.id, payment });
        const b = await api.bookings.create({
          service, title: `${r.quote.option.name} · ${r.drop.name}`, subtitle: `${r.pickup.name} → ${r.drop.name}`, amount: r.quote.fare, payment,
          lines: [["Driver", r.driver.name], ["Vehicle", `${r.driver.vehicle} · ${r.driver.plate}`], ["Ride OTP", r.otp], ["Payment", payment.toUpperCase()], ["Distance", `${r.quote.distanceKm} km`]],
        });
        setRide(r); setBookingId(b.id); setT(0); setPhase("arriving");
        refreshBookings();
      } catch (e) {
        // e.g. the wallet ran short between quote and booking: release the driver.
        if (r) api.rides.cancel(r.id).catch(() => undefined);
        toast((e as Error).message, "err");
        setPhase("plan");
      }
    });
  }

  async function cancelRide() {
    cancelAnimationFrame(raf.current);
    try {
      if (ride) await api.rides.cancel(ride.id);
      if (bookingId) await api.bookings.cancel(bookingId);
      toast("Ride cancelled. No charges applied.");
    } catch (e) { toast((e as Error).message, "err"); }
    refreshBookings(); reset();
  }

  const etaLeft = ride ? Math.max(1, Math.ceil(ride.quote.etaMin * (1 - t))) : 0;
  const tripLeft = ride ? Math.max(1, Math.ceil(ride.quote.durationMin * (1 - t))) : 0;

  return (
    <div className="grid grid-cols-1 [&>*]:min-w-0 lg:grid-cols-[420px_1fr] gap-5">
      <div className="panel p-5">
       <AnimatePresence mode="wait" initial={false}>
        <motion.div key={phase === "arriving" || phase === "ontrip" ? "live" : phase} className="space-y-5"
          initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
        {phase === "plan" && (
          <>
            <div className="relative space-y-2">
              <PlacePicker icon={<span className="w-2.5 h-2.5 rounded-full bg-success" />} placeholder="Pickup location" value={pickup} onChange={setPickup} exclude={drop?.id} />
              <PlacePicker icon={<span className="w-2.5 h-2.5 bg-brand" />} placeholder="Where to?" value={drop} onChange={setDrop} exclude={pickup?.id} />
              <button onClick={() => { setPickup(drop); setDrop(pickup); }} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-smoke border border-line grid place-items-center hover:border-gold" title="Swap">
                <ArrowUpDown size={14} />
              </button>
            </div>

            {!drop && (
              <div>
                <p className="label mb-2">Popular destinations</p>
                <div className="flex flex-wrap gap-2">
                  {PLACES.filter((p) => p.id !== pickup?.id).slice(0, 6).map((p) => (
                    <button key={p.id} className="chip" onClick={() => setDrop(p)}>{p.name}</button>
                  ))}
                </div>
              </div>
            )}

            {loadingQuotes && <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div>}

            {quotes && !loadingQuotes && (
              <div className="space-y-2">
                <p className="label">Choose a ride · {quotes[0].distanceKm} km · ~{quotes[0].durationMin} min</p>
                {quotes.map((q, i) => (
                  <motion.button initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} whileTap={{ scale: 0.98 }} key={q.option.id} onClick={() => setSelected(q.option.id)}
                    className={cx("w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all",
                      selected === q.option.id ? "border-gold bg-gold/[0.07]" : "border-line hover:border-line-strong")}>
                    <img src={service === "bike" ? "/assets/s0.jpg" : q.option.id === "prime" || q.option.id === "suv" ? "/assets/s4.jpg" : "/assets/s1.jpg"} alt="" className="w-16 h-11 object-cover rounded-lg" />
                    <div className="flex-1">
                      <p className="font-semibold flex items-center gap-2">{q.option.name}
                        <span className="text-xs text-muted font-normal flex items-center gap-0.5"><Users size={12} />{q.option.seats}</span>
                      </p>
                      <p className="text-xs text-muted">{q.etaMin} min away · {q.option.description}</p>
                    </div>
                    <p className="font-bold text-lg">{inr(q.fare)}</p>
                  </motion.button>
                ))}
                <div className="flex gap-2 pt-1">
                  {RIDE_PAYMENTS.map((p) => {
                    const short = p === "wallet" && walletShort;
                    return (
                      <button key={p} data-on={payment === p} onClick={() => setPayment(p)} disabled={short}
                        title={short ? `Wallet balance ${inr(user!.walletBalance)} is not enough` : undefined}
                        className="chip uppercase !text-xs disabled:opacity-40 disabled:cursor-not-allowed">{p}</button>
                    );
                  })}
                </div>
                {payment === "wallet" && walletShort && <p className="text-xs text-danger">Wallet balance {inr(user!.walletBalance)} is not enough for this ride. Pick another payment method.</p>}
                <GoldButton className="w-full mt-2 text-base" onClick={book} disabled={payment === "wallet" && walletShort}>Book {quote?.option.name} · {quote && inr(quote.fare)}</GoldButton>
              </div>
            )}
          </>
        )}

        {phase === "searching" && (
          <div className="py-10 text-center space-y-4">
            <div className="relative mx-auto w-24 h-24 grid place-items-center">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="absolute inset-0 rounded-full border border-gold/50"
                  initial={{ scale: 0.3, opacity: 0.9 }} animate={{ scale: 1.4, opacity: 0 }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: "easeOut" }} />
              ))}
              <span className="w-14 h-14 rounded-full btn-gold grid place-items-center"><Spinner size={22} /></span>
            </div>
            <p className="font-semibold text-lg">Finding your {quote?.option.name}…</p>
            <p className="text-sm text-muted">Matching you with the nearest top-rated driver</p>
            <button className="text-sm text-muted underline" onClick={reset}>Cancel</button>
          </div>
        )}

        {ride && (phase === "arriving" || phase === "ontrip") && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="label !text-success">{phase === "arriving" ? "Driver on the way" : "On trip"}</p>
                <p className="text-2xl font-bold">{phase === "arriving" ? `Arriving in ${etaLeft} min` : `${tripLeft} min to drop`}</p>
              </div>
              {phase === "arriving" && (
                <div className="text-center">
                  <p className="label">OTP</p>
                  <p className="text-2xl font-bold tracking-widest text-gold">{ride.otp}</p>
                </div>
              )}
            </div>
            <div className="h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full bg-gradient-to-r from-gold-deep to-gold" style={{ width: `${t * 100}%` }} /></div>
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-ink/60 border border-line">
              <div className="w-12 h-12 rounded-full btn-gold grid place-items-center text-lg">{ride.driver.name[0]}</div>
              <div className="flex-1">
                <p className="font-semibold">{ride.driver.name}</p>
                <p className="text-xs text-muted flex items-center gap-1"><Star size={12} className="fill-gold text-gold" />{ride.driver.rating} · {ride.driver.trips.toLocaleString("en-IN")} trips</p>
              </div>
              <a href={`tel:${ride.driver.phone.replace(/\s/g, "")}`} className="w-10 h-10 rounded-full border border-line grid place-items-center hover:border-gold" title={ride.driver.phone}><Phone size={16} /></a>
            </div>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-gold/[0.06] border border-gold/30">
              <div><p className="text-sm text-soft">{ride.driver.vehicle}</p><p className="text-xs text-subtle">{ride.quote.option.name}</p></div>
              <p className="font-mono font-bold bg-white text-on-brand border border-line px-2 py-1 rounded text-sm">{ride.driver.plate}</p>
            </div>
            <div className="text-sm space-y-1.5">
              <p className="flex gap-2"><MapPin size={16} className="text-success shrink-0" />{ride.pickup.name}</p>
              <p className="flex gap-2"><Navigation size={16} className="text-gold shrink-0" />{ride.drop.name}</p>
            </div>
            <div className="flex items-center justify-between text-sm border-t border-line pt-3">
              <span className="text-muted">Fare ({ride.payment.toUpperCase()})</span><span className="font-bold text-lg">{inr(ride.quote.fare)}</span>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-line text-sm hover:border-line-strong"><ShieldCheck size={16} className="text-success" />Share trip</button>
              {phase === "arriving" && <button onClick={cancelRide} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-danger/30 text-danger text-sm hover:bg-danger/10"><X size={16} />Cancel ride</button>}
            </div>
          </div>
        )}

        {ride && phase === "done" && (
          <div className="text-center space-y-4 py-4">
            <p className="label !text-success">You have arrived</p>
            <p className="text-3xl font-bold">{inr(ride.quote.fare)}</p>
            <p className="text-sm text-muted">{ride.quote.distanceKm} km · {ride.quote.durationMin} min · paid via {ride.payment.toUpperCase()}</p>
            <p className="text-sm">Rate your ride with {ride.driver.name}</p>
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <motion.button key={n} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }} animate={n <= rating ? { scale: [1, 1.35, 1] } : {}}
                  onClick={() => { setRating(n); toast("Thanks for your feedback!"); }} aria-label={`${n} stars`}>
                  <Star size={30} className={n <= rating ? "fill-gold text-gold" : "text-faint"} />
                </motion.button>
              ))}
            </div>
            <GoldButton className="w-full" onClick={() => { reset(); setDrop(null); }}>Book another ride</GoldButton>
          </div>
        )}
        </motion.div>
       </AnimatePresence>
      </div>

      <div className="h-[380px] lg:h-auto lg:min-h-[520px]">
        <CityMap
          pickup={pickup} drop={drop} kind={service}
          showRoute={!!drop && phase !== "arriving"}
          searching={phase === "searching"}
          vehicle={vehicle}
          vehicleFrom={phase === "arriving" ? driverStart : null}
        />
      </div>
    </div>
  );
}

function PlacePicker({
  icon, placeholder, value, onChange, exclude, autoFocus,
}: { icon: React.ReactNode; placeholder: string; value: Place | null; onChange: (p: Place | null) => void; exclude?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  useEffect(() => setQ(value?.name ?? ""), [value]);
  useEffect(() => {
    if (!open) return;
    api.places.search(q === value?.name ? "" : q).then((r) => setResults(r.filter((p) => p.id !== exclude)));
  }, [q, open, exclude, value]);

  return (
    <div className="relative">
      <div className="flex items-center gap-3 field !pr-12">
        {icon}
        <input className="bg-transparent outline-none flex-1 min-w-0" placeholder={placeholder} value={q} autoFocus={autoFocus && !value}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setQ(e.target.value); if (!e.target.value) onChange(null); }} />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto scrollbar-thin rounded-xl border border-line bg-coal shadow-2xl">
          {results.map((p) => (
            <button key={p.id} onMouseDown={() => { onChange(p); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-fg/5 text-left">
              <Clock size={14} className="text-subtle" />
              <span><span className="block text-sm">{p.name}</span><span className="block text-xs text-subtle">{p.area}, Chennai</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
