// Self-drive rental lifecycle: the customer's pickup and return checklist (photos, odometer,
// fuel), extensions before the return time, and the deposit settlement staff confirm after
// the return. The API applies these rules and prices; the apps show them.
import { localToIso } from "./cancellation";
import { BOOKING_LIMITS, RENT_PLANS, RENT_PROTECTION_LABEL, rentHours } from "./pricing";
import type { Settings } from "./settings";
import type { FareLine } from "./types";

/** Photos the customer takes at pickup and again at return. */
export const RENTAL_PHOTO_SIDES = ["front", "back", "left", "right", "odometer"] as const;
export type RentalPhotoSide = (typeof RENTAL_PHOTO_SIDES)[number];
export const RENTAL_PHOTO_LABEL: Record<RentalPhotoSide, string> = {
  front: "Front", back: "Back", left: "Left side", right: "Right side", odometer: "Odometer and fuel gauge",
};

export const RENTAL_STAGES = ["pickup", "return"] as const;
export type RentalStage = (typeof RENTAL_STAGES)[number];

/** Fuel is read in eighths of a tank, like the gauge: 0 (empty) to 8 (full). */
export const FUEL_EIGHTHS = 8;
export const fuelLabel = (eighths: number) => (eighths <= 0 ? "Empty" : eighths >= FUEL_EIGHTHS ? "Full" : eighths === 4 ? "Half" : `${eighths}/8`);

export const RENTAL_RULES = {
  /** The rental can be started this many minutes before the booked pickup time. */
  startEarlyMinutes: 60,
  maxOdometerKm: 999_999,
  /** A return reading more than this above the pickup reading is treated as a typo. */
  maxTripKm: 10_000,
  /** Hours a customer can pick when extending (each at most Settings.rentExtendMaxHours). */
  extendHours: [1, 2, 3, 4, 6, 12, 24, 48] as const,
  damageMax: 100_000,
  damageNoteMax: 300,
} as const;

/** booked → on_trip (pickup checklist done) → returned (return checklist done) → settled (staff). */
export type RentalState = "booked" | "on_trip" | "returned" | "settled";

export interface RentalReading { odometerKm: number; fuel: number; at: string }
export interface RentalExtension { hours: number; amount: number; createdAt: string }

/** What staff confirmed after the return: itemised deductions from the deposit. */
export interface RentalSettlement {
  kmDriven: number;
  /** null on the unlimited-km plan. */
  kmIncluded: number | null;
  extraKm: number;
  lateHours: number;
  fuelShort: number;
  /** Deductions, one line each (extra km, late return, fuel, damage); empty when nothing was deducted. */
  lines: FareLine[];
  damageNote: string | null;
  deductions: number;
  deposit: number;
  /** Deposit that goes back (to the wallet for wallet bookings). */
  depositReturned: number;
  /** Deductions beyond the deposit, owed by the customer (demo: not collected). */
  due: number;
  settledAt: string;
}

/** A self-drive booking's rental (GET /bookings/:id/rental). Times are local India "YYYY-MM-DDTHH:mm". */
export interface Rental {
  bookingId: string;
  state: RentalState;
  start: string;
  /** The current return time; extensions move it. */
  endsAt: string;
  kmPlan: keyof typeof RENT_PLANS;
  deposit: number;
  pickup: RentalReading | null;
  dropoff: RentalReading | null;
  /** Photo sides uploaded so far, per stage. */
  photos: Record<RentalStage, RentalPhotoSide[]>;
  extensions: RentalExtension[];
  settlement: RentalSettlement | null;
}

/** Staff view: who the booking belongs to and what a settlement would deduct now (before damage). */
export interface AdminRental extends Rental {
  /** The most staff can deduct for damage: the excess of the protection plan the customer bought. */
  damageExcess: number;
  customerName: string;
  title: string;
  payment: string;
}

const MINUTE = 60_000;

/** The most a customer pays for damage on a protection plan ("You pay up to ₹X"). Stored with each rental at booking. */
export const rentExcess = (settings: Settings, protection: keyof typeof RENT_PROTECTION_LABEL) =>
  protection === "peace" ? settings.rentExcessPeace : settings.rentExcessStandard;

/** Now as a local India time "YYYY-MM-DDTHH:mm". */
export const localNow = (now = Date.now()) => new Date(now + 330 * MINUTE).toISOString().slice(0, 16);

