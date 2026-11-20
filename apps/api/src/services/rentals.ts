// Self-drive rental lifecycle (packages/shared/src/rental.ts). The customer photographs the car
// and reads the odometer and fuel at pickup and at return, and can extend before the return
// time; staff then settle the deposit (extra km, late return, fuel, damage), which completes
// the booking. Photos are private R2 objects, served to the customer and to staff only.
import {
  FUEL_EIGHTHS, RENTAL_PHOTO_SIDES, RENTAL_RULES, extensionError, extensionLines, localNow, localToIso, rentExcess, rentalSettlement,
  type AdminRental, type FareLine, type Rental, type RentalPhotoSide, type RentalSettlement, type RentalStage, type RentalState, type Settings,
} from "@quikfly/shared";
import { badRequest, conflict, notFound } from "../lib/errors";
import { uid } from "../lib/random";
import { auditStatement } from "./admin/audit";
import { RENTAL_STATE_SQL, completeBookingRow, type BookingRow } from "./bookings";
import { notify } from "./notifications";
import { getSettings } from "./settings";
import { imageResponse, needBucket, storeImageIn } from "./vendors";

interface RentalRow {
  booking_id: string; start_local: string; ends_at: string; km_plan: Rental["kmPlan"]; hourly_rate: number; protection_per_day: number; damage_excess: number | null;
  pickup_odometer: number | null; pickup_fuel: number | null; pickup_at: string | null;
  return_odometer: number | null; return_fuel: number | null; return_at: string | null;
  settlement: string | null; state: RentalState;
}
type Joined = RentalRow & Pick<BookingRow, "user_id" | "title" | "status" | "payment" | "deposit" | "amount" | "lines"> & { customer_name: string };

const SELECT = `SELECT r.*, ${RENTAL_STATE_SQL.replaceAll(/\b(settlement|return_at|pickup_at)\b/g, "r.$1")} AS state,
  b.user_id, b.title, b.status, b.payment, b.deposit, b.amount, b.lines, u.name AS customer_name
  FROM rentals r JOIN bookings b ON b.id = r.booking_id JOIN users u ON u.id = b.user_id WHERE r.booking_id = ?`;

async function load(db: D1Database, bookingId: string, userId: string | null): Promise<Joined> {
  const row = await db.prepare(SELECT).bind(bookingId).first<Joined>();
  if (!row || (userId && row.user_id !== userId)) throw notFound("This booking has no self-drive rental.");
  return row;
}

/**
 * The most staff can deduct for damage: the plan's excess stored at booking. Rentals booked
 * before it was stored (migration 0025) use the plan their daily protection price matches,
 * and Standard otherwise.
 */
function damageExcess(row: Pick<RentalRow, "damage_excess" | "protection_per_day">, settings: Settings) {
  if (row.damage_excess != null) return row.damage_excess;
  const peace = row.protection_per_day === settings.rentProtectionPeacePerDay && row.protection_per_day !== settings.rentProtectionStandardPerDay;
  return rentExcess(settings, peace ? "peace" : "standard");
}

async function view(db: D1Database, row: Joined): Promise<AdminRental> {
  const [photos, exts] = await db.batch([
    db.prepare("SELECT stage, side FROM rental_photos WHERE booking_id = ?").bind(row.booking_id),
    db.prepare("SELECT hours, amount, created_at FROM rental_extensions WHERE booking_id = ? ORDER BY created_at").bind(row.booking_id),
  ]);
  const byStage: Rental["photos"] = { pickup: [], return: [] };
  for (const p of photos.results as { stage: RentalStage; side: RentalPhotoSide }[]) byStage[p.stage].push(p.side);
  for (const k of ["pickup", "return"] as const) byStage[k].sort((a, b) => RENTAL_PHOTO_SIDES.indexOf(a) - RENTAL_PHOTO_SIDES.indexOf(b));
  return {
    bookingId: row.booking_id, state: row.state, start: row.start_local, endsAt: row.ends_at, kmPlan: row.km_plan, deposit: row.deposit ?? 0,
    pickup: row.pickup_at ? { odometerKm: row.pickup_odometer!, fuel: row.pickup_fuel!, at: row.pickup_at } : null,
    dropoff: row.return_at ? { odometerKm: row.return_odometer!, fuel: row.return_fuel!, at: row.return_at } : null,
    photos: byStage,
    extensions: (exts.results as { hours: number; amount: number; created_at: string }[]).map((e) => ({ hours: e.hours, amount: e.amount, createdAt: e.created_at })),
    settlement: row.settlement ? (JSON.parse(row.settlement) as RentalSettlement) : null,
    damageExcess: damageExcess(row, await getSettings(db)),
    customerName: row.customer_name, title: row.title, payment: row.payment,
  };
}

