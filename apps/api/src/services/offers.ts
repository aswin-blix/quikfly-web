// Coupons. Offers live in the catalog (kind "offer"); a coupon counts as used by a customer
// for each of their bookings with that code that isn't cancelled.
import { couponDiscount, rideDiscountRoom, type CouponCheck, type Offer, type ServiceKey } from "@quikfly/shared";
import { businessDate } from "../config";
import { badRequest } from "../lib/errors";
import { visible } from "./catalog";
import { getSettings } from "./settings";

export async function findOffer(db: D1Database, code: string): Promise<Offer> {
  const c = code.trim().toUpperCase();
  const offer = (await visible(db, "offer")).find((o) => o.code === c);
  if (!offer) throw badRequest("That coupon code isn't valid.");
  return offer;
}

/** Uses by everyone (bookings not cancelled), for an offer's `maxUses`. */
export async function totalUses(db: D1Database, code: string) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE coupon_code = ? AND status <> 'cancelled'").bind(code).first<{ n: number }>();
  return r?.n ?? 0;
}

async function timesUsed(db: D1Database, userId: string, code: string) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE user_id = ? AND coupon_code = ? AND status <> 'cancelled'")
    .bind(userId, code).first<{ n: number }>();
  return r?.n ?? 0;
}

/** Discount for this customer on a total, or 400 explaining why the code can't be used. */
export async function checkCoupon(db: D1Database, userId: string, code: string, service: ServiceKey, total: number): Promise<CouponCheck> {
  const offer = await findOffer(db, code);
  const r = couponDiscount(offer, service, total, businessDate(), await timesUsed(db, userId, offer.code), offer.maxUses != null ? await totalUses(db, offer.code) : 0);
  if ("error" in r) throw badRequest(r.error);
  // A ride fare can't be discounted below the floor (Settings.rideMaxDiscountPercent, MVAG 2025).
  const discount = Math.min(r.discount, rideDiscountRoom(await getSettings(db), service, total));
  return { code: offer.code, discount, total: total - discount };
}
