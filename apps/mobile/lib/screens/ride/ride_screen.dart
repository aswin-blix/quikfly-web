// Bike taxi and cab: pickup/drop → fares from the API → driver search → live trip → rating.
// The trip itself is simulated (RIDE_SIMULATION timings) like on the website; the API prices
// the ride and the booking carries its rideId, never an amount.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import '../../api/models.dart';
import '../../core/env.dart';
import '../../core/format.dart';
import '../../core/services.dart';
import '../../state/catalog.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/city_map.dart';
import '../../widgets/safety_sheet.dart';
import '../../widgets/ui.dart';
import '../auth/login_screen.dart';
import '../trips/trips_screen.dart' show paymentLabel;
import 'place_search_screen.dart';

/// Payment options offered for rides (net banking is checkout-only), as on the website.
const ridePayments = [PaymentMethod.upi, PaymentMethod.cash, PaymentMethod.wallet, PaymentMethod.card];

class RideScreen extends ConsumerStatefulWidget {
  const RideScreen({super.key, required this.service});
  final ServiceKey service; // bike or car
  @override
  ConsumerState<RideScreen> createState() => _RideScreenState();
}

class _RideScreenState extends ConsumerState<RideScreen> with SingleTickerProviderStateMixin {
  Place? _pickup, _drop;
  List<FareQuote>? _quotes;
  bool _loadingQuotes = false;
  String? _quoteErr;
  String? _selected;
  var _payment = PaymentMethod.upi;
  var _phase = RidePhase.plan;
  Ride? _ride;
  String? _bookingId;
  int _rating = 0;
  late final _clock = AnimationController(vsync: this)..addListener(() => setState(() {}));
  int _quoteRequest = 0;

  bool get _bike => widget.service == ServiceKey.bike;
  double get _t => _clock.value;
  FareQuote? get _quote => _quotes?.where((q) => q.option.id == _selected).firstOrNull;

  @override
  void initState() {
    super.initState();
    _clock.addStatusListener((s) {
      if (s != AnimationStatus.completed) return;
      if (_phase == RidePhase.arriving) {
        _startPhase(RidePhase.ontrip);
      } else if (_phase == RidePhase.ontrip) {
        setState(() => _phase = RidePhase.done);
        _complete();
      }
    });
  }

  @override
  void dispose() {
    _clock.dispose();
    super.dispose();
  }

  void _startPhase(RidePhase p) {
    setState(() => _phase = p);
    _clock
      ..duration = p == RidePhase.arriving ? Rules.rideArrive : Rules.rideTrip
      ..forward(from: 0);
  }

  Future<void> _loadQuotes() async {
    final a = _pickup, b = _drop;
    if (a == null || b == null || a.id == b.id) {
      setState(() => _quotes = null);
      return;
    }
    final req = ++_quoteRequest;
    setState(() {
      _loadingQuotes = true;
      _quoteErr = null;
    });
    try {
      final q = await ref.read(apiProvider).rideQuotes(widget.service, a.id, b.id);
      if (!mounted || req != _quoteRequest) return;
      setState(() {
        _quotes = q;
        _selected = q.any((x) => x.option.id == _selected) ? _selected : q.firstOrNull?.option.id;
      });
    } catch (e) {
      if (mounted && req == _quoteRequest) setState(() => _quoteErr = errorText(e));
    }
    if (mounted && req == _quoteRequest) setState(() => _loadingQuotes = false);
  }

  void _set({Place? pickup, Place? drop, bool clearDrop = false}) {
    setState(() {
      if (pickup != null) _pickup = pickup;
      if (drop != null) _drop = drop;
      if (clearDrop) _drop = null;
    });
    _loadQuotes();
  }

  Future<void> _pick(bool isPickup) async {
    final p = await Navigator.of(context).push<Place>(MaterialPageRoute(
      builder: (_) => PlaceSearchScreen(title: isPickup ? 'Pickup location' : 'Where to?', exclude: isPickup ? _drop?.id : _pickup?.id),
    ));
    if (p != null) isPickup ? _set(pickup: p) : _set(drop: p);
  }

