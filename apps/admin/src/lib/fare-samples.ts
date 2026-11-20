// Sample fares for the admin "Try a fare" panels (Settings and the catalog edit form). They run
// the same price functions as the API (@quikfly/shared pricing.ts), so the numbers are what a
// customer would be quoted. Staff compare today's settings or item with their unsaved draft.
import {
  fareDateFor, generateBuses, generateSeats, priceBus, priceGroup, priceRent, priceTour, rideQuotes, sumLines,
  type BusRoute, type CatalogItem, type CatalogItemMap, type CatalogKind, type FareDate, type GroupDestination, type Place, type RentalCar, type RideOption, type RideTime,
  type Settings, type SurgeRule, type TourPackage, type TravelVehicle,
} from "@quikfly/shared";

/** Catalog rows the samples price, with each item's id in its data. */
export interface SampleCatalog {
  places: Place[];
  rideOptions: RideOption[];
  tours: TourPackage[];
  cars: RentalCar[];
  vehicles: TravelVehicle[];
  destinations: GroupDestination[];
  surgeRules: SurgeRule[];
  busRoutes: BusRoute[];
  fareCalendar: FareDate[];
}

export const withId = <K extends CatalogKind>(items: CatalogItem<K>[]): CatalogItemMap[K][] =>
  items.filter((i) => i.active).map((i) => ({ ...i.data, id: i.id }) as CatalogItemMap[K]);

/** One sample: what it is, and its total under each set of settings/items. */
export interface Sample { label: string; now: number; draft: number }

/** A date a few weeks out (India), so samples never fall in the past. */
const sampleDate = () => new Date(Date.now() + 330 * 60_000 + 21 * 86_400_000).toISOString().slice(0, 10);

/** Every ride type from `a` to `b` at `t` (India-time hour and weekday), with surge rules. */
export function rideSamples(
  options: RideOption[], a: Place, b: Place, t: RideTime, now: Settings, draft: Settings, draftOptions = options, rulesNow: SurgeRule[] = [], rulesDraft = rulesNow,
): Sample[] {
  const before = rideQuotes(options, a, b, now, t, [], false, rulesNow);
  const after = rideQuotes(draftOptions, a, b, draft, t, [], false, rulesDraft);
  const surge = (x: number, y: number) => (x === y ? (x > 1 ? ` · surge ${x}×` : "") : ` · surge ${x}× → ${y}×`);
  const night = (x?: number, y?: number) => (x || y ? ` · night ${x ? `₹${x}` : "none"}${x !== y ? ` → ${y ? `₹${y}` : "none"}` : ""}` : "");
  return before.map((q, i) => ({ label: `${q.option.name} · ${q.distanceKm} km${surge(q.surge, after[i].surge)}${night(q.nightCharge, after[i].nightCharge)}`, now: q.fare, draft: after[i].fare }));
}

type BusPricing = { routes?: BusRoute[]; calendar?: FareDate[] };

/**
 * One seat on the first bus of each type on a route (default Chennai → Bengaluru, a few weeks
 * out), with GST. `pricingNow` / `pricingDraft`: route fares and peak dates before and after.
 */
export function busSamples(
  now: Settings, draft: Settings, pricingNow: BusPricing = {}, pricingDraft: BusPricing = pricingNow, route = { from: "Chennai", to: "Bengaluru" }, date = sampleDate(),
): Sample[] {
  const seatTotal = (s: Settings, p: BusPricing, type: string) => {
    const bus = generateBuses(["Sample"], s, route.from, route.to, date, p).find((b) => b.type === type);
    if (!bus) return 0;
    const seat = generateSeats(bus, date, s)[0];
    return sumLines(priceBus([seat], s));
  };
  const types = [...new Set(generateBuses(["Sample"], now, route.from, route.to, date, pricingNow).map((b) => b.type))];
  return types.map((t) => ({ label: `${t}, 1 seat (${route.from} → ${route.to}, ${date})`, now: seatTotal(now, pricingNow, t), draft: seatTotal(draft, pricingDraft, t) }));
}

