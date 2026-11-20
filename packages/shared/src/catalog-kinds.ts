// The editable catalog: which kinds exist, their fields, and how they're validated.
// One definition drives three things: API validation (routes/admin/catalog.ts), the admin
// panel's list and edit forms, and the seed copied into D1. To add a field: add it to the
// type in types.ts, here, and to the seed in catalog.ts.
import type { Permission } from "./admin";
import { HOUR_RANGES, hourRangesError } from "./settings";
import {
  BUS_OPERATORS, CITIES, DEPARTURES, DRIVERS, FAQS, GROUP_DESTINATIONS, OFFERS, PLACES, POPULAR_ROUTES, RENTAL_CARS, RIDE_OPTIONS, TOURS, TRAVEL_VEHICLES,
} from "./catalog";
import type {
  BusOperator, City, DriverProfile, Faq, GroupDestination, Offer, Place, PopularRoute, RentalCar, RideOption, SurgeRule, TourDeparture, TourPackage, TravelVehicle,
} from "./types";
import { FAQ_CATEGORIES } from "./types";

export interface CatalogItemMap {
  place: Place;
  rideOption: RideOption;
  surgeRule: SurgeRule;
  driver: DriverProfile;
  city: City;
  busOperator: BusOperator;
  popularRoute: PopularRoute;
  tour: TourPackage;
  departure: TourDeparture;
  rentalCar: RentalCar;
  travelVehicle: TravelVehicle;
  groupDestination: GroupDestination;
  offer: Offer;
  faq: Faq;
}
export type CatalogKind = keyof CatalogItemMap;

/** A catalog row as the admin panel sees it. Hidden items (active false) never reach customers. */
export interface CatalogItem<K extends CatalogKind = CatalogKind> {
  kind: K;
  id: string;
  data: CatalogItemMap[K];
  active: boolean;
  /** Lower comes first. */
  sort: number;
  updatedAt: string;
}

export type FieldType = "text" | "longtext" | "int" | "number" | "select" | "multiselect" | "list" | "date";

export interface CatalogField {
  key: string;
  label: string;
  type: FieldType;
  /** Optional fields may be empty: null for numbers and dates, omitted for text. */
  optional?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  /** For select / multiselect. */
  options?: readonly string[];
  pattern?: RegExp;
  hint?: string;
  /** Upper-cases text (codes, plates). */
  upper?: boolean;
  /** Sets or changes what customers pay: only roles with "pricing.edit" may change it (admin.ts). */
  pricing?: boolean;
}

export interface CatalogKindDef {
  label: string;
  singular: string;
  /** Admin panel grouping. */
  group: "Rides" | "Bus" | "Holidays" | "Rentals" | "Marketing";
  description: string;
  idPrefix: string;
  permission: Permission;
  fields: CatalogField[];
  /** Field whose value must be unique within the kind (case-insensitive). */
  unique?: string;
  /** One-line title and detail for lists. */
  title: (d: Record<string, unknown>) => string;
  detail: (d: Record<string, unknown>) => string;
}

const SERVICES = ["bike", "car", "bus", "tours", "rent", "rentals"] as const;
const name = (label = "Name"): CatalogField => ({ key: "name", label, type: "text", maxLength: 80 });
const rupees = (key: string, label: string, max = 100_000): CatalogField => ({ key, label, type: "int", min: 0, max, hint: "In rupees", pricing: true });
const rating: CatalogField = { key: "rating", label: "Rating", type: "number", min: 1, max: 5, hint: "1 to 5" };
const inr = (n: unknown) => `₹${Number(n).toLocaleString("en-IN")}`;

