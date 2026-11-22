// Parcels in demo mode, with the API's rules (packages/shared/src/parcel.ts) and this browser as
// the database. Transit catches up with the clock whenever parcels are read. There are no staff
// here, so no counter hands over: a bus parcel waits as "ready" until its hold period ends. A
// Quick parcel's hand-offs are the sender's, as on the API.
import {
  CATALOG_SEED, GSTIN_LINE, PARCEL_DECLARATION, PARCEL_LR, PARCEL_NOT_CANCELLABLE, PARCEL_CANCELLABLE, PARCEL_RULES, PATTERNS, isWomenOnly, nextMoveAt,
  parcelBookingText, parcelDepartures, parcelLiability, parcelLr, parcelNotice, parcelRateFor, planLegMove, planLegs, priceParcelCity,
  priceParcelIntercity, rideQuotes, rideTimeAt, simulatedMove, switchError, QUICK_PARCEL_CITY, RIDE_SIM, pick, planQuickLegs, quickParcelText,
  type AppNotification, type FareLine, type LegMove, type NewBooking, type Parcel, type ParcelOptions, type ParcelQuoteInfo, type ParcelState,
  type PublicTracking, type QuoteRequest, type Settings,
} from "@quikfly/shared";
import { KEYS, currentUser, fail, load, save, signedInUser } from "./mock-store";

type ParcelRequest = Extract<QuoteRequest, { service: "parcel" }>;
interface StoredParcel extends Parcel { senderId: string; holdDays: number; nextAt: string | null; tries?: number }
type Notify = (n: Omit<AppNotification, "id" | "createdAt" | "readAt">) => void;

const seed = CATALOG_SEED;
const store = () => load<StoredParcel[]>(KEYS.parcels, []);

function checkOn(settings: Settings) {
  const off = switchError(settings, { service: "parcel" });
  if (off) fail(off);
}

function departuresBetween(settings: Settings, fromInput: string, toInput: string) {
  const named = (s: string) => (seed.city.find((c) => c.name.toLowerCase() === s.trim().toLowerCase()) ?? fail(`QuikFly doesn't run buses in "${s}".`)).name;
  const from = named(fromInput), to = named(toInput);
  if (from === to) fail("Pick two different cities.");
  const departures = parcelDepartures({ operators: seed.busOperator, counters: seed.parcelCounter, rates: seed.parcelRate }, settings, from, to);
  return { from, to, departures };
}

export function mockParcelOptions(settings: Settings, from: string, to: string): ParcelOptions {
  checkOn(settings);
  return { departures: departuresBetween(settings, from, to).departures, declaration: PARCEL_DECLARATION };
}

export function mockParcelPrice(settings: Settings, r: ParcelRequest): { lines: FareLine[]; request: ParcelRequest; info: ParcelQuoteInfo } {
  checkOn(settings);
  if (Number(r.weightBand) > settings.parcelMaxKg) fail(`Parcels can weigh up to ${settings.parcelMaxKg} kg.`);
  if (r.declaredValue > settings.parcelMaxDeclaredValue) fail(`Parcels can be worth up to ₹${settings.parcelMaxDeclaredValue.toLocaleString("en-IN")}. We can't carry anything more valuable.`);
  const liability = parcelLiability(r.declaredValue, settings.parcelLiabilityCap);
  if (r.mode === "city") {
    if (r.pickupId === r.dropId) fail("Pickup and drop must be different places.");
    const place = (id: string) => seed.place.find((p) => p.id === id) ?? fail("Unknown place.");
    const bike = seed.rideOption.find((o) => o.service === "bike" && o.id !== "auto" && !isWomenOnly(o)) ?? fail("Quick parcel isn't available right now.");
    const fare = rideQuotes([bike], place(r.pickupId), place(r.dropId), settings, rideTimeAt(Date.now()), [], false, seed.surgeRule)[0];
    const plan = { fare, pickup: place(r.pickupId), drop: place(r.dropId), liability };
    return { lines: priceParcelCity(fare, r.weightBand, settings), request: { ...r, plan }, info: { liability, departure: null } };
  }
  if (r.pickup === "door" || r.delivery === "door") fail("Door pickup and delivery aren't open yet. Choose the counter.");
  const { from, to, departures } = departuresBetween(settings, r.from, r.to);
  const departure = departures.find((d) => d.busId === r.busId && Date.parse(d.departAt) === Date.parse(r.departAt))
    ?? fail("That bus isn't taking parcels: it doesn't run then, or its hand-in time has passed. Pick another departure.");
  return {
    lines: priceParcelIntercity(parcelRateFor(seed.parcelRate, departure.operatorId, from, to), r.weightBand, settings),
    request: { ...r, from, to, departAt: departure.departAt, plan: { departure, liability } },
    info: { liability, departure },
  };
}

