// Parcels for customers: departures, prices, the rows a booking creates, and reading one back.
// Moving a parcel is legs.ts; who moves it is carriers.ts.
import {
  GSTIN_LINE, PARCEL_DECLARATION, PARCEL_LR, QUICK_PARCEL_CITY, parcelBookingText, parcelDepartures, parcelLiability, parcelLr, parcelRateFor,
  planLegs, planQuickLegs, nextMoveAt, priceParcelCity, priceParcelIntercity, quickParcelText, rideQuotes, rideTimeAt, switchError, isWomenOnly,
  type FareLine, type NewBooking, type Parcel, type ParcelEvent, type ParcelMode, type ParcelOptions, type ParcelQuoteInfo, type ParcelState,
  type PublicTracking, type QuoteRequest, type Ride, type Settings,
} from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { randomToken } from "../../lib/random";
import { visible } from "../catalog";
import { placeById } from "../places";
import { getSettings } from "../settings";
import { newCourierRide, parcelRide } from "./courier";
import { loadParcels, type LoadedParcel } from "./legs";

type ParcelRequest = Extract<QuoteRequest, { service: "parcel" }>;

/** The two cities as the catalog spells them (the timetable is seeded by the names). */
async function route(db: D1Database, fromInput: string, toInput: string) {
  const cities = await visible(db, "city");
  const named = (input: string) => {
    const city = cities.find((c) => c.name.toLowerCase() === input.trim().toLowerCase());
    if (!city) throw badRequest(`QuikFly doesn't run buses in "${input}".`);
    return city.name;
  };
  const from = named(fromInput), to = named(toInput);
  if (from === to) throw badRequest("Pick two different cities.");
  return { from, to };
}

export async function departuresBetween(db: D1Database, settings: Settings, fromInput: string, toInput: string) {
  const { from, to } = await route(db, fromInput, toInput);
  const [operators, counters, rates] = await Promise.all([visible(db, "busOperator"), visible(db, "parcelCounter"), visible(db, "parcelRate")]);
  return { from, to, rates, departures: parcelDepartures({ operators, counters, rates }, settings, from, to) };
}

export async function parcelOptions(db: D1Database, from: string, to: string): Promise<ParcelOptions> {
  const settings = await getSettings(db);
  const off = switchError(settings, { service: "parcel" });
  if (off) throw conflict(off);
  const { departures } = await departuresBetween(db, settings, from, to);
  return { departures, declaration: PARCEL_DECLARATION };
}

/** What POST /quotes needs for a parcel. `request` is what the quote stores for booking. */
export async function priceParcel(
  db: D1Database, settings: Settings, req: ParcelRequest,
): Promise<{ lines: FareLine[]; startsAt: string | null; request: ParcelRequest; info: ParcelQuoteInfo }> {
  if (Number(req.weightBand) > settings.parcelMaxKg) throw badRequest(`Parcels can weigh up to ${settings.parcelMaxKg} kg.`);
  if (req.declaredValue > settings.parcelMaxDeclaredValue) {
    throw badRequest(`Parcels can be worth up to ₹${settings.parcelMaxDeclaredValue.toLocaleString("en-IN")}. We can't carry anything more valuable.`);
  }
  const liability = parcelLiability(req.declaredValue, settings.parcelLiabilityCap);

  if (req.mode === "city") {
    if (req.pickupId === req.dropId) throw badRequest("Pickup and drop must be different places.");
    const [pickup, drop, options, rules] = await Promise.all([
      placeById(db, req.pickupId), placeById(db, req.dropId), visible(db, "rideOption"), visible(db, "surgeRule"),
    ]);
    const bike = options.find((o) => o.service === "bike" && o.id !== "auto" && !isWomenOnly(o));
    if (!bike) throw conflict("Quick parcel isn't available right now.");
    const fare = rideQuotes([bike], pickup, drop, settings, rideTimeAt(Date.now()), [], false, rules)[0];
    // No start time: a Quick parcel follows the ride cancellation rules.
    return {
      lines: priceParcelCity(fare, req.weightBand, settings), startsAt: null,
      request: { ...req, plan: { fare, pickup, drop, liability } },
      info: { liability, departure: null },
    };
  }

  if (req.pickup === "door" || req.delivery === "door") throw badRequest("Door pickup and delivery aren't open yet. Choose the counter.");
  const { from, to, rates, departures } = await departuresBetween(db, settings, req.from, req.to);
  if (!departures.length) throw badRequest(`No bus takes parcels from ${from} to ${to}.`);
  const at = Date.parse(req.departAt);
  const departure = departures.find((d) => d.busId === req.busId && Date.parse(d.departAt) === at);
  if (!departure) throw badRequest("That bus isn't taking parcels: it doesn't run then, or its hand-in time has passed. Pick another departure.");
  return {
    lines: priceParcelIntercity(parcelRateFor(rates, departure.operatorId, from, to), req.weightBand, settings),
    startsAt: departure.departAt,
    request: { ...req, from, to, departAt: departure.departAt, plan: { departure, liability } },
    info: { liability, departure },
  };
}