export const CATALOG_DEFS: Record<CatalogKind, CatalogKindDef> = {
  place: {
    label: "Places", singular: "place", group: "Rides", idPrefix: "p", permission: "catalog.edit",
    description: "Pickup and drop points for bike and cab rides, positioned on the demo city map.",
    fields: [
      name(), { key: "area", label: "Area", type: "text", maxLength: 80 },
      { key: "x", label: "Map position across", type: "int", min: 0, max: 100, hint: "0 = left edge, 100 = right edge of the demo map" },
      { key: "y", label: "Map position down", type: "int", min: 0, max: 100, hint: "0 = top, 100 = bottom" },
    ],
    title: (d) => String(d.name), detail: (d) => String(d.area),
  },
  rideOption: {
    label: "Ride types and fares", singular: "ride type", group: "Rides", idPrefix: "ro", permission: "catalog.edit",
    description: "Bike, auto and cab types with their fares. Fare = base + per km (after any included km) + per minute, at least the minimum fare, times surge, plus any night charge.",
    fields: [
      name(), { key: "service", label: "Service", type: "select", options: ["bike", "car"], hint: '"bike" also covers autos' },
      { key: "description", label: "Description", type: "text", maxLength: 120 },
      { key: "seats", label: "Seats", type: "int", min: 1, max: 12 },
      rupees("baseFare", "Base fare", 2000),
      { key: "perKm", label: "Per km", type: "number", min: 0, max: 100, hint: "In rupees, up to ₹100", pricing: true },
      { key: "perMin", label: "Per minute", type: "number", min: 0, max: 10, hint: "In rupees, up to ₹10", pricing: true },
      { key: "models", label: "Vehicle models", type: "list", maxLength: 60, hint: "One per line; a driver arrives in one of these" },
      { key: "riders", label: "Riders", type: "select", options: ["everyone", "women"], optional: true, hint: '"women": only women riders see it, and a woman captain drives' },
      { key: "minFare", label: "Minimum fare", type: "int", min: 0, max: 2000, optional: true, pricing: true, hint: "In rupees, before surge and night charge. Empty or 0 = no minimum (state fare cards set one, e.g. ₹100)" },
      { key: "includedKm", label: "Km in the base fare", type: "number", min: 0, max: 20, optional: true, pricing: true, hint: "Per km starts after this distance (MVAG 2025: 3 km). Empty = per km from the start" },
      { key: "speedKmh", label: "Average speed", type: "int", min: 5, max: 80, optional: true, pricing: true, hint: "km/h; sets the billed minutes. Empty = 24 for bikes and autos, 20 for cabs" },
    ],
    title: (d) => String(d.name),
    detail: (d) => `${d.service === "car" ? "Cab" : "Bike/auto"} · ${inr(d.baseFare)}${d.includedKm ? ` incl. ${d.includedKm} km` : ""} + ${inr(d.perKm)}/km + ${inr(d.perMin)}/min${d.minFare ? ` · min ${inr(d.minFare)}` : ""}`,
  },
  surgeRule: {
    label: "Surge rules", singular: "surge rule", group: "Rides", idPrefix: "sr", permission: "catalog.edit",
    description: "Surge for some ride types on some days and hours, e.g. cabs Mon–Fri 8–10 ×1.3. The highest matching rule or the everyday surge (Settings) applies, never above the surge cap.",
    fields: [
      name(),
      { key: "appliesTo", label: "Ride types", type: "select", options: ["all", "bike", "auto", "cab"], pricing: true, hint: '"bike" means bikes (not autos)' },
      { key: "days", label: "Days", type: "multiselect", options: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], pricing: true },
      { key: "hours", label: "Hours", type: "text", maxLength: 60, pattern: HOUR_RANGES, pricing: true, hint: 'India time, inclusive ranges like "8-10, 17-20" (8-10 covers 08:00–10:59)' },
      { key: "multiplier", label: "Multiplier", type: "number", min: 1, max: 2, pricing: true, hint: "1 to 2; the surge cap in Settings still applies" },
    ],
    title: (d) => String(d.name),
    detail: (d) => {
      const days = d.days as string[];
      const when = days.length === 7 ? "Every day" : days.join(",") === "Mon,Tue,Wed,Thu,Fri" ? "Mon–Fri" : days.join(",") === "Sat,Sun" ? "Weekends" : days.join(", ");
      return `${d.appliesTo === "all" ? "All ride types" : d.appliesTo === "cab" ? "Cabs" : d.appliesTo === "auto" ? "Autos" : "Bikes"} · ${when} · ${d.hours} · ×${d.multiplier}`;
    },
  },
  driver: {
    label: "Drivers", singular: "driver", group: "Rides", idPrefix: "d", permission: "catalog.edit",
    description: "The roster a booked ride picks its driver from (simulated assignment).",
    fields: [
      name(), rating, { key: "trips", label: "Trips completed", type: "int", min: 0, max: 1_000_000 },
      { key: "phone", label: "Phone", type: "text", maxLength: 20, pattern: /^\+?[\d\s-]{8,20}$/, hint: "e.g. +91 98400 12345" },
      { key: "gender", label: "Gender", type: "select", options: ["female", "male"], optional: true, hint: 'Women-only rides go to "female" drivers' },
    ],
    title: (d) => String(d.name), detail: (d) => `${d.rating}★ · ${Number(d.trips).toLocaleString("en-IN")} trips · ${d.phone}`,
  },
  city: {
    label: "Cities", singular: "city", group: "Bus", idPrefix: "c", permission: "catalog.edit",
    description: "Cities offered in bus search and self-drive pickup.", unique: "name",
    fields: [name("City")],
    title: (d) => String(d.name), detail: () => "",
  },
  busOperator: {
    label: "Bus operators", singular: "bus operator", group: "Bus", idPrefix: "bo", permission: "catalog.edit",
    description: "Operators the bus timetable is generated from. The first one appears on the first bus of every search.", unique: "name",
    fields: [name("Operator")],
    title: (d) => String(d.name), detail: () => "",
  },
  popularRoute: {
    label: "Popular routes", singular: "popular route", group: "Bus", idPrefix: "r", permission: "catalog.edit",
    description: "Route shortcuts on the bus page.",
    fields: [{ key: "from", label: "From", type: "text", maxLength: 60 }, { key: "to", label: "To", type: "text", maxLength: 60 }],
    title: (d) => `${d.from} → ${d.to}`, detail: () => "",
  },
  tour: {
    label: "Holiday packages", singular: "holiday package", group: "Holidays", idPrefix: "t", permission: "catalog.edit",
    description: "Packages on the holidays page. The web address is /holidays/<slug>.", unique: "slug",
    fields: [
      { key: "title", label: "Title", type: "text", maxLength: 80 },
      { key: "slug", label: "Web address (slug)", type: "text", maxLength: 60, pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, hint: "Lower-case words joined by dashes, e.g. goa-beach-holiday" },
      { key: "location", label: "Location", type: "text", maxLength: 60 },
      { key: "themes", label: "Themes", type: "multiselect", options: ["beach", "hills", "international", "weekend", "heritage", "spiritual", "women", "seniors"], hint: '"women" = women-only group, "seniors" = easy pace for older travellers' },
      { key: "days", label: "Days", type: "int", min: 1, max: 60 },
      { key: "nights", label: "Nights", type: "int", min: 0, max: 60 },
      rupees("price", "Price per adult", 2_000_000), rating,
      { key: "hotelStars", label: "Hotel stars", type: "int", min: 1, max: 5 },
      { key: "meals", label: "Meals", type: "text", maxLength: 60 },
      { key: "tag", label: "Badge", type: "text", optional: true, maxLength: 20, hint: 'e.g. "Bestseller"; leave empty for none' },
      { key: "hue", label: "Artwork colour", type: "int", min: 0, max: 360, hint: "Hue 0–360 for the generated artwork" },
      { key: "highlights", label: "Highlights", type: "list", maxLength: 80, hint: "One per line" },
      { key: "includes", label: "Includes", type: "list", maxLength: 60, hint: "One per line" },
      { key: "itinerary", label: "Itinerary", type: "list", maxLength: 160, hint: "One line per day" },
    ],
    title: (d) => String(d.title), detail: (d) => `${d.location} · ${d.days}D/${d.nights}N · ${inr(d.price)}`,
  },
  departure: {
    label: "Holiday departures", singular: "departure", group: "Holidays", idPrefix: "dp", permission: "catalog.edit",
    description: "Dated group departures of a package. A package with upcoming departures is booked by departure (seats left shown); without, any start date.",
    fields: [
      { key: "tourId", label: "Package id", type: "text", maxLength: 20, hint: 'The holiday package\'s id, e.g. "t9"' },
      { key: "date", label: "Departure date", type: "date" },
      { key: "fromCity", label: "Departs from", type: "text", maxLength: 40, hint: 'e.g. "Chennai"' },
      { key: "seats", label: "Seats", type: "int", min: 1, max: 200 },
      { key: "price", label: "Price per adult", type: "int", optional: true, min: 0, max: 2_000_000, hint: "In rupees; empty = the package price", pricing: true },
    ],
    title: (d) => `${d.tourId} · ${d.date} from ${d.fromCity}`, detail: (d) => `${d.seats} seats${d.price ? ` · ${inr(d.price)}` : ""}`,
  },
  rentalCar: {
    label: "Rental cars", singular: "rental car", group: "Rentals", idPrefix: "rc", permission: "catalog.edit",
    description: "Self-drive and chauffeur cars. The web address is /rent-a-car/<id>.",
    fields: [
      name("Model"),
      { key: "category", label: "Category", type: "select", options: ["Hatchback", "Sedan", "SUV", "MUV", "Luxury"] },
      { key: "seats", label: "Seats", type: "int", min: 2, max: 12 },
      { key: "transmission", label: "Transmission", type: "select", options: ["Manual", "Automatic"] },
      { key: "fuel", label: "Fuel", type: "select", options: ["Petrol", "Diesel", "EV"] },
      rupees("pricePerHour", "Price per hour", 10_000), rupees("driverPerDay", "Driver per day", 10_000), rating,
      { key: "trips", label: "Trips completed", type: "int", min: 0, max: 1_000_000 },
      { key: "year", label: "Year", type: "int", min: 2000, max: 2100 },
      { key: "features", label: "Features", type: "list", maxLength: 40, hint: "One per line" },
    ],
    title: (d) => String(d.name), detail: (d) => `${d.category} · ${d.transmission} · ${inr(d.pricePerHour)}/hr`,
  },
  travelVehicle: {
    label: "Group vehicles", singular: "group vehicle", group: "Rentals", idPrefix: "tv", permission: "catalog.edit",
    description: "Tempo travellers, minibuses and coaches for group travel.",
    fields: [
      name(), { key: "seats", label: "Seats", type: "int", min: 2, max: 80 },
      { key: "perKm", label: "Per km", type: "number", min: 0, max: 200, hint: "In rupees, up to ₹200", pricing: true },
      { key: "minKmPerDay", label: "Minimum km per day", type: "int", min: 0, max: 2000, pricing: true },
      rupees("driverBataPerDay", "Driver allowance per day", 10_000),
      rupees("localPackage", "Local package per day", 100_000),
      { key: "features", label: "Features", type: "list", maxLength: 40, hint: "One per line" },
    ],
    title: (d) => String(d.name), detail: (d) => `${d.seats} seats · ${inr(d.perKm)}/km · local ${inr(d.localPackage)}/day`,
  },
  groupDestination: {
    label: "Group destinations", singular: "group destination", group: "Rentals", idPrefix: "g", permission: "catalog.edit",
    description: "Outstation destinations for group travel, priced on the round-trip distance from Chennai.", unique: "name",
    fields: [name("Destination"), { key: "km", label: "One-way distance", type: "int", min: 1, max: 3000, hint: "km from Chennai; sets the trip price", pricing: true }],
    title: (d) => String(d.name), detail: (d) => `${d.km} km one way`,
  },
  offer: {
    label: "Offers and coupons", singular: "offer", group: "Marketing", idPrefix: "of", permission: "offers.edit",
    description: "Coupon codes. The API checks them when a booking is made; hidden or expired codes stop working within 30 seconds.", unique: "code",
    fields: [
      { key: "code", label: "Code", type: "text", maxLength: 20, upper: true, pattern: /^[A-Z0-9]{3,20}$/, hint: "3–20 letters or digits, e.g. BUS150" },
      { key: "title", label: "Title", type: "text", maxLength: 80 },
      { key: "description", label: "Description", type: "text", maxLength: 160 },
      { key: "service", label: "Works on", type: "select", options: ["all", ...SERVICES], pricing: true },
      { key: "percent", label: "Discount", type: "int", min: 1, max: 100, hint: "% of the total, up to the maximum. 100 = a flat discount of the maximum amount", pricing: true },
      rupees("maxDiscount", "Maximum discount", 100_000), rupees("minAmount", "Minimum booking total", 1_000_000),
      { key: "validFrom", label: "Valid from", type: "date", optional: true, hint: "First day (India time); empty = from now. Customers see the offer from this day", pricing: true },
      { key: "validUntil", label: "Valid until", type: "date", optional: true, hint: "Last day (India time); empty = no end date", pricing: true },
      { key: "perUserLimit", label: "Uses per customer", type: "int", optional: true, min: 1, max: 100, hint: "Empty = unlimited", pricing: true },
      { key: "maxUses", label: "Total uses", type: "int", optional: true, min: 1, max: 1_000_000, hint: "All customers together; cancelled bookings give a use back. Empty = unlimited", pricing: true },
      { key: "hue", label: "Card colour", type: "int", min: 0, max: 360, hint: "Hue 0–360" },
    ],
    title: (d) => `${d.code} · ${d.title}`,
    detail: (d) => `${Number(d.percent) >= 100 ? `Flat ${inr(d.maxDiscount)}` : `${d.percent}% up to ${inr(d.maxDiscount)}`} · ${d.service === "all" ? "all services" : d.service}${d.validUntil ? ` · till ${d.validUntil}` : ""}`,
  },
  faq: {
    label: "FAQs", singular: "FAQ", group: "Marketing", idPrefix: "f", permission: "catalog.edit",
    description: "Questions on the help page and service pages.",
    fields: [
      { key: "category", label: "Category", type: "select", options: FAQ_CATEGORIES },
      { key: "q", label: "Question", type: "text", maxLength: 160 },
      { key: "a", label: "Answer", type: "longtext", maxLength: 800 },
    ],
    title: (d) => String(d.q), detail: (d) => String(d.category),
  },
};

