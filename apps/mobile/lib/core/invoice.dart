// Invoice figures, ported from apps/web/src/lib/invoice.ts. Prices are GST-inclusive, so the
// tax is backed out of the amount the API charged; this only splits that amount for display.
import '../api/models.dart';

/// Booking line that carries the customer's GSTIN when they asked for a GST invoice.
const gstinLineLabel = 'GSTIN';

/// Lines shown in the booking details but not repeated on the invoice.
const _hiddenOnInvoice = {gstinLineLabel, 'Ride OTP', 'Paid via', 'Payment'};

double _r2(double v) => (v * 100).roundToDouble() / 100;

class Invoice {
  const Invoice({required this.rate, required this.taxable, required this.cgst, required this.sgst, required this.total, this.buyerGst, required this.details});
  final int rate;
  final double taxable, cgst, sgst;
  final int total;
  final GstDetails? buyerGst;
  final List<(String, String)> details;
}

Invoice invoiceFor(Booking b, Settings settings) {
  // The GST rate the booking was sold under, so an old invoice never changes.
  final rate = settings.withTerms(b.terms).gstRate(b.service);
  final taxable = _r2(b.amount / (1 + rate / 100));
  final tax = _r2(b.amount - taxable);
  // Intra-state supply (Tamil Nadu) splits GST equally into CGST and SGST.
  final cgst = _r2(tax / 2);
  final gstLine = b.lines.where((l) => l.$1 == gstinLineLabel).map((l) => l.$2).firstOrNull;
  GstDetails? buyer;
  if (gstLine != null) {
    final parts = gstLine.split(' · ');
    buyer = GstDetails(parts.first, parts.skip(1).join(' · '));
  }
  return Invoice(
    rate: rate,
    taxable: taxable,
    cgst: cgst,
    sgst: _r2(tax - cgst),
    total: b.amount,
    buyerGst: buyer,
    details: b.lines.where((l) => !_hiddenOnInvoice.contains(l.$1)).toList(),
  );
}
