// Sample fares for the admin "Try a fare" panels (Settings and the catalog edit form). They run
// the same price functions as the API (@quikfly/shared pricing.ts), so the numbers are what a
// customer would be quoted. Staff compare today's settings or item with their unsaved draft.
import {
  generateBuses, generateSeats, priceBus, priceGroup, priceRent, priceTour, rideQuotes, sumLines,
  type CatalogItem, type CatalogItemMap, type CatalogKind, type GroupDestination, type Place, type RentalCar, type RideOption,
  type Settings, type TourPackage, type TravelVehicle,
} from "@quikfly/shared";

/** Catalog rows the samples price, with each item's id in its data. */
export interface SampleCatalog {
  places: Place[];
  rideOptions: RideOption[];
  tours: TourPackage[];
  cars: RentalCar[];
  vehicles: TravelVehicle[];
  destinations: GroupDestination[];
}

export const withId = <K extends CatalogKind>(items: CatalogItem<K>[]): CatalogItemMap[K][] =>
  items.filter((i) => i.active).map((i) => ({ ...i.data, id: i.id }) as CatalogItemMap[K]);

/** One sample: what it is, and its total under each set of settings/items. */
export interface Sample { label: string; now: number; draft: number }

/** A date a few weeks out (India), so samples never fall in the past. */
const sampleDate = () => new Date(Date.now() + 330 * 60_000 + 21 * 86_400_000).toISOString().slice(0, 10);

/** Every ride type from `a` to `b` at `hour` (India time). */
export function rideSamples(options: RideOption[], a: Place, b: Place, hour: number, now: Settings, draft: Settings, draftOptions = options): Sample[] {
  const before = rideQuotes(options, a, b, now, hour);
  const after = rideQuotes(draftOptions, a, b, draft, hour);
  const surge = (x: number, y: number) => (x === y ? (x > 1 ? ` · surge ${x}×` : "") : ` · surge ${x}× → ${y}×`);
  return before.map((q, i) => ({ label: `${q.option.name} · ${q.distanceKm} km${surge(q.surge, after[i].surge)}`, now: q.fare, draft: after[i].fare }));
}

/** One seat on the first bus of each type on a sample route, with GST. */
export function busSamples(now: Settings, draft: Settings): Sample[] {
  const date = sampleDate();
  const seatTotal = (s: Settings, type: string) => {
    const bus = generateBuses(["Sample"], s, "Chennai", "Bengaluru", date).find((b) => b.type === type)!;
    const seat = generateSeats(bus, date, s)[0];
    return sumLines(priceBus([seat], s));
  };
  const types = [...new Set(generateBuses(["Sample"], now, "Chennai", "Bengaluru", date).map((b) => b.type))];
  return types.map((t) => ({ label: `${t}, 1 seat (Chennai → Bengaluru)`, now: seatTotal(now, t), draft: seatTotal(draft, t) }));
}

/** Two adults and one child, with GST. */
export function tourSamples(tour: TourPackage, now: Settings, draft: Settings, draftTour = tour): Sample[] {
  return [{ label: `${tour.title}: 2 adults + 1 child`, now: sumLines(priceTour(tour, 2, 1, now)), draft: sumLines(priceTour(draftTour, 2, 1, draft)) }];
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

/** A one-day local package, a 2-day round trip and a one-way trip to `dest`. */
export function groupSamples(v: TravelVehicle, dest: GroupDestination | undefined, now: Settings, draft: Settings, draftVehicle = v): Sample[] {
  const price = (veh: TravelVehicle, s: Settings, trip: "local" | "outstation" | "oneway", km: number, days: number) => sumLines(priceGroup(veh, trip, km, days, s));
  const out: Sample[] = [{ label: `${v.name}: local, 1 day`, now: price(v, now, "local", 0, 1), draft: price(draftVehicle, draft, "local", 0, 1) }];
  if (dest) {
    out.push(
      { label: `${v.name}: ${dest.name}, round trip, 2 days`, now: price(v, now, "outstation", dest.km, 2), draft: price(draftVehicle, draft, "outstation", dest.km, 2) },
      { label: `${v.name}: ${dest.name}, one way`, now: price(v, now, "oneway", dest.km, 1), draft: price(draftVehicle, draft, "oneway", dest.km, 1) },
    );
  }
  return out;
}
