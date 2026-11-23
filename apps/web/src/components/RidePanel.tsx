"use client";
// Bike Taxi & Car Ride: pickup/drop → fare options → driver search → live trip.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useHideBottomNav } from "./BottomNav";
import { ArrowUpDown, Clock, Coins, MapPin, Navigation, Phone, Plus, Share2, Siren, Star, Users, X } from "lucide-react";
import { api } from "@/lib/api";
import { PASS_NAME, RIDE_CANCEL_REASONS, autoSharesAt, isWomenOnly, RIDE_MAX_STOPS, RIDE_SCHEDULE, RIDE_SIMULATION, creditsEarned, creditsUsable, effectiveSurge, passSaleError, rideCancelFee, rideDiscountRoom, hourRangesText, withTerms } from "@quikfly/shared";
import type { BookingTerms, FareQuote, PaymentMethod, Place, Ride, RideCancelReason, SavedPlace } from "@quikfly/shared";
import { trackUrl } from "@/lib/account";
import { Link } from "@/lib/nav";
import { cx, inr, prettyDateTime, toLocalInput } from "@/lib/format";
import { PLACE_ICON } from "./account/PlacesSection";
import { PlacePicker } from "./PlacePicker";
import { useApp } from "./AppProvider";
import { CityMap, driverStartFor, vehiclePosition, type Pt } from "./CityMap";
import { SafetySheet } from "./SafetySheet";
import { GoldButton, Spinner } from "./ui";
import { useConfig, useSettings } from "@/components/ConfigProvider";
import { serviceByKey } from "@/lib/services";

type Phase = "plan" | "searching" | "scheduled" | "arriving" | "ontrip" | "done";

/** Payment options offered for rides (net banking is checkout-only). */
const RIDE_PAYMENTS: PaymentMethod[] = ["upi", "cash", "wallet", "card"];

const { arriveMs: ARRIVE_MS, tripMs: TRIP_MS } = RIDE_SIMULATION;