/** The booking detail line an extension adds (or updates): the new return time. */
const EXTENDED_LINE = "Return (extended)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-20T18:30" → "20 Nov, 6:30 pm" */
const prettyLocal = (local: string) => {
  const [d, t] = local.split("T"); const [, m, day] = d.split("-").map(Number); const [h, min] = t.split(":").map(Number);
  return `${day} ${MONTHS[m - 1]}, ${h % 12 || 12}:${String(min).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

const forCustomer = ({ customerName: _n, title: _t, payment: _p, damageExcess: _d, ...r }: AdminRental): Rental => r;

export const myRental = async (db: D1Database, userId: string, bookingId: string) => forCustomer(await view(db, await load(db, bookingId, userId)));
export const adminRental = async (db: D1Database, bookingId: string) => view(db, await load(db, bookingId, null));

/** Which checklist a photo or reading belongs to right now. */
function stageOpen(row: Joined, stage: RentalStage) {
  if (row.status === "cancelled" || row.status === "completed") throw conflict(`This booking is already ${row.status}.`);
  if (stage === "pickup" && row.state !== "booked") throw conflict("The rental has already started.");
  if (stage === "return" && row.state !== "on_trip") throw conflict(row.state === "booked" ? "Start the rental first." : "The car has already been returned.");
}

/** Stores one checklist photo (replacing an earlier one of the same side). */
export async function uploadRentalPhoto(db: D1Database, bucket: R2Bucket | undefined, userId: string, bookingId: string, stage: RentalStage, side: RentalPhotoSide, body: ArrayBuffer) {
  const docs = needBucket(bucket);
  const row = await load(db, bookingId, userId);
  stageOpen(row, stage);
  const key = await storeImageIn(docs, `rentals/${bookingId}`, `${stage}-${side}`, body);
  const old = await db.prepare("SELECT photo_key FROM rental_photos WHERE booking_id = ? AND stage = ? AND side = ?").bind(bookingId, stage, side).first<{ photo_key: string }>();
  await db.prepare(
    `INSERT INTO rental_photos (booking_id, stage, side, photo_key, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (booking_id, stage, side) DO UPDATE SET photo_key = excluded.photo_key, created_at = excluded.created_at`,
  ).bind(bookingId, stage, side, key, new Date().toISOString()).run();
  if (old) await docs.delete(old.photo_key).catch(() => undefined);
  return myRental(db, userId, bookingId);
}

/** A checklist photo as a private response (the customer's own, or any for staff). */
export async function rentalPhoto(db: D1Database, bucket: R2Bucket | undefined, userId: string | null, bookingId: string, stage: RentalStage, side: RentalPhotoSide) {
  await load(db, bookingId, userId);
  const p = await db.prepare("SELECT photo_key FROM rental_photos WHERE booking_id = ? AND stage = ? AND side = ?").bind(bookingId, stage, side).first<{ photo_key: string }>();
  const res = await imageResponse(bucket, p?.photo_key);
  if (!res) throw notFound("No photo yet.");
  return res;
}

function checkReading(odometerKm: number, fuel: number) {
  if (!Number.isInteger(odometerKm) || odometerKm < 0 || odometerKm > RENTAL_RULES.maxOdometerKm) throw badRequest("Enter the odometer reading in km.");
  if (!Number.isInteger(fuel) || fuel < 0 || fuel > FUEL_EIGHTHS) throw badRequest("Choose the fuel level.");
}

async function missingPhotos(db: D1Database, bookingId: string, stage: RentalStage) {
  const { results } = await db.prepare("SELECT side FROM rental_photos WHERE booking_id = ? AND stage = ?").bind(bookingId, stage).all<{ side: RentalPhotoSide }>();
  return RENTAL_PHOTO_SIDES.filter((s) => !results.some((r) => r.side === s));
}

/** Pickup checklist done: the rental starts (booking "ongoing"). From an hour before pickup until the return time. */
export async function startRental(db: D1Database, userId: string, bookingId: string, input: { odometerKm: number; fuel: number }) {
  const row = await load(db, bookingId, userId);
  stageOpen(row, "pickup");
  checkReading(input.odometerKm, input.fuel);
  const now = Date.now();
  if (now < Date.parse(localToIso(row.start_local)) - RENTAL_RULES.startEarlyMinutes * 60_000) throw conflict(`You can start the rental from ${RENTAL_RULES.startEarlyMinutes} minutes before pickup.`);
  if (now > Date.parse(localToIso(row.ends_at))) throw conflict("The rental period has ended. Please call us.");
  if ((await missingPhotos(db, bookingId, "pickup")).length) throw badRequest("Add all five photos first.");
  const [, set] = await db.batch([
    db.prepare("UPDATE bookings SET status = 'ongoing' WHERE id = ? AND status = 'confirmed'").bind(bookingId),
    db.prepare("UPDATE rentals SET pickup_odometer = ?, pickup_fuel = ?, pickup_at = ? WHERE booking_id = ? AND pickup_at IS NULL")
      .bind(input.odometerKm, input.fuel, localNow(now), bookingId),
  ]);
  if (!set.meta.changes) throw conflict("The rental has already started.");
  return myRental(db, userId, bookingId);
}

/** What extending by `hours` would cost now (the API's price; the apps show it before paying). */
export async function extensionQuote(db: D1Database, userId: string, bookingId: string, hours: number) {
  const row = await load(db, bookingId, userId);
  const settings = await getSettings(db);
  const err = extensionError({ state: row.state, start: row.start_local, endsAt: row.ends_at }, hours, settings);
  if (err) throw conflict(err);
  const lines = extensionLines({ start: row.start_local, endsAt: row.ends_at, hourlyRate: row.hourly_rate, protectionPerDay: row.protection_per_day }, hours);
  return { row, lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}

/**
 * Extends the return time. Paid like the booking: from the wallet in the same batch (refused
 * if it's short), otherwise recorded as paid by the booking's method (demo: nothing collected).
 */
export async function extendRental(db: D1Database, userId: string, bookingId: string, hours: number) {
  const { row, lines, total } = await extensionQuote(db, userId, bookingId, hours);
  const wallet = row.payment === "wallet";
  const now = new Date().toISOString();
  const extId = uid("RX");
  const newEnd = new Date(Date.parse(`${row.ends_at}:00Z`) + hours * 3_600_000).toISOString().slice(0, 16);
  const detail = JSON.parse(row.lines) as [string, string][];
  const prior = detail.findIndex(([k]) => k === EXTENDED_LINE);
  const shown: [string, string] = [EXTENDED_LINE, prettyLocal(newEnd)];
  const nextLines = prior >= 0 ? detail.map((l, i) => (i === prior ? shown : l)) : [...detail, shown];
  // Only one extension can move this exact return time; a wallet must cover it.
  const guard = `(SELECT ends_at FROM rentals WHERE booking_id = ?1) = ?2${wallet ? " AND (SELECT wallet_balance FROM users WHERE id = ?3) >= ?4" : ""}`;
  const results = await db.batch([
    db.prepare(`INSERT INTO rental_extensions (id, booking_id, hours, amount, created_at) SELECT ?5, ?1, ?6, ?4, ?7 WHERE ${guard}`)
      .bind(bookingId, row.ends_at, userId, total, extId, hours, now),
    db.prepare("UPDATE rentals SET ends_at = ?2 WHERE booking_id = ?1 AND EXISTS (SELECT 1 FROM rental_extensions WHERE id = ?3)").bind(bookingId, newEnd, extId),
    db.prepare("UPDATE bookings SET amount = amount + ?2, lines = ?3 WHERE id = ?1 AND EXISTS (SELECT 1 FROM rental_extensions WHERE id = ?4)")
      .bind(bookingId, total, JSON.stringify(nextLines), extId),
    ...(wallet ? [
      db.prepare("UPDATE users SET wallet_balance = wallet_balance - ?2 WHERE id = ?1 AND EXISTS (SELECT 1 FROM rental_extensions WHERE id = ?3)").bind(userId, total, extId),
      db.prepare(
        `INSERT INTO wallet_transactions (id, user_id, kind, amount, note, booking_id, created_at)
         SELECT ?, ?, 'payment', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rental_extensions WHERE id = ?)`,
      ).bind(uid("WT"), userId, -total, `Extension +${hours} hr${hours > 1 ? "s" : ""} · ${row.title}`, bookingId, now, extId),
    ] : []),
  ]);
  if (!results[0].meta.changes) throw conflict(wallet ? "Your wallet doesn't have enough for this extension, or the rental changed. Please try again." : "The rental changed meanwhile. Please try again.");
  return { rental: await myRental(db, userId, bookingId), lines, total };
}

/** Return checklist done: the car is back and waits for staff to check it and settle the deposit. */
export async function returnRental(db: D1Database, userId: string, bookingId: string, input: { odometerKm: number; fuel: number }) {
  const row = await load(db, bookingId, userId);
  stageOpen(row, "return");
  checkReading(input.odometerKm, input.fuel);
  if (input.odometerKm < row.pickup_odometer!) throw badRequest(`The odometer can't be lower than at pickup (${row.pickup_odometer!.toLocaleString("en-IN")} km).`);
  if (input.odometerKm - row.pickup_odometer! > RENTAL_RULES.maxTripKm) throw badRequest("That reading looks too high. Check the odometer and try again.");
  if ((await missingPhotos(db, bookingId, "return")).length) throw badRequest("Add all five photos first.");
  const set = await db.prepare("UPDATE rentals SET return_odometer = ?, return_fuel = ?, return_at = ? WHERE booking_id = ? AND pickup_at IS NOT NULL AND return_at IS NULL")
    .bind(input.odometerKm, input.fuel, localNow(), bookingId).run();
  if (!set.meta.changes) throw conflict("The car has already been returned.");
  return myRental(db, userId, bookingId);
}

