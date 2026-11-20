// Invoice maths. Prices are GST-inclusive, so tax is backed out of the paid amount.
// The GST rate is the one the booking was sold under (booking terms), so an old invoice never
// changes when staff change a rate; bookings made before terms were stored use today's settings.
import { gstRate, withTerms, type Booking, type Settings } from "@quikfly/shared";

/** Booking line that carries the customer's GSTIN when they asked for a GST invoice. */
export const GSTIN_LINE = "GSTIN";


/** Lines shown in the booking details but not repeated on the invoice. */
const HIDDEN_ON_INVOICE = new Set([GSTIN_LINE, "Ride OTP", "Paid via", "Payment"]);

export function invoiceFor(b: Booking, settings: Settings) {
  const rate = gstRate(withTerms(settings, b.terms), b.service);
  const taxable = Math.round((b.amount / (1 + rate / 100)) * 100) / 100;
  const tax = Math.round((b.amount - taxable) * 100) / 100;
  // Intra-state supply (Tamil Nadu) splits GST equally into CGST and SGST.
  const cgst = Math.round((tax / 2) * 100) / 100;
  const gstLine = b.lines.find(([k]) => k === GSTIN_LINE)?.[1];
  const [gstin, ...rest] = gstLine?.split(" · ") ?? [];
  return {
    rate,
    taxable,
    cgst,
    sgst: Math.round((tax - cgst) * 100) / 100,
    total: b.amount,
    buyerGst: gstLine ? { gstin, name: rest.join(" · ") } : null,
    details: b.lines.filter(([k]) => !HIDDEN_ON_INVOICE.has(k)),
  };
}

/** ₹ with paise, for invoices. */
export const inr2 = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