/** Holiday, car and group samples on `date` without and with a peak entry (the catalog preview for peak dates). */
export function peakSamples(cat: SampleCatalog, entry: FareDate, settings: Settings): Sample[] {
  const date = entry.from;
  const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const out: Sample[] = [];
  const on = (svc: FareDate["service"]) => entry.service === "all" || entry.service === svc;
  if (on("bus")) out.push(...busSamples(settings, settings, { calendar: [] }, { calendar: [entry] }, undefined, date).slice(0, 2));
  const tour = cat.tours[0];
  if (on("tours") && tour) out.push({ label: `${tour.title}: 2 adults + 1 child`, now: sumLines(priceTour(tour, 2, 1, settings)), draft: sumLines(priceTour(tour, 2, 1, settings, tour.price, entry)) });
  const car = cat.cars[0];
  if (on("rent") && car) {
    const self = { mode: "self" as const, start: `${date}T09:00`, end: `${next}T09:00`, kmPlan: "limited" as const, protection: "standard" as const, doorstep: false };
    out.push({ label: `${car.name}: self-drive, 1 day`, now: sumLines(priceRent(car, self, settings)), draft: sumLines(priceRent(car, self, settings, entry)) });
  }
  const v = cat.vehicles[0];
  if (on("rentals") && v) out.push({ label: `${v.name}: local, 1 day`, now: sumLines(priceGroup(v, "local", 0, 1, settings)), draft: sumLines(priceGroup(v, "local", 0, 1, settings, entry)) });
  return out;
}

/** Two adults and one child, with GST, a few weeks out (peak dates apply). */
export function tourSamples(tour: TourPackage, now: Settings, draft: Settings, draftTour = tour, calendar: FareDate[] = []): Sample[] {
  const peak = fareDateFor(calendar, "tours", sampleDate());
  return [{ label: `${tour.title}: 2 adults + 1 child`, now: sumLines(priceTour(tour, 2, 1, now, tour.price, peak)), draft: sumLines(priceTour(draftTour, 2, 1, draft, draftTour.price, peak)) }];
}

/** Self-drive for a day (limited km, standard protection) and a chauffeur for 8 hours. */
export function rentSamples(car: RentalCar, now: Settings, draft: Settings, draftCar = car): Sample[] {
  const day = sampleDate();
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const self = { mode: "self" as const, start: `${day}T09:00`, end: `${next}T09:00`, kmPlan: "limited" as const, protection: "standard" as const, doorstep: false };
  const driver = { ...self, mode: "driver" as const, end: `${day}T17:00` };
  return [
    { label: `${car.name}: self-drive, 1 day, limited km`, now: sumLines(priceRent(car, self, now)), draft: sumLines(priceRent(draftCar, self, draft)) },
    { label: `${car.name}: with chauffeur, 8 hours`, now: sumLines(priceRent(car, driver, now)), draft: sumLines(priceRent(draftCar, driver, draft)) },
  ];
}

/** A one-day local package, a 2-day round trip and a one-way trip to `dest` (with its toll estimate). `draftDest`: the destination as edited. */
export function groupSamples(v: TravelVehicle, dest: GroupDestination | undefined, now: Settings, draft: Settings, draftVehicle = v, draftDest = dest): Sample[] {
  const price = (veh: TravelVehicle, s: Settings, trip: "local" | "outstation" | "oneway", km: number, days: number, d = dest) =>
    sumLines(priceGroup(veh, trip, d?.km ?? km, days, s, null, trip === "local" ? null : d?.tollEstimate ?? null));
  const out: Sample[] = [{ label: `${v.name}: local, 1 day`, now: price(v, now, "local", 0, 1), draft: price(draftVehicle, draft, "local", 0, 1) }];
  if (dest) {
    out.push(
      { label: `${v.name}: ${dest.name}, round trip, 2 days`, now: price(v, now, "outstation", dest.km, 2), draft: price(draftVehicle, draft, "outstation", dest.km, 2, draftDest) },
      { label: `${v.name}: ${dest.name}, one way`, now: price(v, now, "oneway", dest.km, 1), draft: price(draftVehicle, draft, "oneway", dest.km, 1, draftDest) },
    );
  }
  return out;
}