/** What settling now would deduct, for staff (damage as entered). */
export async function settlementPreview(db: D1Database, bookingId: string, damage = 0, damageNote: string | null = null) {
  const row = await load(db, bookingId, null);
  if (row.state !== "returned") throw conflict(row.state === "settled" ? "This rental is already settled." : "The customer hasn't returned the car yet.");
  const settings = await getSettings(db);
  return { row, settings, settlement: rentalSettlement({
    start: row.start_local, endsAt: row.ends_at, kmPlan: row.km_plan, hourlyRate: row.hourly_rate, deposit: row.deposit ?? 0,
    pickup: { odometerKm: row.pickup_odometer!, fuel: row.pickup_fuel! }, dropoff: { odometerKm: row.return_odometer!, fuel: row.return_fuel!, at: row.return_at! },
    damage, damageNote,
  }, settings) };
}

/** Staff settle a returned rental: deductions recorded, the rest of the deposit refunded, booking completed (audited). */
export async function settleRental(db: D1Database, adminId: string, bookingId: string, input: { damage: number; damageNote: string | null }) {
  if (!Number.isInteger(input.damage) || input.damage < 0 || input.damage > RENTAL_RULES.damageMax) throw badRequest(`Damage must be ₹0 to ₹${RENTAL_RULES.damageMax.toLocaleString("en-IN")}.`);
  if (input.damage > 0 && !input.damageNote?.trim()) throw badRequest("Say what the damage charge is for.");
  const { row, settlement: s, settings } = await settlementPreview(db, bookingId, input.damage, input.damageNote);
  // The customer was promised "You pay up to ₹X for damage" by their protection plan.
  const cap = damageExcess(row, settings);
  if (input.damage > cap) throw badRequest(`Damage can be at most ₹${cap.toLocaleString("en-IN")}: the excess of the customer's protection plan.`);
  const what = s.lines.map((l) => l.label.split(" (")[0].replace(/ \d.*$/, "")).join(", ");
  const note = s.deductions ? `Deposit returned · ${row.title} (₹${s.deductions.toLocaleString("en-IN")} deducted: ${what})` : `Deposit returned · ${row.title}`;
  const done = await completeBookingRow(db, bookingId, {
    depositBack: s.depositReturned, note,
    statements: (stillActive) => [
      db.prepare(`UPDATE rentals SET settlement = ?2 WHERE booking_id = ?1 AND settlement IS NULL AND ${stillActive}`).bind(bookingId, JSON.stringify(s)),
      auditStatement(db, { adminId, action: "rental.settle", entity: "booking", entityId: bookingId, detail: { deductions: s.deductions, depositReturned: s.depositReturned, due: s.due, lines: s.lines as FareLine[], damageNote: s.damageNote } }),
    ],
  });
  if (!done) throw conflict("This booking was closed meanwhile.");
  const back = s.depositReturned ? `₹${s.depositReturned.toLocaleString("en-IN")} ${row.payment === "wallet" ? "is back in your QuikFly wallet" : "is due back to you"}` : "Nothing comes back";
  await notify(db, row.user_id, {
    kind: "booking.deposit_returned", ref: bookingId, bookingId, title: `Deposit settled · ${row.title}`,
    body: s.deductions ? `${back}. ₹${s.deductions.toLocaleString("en-IN")} was deducted (${what}).${s.due ? ` ₹${s.due.toLocaleString("en-IN")} more is owed.` : ""}` : `${back}. Nothing was deducted.`,
  });
  return adminRental(db, bookingId);
}