export interface NewParcel {
  mode: ParcelMode;
  title: string;
  subtitle: string;
  lines: [string, string][];
  statements: (bookingId: string, createdAt: string) => D1PreparedStatement[];
}

/** Checks a parcel booking and prepares its rows for the booking's batch. */
export async function newParcel(db: D1Database, userId: string, req: ParcelRequest, input: NewBooking): Promise<NewParcel> {
  if (!req.plan) throw badRequest("That price isn't valid. Please check the price again.");
  const { receiver, contents, declaration } = input;
  if (!receiver || !contents) throw badRequest('"receiver" and "contents" are required for parcels.');
  if (declaration !== PARCEL_DECLARATION.version) throw badRequest("Please read and accept the current parcel declaration.");
  if (input.payment === "cash") {
    if (req.mode === "intercity") throw badRequest("Bus parcels are paid when you book. Choose the wallet, UPI, card or net banking.");
    const off = switchError(await getSettings(db), { service: "parcel", payment: "cash" });
    if (off) throw conflict(off);
  }
  // The quote is held for 30 minutes; the bus doesn't wait that long.
  if (req.mode === "intercity" && Date.parse(req.plan!.departure.cutoffAt) <= Date.now()) throw conflict("The hand-in time for that bus has passed. Pick another departure.");

  const account = await db.prepare("SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL").bind(receiver.phone).first<{ id: string }>();
  const random = crypto.getRandomValues(new Uint8Array(PARCEL_LR.randomLength));
  const route = req.mode === "city"
    ? await cityRoute(db, req, input, random)
    : busRoute(req, random);
  const { lr, legs, text, ride } = route;
  const firstEvent = randomToken(12);
  // A GST invoice is the one line the sender can ask for; its value comes from their profile, not the request.
  if (input.lines.some(([k]) => k === GSTIN_LINE)) {
    const gst = await db.prepare("SELECT gstin, gst_name FROM users WHERE id = ?").bind(userId).first<{ gstin: string | null; gst_name: string | null }>();
    if (gst?.gstin && gst.gst_name) text.lines.push([GSTIN_LINE, `${gst.gstin} · ${gst.gst_name}`]);
  }

  return {
    mode: req.mode,
    ...text,
    statements: (id, createdAt) => [
      db.prepare(
        `INSERT INTO parcels (booking_id, user_id, lr, mode, state, move_id, next_at, from_city, to_city, depart_at, ready_at, from_counter, to_counter,
           pickup_place_id, drop_place_id,
           category, weight_band, size, declared_value, liability_cap, contents, receiver_name, receiver_phone, receiver_user_id,
           pickup_kind, delivery_kind, declaration_version, created_at, updated_at)
         SELECT ?1, ?2, ?3, ?4, 'booked', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?27
         WHERE EXISTS (SELECT 1 FROM bookings WHERE id = ?1)`,
      ).bind(id, userId, lr, req.mode, firstEvent, nextMoveAt(legs, null), route.from, route.to, route.departAt, route.readyAt,
        route.fromCounter, route.toCounter, route.pickupPlace, route.dropPlace,
        req.category, req.weightBand, req.size, req.declaredValue, route.liability, contents, receiver.name, receiver.phone, account?.id ?? null,
        route.pickupKind, route.deliveryKind, declaration, createdAt),
      // The captain's ride: never bookable as a ride (status 'parcel').
      ...(ride ? [db.prepare(
        "INSERT INTO rides (id, user_id, status, data, created_at) SELECT ?2, ?3, 'parcel', ?4, ?5 WHERE EXISTS (SELECT 1 FROM parcels WHERE booking_id = ?1)",
      ).bind(id, ride.id, userId, JSON.stringify(ride), createdAt)] : []),
      db.prepare(
        `INSERT INTO parcel_legs (id, booking_id, seq, kind, state, operator_id, counter_id, bus_id, bus_date, depart_at, planned_at, ride_id)
         SELECT ?1 || ':' || json_extract(l.value, '$.seq'), ?1, json_extract(l.value, '$.seq'), json_extract(l.value, '$.kind'), 'pending',
           json_extract(l.value, '$.operatorId'), json_extract(l.value, '$.counterId'), json_extract(l.value, '$.busId'),
           json_extract(l.value, '$.busDate'), json_extract(l.value, '$.departAt'), json_extract(l.value, '$.plannedAt'),
           CASE WHEN json_extract(l.value, '$.kind') = 'bike' THEN ?3 END
         FROM json_each(?2) l WHERE EXISTS (SELECT 1 FROM parcels WHERE booking_id = ?1)`,
      ).bind(id, JSON.stringify(legs), ride?.id ?? null),
      db.prepare("INSERT INTO parcel_events (id, booking_id, state, at) SELECT ?2, ?1, 'booked', ?3 WHERE EXISTS (SELECT 1 FROM parcels WHERE booking_id = ?1)")
        .bind(id, firstEvent, createdAt),
    ],
  };
}