/** A local time moved by some hours (plain clock arithmetic). */
export const addLocalHours = (local: string, hours: number) => new Date(Date.parse(`${local}:00Z`) + hours * 3_600_000).toISOString().slice(0, 16);

/** Rental days between pickup and return, as billed (at least one). */
export const rentalDays = (start: string, end: string) => Math.max(1, Math.ceil(rentHours(start, end) / 24));

/** Why the rental can't be extended by `hours` now, or null when it can. */
export function extensionError(r: Pick<Rental, "state" | "start" | "endsAt">, hours: number, settings: Settings, now = Date.now()): string | null {
  if (r.state !== "booked" && r.state !== "on_trip") return "This rental has already been returned.";
  if (!Number.isInteger(hours) || hours < 1 || hours > settings.rentExtendMaxHours) return `Extend by 1 to ${settings.rentExtendMaxHours} hours.`;
  if (Date.parse(localToIso(r.endsAt)) <= now) return "The return time has passed. Return the car, or call us.";
  if (rentHours(r.start, addLocalHours(r.endsAt, hours)) > BOOKING_LIMITS.rentMaxDays * 24) return `Rentals can be at most ${BOOKING_LIMITS.rentMaxDays} days.`;
  return null;
}

/** Price of extending by `hours`: the booked hourly rate, plus protection for any extra day it starts. */
export function extensionLines(r: { start: string; endsAt: string; hourlyRate: number; protectionPerDay: number }, hours: number): FareLine[] {
  const extraDays = rentalDays(r.start, addLocalHours(r.endsAt, hours)) - rentalDays(r.start, r.endsAt);
  return [
    { label: `Extension (+${hours} hr${hours > 1 ? "s" : ""})`, amount: Math.round(r.hourlyRate * hours) },
    ...(extraDays > 0 && r.protectionPerDay ? [{ label: `Protection (+${extraDays} day${extraDays > 1 ? "s" : ""})`, amount: r.protectionPerDay * extraDays }] : []),
  ];
}

/** The deposit settlement after a return. Pure: the API stores it, admin previews it. */
export function rentalSettlement(
  input: {
    start: string; endsAt: string; kmPlan: keyof typeof RENT_PLANS; hourlyRate: number; deposit: number;
    pickup: Pick<RentalReading, "odometerKm" | "fuel">; dropoff: RentalReading; damage: number; damageNote?: string | null;
  },
  settings: Settings,
  settledAt = new Date().toISOString(),
): RentalSettlement {
  const kmDriven = Math.max(0, input.dropoff.odometerKm - input.pickup.odometerKm);
  const kmIncluded = input.kmPlan === "limited" ? settings.rentLimitedKmPerDay * rentalDays(input.start, input.endsAt) : null;
  const extraKm = kmIncluded == null ? 0 : Math.max(0, kmDriven - kmIncluded);
  const lateMinutes = Math.max(0, (Date.parse(`${input.dropoff.at}:00Z`) - Date.parse(`${input.endsAt}:00Z`)) / MINUTE);
  const lateHours = lateMinutes > settings.rentLateGraceMinutes ? Math.ceil(lateMinutes / 60) : 0;
  const fuelShort = Math.max(0, input.pickup.fuel - input.dropoff.fuel);
  const damage = Math.max(0, Math.round(input.damage));
  const lines: FareLine[] = [
    ...(extraKm ? [{ label: `Extra ${extraKm} km × ₹${settings.rentExtraKmRate}`, amount: extraKm * settings.rentExtraKmRate }] : []),
    ...(lateHours ? [{ label: `Late return (${lateHours} hr${lateHours > 1 ? "s" : ""})`, amount: lateHours * Math.round((input.hourlyRate * settings.rentLateFeePercent) / 100) }] : []),
    ...(fuelShort ? [{ label: `Fuel (${fuelShort}/8 tank less)`, amount: fuelShort * settings.rentFuelChargePerEighth }] : []),
    ...(damage ? [{ label: "Damage", amount: damage }] : []),
  ];
  const deductions = lines.reduce((s, l) => s + l.amount, 0);
  return {
    kmDriven, kmIncluded, extraKm, lateHours, fuelShort, lines, damageNote: damage ? input.damageNote?.trim() || null : null,
    deductions, deposit: input.deposit, depositReturned: Math.max(0, input.deposit - deductions), due: Math.max(0, deductions - input.deposit), settledAt,
  };
}