  Future<void> _book() async {
    final a = _pickup, b = _drop, q = _quote;
    if (a == null || b == null || q == null) return;
    if (!await ensureSignedIn(context, ref) || !mounted) return;
    final api = ref.read(apiProvider);
    setState(() => _phase = RidePhase.searching);
    Ride? r;
    try {
      r = await api.bookRide(q.option.id, a.id, b.id, _payment);
      final booking = await api.createBooking(
        service: widget.service,
        title: '${r.quote.option.name} · ${r.drop.name}',
        subtitle: '${r.pickup.name} → ${r.drop.name}',
        payment: _payment,
        rideId: r.id,
        lines: [
          ('Driver', r.driver.name),
          ('Vehicle', '${r.driver.vehicle} · ${r.driver.plate}'),
          ('Ride OTP', r.otp),
          ('Payment', paymentLabel(_payment.name)),
          ('Distance', '${r.quote.distanceKm} km'),
        ],
      );
      if (!mounted) return;
      _ride = r;
      _bookingId = booking.id;
      _startPhase(RidePhase.arriving);
      ref.invalidate(bookingsProvider);
      ref.read(sessionProvider.notifier).refresh();
      _autoShareIfNight(r);
    } catch (e) {
      // e.g. the wallet ran short between quote and booking: release the driver.
      if (r != null) api.cancelRide(r.id).catchError((_) {});
      if (!mounted) return;
      toast(context, errorText(e));
      setState(() => _phase = RidePhase.plan);
    }
  }