/** The default pickup time for "Schedule": the next quarter hour after the minimum lead time. */
function defaultPickup(minMinutes: number) {
  const d = new Date(Date.now() + (minMinutes + 15) * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return toLocalInput(d);
}

export function RidePanel({ service, initialFrom, initialTo, resume, scheduleAt, tripOf }: {
  service: "bike" | "car"; initialFrom?: string | null; initialTo?: string | null;
  /** Pre-select "Schedule" at this local time (e.g. before a bus departs). */
  scheduleAt?: string | null;
  /** The booking whose trip this ride joins (the bus or holiday it gets you to). */
  tripOf?: string | null;
  /** A scheduled ride to start now (from My Trips). */
  resume?: { rideId: string; bookingId: string };
}) {
  const PLACES = useConfig()?.places ?? [];
  const surgeRules = useConfig()?.surgeRules ?? [];
  const { user, requireAuth, refreshBookings, toast } = useApp();
  const [pickup, setPickup] = useState<Place | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  /** Stops between pickup and drop, in order (an empty picker is null). */
  const [stops, setStops] = useState<(Place | null)[]>([]);
  const chosenStops = stops.filter((s): s is Place => !!s);
  const stopKey = chosenStops.map((s) => s.id).join(",");
  // Places arrive with /config: once they do, pre-fill from the link (or a sensible default).
  const placesReady = PLACES.length > 0;
  useEffect(() => {
    if (!placesReady) return;
    setPickup((p) => p ?? PLACES.find((x) => x.id === initialFrom) ?? PLACES[Math.min(2, PLACES.length - 1)]);
    setDrop((d) => d ?? PLACES.find((x) => x.id === initialTo && x.id !== initialFrom) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesReady]);
  const [quotes, setQuotes] = useState<FareQuote[] | null>(null);
  /** The highest surge in the current quotes (surge rules can differ by ride type). */
  const topSurge = quotes?.length ? Math.max(...quotes.map((q) => q.surge)) : 1;
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [payment, setPayment] = useState<PaymentMethod>("upi");
  const [useCredits, setUseCredits] = useState(true);
  const [creditsPaid, setCreditsPaid] = useState(0);
  const [phase, setPhase] = useState<Phase>("plan");
  // Keep the screen focused on the ride once it is booked.
  useHideBottomNav(phase !== "plan");
  const [ride, setRide] = useState<Ride | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookedAt, setBookedAt] = useState<string>("");
  /** The cancellation fee rules the ride was booked under. */
  const [bookedTerms, setBookedTerms] = useState<BookingTerms | null>(null);
  /** Cancel flow: the reason picker is open, and the reason chosen (MVAG 2025 reason list). */
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState<RideCancelReason | null>(null);
  const settings = useSettings();
  /** Ride now, or book ahead for a pickup time (local "YYYY-MM-DDTHH:mm"). */
  const [when, setWhen] = useState<"now" | "later">(scheduleAt ? "later" : "now");
  // Feature switches (admin → Settings → Features): fall back when one is turned off.
  useEffect(() => { if (!settings.featureRideScheduling) setWhen("now"); }, [settings.featureRideScheduling]);
  useEffect(() => { if (!settings.featureMultiStop) setStops([]); }, [settings.featureMultiStop]);
  useEffect(() => { if (!settings.featureCashRides) setPayment((p) => (p === "cash" ? "upi" : p)); }, [settings.featureCashRides]);
  const [at, setAt] = useState(() => scheduleAt || defaultPickup(30));
  const scheduledFor = when === "later" ? at : undefined;
  const [t, setT] = useState(0);
  const [rating, setRating] = useState(0);
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [sosOpen, setSosOpen] = useState(false);
  const raf = useRef<number>(0);

  // Saved places (Home, Work...) as one-tap picks for signed-in riders.
  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn) return setSaved([]);
    api.savedPlaces.list().then(setSaved, () => setSaved([]));
  }, [signedIn]);

  /** Creates (or reuses) a public link for this ride and hands it to the share sheet or clipboard. */
  async function shareTrip(r: Ride | null = ride) {
    if (!r) return;
    try {
      const { token } = await api.rides.share(r.id);
      const url = trackUrl(token);
      const text = `Follow my QuikFly ride: ${r.driver.vehicle} (${r.driver.plate}) from ${r.pickup.name} to ${r.drop.name}.`;
      if (navigator.share) { try { await navigator.share({ title: "My QuikFly ride", text, url }); return; } catch { /* dismissed: fall back to copy */ } }
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast("Trip link copied. Paste it to anyone.");
    } catch (e) { toast((e as Error).message, "err"); }
  }

  /** Safety Preferences: share with emergency contacts automatically (night rides or every ride). */
  async function autoShareIfNight(r: Ride) {
    if (!user || !autoSharesAt(user.autoShareRides, new Date().getHours())) return;
    const contacts = await api.contacts.list().catch(() => []);
    if (!contacts.length) return;
    await api.rides.share(r.id).catch(() => undefined);
    toast(`Ride shared with ${contacts.map((c) => c.name.split(" ")[0]).join(", ")} (demo: no SMS sent)`);
  }


  useEffect(() => {
    if (!pickup || !drop || pickup.id === drop.id) { setQuotes(null); return; }
    let live = true;
    setLoadingQuotes(true);
    api.rides.quote(service, pickup.id, drop.id, scheduledFor, chosenStops.map((s) => s.id)).then((q) => {
      if (!live) return;
      setQuotes(q); setSelected((s) => q.find((x) => x.option.id === s)?.option.id ?? q[0].option.id);
      setLoadingQuotes(false);
    }, (e: Error) => { if (live) { setQuotes(null); setLoadingQuotes(false); toast(e.message, "err"); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Re-quote when signing in or buying a QuikFly Pass changes the surge.
  }, [pickup, drop, service, scheduledFor, stopKey, toast, user?.passUntil]);

  // Starting a scheduled ride from My Trips: assign the driver now and run the live trip.
  const resumeKey = resume ? `${resume.rideId}:${resume.bookingId}` : "";
  useEffect(() => {
    if (!resume) return;
    let live = true;
    (async () => {
      try {
        const [r, b] = await Promise.all([api.rides.start(resume.rideId), api.bookings.get(resume.bookingId)]);
        if (!live) return;
        setPickup(r.pickup); setDrop(r.drop); setStops(r.stops ?? []);
        setRide(r); setBookingId(b.id); setBookedAt(b.createdAt); setBookedTerms(b.terms); setT(0); setPhase("arriving");
        autoShareIfNight(r);
      } catch (e) { if (live) toast((e as Error).message, "err"); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeKey]);

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
  const driverStart: Pt | null = useMemo(() => pickup ? driverStartFor(pickup) : null, [pickup]);
  const vehicle: Pt | null = pickup && drop && (phase === "arriving" || phase === "ontrip" || phase === "done")
    ? vehiclePosition(phase, pickup, drop, t, chosenStops) : null;

  function reset() {
    cancelAnimationFrame(raf.current);
    setPhase("plan"); setRide(null); setBookingId(null); setCreditsPaid(0); setT(0); setRating(0); setCancelling(false); setReason(null); setWhen("now"); setStops([]);
  }

  // Credits: the same rule the API applies at booking.
  // A ride fare keeps its discount floor (Settings.rideMaxDiscountPercent), like the API.
  const creditsCanPay = user && quote ? creditsUsable(settings, user.creditBalance, quote.fare, 0, rideDiscountRoom(settings, service, quote.fare)) : 0;
  const creditsOff = useCredits ? creditsCanPay : 0;
  const payable = quote ? quote.fare - creditsOff : 0;
  const earns = quote ? creditsEarned(settings, service, payable) : 0;
  const walletShort = !!user && !!quote && user.walletBalance < payable;

  function book() {
    if (!pickup || !drop || !quote) return;
    requireAuth(async () => {
      setPhase("searching");
      let r: Ride | null = null;
      try {
        r = await api.rides.book({ optionId: quote.option.id, pickupId: pickup.id, dropId: drop.id, payment, scheduledFor, stopIds: chosenStops.map((s) => s.id) });
        const stopLine: [string, string][] = r.stops?.length ? [["Stops", r.stops.map((s) => s.name).join(" → ")]] : [];
        // A ride booked ahead gets its driver near pickup time, so its booking has no driver lines yet.
        const b = await api.bookings.create({
          service, title: `${r.quote.option.name} · ${r.drop.name}`, subtitle: `${r.pickup.name} → ${r.drop.name}`, rideId: r.id, payment, useCredits: creditsOff > 0,
          ...(tripOf ? { tripOf } : {}),
          lines: r.scheduledFor
            ? [["Pickup time", prettyDateTime(r.scheduledFor)], ...stopLine, ["Payment", payment.toUpperCase()], ["Distance", `${r.quote.distanceKm} km`]]
            : [["Driver", r.driver.name], ["Vehicle", `${r.driver.vehicle} · ${r.driver.plate}`], ["Ride OTP", r.otp], ...stopLine, ["Payment", payment.toUpperCase()], ["Distance", `${r.quote.distanceKm} km`]],
        });
        setCreditsPaid(b.creditsUsed);
        if (r.scheduledFor) {
          setRide(r); setBookingId(b.id); setBookedAt(b.createdAt); setBookedTerms(b.terms); setPhase("scheduled");
          refreshBookings();
          return;
        }
        setRide(r); setBookingId(b.id); setBookedAt(b.createdAt); setBookedTerms(b.terms); setT(0); setPhase("arriving");
        refreshBookings();
        autoShareIfNight(r);
      } catch (e) {
        // e.g. the wallet ran short between quote and booking: release the driver.
        if (r) api.rides.cancel(r.id).catch(() => undefined);
        toast((e as Error).message, "err");
        setPhase("plan");
      }
    });
  }

  /** Fee the rider would pay if they cancel now with the chosen reason (the API applies the same rule). */
  const sold = withTerms(settings, bookedTerms);
  const feeNow = ride && bookedAt ? rideCancelFee(sold, ride.quote.fare, reason, bookedAt, Date.now(), ride.scheduledFor) : 0;

  async function cancelRide() {
    cancelAnimationFrame(raf.current);
    try {
      if (ride) await api.rides.cancel(ride.id);
      const done = bookingId ? await api.bookings.cancel(bookingId, reason ?? undefined) : null;
      toast(!done?.cancelFee ? "Ride cancelled. No charges applied."
        : done.payment === "wallet" ? `Ride cancelled. ${inr(done.cancelFee)} cancellation fee kept; ${inr(done.refundAmount ?? 0)} back in your wallet.`
        : `Ride cancelled. Cancellation fee ${inr(done.cancelFee)} (demo: not collected).`);
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
            {tripOf && <p className="text-xs text-success border border-success/30 bg-success/10 rounded-lg px-3 py-2">This ride will be added to your trip.</p>}
            <div className="relative space-y-2">
              <PlacePicker icon={<span className="w-2.5 h-2.5 rounded-full bg-success" />} placeholder="Pickup location" value={pickup} onChange={setPickup} exclude={drop?.id} saved={saved} />
              {stops.map((s, i) => (
                <div key={i} className="flex items-center gap-2 pr-10">
                  <div className="flex-1 min-w-0">
                    <PlacePicker icon={<span className="w-4 h-4 rounded-full bg-gold text-on-brand text-[10px] font-bold grid place-items-center">{i + 1}</span>}
                      placeholder={`Stop ${i + 1}`} value={s} onChange={(p) => setStops((list) => list.map((x, k) => (k === i ? p : x)))} saved={saved} />
                  </div>
                  <button type="button" aria-label={`Remove stop ${i + 1}`} onClick={() => setStops((list) => list.filter((_, k) => k !== i))}
                    className="w-8 h-8 shrink-0 rounded-full border border-line grid place-items-center hover:border-danger hover:text-danger"><X size={14} /></button>
                </div>
              ))}
              <PlacePicker icon={<span className="w-2.5 h-2.5 bg-brand" />} placeholder="Where to?" value={drop} onChange={setDrop} exclude={pickup?.id} saved={saved} />
              <button onClick={() => { setPickup(drop); setDrop(pickup); setStops((list) => [...list].reverse()); }} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-smoke border border-line grid place-items-center hover:border-gold" title="Swap">
                <ArrowUpDown size={14} />
              </button>
            </div>

            {!drop && saved.some((s) => s.place.id !== pickup?.id) && (
              <div>
                <p className="label mb-2">Your places</p>
                <div className="flex flex-wrap gap-2">
                  {saved.filter((s) => s.place.id !== pickup?.id).map((s) => {
                    const Icon = PLACE_ICON[s.kind];
                    return <button key={s.id} className="chip flex items-center gap-1.5" onClick={() => setDrop(s.place)} title={s.place.name}><Icon size={14} className="text-gold" />{s.label}</button>;
                  })}
                </div>
              </div>
            )}

            {settings.featureMultiStop && stops.length < RIDE_MAX_STOPS && (
              <button type="button" onClick={() => setStops((list) => [...list, null])} className="text-sm text-gold flex items-center gap-1.5">
                <Plus size={15} />Add a stop <span className="text-xs text-muted">({settings.rideStopMinutes} min wait included per stop)</span>
              </button>
            )}

            {settings.featureRideScheduling && <div>
              <p className="label mb-2">When</p>
              <div className="flex flex-wrap items-center gap-2">
                {([["now", "Ride now"], ["later", "Schedule"]] as const).map(([k, l]) => (
                  <button key={k} type="button" data-on={when === k} aria-pressed={when === k} onClick={() => setWhen(k)} className="chip">{l}</button>
                ))}
                {when === "later" && (
                  <input type="datetime-local" aria-label="Pickup time" className="field !py-2 !w-auto" value={at} step={900}
                    min={toLocalInput(new Date(Date.now() + settings.rideScheduleMinMinutes * 60_000))}
                    max={toLocalInput(new Date(Date.now() + settings.rideScheduleMaxDays * 86_400_000))}
                    onChange={(e) => e.target.value && setAt(e.target.value)} />
                )}
              </div>
              {when === "later" && (
                <p className="text-xs text-muted mt-2">
                  Fare locked now. Your driver is assigned {RIDE_SCHEDULE.startWindowMinutes} min before pickup; free cancellation until {settings.rideScheduleFreeCancelMinutes} min before.
                </p>
              )}
            </div>}

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
                {topSurge > 1 && (
                  <p className="text-xs text-warning border border-warning/30 bg-warning/10 rounded-lg px-3 py-2" role="note">
                    Busy hours: {quotes.every((q) => q.surge === topSurge) ? `these fares include a ×${topSurge} surge` : `some fares include a surge of up to ×${topSurge}, shown on each ride`} (never more than ×{settings.surgeCap}).
                    {!surgeRules.length && settings.surgeHours && <> Surge hours today: {settings.surgeHours}.</>}
                    {!passSaleError(settings, surgeRules) && (
                      <> <Link href="/account?tab=wallet#pass" className="underline font-medium">Skip surge with {PASS_NAME}</Link> ({inr(settings.passPrice)} for {settings.passDays} days).</>
                    )}
                  </p>
                )}
                {quotes.some((q) => q.nightCharge) && (
                  <p className="text-xs text-muted border border-line rounded-lg px-3 py-2" role="note">
                    Night fares: {settings.rideNightPercent}% is added {hourRangesText(settings.rideNightHours ?? "")} (India time), shown on each ride.
                  </p>
                )}
                {!!quotes[0].passSaving && (
                  <p className="text-xs text-success border border-success/30 bg-success/10 rounded-lg px-3 py-2" role="note">
                    Busy hours, but your {PASS_NAME} takes the ×{effectiveSurge(settings)} surge off these fares.
                  </p>
                )}
                {quotes.map((q, i) => (
                  <motion.button initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} whileTap={{ scale: 0.98 }} key={q.option.id} onClick={() => setSelected(q.option.id)}
                    className={cx("w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all",
                      selected === q.option.id ? "border-gold bg-gold/[0.07]" : "border-line hover:border-line-strong")}>
                    <img src={service === "bike" ? serviceByKey("bike").image : q.option.id === "prime" || q.option.id === "suv" ? serviceByKey("rent").image : serviceByKey("car").image} alt="" className="w-16 h-11 object-cover rounded-lg" />
                    <div className="flex-1">
                      <p className="font-semibold flex items-center gap-2 flex-wrap">{q.option.name}
                        <span className="text-xs text-muted font-normal flex items-center gap-0.5"><Users size={12} />{q.option.seats}</span>
                        {isWomenOnly(q.option) && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-highlight/15 text-highlight">Women only</span>}
                      </p>
                      <p className="text-xs text-muted">{q.etaMin} min away · {q.option.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">{inr(q.fare)}</p>
                      {!!q.passSaving && <p className="text-[11px] text-success">−{inr(q.passSaving)} surge</p>}
                      {q.surge > 1 && topSurge > 1 && !quotes.every((x) => x.surge === topSurge) && <p className="text-[11px] text-warning">×{q.surge} surge</p>}
                      {!!q.nightCharge && <p className="text-[11px] text-muted">incl. {inr(q.nightCharge)} night</p>}
                      {!!q.airportFee && <p className="text-[11px] text-muted">incl. {inr(q.airportFee)} airport fee</p>}
                    </div>
                  </motion.button>
                ))}
                <div className="flex gap-2 pt-1">
                  {RIDE_PAYMENTS.filter((p) => p !== "cash" || settings.featureCashRides).map((p) => {
                    const short = p === "wallet" && walletShort;
                    return (
                      <button key={p} data-on={payment === p} onClick={() => setPayment(p)} disabled={short}
                        title={short ? `Wallet balance ${inr(user!.walletBalance)} is not enough` : undefined}
                        className="chip uppercase !text-xs disabled:opacity-40 disabled:cursor-not-allowed">{p}</button>
                    );
                  })}
                </div>
                {payment === "wallet" && walletShort && <p className="text-xs text-danger">Wallet balance {inr(user!.walletBalance)} is not enough for this ride. Pick another payment method.</p>}
                {creditsCanPay > 0 && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="accent-brand" checked={useCredits} onChange={(e) => setUseCredits(e.target.checked)} />
                    Use {inr(creditsCanPay)} QuikFly Credits <span className="text-xs text-subtle">(balance {inr(user!.creditBalance)})</span>
                  </label>
                )}
                {earns > 0 && <p className="text-xs text-muted flex items-center gap-1.5"><Coins size={13} className="text-gold shrink-0" />Earn {inr(earns)} QuikFly Credits when the ride is completed.</p>}
                <GoldButton className="w-full mt-2 text-base" onClick={book} disabled={payment === "wallet" && walletShort}>{when === "later" ? "Schedule" : "Book"} {quote?.option.name} · {quote && inr(payable)}</GoldButton>
              </div>
            )}
          </>
        )}

        {phase === "scheduled" && ride?.scheduledFor && (
          <div className="py-6 space-y-4 text-center">
            <p className="font-display text-2xl">Ride scheduled</p>
            {tripOf && <p className="text-sm text-success">Added to your trip</p>}
            <p className="text-soft">{ride.quote.option.name} · {ride.pickup.name} → {ride.drop.name}</p>
            <p className="text-gold font-semibold text-lg">{prettyDateTime(ride.scheduledFor)}</p>
            <p className="text-sm text-muted">Fare {inr(ride.quote.fare)} ({ride.payment.toUpperCase()}), locked. Your driver is assigned {RIDE_SCHEDULE.startWindowMinutes} minutes before pickup: start the ride from My Trips then. Free cancellation until {settings.rideScheduleFreeCancelMinutes} minutes before pickup.</p>
            <div className="flex gap-2 justify-center pt-2">
              <Link href="/bookings" className="btn-gold rounded-xl px-5 py-2.5 text-sm">View My Trips</Link>
              <button type="button" onClick={reset} className="rounded-xl border border-line px-5 py-2.5 text-sm hover:border-line-strong">Book another ride</button>
            </div>
          </div>
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
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="label !text-success">{phase === "arriving" ? "Driver on the way" : "On trip"}</p>
                <p className="text-2xl font-bold">{phase === "arriving" ? `Arriving in ${etaLeft} min` : `${tripLeft} min to drop`}</p>
              </div>
              {phase === "arriving" && (
                <div className="text-center">
                  <p className="label">{user?.ridePin && ride.otp === user.ridePin ? "Your PIN" : "OTP"}</p>
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
              <span className="text-muted">Fare ({ride.payment.toUpperCase()}){creditsPaid > 0 && <span className="block text-xs text-success">{inr(creditsPaid)} paid with credits</span>}</span><span className="font-bold text-lg">{inr(ride.quote.fare - creditsPaid)}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSosOpen(true)} aria-label="SOS: safety options"
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-danger text-on-brand text-sm font-bold hover:opacity-90"><Siren size={16} />SOS</button>
              <button type="button" onClick={() => shareTrip()} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-line text-sm hover:border-line-strong"><Share2 size={16} className="text-success" />Share trip</button>
              {phase === "arriving" && !cancelling && <button onClick={() => setCancelling(true)} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-danger/30 text-danger text-sm hover:bg-danger/10"><X size={16} />Cancel</button>}
            </div>
            {phase === "arriving" && cancelling && (
              <div className="rounded-2xl border border-danger/30 p-4 space-y-3" role="group" aria-label="Why are you cancelling?">
                <p className="font-semibold text-sm">Why are you cancelling?</p>
                <div className="space-y-1.5">
                  {RIDE_CANCEL_REASONS.map((r) => (
                    <label key={r.key} className={cx("flex items-center gap-2.5 text-sm rounded-lg border px-3 py-2 cursor-pointer", reason === r.key ? "border-gold bg-gold/[0.07]" : "border-line hover:border-line-strong")}>
                      <input type="radio" name="cancel-reason" className="accent-[var(--accent)]" checked={reason === r.key} onChange={() => setReason(r.key)} />{r.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted">
                  {!reason ? `Free ${sold.rideCancelFreeMinutes > 0 ? `within ${sold.rideCancelFreeMinutes} min of booking or ` : ""}if the driver is at fault; otherwise ${sold.rideCancelFeePercent}% of the fare (up to ${inr(sold.rideCancelFeeCap)}).`
                    : feeNow === 0 ? "No cancellation fee."
                    : `Cancellation fee: ${inr(feeNow)}${ride!.payment === "wallet" ? ", kept from your wallet refund." : " (demo: not collected)."}`}
                </p>
                <div className="flex gap-2">
                  <button type="button" disabled={!reason} onClick={cancelRide} className="flex-1 py-2.5 rounded-xl bg-danger/15 text-danger text-sm font-semibold hover:bg-danger/25 disabled:opacity-40">Cancel ride</button>
                  <button type="button" onClick={() => { setCancelling(false); setReason(null); }} className="flex-1 py-2.5 rounded-xl border border-line text-sm">Keep my ride</button>
                </div>
              </div>
            )}
            <SafetySheet open={sosOpen} rideId={ride?.id} onClose={() => setSosOpen(false)} onShare={() => shareTrip()} />
          </div>
        )}

        {ride && phase === "done" && (
          <div className="text-center space-y-4 py-4">
            <p className="label !text-success">You have arrived</p>
            <p className="text-3xl font-bold">{inr(ride.quote.fare - creditsPaid)}</p>
            <p className="text-sm text-muted">{ride.quote.distanceKm} km · {ride.quote.durationMin} min · paid via {ride.payment.toUpperCase()}{creditsPaid > 0 ? ` + ${inr(creditsPaid)} credits` : ""}</p>
            {creditsEarned(settings, service, ride.quote.fare - creditsPaid) > 0 && (
              <p className="text-sm text-gold flex items-center justify-center gap-1.5"><Coins size={15} />{inr(creditsEarned(settings, service, ride.quote.fare - creditsPaid))} QuikFly Credits earned</p>
            )}
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
          pickup={pickup} drop={drop} stops={chosenStops} kind={service}
          showRoute={!!drop && phase !== "arriving"}
          searching={phase === "searching"}
          vehicle={vehicle}
          vehicleFrom={phase === "arriving" ? driverStart : null}
        />
      </div>
    </div>
  );
}