export const CATALOG_KINDS = Object.keys(CATALOG_DEFS) as CatalogKind[];
export const isCatalogKind = (k: string): k is CatalogKind => k in CATALOG_DEFS;

/** The seed copied into D1 on first use and by "reset catalog". */
export const CATALOG_SEED: { [K in CatalogKind]: CatalogItemMap[K][] } = {
  place: PLACES, rideOption: RIDE_OPTIONS, surgeRule: [], driver: DRIVERS, city: CITIES, busOperator: BUS_OPERATORS,
  popularRoute: POPULAR_ROUTES, tour: TOURS, departure: DEPARTURES, rentalCar: RENTAL_CARS, travelVehicle: TRAVEL_VEHICLES,
  groupDestination: GROUP_DESTINATIONS, offer: OFFERS, faq: FAQS,
};

/**
 * Checks and cleans an item's fields against its definition. Returns the data
 * (with `id` set) or an error message. Uniqueness is checked by the API.
 */
export function validateCatalogData(kind: CatalogKind, input: unknown, id: string): { data: Record<string, unknown> } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: '"data" must be an object.' };
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = { id };
  for (const f of CATALOG_DEFS[kind].fields) {
    let v = src[f.key];
    const empty = v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);
    if (empty) {
      if (!f.optional) return { error: `${f.label} is required.` };
      if (f.type === "int" || f.type === "number" || f.type === "date") out[f.key] = null;
      continue;
    }
    switch (f.type) {
      case "text": case "longtext": case "date": {
        if (typeof v !== "string") return { error: `${f.label} must be text.` };
        v = v.trim();
        if (f.upper) v = (v as string).toUpperCase();
        if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v as string)) return { error: `${f.label} must be a date (YYYY-MM-DD).` };
        if (f.maxLength && (v as string).length > f.maxLength) return { error: `${f.label} is too long (max ${f.maxLength}).` };
        if (f.pattern && !f.pattern.test(v as string)) return { error: f.hint ? `${f.label}: ${f.hint}` : `${f.label} isn't in the right format.` };
        break;
      }
      case "int": case "number": {
        if (typeof v === "string" && v.trim() !== "") v = Number(v);
        if (typeof v !== "number" || !Number.isFinite(v)) return { error: `${f.label} must be a number.` };
        if (f.type === "int" && !Number.isInteger(v)) return { error: `${f.label} must be a whole number.` };
        if ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)) return { error: `${f.label} must be between ${f.min} and ${f.max}.` };
        break;
      }
      case "select": {
        if (typeof v !== "string" || !f.options!.includes(v)) return { error: `${f.label} must be one of: ${f.options!.join(", ")}.` };
        break;
      }
      case "multiselect": case "list": {
        if (typeof v === "string") v = v.split("\n");
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return { error: `${f.label} must be a list of text.` };
        v = (v as string[]).map((x) => x.trim()).filter(Boolean);
        if (!(v as string[]).length) return { error: `${f.label} needs at least one entry.` };
        if ((v as string[]).length > 40) return { error: `${f.label} can have at most 40 entries.` };
        if (f.type === "multiselect" && (v as string[]).some((x) => !f.options!.includes(x))) return { error: `${f.label} must be from: ${f.options!.join(", ")}.` };
        if (f.maxLength && (v as string[]).some((x) => x.length > f.maxLength!)) return { error: `Each ${f.label.toLowerCase()} entry must be at most ${f.maxLength} characters.` };
        break;
      }
    }
    out[f.key] = v;
  }
  // Cross-field rules.
  if (kind === "tour" && (out.nights as number) > (out.days as number)) return { error: "Nights can't be more than days." };
  if (kind === "rideOption" && (out.baseFare as number) + (out.perKm as number) + (out.perMin as number) <= 0) return { error: "A ride type needs a fare: set a base fare, a per-km or a per-minute rate above ₹0." };
  if (kind === "offer") {
    if (out.validFrom && out.validUntil && (out.validFrom as string) > (out.validUntil as string)) return { error: "Valid from must be on or before valid until." };
    // A flat discount (or 100%) with no minimum above it can make a booking free.
    if ((out.percent as number) >= 100 && (out.minAmount as number) <= (out.maxDiscount as number)) {
      return { error: `A flat discount needs a minimum booking total above the discount, or bookings can be free. Set the minimum above ₹${Number(out.maxDiscount).toLocaleString("en-IN")}.` };
    }
  }
  if (kind === "popularRoute" && String(out.from).toLowerCase() === String(out.to).toLowerCase()) return { error: "From and To must be different." };
  if (kind === "surgeRule" && (!String(out.hours).trim() || hourRangesError(String(out.hours)))) return { error: 'Hours must be ranges from 0 to 23 with the start before the end, like "8-10, 17-20". Split a window over midnight: "22-23, 0-2".' };
  if (kind === "rideOption" && out.minFare && (out.minFare as number) <= (out.baseFare as number)) return { error: "The minimum fare is below the base fare, so it never applies. Raise it or leave it empty." };
  return { data: out };
}

/** Does this kind have fields only "pricing.edit" may change? */
export const kindHasPricing = (kind: CatalogKind) => CATALOG_DEFS[kind].fields.some((f) => f.pricing);

/** Offers: showing or hiding one turns a discount on or off, so it needs "pricing.edit" too. */
export const ACTIVE_IS_PRICING: readonly CatalogKind[] = ["offer", "surgeRule"];

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Labels of the price fields an edit sets or changes (an empty list = no price change).
 * `before` is null for a new item: then every price field with a value counts.
 */
export function pricingChanges(kind: CatalogKind, before: Record<string, unknown> | null, after: Record<string, unknown>): string[] {
  return CATALOG_DEFS[kind].fields
    .filter((f) => f.pricing && (before ? !sameValue(before[f.key], after[f.key]) : after[f.key] !== null && after[f.key] !== undefined && after[f.key] !== ""))
    .map((f) => f.label);
}
