// Shared checkout for bus, holidays, rentals and parcels: details (travellers, or the parcel) → payment.
// Shows the API's quote, checks coupons with the API (signs in first) and books with
// quoteId + couponCode; the API sets the amount. Mirrors the website's CheckoutScreen.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../core/credits.dart';
import '../../core/format.dart';
import '../../core/services.dart';
import '../../state/catalog.dart';
import '../../state/checkout.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/licence_panel.dart';
import '../../widgets/offer_card.dart' show offerTerms;
import '../../widgets/ui.dart';
import '../auth/login_screen.dart';
import '../trips/trips_screen.dart' show paymentLabel;

/// Booking line that carries the customer's GSTIN when they ask for a GST invoice (same as the website).
const gstinLine = 'GSTIN';

/// How long the simulated payment takes (no gateway yet, decision 2026-11-16).
const _paymentDelay = Duration(milliseconds: 1400);

final travellersProvider = FutureProvider<List<Traveller>>((ref) async {
  final id = ref.watch(userProvider.select((u) => u?.id));
  if (id == null) return const [];
  return ref.watch(apiProvider).travellers();
});

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});
  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  int _step = 1;
  List<TextEditingController> _names = [];
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _code = TextEditingController();
  bool _gstInvoice = false;
  var _method = PaymentMethod.upi;
  CouponCheck? _coupon;
  String? _couponErr;
  bool _couponBusy = false, _paying = false;
  bool _useCredits = true;
  int _creditsOff = 0;
  final _errors = <String, String>{};

  @override
  void initState() {
    super.initState();
    final draft = ref.read(checkoutProvider);
    final user = ref.read(userProvider);
    _names = [for (var i = 0; i < (draft?.travellers.length ?? 0); i++) TextEditingController(text: i == 0 ? user?.name ?? '' : '')];
    _fillContact(user);
  }

  void _fillContact(User? user) {
    if (user == null) return;
    final digits = user.phone.replaceAll(RegExp(r'\D'), '');
    if (_phone.text.isEmpty && digits.length >= 10) _phone.text = digits.substring(digits.length - 10);
    if (_email.text.isEmpty && user.email != null) _email.text = user.email!;
    if (_names.isNotEmpty && _names.first.text.isEmpty) _names.first.text = user.name;
  }

  @override
  void dispose() {
    for (final c in [..._names, _phone, _email, _code]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _applyCoupon(CheckoutDraft d) async {
    final code = _code.text.trim().toUpperCase();
    setState(() => _couponErr = null);
    if (code.isEmpty) {
      setState(() => _couponErr = 'Enter a coupon code');
      return;
    }
    // Coupons have per-customer limits, so the API needs to know who's asking.
    if (!await ensureSignedIn(context, ref) || !mounted) return;
    setState(() => _couponBusy = true);
    try {
      final r = await ref.read(apiProvider).checkCoupon(code, quoteId: d.quote.id);
      setState(() => _coupon = r);
      if (mounted) toast(context, 'Coupon applied · you save ${inr(r.discount)}');
    } catch (e) {
      setState(() => _couponErr = errorText(e));
    }
    if (mounted) setState(() => _couponBusy = false);
  }

  /// Tap a saved traveller: fills the next empty name, or removes them if already added.
  void _toggleTraveller(String name) {
    setState(() {
      final at = _names.indexWhere((c) => c.text.trim() == name);
      if (at >= 0) {
        _names[at].clear();
        return;
      }
      final empty = _names.indexWhere((c) => c.text.trim().isEmpty);
      if (empty >= 0) _names[empty].text = name;
    });
  }

  Future<void> _next(CheckoutDraft d) async {
    if (d.parcel != null) {
      // A parcel's details were checked on its form, and it has no travellers.
      if (await ensureSignedIn(context, ref) && mounted) setState(() => _step = 2);
      return;
    }
    final user = ref.read(userProvider);
    _fillContact(user);
    final e = <String, String>{};
    for (var i = 0; i < _names.length; i++) {
      if (_names[i].text.trim().isEmpty) e['n$i'] = 'Required';
    }
    if (!Rules.phone.hasMatch(_phone.text)) e['phone'] = 'Enter a valid 10-digit mobile number';
    if (_email.text.trim().isNotEmpty && !Rules.email.hasMatch(_email.text.trim())) e['email'] = 'Enter a valid email';
    if (d.needsLicence && user != null) {
      final s = user.licence.status;
      if (s == LicenceStatus.none) e['licence'] = 'Add your driving licence to book a self-drive car';
      if (s == LicenceStatus.rejected) e['licence'] = "Your licence wasn't approved. Submit it again to book a self-drive car";
    }
    setState(() => _errors
      ..clear()
      ..addAll(e));
    if (e.isNotEmpty) return;
    if (!await ensureSignedIn(context, ref) || !mounted) return;
    final signedIn = ref.read(userProvider)!;
    _fillContact(signedIn);
    // Self-drive needs the licence on the account: after signing in, add it here first.
    if (d.needsLicence && (signedIn.licence.status == LicenceStatus.none || signedIn.licence.status == LicenceStatus.rejected)) {
      toast(context, 'Signed in. Add your driving licence below to continue.');
      return;
    }
    setState(() => _step = 2);
  }

  Future<void> _pay(CheckoutDraft d) async {
    final user = ref.read(userProvider);
    setState(() => _paying = true);
    try {
      await Future<void>.delayed(_paymentDelay);
      final parcel = d.parcel;
      final gstLines = [if (_gstInvoice && user?.gst != null) (gstinLine, '${user!.gst!.gstin} · ${user.gst!.name}')];
      final b = await ref.read(apiProvider).createBooking(
            service: d.service,
            title: d.title,
            subtitle: d.subtitle,
            payment: _method,
            quoteId: d.quote.id,
            couponCode: _coupon?.code,
            useCredits: _creditsOff > 0,
            receiver: parcel == null ? null : (name: parcel.receiverName, phone: parcel.receiverPhone),
            contents: parcel?.contents,
            declaration: parcel?.declaration,
            // The API writes a parcel's lines itself; a GST invoice is the only one to ask for.
            lines: parcel != null
                ? gstLines
                : [
                    ...d.summary,
                    ('Traveller names', _names.map((c) => c.text.trim()).join(', ')),
                    ('Paid via', paymentLabel(_method.name)),
                    ...gstLines,
                  ],
          );
      ref.invalidate(bookingsProvider);
      await ref.read(sessionProvider.notifier).refresh();
      ref.read(checkoutProvider.notifier).set(null);
      if (mounted) context.pushReplacement('/confirmed/${b.id}', extra: b);
    } catch (e) {
      if (mounted) {
        toast(context, errorText(e));
        setState(() => _paying = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(checkoutProvider);
    if (d == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Checkout')),
        body: ScreenList(children: [
          EmptyState(
            icon: Icons.confirmation_number_outlined,
            title: 'Nothing to check out yet',
            message: 'Pick a bus, holiday or rental first.',
            action: OutlinedButton(onPressed: () => context.go('/'), child: const Text('Explore services')),
          ),
        ]),
      );
    }
    final c = context.qf;
    final user = ref.watch(userProvider);
    // Signed in part-way (coupon or continue): fill the name and contact from the account.
    ref.listen(userProvider, (prev, next) {
      if (prev == null && next != null) setState(() => _fillContact(next));
    });
    final afterCoupon = (_coupon?.total ?? d.quote.total).clamp(0, 1 << 31);
    // Credits: the same rule the API applies at booking (never the refundable deposit).
    final settings = ref.watch(configProvider).value?.settings ?? const Settings({});
    final deposit = d.quote.lines.where((l) => l.label == 'Refundable security deposit').fold(0, (s, l) => s + l.amount).clamp(0, afterCoupon);
    final canPay = user == null ? 0 : creditsUsable(settings, user.creditBalance, afterCoupon, deposit);
    _creditsOff = _useCredits ? canPay : 0;
    final total = afterCoupon - _creditsOff;
    final earns = creditsEarned(settings, d.service, total, deposit.clamp(0, total));
    final summary = _summary(d, total, user: user, canPay: canPay, deposit: deposit, earns: earns, settings: settings);
    final step = _step == 1 ? _details(d, user) : _payment(d, user, total);
    return PopScope(
      canPop: _step == 1 && !_paying,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _step == 2 && !_paying) setState(() => _step = 1);
      },
      child: Scaffold(
        appBar: AppBar(title: const Text('Review & pay')),
        body: LayoutBuilder(builder: (context, box) {
          final progress = Row(children: [
            for (final (i, l) in [(1, d.parcel == null ? 'Traveller details' : 'Parcel details'), (2, 'Payment')]) ...[
              if (i > 1) const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(99),
                    child: LinearProgressIndicator(value: _step >= i ? 1 : 0, minHeight: 5, backgroundColor: c.border),
                  ),
                  const SizedBox(height: 4),
                  Text('$i. $l', style: TextStyle(color: _step >= i ? c.accent : c.fgSubtle, fontSize: 12)),
                ]),
              ),
            ],
          ]);
          if (box.maxWidth >= 900) {
            return SingleChildScrollView(
              padding: const EdgeInsets.all(Brand.gutter),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1100),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(child: Column(children: [progress, const SizedBox(height: 16), step])),
                    const SizedBox(width: 20),
                    SizedBox(width: 380, child: summary),
                  ]),
                ),
              ),
            );
          }
          return ScreenList(children: [progress, const SizedBox(height: 14), summary, const SizedBox(height: 14), step]);
        }),
      ),
    );
  }

  Widget _summary(CheckoutDraft d, int total, {User? user, int canPay = 0, int deposit = 0, int earns = 0, required Settings settings}) {
    final c = context.qf;
    final s = serviceOf(d.service);
    return Column(children: [
      Panel(
        padding: EdgeInsets.zero,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              ClipRRect(borderRadius: BorderRadius.circular(10), child: Image.asset(d.image ?? s.image, width: 60, height: 44, fit: BoxFit.cover)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(d.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(d.subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
                ]),
              ),
            ]),
          ),
          Divider(color: c.border),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
            child: Column(children: [for (final (k, v) in d.summary) KeyValue(k, v)]),
          ),
          Divider(color: c.border),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
            child: Column(children: [
              for (final l in d.quote.lines) KeyValue(l.label, inr(l.amount)),
              if (_coupon != null)
                Row(children: [
                  Expanded(child: Text('Coupon ${_coupon!.code}', style: TextStyle(color: c.success))),
                  TextButton(onPressed: () => setState(() => _coupon = null), child: const Text('Remove')),
                  Text('−${inr(_coupon!.discount)}', style: TextStyle(color: c.success)),
                ]),
              if (_creditsOff > 0)
                Row(children: [
                  Expanded(child: Text(creditsLine, style: TextStyle(color: c.success))),
                  Text('−${inr(_creditsOff)}', style: TextStyle(color: c.success)),
                ]),
              Divider(color: c.border),
              Row(children: [
                const Expanded(child: Text('Total', style: TextStyle(fontWeight: FontWeight.w700))),
                Text(inr(total), style: TextStyle(color: c.accent, fontSize: 22, fontWeight: FontWeight.w700)),
              ]),
              if (earns > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Row(children: [
                    Icon(Icons.toll_outlined, size: 15, color: c.accent),
                    const SizedBox(width: 6),
                    Expanded(child: Text('Earn ${inr(earns)} QuikFly Credits when ${d.parcel == null ? 'this trip is completed' : d.parcel!.city ? 'the parcel is delivered' : 'the parcel is collected'}.', style: TextStyle(color: c.fgMuted, fontSize: 12))),
                  ]),
                ),
            ]),
          ),
        ]),
      ),
      if (user != null && user.creditBalance > 0) ...[
        const SizedBox(height: 12),
        Panel(
          padding: EdgeInsets.zero,
          child: CheckboxListTile(
            value: _useCredits && canPay > 0,
            onChanged: canPay == 0 ? null : (v) => setState(() => _useCredits = v ?? false),
            controlAffinity: ListTileControlAffinity.leading,
            title: Text(canPay > 0 ? 'Use ${inr(canPay)} QuikFly Credits' : 'QuikFly Credits', style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('Balance ${inr(user.creditBalance)} · credits pay up to ${settings.creditsMaxRedeemPercent}% of a booking${deposit > 0 ? ', not the deposit' : ''}.',
                style: TextStyle(color: c.fgMuted, fontSize: 12)),
          ),
        ),
      ],
      if (_coupon == null) ...[
        const SizedBox(height: 12),
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [Icon(Icons.local_offer_outlined, size: 18, color: c.accent), const SizedBox(width: 8), const Text('Have a coupon?', style: TextStyle(fontWeight: FontWeight.w600))]),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: TextField(
                  controller: _code,
                  textCapitalization: TextCapitalization.characters,
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]'))],
                  decoration: const InputDecoration(hintText: 'e.g. BUS150', isDense: true),
                  onSubmitted: (_) => _applyCoupon(d),
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                style: OutlinedButton.styleFrom(foregroundColor: c.accent, side: BorderSide(color: c.accent.withValues(alpha: 0.5)), minimumSize: const Size(80, 46)),
                onPressed: _couponBusy ? null : () => _applyCoupon(d),
                child: _couponBusy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Apply'),
              ),
            ]),
            FormError(_couponErr),
            TextButton(onPressed: () => _offers(d), child: const Text('See offers for this booking')),
          ]),
        ),
      ],
    ]);
  }

  /// Coupons that apply to this service, with one tap to use.
  void _offers(CheckoutDraft d) {
    final offers = (ref.read(configProvider).value?.offers ?? const <Offer>[]).where((o) => o.service == 'all' || o.service == d.service.name).toList();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        final c = ctx.qf;
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * 0.7),
            child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(Brand.gutter, 0, Brand.gutter, 16), children: [
              Text('Offers for this booking', style: Theme.of(ctx).textTheme.titleLarge),
              const SizedBox(height: 8),
              if (offers.isEmpty) const EmptyState(icon: Icons.local_offer_outlined, title: 'No offers for this service right now'),
              for (final o in offers)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.local_offer_outlined, color: c.accent),
                  title: Text(o.title),
                  subtitle: Text(offerTerms(o)),
                  trailing: TextButton(
                    onPressed: () {
                      Navigator.pop(ctx);
                      _code.text = o.code;
                      _applyCoupon(d);
                    },
                    child: Text('Use ${o.code}'),
                  ),
                ),
            ]),
          ),
        );
      },
    );
  }

  Widget _details(CheckoutDraft d, User? user) {
    final c = context.qf;
    final saved = ref.watch(travellersProvider).value ?? const <Traveller>[];
    final parcel = d.parcel;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (parcel != null) _parcelDetails(parcel) else ...[
      Panel(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Traveller details', style: TextStyle(fontWeight: FontWeight.w700)),
          if (saved.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Saved travellers: tap to add', style: TextStyle(color: c.fgMuted, fontSize: 12)),
            const SizedBox(height: 6),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final t in saved)
                FilterChip(
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  avatar: const Icon(Icons.person_outline, size: 16),
                  label: Text('${t.name} · ${t.age}'),
                  selected: _names.any((n) => n.text.trim() == t.name),
                  onSelected: (_) => _toggleTraveller(t.name),
                ),
            ]),
          ],
          for (var i = 0; i < d.travellers.length; i++) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _names[i],
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(labelText: d.travellers[i], hintText: 'Full name as per ID', errorText: _errors['n$i']),
              onChanged: (_) => setState(() {}),
            ),
          ],
        ]),
      ),
      const SizedBox(height: 12),
      Panel(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text.rich(TextSpan(children: [
            const TextSpan(text: 'Contact details', style: TextStyle(fontWeight: FontWeight.w700)),
            TextSpan(text: '  · ticket and updates are sent here', style: TextStyle(color: c.fgSubtle, fontSize: 12)),
          ])),
          const SizedBox(height: 12),
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
            decoration: InputDecoration(labelText: 'Mobile', prefixText: '+91  ', errorText: _errors['phone']),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(labelText: 'Email (optional)', errorText: _errors['email']),
          ),
        ]),
      ),
      ],
      if (d.needsLicence) ...[
        const SizedBox(height: 12),
        LicencePanel(showForm: false, error: _errors['licence'], onSaved: () => setState(() => _errors.remove('licence'))),
      ],
      const SizedBox(height: 12),
      if (user?.gst != null)
        Panel(
          padding: EdgeInsets.zero,
          child: CheckboxListTile(
            value: _gstInvoice,
            onChanged: (v) => setState(() => _gstInvoice = v ?? false),
            controlAffinity: ListTileControlAffinity.leading,
            title: Text('Get a GST invoice for ${user!.gst!.name}'),
            subtitle: Text(user.gst!.gstin, style: const TextStyle(fontFamily: 'monospace')),
          ),
        )
      else if (user != null)
        TextButton(
          style: TextButton.styleFrom(alignment: Alignment.centerLeft),
          onPressed: () => context.push('/account/business'),
          child: Text('${parcel == null ? 'Travelling' : 'Sending'} for work? Add GST details for a GST invoice'),
        ),
      const SizedBox(height: 8),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.info_outline, size: 16, color: c.accent),
        const SizedBox(width: 8),
        Expanded(child: Text(d.policy, style: TextStyle(color: c.fgMuted, fontSize: 12.5))),
      ]),
      const SizedBox(height: 16),
      GoldButton(label: 'Continue to payment', onPressed: () => _next(d)),
    ]);
  }

  Widget _parcelDetails(ParcelDraft p) {
    final c = context.qf;
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Expanded(child: Text('Parcel details', style: TextStyle(fontWeight: FontWeight.w700))),
          TextButton(onPressed: () => context.pop(), child: const Text('Edit')),
        ]),
        KeyValue('Receiver', p.receiverName),
        KeyValue('Mobile', phoneDisplay(p.receiverPhone)),
        KeyValue('Contents', p.contents),
        KeyValue('Declared value', inr(p.declaredValue)),
        const SizedBox(height: 6),
        Text('The ${p.city ? 'delivery' : 'collection'} code appears only on your screen, in My Trips. You pass it to the receiver (demo: no SMS is sent).',
            style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
      ]),
    );
  }

  Widget _payment(CheckoutDraft d, User? user, int total) {
    final c = context.qf;
    final walletShort = user != null && user.walletBalance < total;
    final methods = [
      (PaymentMethod.upi, 'UPI', Icons.smartphone, 'GPay, PhonePe, Paytm'),
      (PaymentMethod.card, 'Card', Icons.credit_card, 'Credit / debit'),
      (PaymentMethod.netbanking, 'Net banking', Icons.account_balance, 'All major banks'),
      (PaymentMethod.wallet, 'QuikFly wallet', Icons.account_balance_wallet_outlined,
          user == null ? 'Instant refunds' : 'Balance ${inr(user.walletBalance)}${walletShort ? ' · not enough' : ''}'),
      if ((d.parcel?.city ?? false) && (ref.watch(configProvider).value?.settings ?? const Settings({})).featureCashRides)
        (PaymentMethod.cash, 'Cash on pickup', Icons.payments_outlined, 'Pay the captain'),
    ];
    if (_method == PaymentMethod.wallet && walletShort) _method = PaymentMethod.upi;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Panel(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Choose a payment method', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          for (final (m, label, icon, sub) in methods)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Opacity(
                opacity: m == PaymentMethod.wallet && walletShort ? 0.5 : 1,
                child: Panel(
                  highlighted: _method == m,
                  padding: const EdgeInsets.all(12),
                  onTap: m == PaymentMethod.wallet && walletShort ? null : () => setState(() => _method = m),
                  child: Row(children: [
                    Icon(icon, color: c.accent),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
                        Text(sub, style: TextStyle(color: c.fgMuted, fontSize: 12)),
                      ]),
                    ),
                    if (_method == m) Icon(Icons.check_circle, color: c.accent),
                  ]),
                ),
              ),
            ),
          const SizedBox(height: 4),
          Text(
            _method == PaymentMethod.wallet
                ? 'Paid from your QuikFly wallet straight away; refunded to it if you cancel.'
                : _method == PaymentMethod.cash
                ? 'Nothing is paid now. You pay the captain at pickup.'
                : 'Demo: no payment is taken. The live app will open the payment gateway here.',
            style: TextStyle(color: c.accent, fontSize: 12.5),
          ),
        ]),
      ),
      const SizedBox(height: 16),
      GoldButton(label: _paying ? 'Processing payment…' : 'Pay ${inr(total)}', icon: _paying ? null : Icons.lock_outline, loading: _paying, onPressed: () => _pay(d)),
      const SizedBox(height: 8),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.verified_user_outlined, size: 14, color: c.success),
        const SizedBox(width: 4),
        Text('Secure checkout', style: TextStyle(color: c.fgSubtle, fontSize: 12)),
      ]),
    ]);
  }
}
