// Invoice maths. Prices are GST-inclusive, so tax is backed out of the paid amount.
import type { Booking, ServiceKey } from "@quikfly/shared";

/** Booking line that carries the customer's GSTIN when they asked for a GST invoice. */
export const GSTIN_LINE = "GSTIN";

/**
 * GST rate (%) per service. Typical Indian rates: passenger transport and tour operators 5%,
 * self-drive car rental 18%. Confirm with the client's accountant before going live.
 */
export const GST_RATE: Record<ServiceKey, number> = { bike: 5, car: 5, bus: 5, tours: 5, rentals: 5, rent: 18 };

/** Lines shown in the booking details but not repeated on the invoice. */
const HIDDEN_ON_INVOICE = new Set([GSTIN_LINE, "Ride OTP", "Paid via", "Payment"]);

export function invoiceFor(b: Booking) {
  const rate = GST_RATE[b.service];
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
