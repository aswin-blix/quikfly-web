// Tax invoice for a booking, drawn as paper (ink on white in both themes), with Share.
// Mirrors apps/web InvoiceScreen; the figures come from core/invoice.dart.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import '../../api/models.dart';
import '../../api/parcel_models.dart';
import '../../core/format.dart';
import '../../core/invoice.dart';
import '../../core/parcels.dart';
import '../../core/services.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../auth/login_screen.dart';
import 'confirmed_screen.dart' show bookingProvider;

/// Invoice colours: always a printed page, whatever the app theme (tokens.css --paper-*).
abstract final class Paper {
  static const bg = Color(0xFFFFFFFF);
  static const fg = Color(0xFF17171C);
  static const muted = Color(0xFF5F5F6B);
  static const line = Color(0xFFE3DFD4);
  static const accent = Color(0xFF9A7414);
}

/// ₹ with paise, Indian grouping: 12345.5 → ₹12,345.50
final _inr2 = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
String inr2(double v) => _inr2.format(v);

class InvoiceScreen extends ConsumerWidget {
  const InvoiceScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userProvider);
    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Invoice')),
        body: ScreenList(children: [
          EmptyState(
            icon: Icons.receipt_long_outlined,
            title: 'Sign in to see this invoice',
            action: GoldButton(label: 'Login', expand: false, onPressed: () => ensureSignedIn(context, ref)),
          ),
        ]),
      );
    }
    final booking = ref.watch(bookingProvider(id));
    final settings = ref.watch(configProvider).value?.settings ?? const Settings({});
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tax invoice'),
        actions: [
          if (booking.value != null && booking.value!.status != BookingStatus.cancelled)
            IconButton(
              tooltip: 'Share invoice',
              icon: const Icon(Icons.ios_share),
              onPressed: () => SharePlus.instance.share(ShareParams(subject: 'QuikFly invoice INV-$id', text: _asText(booking.value!, settings, user))),
            ),
        ],
      ),
      body: booking.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(bookingProvider(id)))]),
        data: (b) => b.status == BookingStatus.cancelled
            ? const ScreenList(children: [EmptyState(icon: Icons.receipt_long_outlined, title: "This booking was cancelled, so there's no invoice")])
            : ScreenList(children: [_paper(b, settings, user)]),
      ),
    );
  }

  String _asText(Booking b, Settings s, User u) {
    final inv = invoiceFor(b, s);
    return [
      'TAX INVOICE  INV-${b.id}',
      '${s.companyName}, ${s.companyAddress} · GSTIN ${s.companyGstin}',
      'Billed to: ${inv.buyerGst?.name ?? u.name}${inv.buyerGst != null ? ' (GSTIN ${inv.buyerGst!.gstin})' : ''}',
      '${serviceOf(b.service).action}: ${b.title} · ${b.subtitle}',
      'Date: ${dateTime(b.createdAt)}',
      'Taxable value: ${inr2(inv.taxable)}',
      'CGST @ ${inv.rate / 2}%: ${inr2(inv.cgst)}',
      'SGST @ ${inv.rate / 2}%: ${inr2(inv.sgst)}',
      'Total (incl. GST): ${inr2(inv.total.toDouble())}',
      'Demo invoice from the QuikFly preview. Not valid for tax purposes.',
    ].join('\n');
  }

  Widget _paper(Booking b, Settings s, User u) {
    final inv = invoiceFor(b, s);
    final lr = b.service == ServiceKey.parcel ? b.line(parcelLrLine) : null;
    const muted = TextStyle(fontFamily: Brand.bodyFont, color: Paper.muted, fontSize: 13);
    const body = TextStyle(fontFamily: Brand.bodyFont, color: Paper.fg, fontSize: 13.5);
    Widget row(String k, String v, {bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(flex: 3, child: Text(k, style: bold ? body.copyWith(fontWeight: FontWeight.w700, fontSize: 15) : muted)),
            Expanded(flex: 2, child: Text(v, textAlign: TextAlign.right, style: bold ? body.copyWith(fontWeight: FontWeight.w700, fontSize: 15) : body)),
          ]),
        );
    const line = Divider(color: Paper.line, height: 24);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Paper.bg, borderRadius: BorderRadius.circular(12), border: Border.all(color: Paper.line)),
      child: DefaultTextStyle(
        style: body,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('QuikFly', style: TextStyle(fontFamily: Brand.headingFont, fontSize: 22, color: Paper.accent)),
          const SizedBox(height: 6),
          Text(s.companyName, style: body.copyWith(fontWeight: FontWeight.w700)),
          Text(s.companyAddress, style: muted),
          Text('GSTIN ${s.companyGstin}', style: muted),
          const SizedBox(height: 12),
          const Text('TAX INVOICE', style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: 1.5, color: Paper.fg)),
          Text('Invoice no. INV-${b.id}', style: muted),
          Text('Date ${dateTime(b.createdAt)}', style: muted),
          line,
          const Text('BILLED TO', style: TextStyle(color: Paper.muted, fontSize: 11, letterSpacing: 1)),
          Text(inv.buyerGst?.name.isNotEmpty == true ? inv.buyerGst!.name : u.name, style: body.copyWith(fontWeight: FontWeight.w700)),
          if (inv.buyerGst != null) Text('GSTIN ${inv.buyerGst!.gstin}', style: body),
          Text('${phoneDisplay(u.phone)}${u.email != null ? ' · ${u.email}' : ''}', style: muted),
          const SizedBox(height: 10),
          const Text('SERVICE', style: TextStyle(color: Paper.muted, fontSize: 11, letterSpacing: 1)),
          Text('${serviceOf(b.service).action}: ${b.title}', style: body.copyWith(fontWeight: FontWeight.w700)),
          Text(b.subtitle, style: muted),
          if (inv.details.isNotEmpty) ...[line, for (final (k, v) in inv.details) row(k, v)],
          if (lr != null) ...[
            line,
            QrImageView(data: parcelTrackUrl(lr), size: 112, backgroundColor: Paper.bg, semanticsLabel: 'QR code to track parcel $lr'),
            Text("Scan to track parcel $lr. Collection needs the sender's code, which is never printed here.", style: muted),
          ],
          line,
          row('Taxable value', inr2(inv.taxable)),
          row('CGST @ ${inv.rate / 2}%', inr2(inv.cgst)),
          row('SGST @ ${inv.rate / 2}%', inr2(inv.sgst)),
          const Divider(color: Paper.line),
          row('Total (incl. GST)', inr2(inv.total.toDouble()), bold: true),
          const SizedBox(height: 4),
          Text('Paid via ${b.payment.toUpperCase()} · Status: ${b.status.name}', style: muted),
          line,
          Text('Questions? ${s.companyEmail} · ${s.companyPhone}', style: muted.copyWith(fontSize: 11.5)),
          Text('Demo invoice generated by the QuikFly preview. Not valid for tax purposes.', style: muted.copyWith(fontSize: 11.5)),
        ]),
      ),
    );
  }
}