  Future<void> _cancel() async {
    final ok = await confirm(context, title: 'Cancel this ride?', message: 'No charges apply while the driver is on the way.', yes: 'Cancel ride', danger: true);
    if (!ok || !mounted) return;
    _clock.stop();
    final api = ref.read(apiProvider);
    try {
      if (_ride != null) await api.cancelRide(_ride!.id);
      if (_bookingId != null) await api.cancelBooking(_bookingId!);
      if (mounted) toast(context, 'Ride cancelled. No charges applied.');
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
    ref.invalidate(bookingsProvider);
    ref.read(sessionProvider.notifier).refresh();
    _reset();
  }

  /// Trip over: move the booking from Upcoming to Past.
  Future<void> _complete() async {
    final id = _bookingId;
    if (id == null) return;
    try {
      await ref.read(apiProvider).completeBooking(id);
    } catch (_) {/* stays upcoming; nothing to show the rider */}
    ref.invalidate(bookingsProvider);
  }

  void _reset() {
    _clock.stop();
    setState(() {
      _phase = RidePhase.plan;
      _ride = null;
      _bookingId = null;
      _rating = 0;
      _clock.value = 0;
    });
  }

  /// Creates (or reuses) a public link for this ride and opens the share sheet.
  Future<void> _share() async {
    final r = _ride;
    if (r == null) return;
    try {
      final link = await ref.read(apiProvider).shareRide(r.id);
      final url = '$webUrl/track?t=${Uri.encodeQueryComponent(link.token)}';
      await SharePlus.instance.share(ShareParams(
        subject: 'My QuikFly ride',
        text: 'Follow my QuikFly ride: ${r.driver.vehicle} (${r.driver.plate}) from ${r.pickup.name} to ${r.drop.name}. $url',
      ));
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
  }

  /// Night rides: share with emergency contacts automatically if the rider turned that on.
  Future<void> _autoShareIfNight(Ride r) async {
    final user = ref.read(userProvider);
    if (user == null || !user.autoShareNightRides || !Rules.isNightHour(DateTime.now().hour)) return;
    try {
      final contacts = await ref.read(apiProvider).contacts();
      if (contacts.isEmpty) return;
      await ref.read(apiProvider).shareRide(r.id);
      if (mounted) toast(context, 'Night ride shared with ${contacts.map((c) => c.name.split(' ').first).join(', ')} (demo: no SMS sent)');
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final places = ref.watch(configProvider).value?.places ?? const <Place>[];
    // Places arrive with /config: pre-fill a sensible pickup once they do.
    if (_pickup == null && places.isNotEmpty) _pickup = places[places.length > 2 ? 2 : 0];

    final pickup = _pickup, drop = _drop;
    final live = _phase == RidePhase.arriving || _phase == RidePhase.ontrip || _phase == RidePhase.done;
    final map = CityMap(
      places: places,
      pickup: pickup,
      drop: drop,
      bike: _bike,
      showRoute: drop != null && _phase != RidePhase.arriving,
      searching: _phase == RidePhase.searching,
      vehicle: pickup != null && drop != null && live ? vehiclePosition(_phase, placePt(pickup), placePt(drop), _t) : null,
      vehicleFrom: _phase == RidePhase.arriving && pickup != null ? driverStartFor(placePt(pickup)) : null,
    );
    final panel = AnimatedSwitcher(
      duration: const Duration(milliseconds: 250),
      child: KeyedSubtree(key: ValueKey(_phase == RidePhase.ontrip ? RidePhase.arriving : _phase), child: _panel(places)),
    );

    return PopScope(
      canPop: _phase == RidePhase.plan || _phase == RidePhase.done,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) toast(context, 'Your ride is in progress. Cancel it first to leave.');
      },
      child: Scaffold(
        appBar: AppBar(title: Text(_bike ? 'Bike taxi' : 'Book a cab')),
        body: SafeArea(
          child: LayoutBuilder(builder: (context, box) {
            if (box.maxWidth >= 900) {
              return Padding(
                padding: const EdgeInsets.all(Brand.gutter),
                child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  SizedBox(width: 420, child: SingleChildScrollView(child: Panel(child: panel))),
                  const SizedBox(width: 16),
                  Expanded(child: map),
                ]),
              );
            }
            return ListView(padding: const EdgeInsets.fromLTRB(Brand.gutter, 4, Brand.gutter, 24), children: [
              Constrained(child: SizedBox(height: (box.maxHeight * 0.36).clamp(220, 380), child: map)),
              const SizedBox(height: 14),
              Constrained(child: panel),
            ]);
          }),
        ),
      ),
    );
  }

  Widget _panel(List<Place> places) => switch (_phase) {
        RidePhase.plan => _plan(places),
        RidePhase.searching => _searching(),
        RidePhase.arriving || RidePhase.ontrip => _live(),
        RidePhase.done => _done(),
      };

  Widget _plan(List<Place> places) {
    final c = context.qf;
    final user = ref.watch(userProvider);
    final saved = ref.watch(savedPlacesProvider).value ?? const <SavedPlace>[];
    final quote = _quote;
    final walletShort = user != null && quote != null && user.walletBalance < quote.fare;
    final s = serviceOf(widget.service);

    Widget field(Widget dot, String hint, Place? value, VoidCallback onTap) => Material(
          color: c.field,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Brand.radiusField), side: BorderSide(color: c.border)),
          child: InkWell(
            borderRadius: BorderRadius.circular(Brand.radiusField),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 52, 14),
              child: Row(children: [
                dot,
                const SizedBox(width: 12),
                Expanded(
                  child: Text(value?.name ?? hint,
                      maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: value == null ? c.fgSubtle : c.fg, fontSize: 15)),
                ),
              ]),
            ),
          ),
        );

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Stack(children: [
        Column(children: [
          field(Container(width: 10, height: 10, decoration: BoxDecoration(color: c.success, shape: BoxShape.circle)), 'Pickup location', _pickup,
              () => _pick(true)),
          const SizedBox(height: 8),
          field(Container(width: 10, height: 10, color: Brand.gold), 'Where to?', _drop, () => _pick(false)),
        ]),
        Positioned(
          right: 8,
          top: 0,
          bottom: 0,
          child: Center(
            child: IconButton.outlined(
              tooltip: 'Swap pickup and drop',
              style: IconButton.styleFrom(backgroundColor: c.surfaceRaised, side: BorderSide(color: c.border)),
              icon: const Icon(Icons.swap_vert, size: 20),
              onPressed: _drop == null
                  ? null
                  : () {
                      final p = _pickup;
                      setState(() {
                        _pickup = _drop;
                        _drop = p;
                      });
                      _loadQuotes();
                    },
            ),
          ),
        ),
      ]),
      if (_drop == null) ...[
        if (saved.any((x) => x.place.id != _pickup?.id)) ...[
          const SizedBox(height: 16),
          _label('Your places'),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final sp in saved.where((x) => x.place.id != _pickup?.id))
              ActionChip(
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                avatar: Icon(savedPlaceIcon(sp.kind), size: 16, color: c.accent),
                label: Text(sp.label),
                onPressed: () => _set(drop: sp.place),
              ),
          ]),
        ],
        const SizedBox(height: 16),
        _label('Popular destinations'),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final p in places.where((p) => p.id != _pickup?.id).take(6))
            ActionChip(materialTapTargetSize: MaterialTapTargetSize.shrinkWrap, label: Text(p.name), onPressed: () => _set(drop: p)),
        ]),
        const SizedBox(height: 20),
        Row(children: [
          Icon(s.icon, color: c.accent, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(_bike ? 'Captains reach you in under 5 minutes, at half the price of a cab.' : 'Upfront fares, verified drivers and live trip sharing.',
                style: TextStyle(color: c.fgMuted, fontSize: 13)),
          ),
        ]),
      ],
      if (_quoteErr != null) ...[const SizedBox(height: 14), ErrorBox(_quoteErr!, onRetry: _loadQuotes)],
      if (_loadingQuotes) ...[const SizedBox(height: 16), for (var i = 0; i < 3; i++) const Padding(padding: EdgeInsets.only(bottom: 8), child: Skeleton(height: 66))],
      if (_quotes != null && !_loadingQuotes && _quotes!.isNotEmpty) ...[
        const SizedBox(height: 16),
        _label('Choose a ride · ${_quotes!.first.distanceKm} km · ~${_quotes!.first.durationMin} min'),
        for (final q in _quotes!)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Panel(
              highlighted: q.option.id == _selected,
              padding: const EdgeInsets.all(10),
              onTap: () => setState(() => _selected = q.option.id),
              child: Row(children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.asset(_rideImage(q.option), width: 64, height: 44, fit: BoxFit.cover),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Flexible(child: Text(q.option.name, style: const TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis)),
                      const SizedBox(width: 6),
                      Icon(Icons.person_outline, size: 14, color: c.fgMuted),
                      Text('${q.option.seats}', style: TextStyle(color: c.fgMuted, fontSize: 12)),
                    ]),
                    Text('${q.etaMin} min away · ${q.option.description}',
                        maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.fgMuted, fontSize: 12)),
                  ]),
                ),
                const SizedBox(width: 8),
                Text(inr(q.fare), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
              ]),
            ),
          ),
        const SizedBox(height: 6),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final p in ridePayments)
            ChoiceChip(
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              label: Text(paymentLabel(p.name)),
              selected: _payment == p,
              onSelected: p == PaymentMethod.wallet && walletShort ? null : (_) => setState(() => _payment = p),
            ),
        ]),
        if (walletShort)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Wallet balance ${inr(user.walletBalance)} is not enough for this ride.', style: TextStyle(color: c.fgMuted, fontSize: 12)),
          ),
        const SizedBox(height: 14),
        GoldButton(
          label: 'Book ${quote?.option.name ?? ''} · ${quote == null ? '' : inr(quote.fare)}',
          onPressed: quote == null || (_payment == PaymentMethod.wallet && walletShort) ? null : _book,
        ),
      ],
    ]);
  }

  String _rideImage(RideOption o) =>
      _bike ? 'assets/images/s0.jpg' : (o.id == 'prime' || o.id == 'suv' ? 'assets/images/s4.jpg' : 'assets/images/s1.jpg');

  Widget _label(String s) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(s.toUpperCase(), style: TextStyle(color: context.qf.fgMuted, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1)),
      );

  Widget _searching() {
    final c = context.qf;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 28),
      child: Column(children: [
        const SizedBox(width: 56, height: 56, child: CircularProgressIndicator(strokeWidth: 3)),
        const SizedBox(height: 18),
        Text('Finding your ${_quote?.option.name ?? 'ride'}…', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text('Matching you with the nearest top-rated driver', style: TextStyle(color: c.fgMuted)),
      ]),
    );
  }

  Widget _live() {
    final c = context.qf;
    final r = _ride!;
    final arriving = _phase == RidePhase.arriving;
    final left = arriving ? (r.quote.etaMin * (1 - _t)).ceil().clamp(1, 999) : (r.quote.durationMin * (1 - _t)).ceil().clamp(1, 999);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(arriving ? 'DRIVER ON THE WAY' : 'ON TRIP', style: TextStyle(color: c.success, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1)),
            Text(arriving ? 'Arriving in $left min' : '$left min to drop', style: Theme.of(context).textTheme.headlineSmall),
          ]),
        ),
        if (arriving)
          Column(children: [
            Text('OTP', style: TextStyle(color: c.fgMuted, fontSize: 11.5, fontWeight: FontWeight.w700)),
            Text(r.otp, style: TextStyle(color: c.accent, fontSize: 24, fontWeight: FontWeight.w700, letterSpacing: 4)),
          ]),
      ]),
      const SizedBox(height: 10),
      ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: _t, minHeight: 6, backgroundColor: c.border)),
      const SizedBox(height: 14),
      Panel(
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: Brand.gold,
            child: Text(r.driver.name[0], style: const TextStyle(color: Brand.onGold, fontWeight: FontWeight.w700, fontSize: 18)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(r.driver.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              Row(children: [
                Icon(Icons.star, size: 14, color: c.accent),
                const SizedBox(width: 3),
                Text('${r.driver.rating} · ${r.driver.trips} trips', style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
              ]),
            ]),
          ),
          IconButton.outlined(tooltip: 'Call driver', onPressed: () => call(r.driver.phone), icon: const Icon(Icons.call, size: 18)),
        ]),
      ),
      const SizedBox(height: 10),
      Panel(
        highlighted: true,
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(r.driver.vehicle, style: TextStyle(color: c.fgSoft)),
              Text(r.quote.option.name, style: TextStyle(color: c.fgSubtle, fontSize: 12)),
            ]),
          ),
          // Number plates are white with black text in both themes.
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(4), border: Border.all(color: Colors.black26)),
            child: Text(r.driver.plate, style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w700, fontFamily: 'monospace')),
          ),
        ]),
      ),
      const SizedBox(height: 12),
      Row(children: [Icon(Icons.trip_origin, size: 16, color: c.success), const SizedBox(width: 8), Expanded(child: Text(r.pickup.name))]),
      const SizedBox(height: 6),
      Row(children: [Icon(Icons.navigation_outlined, size: 16, color: c.accent), const SizedBox(width: 8), Expanded(child: Text(r.drop.name))]),
      const SizedBox(height: 10),
      Divider(color: c.border),
      KeyValue('Fare (${paymentLabel(r.payment)})', inr(r.quote.fare), bold: true),
      const SizedBox(height: 10),
      Row(children: [
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: c.danger, foregroundColor: Colors.white, minimumSize: const Size(0, 48)),
          onPressed: () => showSafetySheet(context, onShare: _share),
          icon: const Icon(Icons.sos, size: 18),
          label: const Text('SOS'),
        ),
        const SizedBox(width: 8),
        Expanded(child: OutlinedButton.icon(onPressed: _share, icon: Icon(Icons.share, size: 18, color: c.success), label: const Text('Share'))),
        if (arriving) ...[
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(foregroundColor: c.danger, side: BorderSide(color: c.danger.withValues(alpha: 0.5))),
              onPressed: _cancel,
              child: const Text('Cancel'),
            ),
          ),
        ],
      ]),
    ]);
  }

  Widget _done() {
    final c = context.qf;
    final r = _ride!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(children: [
        Text('YOU HAVE ARRIVED', style: TextStyle(color: c.success, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1)),
        const SizedBox(height: 4),
        Text(inr(r.quote.fare), style: Theme.of(context).textTheme.headlineLarge),
        const SizedBox(height: 4),
        Text('${r.quote.distanceKm} km · ${r.quote.durationMin} min · paid by ${paymentLabel(r.payment)}', style: TextStyle(color: c.fgMuted)),
        const SizedBox(height: 16),
        Text('Rate your ride with ${r.driver.name}'),
        const SizedBox(height: 6),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          for (var n = 1; n <= 5; n++)
            IconButton(
              tooltip: '$n star${n > 1 ? 's' : ''}',
              iconSize: 34,
              onPressed: () {
                setState(() => _rating = n);
                toast(context, 'Thanks for your feedback!');
              },
              icon: Icon(n <= _rating ? Icons.star : Icons.star_border, color: n <= _rating ? c.accent : c.fgFaint),
            ),
        ]),
        const SizedBox(height: 12),
        GoldButton(
          label: 'Book another ride',
          onPressed: () {
            _reset();
            setState(() => _drop = null);
            _quotes = null;
          },
        ),
      ]),
    );
  }
}