/** A bus parcel's columns, legs and wording. */
function busRoute(req: Extract<ParcelRequest, { mode: "intercity" }>, random: Uint8Array) {
  const { departure, liability } = req.plan!;
  const lr = parcelLr(req.from, req.to, random);
  return {
    lr, liability, legs: planLegs(departure), ride: null as Ride | null,
    text: parcelBookingText(departure, req.weightBand, lr, liability),
    from: req.from, to: req.to, departAt: departure.departAt as string | null, readyAt: departure.readyAt,
    fromCounter: JSON.stringify(departure.fromCounter) as string | null, toCounter: JSON.stringify(departure.toCounter) as string | null,
    pickupPlace: null as string | null, dropPlace: null as string | null,
    pickupKind: req.pickup, deliveryKind: req.delivery,
  };
}

/** A Quick parcel's: one leg with a captain from the roster. */
async function cityRoute(db: D1Database, req: Extract<ParcelRequest, { mode: "city" }>, input: NewBooking, random: Uint8Array): Promise<ReturnType<typeof busRoute>> {
  const plan = req.plan!;
  const { pickup, drop, fare, liability } = plan;
  const lr = parcelLr(QUICK_PARCEL_CITY, QUICK_PARCEL_CITY, random);
  return {
    lr, liability, legs: planQuickLegs(), ride: await newCourierRide(db, plan, input.payment),
    text: quickParcelText(pickup, drop, req.weightBand, lr, liability),
    from: QUICK_PARCEL_CITY, to: QUICK_PARCEL_CITY, departAt: null,
    readyAt: new Date(Date.now() + (fare.etaMin + fare.durationMin) * 60_000).toISOString(),
    fromCounter: null, toCounter: null, pickupPlace: pickup.id, dropPlace: drop.id,
    pickupKind: "door", deliveryKind: "door",
  };
}