const digitsCode = (n: number) => String(crypto.getRandomValues(new Uint32Array(1))[0]).padStart(10, "0").slice(-n);

function courierFor(plan: NonNullable<Extract<ParcelRequest, { mode: "city" }>["plan"]>): Parcel["courier"] {
  const at = Date.now();
  const { id: _id, ...captain } = pick(seed.driver, at);
  const { option } = plan.fare;
  return {
    captain: {
      ...captain,
      vehicle: pick(option.models.length ? option.models : [option.name], at >> 2),
      plate: `${pick(RIDE_SIM.plateStates, at >> 3)} ${pick(RIDE_SIM.plateLetters, at >> 5)} ${1000 + (at % 8999)}`,
    },
    pickup: { id: plan.pickup.id, name: plan.pickup.name, area: plan.pickup.area },
    drop: { id: plan.drop.id, name: plan.drop.name, area: plan.drop.area },
    distanceKm: plan.fare.distanceKm, durationMin: plan.fare.durationMin,
  };
}

/** Writes a planned move onto the stored parcel. */
function applyMove(p: StoredParcel, move: LegMove, at: number, notify: Notify) {
  Object.assign(p, {
    legs: move.legs, state: move.state, holdUntil: move.holdUntil, nextAt: move.nextAt,
    collectOtp: move.issuesCode ? digitsCode(PARCEL_RULES.collectOtpDigits) : null,
    pickupOtp: move.state === "booked" ? p.pickupOtp : null,
  });
  p.events.push({ state: move.state, at: new Date(at).toISOString(), note: null });
  const notice = parcelNotice(move.state, p.lr);
  if (notice) notify({ ...notice, bookingId: p.bookingId });
}

/** The sender playing the captain (demo). */
export function mockSenderMove(id: string, to: "active" | "done", otp: string, notify: Notify): Parcel {
  const me = currentUser();
  const list = store();
  const p = list.find((x) => x.bookingId === id && x.senderId === me.id) ?? fail("Parcel not found.");
  const leg = p.legs.find((l) => l.kind === "bike" && l.state === (to === "active" ? "pending" : "active")) ?? fail("No captain is waiting for that code on this parcel.");
  const move = planLegMove(p, leg.seq, to, "sender");
  if ("error" in move) return fail(move.error);
  if (move.needsOtp) {
    if ((p.tries ?? 0) >= PARCEL_RULES.otpMaxTries) fail(`Too many wrong codes. Try again in ${PARCEL_RULES.otpLockMinutes} minutes.`);
    if (otp !== p.collectOtp) {
      p.tries = (p.tries ?? 0) + 1;
      save(KEYS.parcels, list);
      fail("That code isn't right.");
    }
  } else if (otp !== p.pickupOtp) fail("That pickup code isn't right.");
  applyMove(p, move, Date.now(), notify);
  save(KEYS.parcels, list);
  return mockParcel(id);
}

