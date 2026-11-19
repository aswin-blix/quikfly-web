// Onboarding (step 2): joining fee → partner agreement → sticker and paint.
// No payment gateway yet, so the fee is simulated and labelled as such.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api.dart';
import '../core/format.dart';
import '../state/providers.dart';
import '../theme/tokens.dart';
import '../widgets/ui.dart';
import 'home_screen.dart' show partnerSettings;
import 'partner_app.dart';

/// Runs an onboarding call, refreshes the application and goes back.
mixin _Step<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  bool busy = false;
  String? err;
  Future<void> run(Future<VendorApplication> Function() call, String done) async {
    setState(() { busy = true; err = null; });
    try {
      setVendor(ref, await call());
      if (mounted) {
        toast(context, done);
        context.pop();
      }
    } catch (e) {
      setState(() => err = errorText(e));
    }
    if (mounted) setState(() => busy = false);
  }
}

class PaymentScreen extends ConsumerStatefulWidget {
  const PaymentScreen({super.key});
  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> with _Step {
  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final fee = ref.watch(vendorProvider).value?.fee ?? 0;
    return Scaffold(
      appBar: AppBar(title: const Text('Payment')),
      body: ScreenList(children: [
        Panel(highlighted: true, child: Column(children: [
          Text('Joining fee', style: TextStyle(color: c.fgMuted)),
          Text(inr(fee), style: Theme.of(context).textTheme.headlineLarge),
          const SizedBox(height: 6),
          Text('One time, per partner. Covers onboarding, the vehicle audit and the QuikFly sticker kit.', textAlign: TextAlign.center, style: TextStyle(color: c.fgMuted, fontSize: 13)),
        ])),
        const SizedBox(height: 14),
        Text('Demo: no money is taken. Online payment comes once QuikFly\'s payment gateway is live.', textAlign: TextAlign.center, style: TextStyle(color: c.fgSubtle, fontSize: 12)),
        const SizedBox(height: 14),
        FormError(err),
        GoldButton(label: 'Pay ${inr(fee)}', icon: Icons.lock_outline, loading: busy, onPressed: () => run(() => ref.read(apiProvider).payVendorJoiningFee(), 'Payment recorded')),
      ]),
    );
  }
}

class AgreementScreen extends ConsumerStatefulWidget {
  const AgreementScreen({super.key});
  @override
  ConsumerState<AgreementScreen> createState() => _AgreementScreenState();
}

class _AgreementScreenState extends ConsumerState<AgreementScreen> with _Step {
  final _name = TextEditingController();
  bool _accept = false;

  @override
  void initState() {
    super.initState();
    _name.text = ref.read(sessionProvider).value?.name ?? '';
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final s = partnerSettings(ref);
    Widget term(String t) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(padding: const EdgeInsets.only(top: 6), child: Icon(Icons.circle, size: 6, color: c.accent)),
            const SizedBox(width: 10),
            Expanded(child: Text(t)),
          ]),
        );
    return Scaffold(
      appBar: AppBar(title: const Text('Partner & vehicle agreement')),
      body: ScreenList(children: [
        Text('Between you and ${s.companyName}', style: TextStyle(color: c.fgMuted)),
        const SizedBox(height: 12),
        // Same terms as VENDOR_AGREEMENT_TERMS in packages/shared/src/vendor.ts (the website shows those).
        Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          term('Your vehicle and every driver you assign keep valid RC, insurance, permit and licence. Expired documents stop trips until renewed.'),
          term('Only drivers registered with QuikFly drive your vehicle on QuikFly trips.'),
          term('QuikFly sets customer fares. Your earnings are the fare less QuikFly\'s commission and taxes, shown for every trip.'),
          term('Earnings are paid to your registered bank account; you can request a payout from the app.'),
          term('The QuikFly sticker and paint stay on the vehicle while it\'s listed and come off when you leave.'),
          term('Safety rules (SOS, trip sharing, customer complaints) apply to every trip; QuikFly can pause a vehicle while a complaint is checked.'),
          term('Either side can end the partnership with 15 days\' notice.'),
        ])),
        const SizedBox(height: 14),
        TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Your full name (as your signature)')),
        CheckboxListTile(
          value: _accept,
          onChanged: (v) => setState(() => _accept = v ?? false),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          title: const Text('I have read and accept this agreement'),
        ),
        FormError(err),
        GoldButton(
          label: 'Accept agreement',
          loading: busy,
          onPressed: _accept && _name.text.trim().length >= 2 ? () => run(() => ref.read(apiProvider).acceptVendorAgreement(_name.text.trim()), 'Agreement accepted') : null,
        ),
      ]),
    );
  }
}

class StickerScreen extends ConsumerStatefulWidget {
  const StickerScreen({super.key});
  @override
  ConsumerState<StickerScreen> createState() => _StickerScreenState();
}

class _StickerScreenState extends ConsumerState<StickerScreen> with _Step {
  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final a = ref.watch(vendorProvider).value;
    final s = partnerSettings(ref);
    final requested = a?.stickerRequestedAt != null;
    final done = a?.stickerDoneAt != null;
    return Scaffold(
      appBar: AppBar(title: const Text('Vehicle sticker & paint')),
      body: ScreenList(children: [
        Panel(child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.format_paint_outlined, color: c.accent, size: 30),
          const SizedBox(width: 12),
          Expanded(child: Text('Our team fixes the QuikFly stickers (and the roof sign for cabs) at ${s.vendorAuditAddress}. It takes about an hour. You go live as soon as it\'s done.',
              style: TextStyle(color: c.fgMuted))),
        ])),
        const SizedBox(height: 16),
        if (done)
          Text('Done. You\'re live on QuikFly.', textAlign: TextAlign.center, style: TextStyle(color: c.success, fontWeight: FontWeight.w600))
        else if (requested)
          Text('Requested. QuikFly will call you to fix a time.', textAlign: TextAlign.center, style: TextStyle(color: c.fgMuted))
        else ...[
          FormError(err),
          GoldButton(label: 'Request a slot', loading: busy, onPressed: () => run(() => ref.read(apiProvider).requestVendorSticker(), 'Request sent. We\'ll call you.')),
        ],
      ]),
    );
  }
}