/** Parcel states of these bookings, by booking id. */
export async function parcelStates(db: D1Database, ids: string[]): Promise<Map<string, ParcelState>> {
  const map = new Map<string, ParcelState>();
  if (!ids.length) return map;
  const { results } = await db.prepare("SELECT booking_id, state FROM parcels WHERE booking_id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(ids)).all<{ booking_id: string; state: ParcelState }>();
  for (const r of results) map.set(r.booking_id, r.state);
  return map;
}

async function eventsOf(db: D1Database, id: string) {
  const { results } = await db.prepare("SELECT state, note, at FROM parcel_events WHERE booking_id = ? ORDER BY at, rowid").bind(id).all<ParcelEvent>();
  return results;
}

export async function toParcel(db: D1Database, { row, legs }: LoadedParcel, forSender: boolean): Promise<Parcel> {
  const [settings, events, ride] = await Promise.all([
    getSettings(db), eventsOf(db, row.booking_id), legs.some((l) => l.kind === "bike") ? parcelRide(db, row.booking_id) : null,
  ]);
  const active = row.booking_status === "confirmed" || row.booking_status === "ongoing";
  return {
    bookingId: row.booking_id, lr: row.lr, mode: row.mode, state: row.state, from: row.from_city, to: row.to_city,
    departAt: row.depart_at, readyAt: row.ready_at,
    fromCounter: row.from_counter ? JSON.parse(row.from_counter) : null,
    toCounter: row.to_counter ? JSON.parse(row.to_counter) : null,
    category: row.category, weightBand: row.weight_band, size: row.size, declaredValue: row.declared_value, liability: row.liability_cap,
    contents: row.contents, receiver: { name: row.receiver_name, phone: row.receiver_phone }, declarationVersion: row.declaration_version,
    holdUntil: row.hold_until, legs, events,
    collectOtp: forSender && active && (row.state === "ready" || row.state === "in_transit") ? row.collect_otp : null,
    courier: ride && {
      captain: ride.driver, distanceKm: ride.quote.distanceKm, durationMin: ride.quote.durationMin,
      pickup: { id: ride.pickup.id, name: ride.pickup.name, area: ride.pickup.area },
      drop: { id: ride.drop.id, name: ride.drop.name, area: ride.drop.area },
    },
    pickupOtp: forSender && active && ride && row.state === "booked" ? ride.otp : null,
    simulated: settings.parcelSimulateTransit,
  };
}

/** The sender's own parcel. The receiver gets no access by signing in: they use the tracking page. */
export async function myParcel(db: D1Database, userId: string, id: string): Promise<Parcel> {
  const found = (await loadParcels(db, "p.booking_id = ? AND p.user_id = ?", id, userId))[0];
  if (!found) throw notFound("Parcel not found.");
  return toParcel(db, found, true);
}

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] || null;

export async function trackParcel(db: D1Database, input: string): Promise<PublicTracking> {
  const lr = input.trim().toUpperCase();
  const missing = () => notFound("No parcel has that LR number. Check it and try again.");
  if (!PARCEL_LR.pattern.test(lr)) throw missing();
  const row = await db.prepare(
    `SELECT p.booking_id, p.lr, p.mode, p.state, p.from_city, p.to_city, p.depart_at, p.ready_at, p.hold_until, p.to_counter, p.receiver_name,
       CASE WHEN u.erased_at IS NULL THEN u.name END AS sender_name
     FROM parcels p LEFT JOIN users u ON u.id = p.user_id WHERE p.lr = ?`,
  ).bind(lr).first<{
    booking_id: string; lr: string; mode: ParcelMode; state: ParcelState; from_city: string; to_city: string; depart_at: string | null; ready_at: string | null;
    hold_until: string | null; to_counter: string | null; receiver_name: string; sender_name: string | null;
  }>();
  if (!row) throw missing();
  const [settings, events] = await Promise.all([getSettings(db), eventsOf(db, row.booking_id)]);
  const counter = row.to_counter ? JSON.parse(row.to_counter) : null;
  return {
    lr: row.lr, mode: row.mode, state: row.state, from: row.from_city, to: row.to_city, departAt: row.depart_at, readyAt: row.ready_at, holdUntil: row.hold_until,
    sender: firstName(row.sender_name), receiver: firstName(row.receiver_name),
    collectAt: counter ? { name: counter.name, address: counter.address, hours: counter.hours } : null,
    // A bus or weight change is an event with the same state, and its note isn't public: show each state once.
    events: events.filter((e, i) => e.state !== events[i - 1]?.state).map(({ state, at }) => ({ state, at })),
    simulated: settings.parcelSimulateTransit,
  };
}
