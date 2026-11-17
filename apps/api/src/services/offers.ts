// Coupons. Offers live in the catalog (kind "offer"); a coupon counts as used by a customer
// for each of their bookings with that code that isn't cancelled.
import { couponDiscount, type CouponCheck, type Offer, type ServiceKey } from "@quikfly/shared";
import { businessDate } from "../config";
import { badRequest } from "../lib/errors";
import { visible } from "./catalog";

export async function findOffer(db: D1Database, code: string): Promise<Offer> {
  const c = code.trim().toUpperCase();
  const offer = (await visible(db, "offer")).find((o) => o.code === c);
  if (!offer) throw badRequest("That coupon code isn't valid.");
  return offer;
}

async function timesUsed(db: D1Database, userId: string, code: string) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE user_id = ? AND coupon_code = ? AND status <> 'cancelled'")
    .bind(userId, code).first<{ n: number }>();
  return r?.n ?? 0;
}

/** Discount for this customer on a total, or 400 explaining why the code can't be used. */
export async function checkCoupon(db: D1Database, userId: string, code: string, service: ServiceKey, total: number): Promise<CouponCheck> {
  const offer = await findOffer(db, code);
  const r = couponDiscount(offer, service, total, businessDate(), await timesUsed(db, userId, offer.code));
  if ("error" in r) throw badRequest(r.error);
  return { code: offer.code, discount: r.discount, total: total - r.discount };
}
