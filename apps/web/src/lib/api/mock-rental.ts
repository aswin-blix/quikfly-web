// Mock (demo mode) self-drive rentals: the same checklist rules as the API, stored in this
// browser. Demo mode has no staff, so a returned car is settled at once with no damage
// charge (the page says so).
import {
  CATALOG_SEED, DEFAULT_SETTINGS, FUEL_EIGHTHS, RENTAL_PHOTO_SIDES, RENTAL_RULES, extensionError, extensionLines, localNow, localToIso, rentalSettlement,
  type Booking, type QuoteRequest, type Rental, type RentalStage,
} from "@quikfly/shared";
import type { QuikflyApi } from "./contract";
import { KEYS, currentUser, fail, load, save, wait, walletEntry } from "./mock-store";

type Stored = Omit<Rental, "state"> & { hourlyRate: number; protectionPerDay: number };
const KEY = "quikfly.mockRentals";
const settings = DEFAULT_SETTINGS;
const all = () => load<Record<string, Stored>>(KEY, {});
const put = (r: Stored) => save(KEY, { ...all(), [r.bookingId]: r });
const stateOf = (r: Pick<Stored, "settlement" | "dropoff" | "pickup">): Rental["state"] => (r.settlement ? "settled" : r.dropoff ? "returned" : r.pickup ? "on_trip" : "booked");
const view = ({ hourlyRate: _h, protectionPerDay: _p, ...r }: Stored): Rental => ({ ...r, state: stateOf(r) });
const get = (id: string) => all()[id] ?? fail("This booking has no self-drive rental.");

const bookings = () => load<Booking[]>(KEYS.bookings, []);
function patchBooking(id: string, patch: (b: Booking) => Partial<Booking>) {
  save(KEYS.bookings, bookings().map((b) => (b.id === id ? { ...b, ...patch(b) } : b)));
}

/** Called by the mock booking create for a self-drive quote. */
export function mockRentalFor(bookingId: string, req: QuoteRequest, deposit: number): Booking["rentalState"] {
  if (req.service !== "rent" || req.mode !== "self") return null;
  const car = CATALOG_SEED.rentalCar.find((c) => c.id === req.carId);
  const uplift = req.kmPlan === "unlimited" ? 1 + settings.rentUnlimitedKmExtraPercent / 100 : 1;
  put({
    bookingId, start: req.start, endsAt: req.end, kmPlan: req.kmPlan, deposit, pickup: null, dropoff: null, photos: { pickup: [], return: [] },
    extensions: [], settlement: null, hourlyRate: Math.round((car?.pricePerHour ?? 0) * uplift),
    protectionPerDay: req.protection === "peace" ? settings.rentProtectionPeacePerDay : settings.rentProtectionStandardPerDay,
  });
  return "booked";
}

function reading(odometerKm: number, fuel: number) {
  if (!Number.isInteger(odometerKm) || odometerKm < 0 || odometerKm > RENTAL_RULES.maxOdometerKm) fail("Enter the odometer reading in km.");
  if (!Number.isInteger(fuel) || fuel < 0 || fuel > FUEL_EIGHTHS) fail("Choose the fuel level.");
}
const allPhotos = (r: Stored, stage: RentalStage) => RENTAL_PHOTO_SIDES.every((s) => r.photos[stage].includes(s));

export const mockRental: QuikflyApi["rental"] = {
  async get(id) { await wait(200); return view(get(id)); },
  async uploadPhoto(id, stage, side) {
    await wait(400);
    const r = get(id);
    if (stage === "pickup" && stateOf(r) !== "booked") fail("The rental has already started.");
    if (stage === "return" && stateOf(r) !== "on_trip") fail("Start the rental first.");
    const next = { ...r, photos: { ...r.photos, [stage]: [...new Set([...r.photos[stage], side])] } };
    put(next);
    return view(next);
  },
  // Demo mode keeps no photos, only which sides were taken.
  async photoUrl() { return null; },
  async start(id, { odometerKm, fuel }) {
    await wait(500);
    const r = get(id);
    if (stateOf(r) !== "booked") fail("The rental has already started.");
    reading(odometerKm, fuel);
    if (Date.now() < Date.parse(localToIso(r.start)) - RENTAL_RULES.startEarlyMinutes * 60_000) fail(`You can start the rental from ${RENTAL_RULES.startEarlyMinutes} minutes before pickup.`);
    if (!allPhotos(r, "pickup")) fail("Add all five photos first.");
    const next = { ...r, pickup: { odometerKm, fuel, at: localNow() } };
    put(next);
    patchBooking(id, () => ({ status: "ongoing", rentalState: "on_trip" }));
    return view(next);
  },
  async extensionQuote(id, hours) {
    await wait(250);
    const r = get(id);
    const err = extensionError({ state: stateOf(r), start: r.start, endsAt: r.endsAt }, hours, settings);
    if (err) fail(err);
    const lines = extensionLines(r, hours);
    return { lines, total: lines.reduce((s, l) => s + l.amount, 0), endsAt: new Date(Date.parse(`${r.endsAt}:00Z`) + hours * 3_600_000).toISOString().slice(0, 16) };
  },
  async extend(id, hours) {
    const q = await mockRental.extensionQuote(id, hours);
    const r = get(id);
    const b = bookings().find((x) => x.id === id) ?? fail("Booking not found.");
    if (b.payment === "wallet") {
      if (currentUser().walletBalance < q.total) fail("Your wallet doesn't have enough for this extension.");
      walletEntry("payment", -q.total, `Extension +${hours} hr${hours > 1 ? "s" : ""} · ${b.title}`, id);
    }
    const next = { ...r, endsAt: q.endsAt, extensions: [...r.extensions, { hours, amount: q.total, createdAt: new Date().toISOString() }] };
    put(next);
    patchBooking(id, (x) => ({ amount: x.amount + q.total, lines: [...x.lines.filter(([k]) => k !== "Return (extended)"), ["Return (extended)", q.endsAt.replace("T", " ")]] }));
    return { rental: view(next), lines: q.lines, total: q.total };
  },
  async end(id, { odometerKm, fuel }) {
    await wait(500);
    const r = get(id);
    if (stateOf(r) !== "on_trip") fail("Start the rental first.");
    reading(odometerKm, fuel);
    if (odometerKm < r.pickup!.odometerKm) fail(`The odometer can't be lower than at pickup (${r.pickup!.odometerKm} km).`);
    if (!allPhotos(r, "return")) fail("Add all five photos first.");
    const dropoff = { odometerKm, fuel, at: localNow() };
    const settlement = rentalSettlement({ ...r, pickup: r.pickup!, dropoff, damage: 0 }, settings);
    const next = { ...r, dropoff, settlement };
    put(next);
    const b = bookings().find((x) => x.id === id);
    if (b?.payment === "wallet" && settlement.depositReturned) walletEntry("refund", settlement.depositReturned, `Deposit returned · ${b.title}`, id);
    patchBooking(id, () => ({ status: "completed", rentalState: "settled", refundAmount: settlement.depositReturned }));
    return view(next);
  },
};
