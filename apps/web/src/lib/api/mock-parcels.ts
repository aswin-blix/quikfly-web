// Parcels in demo mode, with the API's rules (packages/shared/src/parcel.ts) and this browser as
// the database. Transit catches up with the clock whenever parcels are read. There are no staff
// here, so nothing is handed over: a parcel waits as "ready" until its hold period ends.
import {
  CATALOG_SEED, GSTIN_LINE, PARCEL_DECLARATION, PARCEL_LR, PARCEL_NOT_CANCELLABLE, PARCEL_CANCELLABLE, PARCEL_RULES, PATTERNS, isWomenOnly, nextMoveAt,
  parcelBookingText, parcelDepartures, parcelLiability, parcelLr, parcelNotice, parcelRateFor, planLegMove, planLegs, priceParcelCity,
  priceParcelIntercity, rideQuotes, rideTimeAt, simulatedMove, switchError,
  type AppNotification, type FareLine, type NewBooking, type Parcel, type ParcelOptions, type ParcelQuoteInfo, type ParcelState,
  type PublicTracking, type QuoteRequest, type Settings,
} from "@quikfly/shared";
import { KEYS, currentUser, fail, load, save, signedInUser } from "./mock-store";

type ParcelRequest = Extract<QuoteRequest, { service: "parcel" }>;
interface StoredParcel extends Parcel { senderId: string; holdDays: number; nextAt: string | null }
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
    return { lines: priceParcelCity(fare, r.weightBand, settings), request: r, info: { liability, departure: null } };
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

/** Checks a parcel booking; `save` writes the parcel once the booking has gone in. */
export function mockNewParcel(settings: Settings, req: ParcelRequest, input: NewBooking) {
  checkOn(settings);
  if (req.mode === "city") return fail("Quick parcel booking isn't open yet.");
  const { departure, liability } = req.plan ?? fail("That price isn't valid. Please check the price again.");
  const receiver = input.receiver ?? fail("Add who receives the parcel.");
  const digits = receiver.phone.replace(/\D/g, "").slice(-10);
  if (!PATTERNS.phone.test(digits)) fail("Enter the receiver's 10-digit mobile number.");
  const contents = input.contents?.trim() ?? "";
  if (contents.length < PARCEL_RULES.contentsMin || contents.length > PARCEL_RULES.contentsMax) fail("Say what's inside, in a few words.");
  if (input.declaration !== PARCEL_DECLARATION.version) fail("Please read and accept the current parcel declaration.");
  if (input.payment === "cash") fail("Bus parcels are paid when you book. Choose the wallet, UPI, card or net banking.");
  if (Date.parse(departure.cutoffAt) <= Date.now()) fail("The hand-in time for that bus has passed. Pick another departure.");

  const lr = parcelLr(req.from, req.to, crypto.getRandomValues(new Uint8Array(PARCEL_LR.randomLength)));
  const text = parcelBookingText(departure, req.weightBand, lr, liability);
  const gst = currentUser().gst;
  if (gst && input.lines.some(([k]) => k === GSTIN_LINE)) text.lines.push([GSTIN_LINE, `${gst.gstin} · ${gst.name}`]);
  return {
    ...text,
    save(bookingId: string, createdAt: string) {
      const legs = planLegs(departure);
      const parcel: StoredParcel = {
        bookingId, lr, mode: "intercity", state: "booked", from: req.from, to: req.to, departAt: departure.departAt, readyAt: departure.readyAt,
        fromCounter: departure.fromCounter, toCounter: departure.toCounter,
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
        Object.assign(p, {
          legs: move.legs, state: move.state, holdUntil: move.holdUntil, nextAt: move.nextAt,
          collectOtp: move.state === "ready" ? String(crypto.getRandomValues(new Uint32Array(1))[0]).padStart(10, "0").slice(-PARCEL_RULES.collectOtpDigits) : null,
        });
        p.events.push({ state: move.state, at: new Date(at).toISOString(), note: null });
        const notice = parcelNotice(move.state, p.lr);
        if (notice) notify({ ...notice, bookingId: p.bookingId });
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
    state: "cancelled", nextAt: null, collectOtp: null,
    legs: p.legs.map((l) => (l.state === "pending" || l.state === "active" ? { ...l, state: "failed", endedAt: at } : l)),
  });
  p.events.push({ state: "cancelled", at, note: null });
  save(KEYS.parcels, list);
}

export function mockParcel(id: string): Parcel {
  const me = currentUser();
  const { senderId: _s, holdDays: _h, nextAt: _n, ...parcel } = store().find((p) => p.bookingId === id && p.senderId === me.id) ?? fail("Parcel not found.");
  return parcel;
}

const firstName = (name: string | undefined) => name?.trim().split(/\s+/)[0] || null;

export function mockTrack(input: string): PublicTracking {
  const p = store().find((x) => x.lr === input.trim().toUpperCase()) ?? fail("No parcel has that LR number. Check it and try again.");
  const me = signedInUser();
  return {
    lr: p.lr, state: p.state, from: p.from, to: p.to, departAt: p.departAt, readyAt: p.readyAt, holdUntil: p.holdUntil,
    sender: me?.id === p.senderId ? firstName(me.name) : null, receiver: firstName(p.receiver.name),
    collectAt: p.toCounter ? { name: p.toCounter.name, address: p.toCounter.address, hours: p.toCounter.hours } : null,
    events: p.events.map(({ state, at }) => ({ state, at })), simulated: p.simulated,
  };
}