/** Checks a parcel booking; `save` writes the parcel once the booking has gone in. */
export function mockNewParcel(settings: Settings, req: ParcelRequest, input: NewBooking) {
  checkOn(settings);
  if (!req.plan) return fail("That price isn't valid. Please check the price again.");
  const receiver = input.receiver ?? fail("Add who receives the parcel.");
  const digits = receiver.phone.replace(/\D/g, "").slice(-10);
  if (!PATTERNS.phone.test(digits)) fail("Enter the receiver's 10-digit mobile number.");
  const contents = input.contents?.trim() ?? "";
  if (contents.length < PARCEL_RULES.contentsMin || contents.length > PARCEL_RULES.contentsMax) fail("Say what's inside, in a few words.");
  if (input.declaration !== PARCEL_DECLARATION.version) fail("Please read and accept the current parcel declaration.");
  if (input.payment === "cash") {
    if (req.mode === "intercity") fail("Bus parcels are paid when you book. Choose the wallet, UPI, card or net banking.");
    const off = switchError(settings, { service: "parcel", payment: "cash" });
    if (off) fail(off);
  }
  if (req.mode === "intercity" && Date.parse(req.plan!.departure.cutoffAt) <= Date.now()) fail("The hand-in time for that bus has passed. Pick another departure.");

  const { liability } = req.plan!;
  const random = crypto.getRandomValues(new Uint8Array(PARCEL_LR.randomLength));
  const from = req.mode === "city" ? QUICK_PARCEL_CITY : req.from;
  const to = req.mode === "city" ? QUICK_PARCEL_CITY : req.to;
  const lr = parcelLr(from, to, random);
  const text = req.mode === "city"
    ? quickParcelText(req.plan!.pickup, req.plan!.drop, req.weightBand, lr, liability)
    : parcelBookingText(req.plan!.departure, req.weightBand, lr, liability);
  const gst = currentUser().gst;
  if (gst && input.lines.some(([k]) => k === GSTIN_LINE)) text.lines.push([GSTIN_LINE, `${gst.gstin} · ${gst.name}`]);
  return {
    mode: req.mode,
    ...text,
    save(bookingId: string, createdAt: string) {
      const departure = req.mode === "intercity" ? req.plan!.departure : null;
      const quick = req.mode === "city" ? req.plan! : null;
      const legs = departure ? planLegs(departure) : planQuickLegs();
      const parcel: StoredParcel = {
        bookingId, lr, mode: req.mode, state: "booked", from, to, departAt: departure?.departAt ?? null,
        readyAt: departure?.readyAt ?? new Date(Date.now() + (quick!.fare.etaMin + quick!.fare.durationMin) * 60_000).toISOString(),
        fromCounter: departure?.fromCounter ?? null, toCounter: departure?.toCounter ?? null,
        courier: quick && courierFor(quick), pickupOtp: quick && digitsCode(PARCEL_RULES.pickupOtpDigits),
        category: req.category, weightBand: req.weightBand, size: req.size, declaredValue: req.declaredValue, liability, contents,
        receiver: { name: receiver.name.trim(), phone: `+91 ${digits}` }, declarationVersion: PARCEL_DECLARATION.version,
        holdUntil: null, legs, events: [{ state: "booked", at: createdAt, note: null }], collectOtp: null, simulated: settings.parcelSimulateTransit,
        senderId: currentUser().id, holdDays: settings.parcelCounterHoldDays, nextAt: nextMoveAt(legs, null),
      };
      save(KEYS.parcels, [parcel, ...store()]);
    },
  };
}

/** Moves parcels whose time has come; returns each parcel's state, by booking id. */
export function syncMockParcels(settings: Settings, notify: Notify): Map<string, ParcelState> {
  const list = store();
  let changed = false;
  if (settings.parcelSimulateTransit) {
    for (const p of list) {
      while (p.nextAt && Date.parse(p.nextAt) <= Date.now()) {
        const at = Date.parse(p.nextAt);
        const step = simulatedMove(p.legs);
        if (!step) break;
        const move = planLegMove(p, step.seq, step.to, "simulated", at);
        if ("error" in move) break;
        applyMove(p, move, at, notify);
        changed = true;
      }
    }
  }
  if (changed) save(KEYS.parcels, list);
  return new Map(list.map((p) => [p.bookingId, p.state]));
}

export function checkMockParcelCancel(id: string) {
  const p = store().find((x) => x.bookingId === id);
  if (p && !PARCEL_CANCELLABLE.includes(p.state)) fail(PARCEL_NOT_CANCELLABLE);
}

export function closeMockParcel(id: string) {
  const list = store();
  const p = list.find((x) => x.bookingId === id);
  if (!p) return;
  const at = new Date().toISOString();
  Object.assign(p, {
    state: "cancelled", nextAt: null, collectOtp: null, pickupOtp: null,
    legs: p.legs.map((l) => (l.state === "pending" || l.state === "active" ? { ...l, state: "failed", endedAt: at } : l)),
  });
  p.events.push({ state: "cancelled", at, note: null });
  save(KEYS.parcels, list);
}

export function mockParcel(id: string): Parcel {
  const me = currentUser();
  const { senderId: _s, holdDays: _h, nextAt: _n, tries: _t, ...parcel } = store().find((p) => p.bookingId === id && p.senderId === me.id) ?? fail("Parcel not found.");
  // Parcels saved by the demo before Quick parcel existed have neither.
  return { ...parcel, courier: parcel.courier ?? null, pickupOtp: parcel.pickupOtp ?? null };
}

const firstName = (name: string | undefined) => name?.trim().split(/\s+/)[0] || null;

export function mockTrack(input: string): PublicTracking {
  const p = store().find((x) => x.lr === input.trim().toUpperCase()) ?? fail("No parcel has that LR number. Check it and try again.");
  const me = signedInUser();
  return {
    lr: p.lr, mode: p.mode, state: p.state, from: p.from, to: p.to, departAt: p.departAt, readyAt: p.readyAt, holdUntil: p.holdUntil,
    sender: me?.id === p.senderId ? firstName(me.name) : null, receiver: firstName(p.receiver.name),
    collectAt: p.toCounter ? { name: p.toCounter.name, address: p.toCounter.address, hours: p.toCounter.hours } : null,
    events: p.events.map(({ state, at }) => ({ state, at })), simulated: p.simulated,
  };
}
