// Bike taxi and cab: pickup/drop → fares from the API → driver search → live trip → rating.
// A simulated ride plays its trip with timers (RIDE_SIMULATION) like on the website. A live ride (live
// captains on, docs/driver-app-plan.md) follows the API: it searches for a captain, is paid once one
// accepts, then moves as the captain moves. The API prices the ride; the booking carries its rideId.
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import '../../api/models.dart';
import '../../core/cancellation.dart';
import '../../core/env.dart';
import '../../core/credits.dart';
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
  const RideScreen({super.key, required this.service, this.resumeRideId, this.resumeBookingId, this.toPlaceId, this.scheduleAt, this.tripOf});
  final ServiceKey service; // bike or car

  /// A scheduled ride to start now (from My Trips).
  final String? resumeRideId, resumeBookingId;

  /// Prefill from a trip offer: the drop place, a pickup time (local "YYYY-MM-DDTHH:mm"), and the booking whose trip this ride joins.
  final String? toPlaceId, scheduleAt, tripOf;
  @override
  ConsumerState<RideScreen> createState() => _RideScreenState();
}

class _RideScreenState extends ConsumerState<RideScreen> with SingleTickerProviderStateMixin {
  Place? _pickup, _drop;

  /// Stops between pickup and drop, in order (up to Rules.rideMaxStops).
  final _stops = <Place>[];
  List<FareQuote>? _quotes;
  bool _loadingQuotes = false;
  String? _quoteErr;
  String? _selected;
  var _payment = PaymentMethod.upi;
  var _useCredits = true;
  int _creditsPaid = 0;
  var _phase = RidePhase.plan;
  Ride? _ride;
  String? _bookingId;
  DateTime? _bookedAt;

  /// The cancellation fee rules the ride was booked under.
  Json? _bookedTerms;

  /// Book ahead: the pickup time (null = ride now), and the ride just scheduled (shows its confirmation).
  late DateTime? _at = widget.scheduleAt == null ? null : DateTime.tryParse(widget.scheduleAt!);
  Ride? _scheduled;
  bool _prefilledDrop = false;
  int _rating = 0;
  late final _clock = AnimationController(vsync: this)..addListener(() => setState(() {}));
  int _quoteRequest = 0;

  /// Live rides: the next read of the ride, whether the payment has been started, a captain gave the
  /// ride back (searching again), and a fall back to a simulated captain (labelled on screen).
  Timer? _poll;
  bool _bookingStarted = false, _researching = false, _simFallback = false;
  RideLive? get _live => _ride?.live;

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
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_resumed && widget.resumeRideId != null && widget.resumeBookingId != null) {
      _resumed = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _resume());
    }
  }

  bool _resumed = false;

  /// Starts a scheduled ride: the driver is assigned now and the live trip runs.
  Future<void> _resume() async {
    final api = ref.read(apiProvider);
    try {
      final r = await api.startRide(widget.resumeRideId!);
      final b = await api.booking(widget.resumeBookingId!);
      if (!mounted) return;
      setState(() {
        _pickup = r.pickup;
        _drop = r.drop;
        _stops
          ..clear()
          ..addAll(r.stops);
        _ride = r;
        _bookingId = b.id;
        _bookedAt = b.createdAt;
        _bookedTerms = b.terms;
      });
      _startPhase(RidePhase.arriving);
      _autoShareIfNight(r);
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
  }

  /// Local "YYYY-MM-DDTHH:mm" sent as scheduledFor.
  String? get _scheduledFor => _at == null ? null : DateFormat("yyyy-MM-dd'T'HH:mm").format(_at!);

  /// Date then time pickers, within the settings' limits.
  Future<void> _pickTime() async {
    final s = ref.read(configProvider).value?.settings ?? const Settings({});
    final now = DateTime.now();
    final first = now.add(Duration(minutes: s.rideScheduleMinMinutes));
    final start = _at ?? first.add(const Duration(minutes: 15));
    final day = await showDatePicker(context: context, initialDate: start, firstDate: DateTime(first.year, first.month, first.day), lastDate: now.add(Duration(days: s.rideScheduleMaxDays)));
    if (day == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(start));
    if (time == null || !mounted) return;
    final picked = DateTime(day.year, day.month, day.day, time.hour, time.minute);
    if (picked.isBefore(first)) {
      toast(context, 'Schedule a ride at least ${s.rideScheduleMinMinutes} minutes ahead.');
      return;
    }
    setState(() => _at = picked);
    _loadQuotes();
  }

  @override
  void dispose() {
    _poll?.cancel();
    _clock.dispose();
    super.dispose();
  }

  /// Reads a live ride again after DRIVER_RULES' interval (each read also moves its captain search on).
  void _schedulePoll() {
    _poll?.cancel();
    final r = _ride, live = r?.live;
    if (r == null || live == null || const ['done', 'unmatched', 'cancelled'].contains(live.phase)) return;
    _poll = Timer(Duration(seconds: live.phase == 'searching' ? Rules.rideSearchPollSeconds : Rules.rideLivePollSeconds), () async {
      try {
        final next = await ref.read(apiProvider).ride(r.id);
        if (mounted && _ride?.id == r.id) _onLive(next);
      } catch (_) {
        if (mounted) _schedulePoll(); // a failed read is tried again
      }
    });
  }

  /// A new read of a live ride: follow its phase; pay once a captain accepts.
  void _onLive(Ride r) {
    final was = _live?.phase;
    final live = r.live;
    if (live == null) {
      // Nobody took it and a simulated captain stepped in: play it like any simulated ride.
      setState(() {
        _ride = r;
        _simFallback = true;
      });
      _startPhase(RidePhase.arriving);
      if (_bookingId == null) _payFor(r);
      return;
    }
    setState(() => _ride = r);
    switch (live.phase) {
      case 'searching':
        setState(() {
          if (was == 'arriving' || was == 'arrived') _researching = true;
          _phase = RidePhase.searching;
        });
      case 'arriving' || 'arrived':
        setState(() {
          _researching = false;
          _phase = live.phase == 'arrived' ? RidePhase.arrived : RidePhase.arriving;
        });
        if (_bookingId == null) _payFor(r);
      case 'ontrip':
        setState(() => _phase = RidePhase.ontrip);
      case 'done':
        setState(() => _phase = RidePhase.done);
        ref.invalidate(bookingsProvider);
      case 'unmatched':
        setState(() => _phase = RidePhase.unmatched);
        ref.invalidate(bookingsProvider); // anything already paid came back
        ref.read(sessionProvider.notifier).refresh();
      case 'cancelled':
        toast(context, 'This ride was cancelled.');
        ref.invalidate(bookingsProvider);
        _reset();
        return;
    }
    _schedulePoll();
  }

  /// Pays for a live ride a captain has just taken (once). If paying fails, the captain is let go.
  Future<void> _payFor(Ride r) async {
    if (_bookingStarted) return;
    _bookingStarted = true;
    try {
      await _createBooking(r);
      _autoShareIfNight(r);
    } catch (e) {
      ref.read(apiProvider).cancelRide(r.id).catchError((_) {});
      if (!mounted) return;
      toast(context, errorText(e));
      _reset();
    }
  }

  /// The booking (the payment) for a ride: right after booking a simulated one, once a captain accepts a live one.
  Future<Booking> _createBooking(Ride r) async {
    final driver = r.driver;
    final booking = await ref.read(apiProvider).createBooking(
      service: widget.service,
      title: '${r.quote.option.name} · ${r.drop.name}',
      subtitle: '${r.pickup.name} → ${r.drop.name}',
      payment: PaymentMethod.values.firstWhere((p) => p.name == r.payment, orElse: () => _payment),
      rideId: r.id,
      useCredits: _creditsOff() > 0,
      tripOf: widget.tripOf,
      // A ride booked ahead gets its driver near pickup time, so its booking has no driver lines yet.
      lines: r.scheduledFor != null || driver == null
          ? [
              if (r.scheduledFor != null) ('Pickup time', dateTime(r.scheduledFor!)),
              if (r.stops.isNotEmpty) ('Stops', r.stops.map((s) => s.name).join(' → ')),
              ('Payment', paymentLabel(r.payment)),
              ('Distance', '${r.quote.distanceKm} km'),
            ]
          : [
              ('Driver', driver.name),
              ('Vehicle', '${driver.vehicle} · ${driver.plate}'),
              ('Ride OTP', r.otp),
              ('Payment', paymentLabel(r.payment)),
              ('Distance', '${r.quote.distanceKm} km'),
            ],
    );
    _creditsPaid = booking.creditsUsed;
    if (mounted) {
      setState(() {
        _bookingId = booking.id;
        _bookedAt = booking.createdAt;
        _bookedTerms = booking.terms;
      });
    }
    ref.invalidate(bookingsProvider);
    ref.read(sessionProvider.notifier).refresh();
    return booking;
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
      final q = await ref.read(apiProvider).rideQuotes(widget.service, a.id, b.id, scheduledFor: _scheduledFor, stopIds: [for (final s in _stops) s.id]);
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

  /// Picks a stop: [i] == _stops.length adds a new one.
  Future<void> _pickStop(int i) async {
    final p = await Navigator.of(context).push<Place>(MaterialPageRoute(builder: (_) => PlaceSearchScreen(title: 'Stop ${i + 1}')));
    if (p == null || !mounted) return;
    setState(() => i < _stops.length ? _stops[i] = p : _stops.add(p));
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
      r = await api.bookRide(q.option.id, a.id, b.id, _payment, scheduledFor: _scheduledFor, stopIds: [for (final s in _stops) s.id]);
      if (!mounted) return;
      if (r.isLive) {
        // Real captains: wait for one to accept (the poll), then pay.
        setState(() => _ride = r);
        _schedulePoll();
        return;
      }
      await _createBooking(r);
      if (!mounted) return;
      if (r.scheduledFor != null) {
        setState(() {
          _scheduled = r;
          _phase = RidePhase.plan;
        });
        return;
      }
      _ride = r;
      _startPhase(RidePhase.arriving);
      _autoShareIfNight(r);
    } catch (e) {
      // e.g. the wallet ran short between quote and booking: release the driver.
      if (r != null) api.cancelRide(r.id).catchError((_) {});
      if (!mounted) return;
      toast(context, errorText(e));
      setState(() => _phase = RidePhase.plan);
    }
  }

  /// Asks why (MVAG 2025 reason list) and shows the cancellation fee before confirming. Null = keep the ride.
  Future<String?> _askReason() {
    final settings = (ref.read(configProvider).value?.settings ?? const Settings({})).withTerms(_bookedTerms);
    final fare = _ride?.quote.fare ?? 0;
    final wallet = _ride?.payment == 'wallet';
    String? picked;
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSheet) {
        final c = ctx.qf;
        final fee = picked == null ? null : rideCancelFee(settings, fare, picked, _bookedAt ?? DateTime.now(), scheduledFor: _ride?.scheduledFor);
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(Brand.gutter, 0, Brand.gutter, 16),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('Why are you cancelling?', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
              const SizedBox(height: 8),
              RadioGroup<String>(
                groupValue: picked,
                onChanged: (v) => setSheet(() => picked = v),
                child: Column(children: [for (final r in rideCancelReasons) RadioListTile<String>(value: r.$1, dense: true, title: Text(r.$2))]),
              ),
              const SizedBox(height: 4),
              Text(
                fee == null
                    ? 'Free ${settings.rideCancelFreeMinutes > 0 ? 'within ${settings.rideCancelFreeMinutes} min of booking or ' : ''}if the driver is at fault; otherwise ${settings.rideCancelFeePercent}% of the fare (up to ${inr(settings.rideCancelFeeCap)}).'
                    : fee == 0
                        ? 'No cancellation fee.'
                        : 'Cancellation fee: ${inr(fee)}${wallet ? ', kept from your wallet refund.' : ' (demo: not collected).'}',
                style: TextStyle(color: c.fgMuted, fontSize: 12.5),
              ),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(ctx), child: const Text('Keep my ride'))),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: c.danger, foregroundColor: Colors.white),
                    onPressed: picked == null ? null : () => Navigator.pop(ctx, picked),
                    child: const Text('Cancel ride'),
                  ),
                ),
              ]),
            ]),
          ),
        );
      }),
    );
  }

  Future<void> _cancel() async {
    final reason = await _askReason();
    if (reason == null || !mounted) return;
    // The dialog may have stayed open until the trip started; cancelling is only for the wait.
    if (_phase != RidePhase.arriving && _phase != RidePhase.arrived) {
      toast(context, 'Your trip has already started, so it can no longer be cancelled.');
      return;
    }
    _clock.stop();
    final api = ref.read(apiProvider);
    try {
      // A paid live ride is cancelled through its booking (the API frees and tells the captain).
      if (_ride != null && !(_ride!.isLive && _bookingId != null)) await api.cancelRide(_ride!.id);
      final done = _bookingId == null ? null : await api.cancelBooking(_bookingId!, reason: reason);
      final fee = done?.cancelFee ?? 0;
      if (mounted) {
        toast(
            context,
            fee == 0
                ? 'Ride cancelled. No charges applied.'
                : done!.payment == 'wallet'
                    ? 'Ride cancelled. ${inr(fee)} cancellation fee kept; ${inr(done.refundAmount ?? 0)} back in your wallet.'
                    : 'Ride cancelled. Cancellation fee ${inr(fee)} (demo: not collected).');
      }
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
    ref.invalidate(bookingsProvider);
    ref.read(sessionProvider.notifier).refresh();
    _reset();
  }

  /// Stops a live search: before a captain took it nothing was paid; after one gave a paid ride back the API waives the fee.
  Future<void> _cancelSearch() async {
    final api = ref.read(apiProvider);
    try {
      if (_bookingId != null) {
        await api.cancelBooking(_bookingId!);
        if (mounted) toast(context, 'Ride cancelled. No charges applied.');
      } else if (_ride != null) {
        await api.cancelRide(_ride!.id);
      }
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
    ref.invalidate(bookingsProvider);
    ref.read(sessionProvider.notifier).refresh();
    _reset();
  }

  /// Trip over: move the booking from Upcoming to Past (a live ride is completed by its captain).
  Future<void> _complete() async {
    final id = _bookingId;
    if (id == null || (_ride?.isLive ?? false)) return;
    try {
      await ref.read(apiProvider).completeBooking(id);
    } catch (_) {/* stays upcoming; nothing to show the rider */}
    ref.invalidate(bookingsProvider);
  }

  void _reset() {
    _clock.stop();
    _poll?.cancel();
    setState(() {
      _phase = RidePhase.plan;
      _ride = null;
      _bookingId = null;
      _bookingStarted = false;
      _researching = false;
      _simFallback = false;
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
        text: r.driver == null
            ? 'Follow my QuikFly ride from ${r.pickup.name} to ${r.drop.name}. $url'
            : 'Follow my QuikFly ride: ${r.driver!.vehicle} (${r.driver!.plate}) from ${r.pickup.name} to ${r.drop.name}. $url',
      ));
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
  }

  /// Night rides: share with emergency contacts automatically if the rider turned that on.
  Future<void> _autoShareIfNight(Ride r) async {
    final user = ref.read(userProvider);
    if (user == null || !Rules.autoSharesAt(user.autoShareRides, DateTime.now().hour)) return;
    try {
      final contacts = await ref.read(apiProvider).contacts();
      if (contacts.isEmpty) return;
      await ref.read(apiProvider).shareRide(r.id);
      if (mounted) toast(context, 'Ride shared with ${contacts.map((c) => c.name.split(' ').first).join(', ')} (demo: no SMS sent)');
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    // Signing in or buying a QuikFly Pass changes the surge: quote again.
    ref.listen(userProvider.select((u) => u?.passUntil), (_, _) => _loadQuotes());
    final places = ref.watch(configProvider).value?.places ?? const <Place>[];
    // Places arrive with /config: pre-fill a sensible pickup once they do.
    if (_pickup == null && places.isNotEmpty) _pickup = places[places.length > 2 ? 2 : 0];
    // From a trip offer: the drop (e.g. the bus stand), once places have loaded.
    if (!_prefilledDrop && widget.toPlaceId != null && places.isNotEmpty) {
      _prefilledDrop = true;
      _drop = places.where((p) => p.id == widget.toPlaceId && p.id != _pickup?.id).firstOrNull;
      if (_drop != null) WidgetsBinding.instance.addPostFrameCallback((_) => _loadQuotes());
    }

    final pickup = _pickup, drop = _drop;
    final live = _phase == RidePhase.arriving || _phase == RidePhase.ontrip || _phase == RidePhase.done;
    final rl = _live;
    // A live ride shows where its captain really is (at the pickup once arrived); a simulated one is worked out from the clock.
    final Offset? vehicle = rl != null
        ? (rl.hasCaptain ? Offset(rl.captainX!, rl.captainY!) : (_phase == RidePhase.arrived && pickup != null ? placePt(pickup) : null))
        : pickup != null && drop != null && live
            ? vehiclePosition(_phase, placePt(pickup), placePt(drop), _t, [for (final s in _stops) placePt(s)])
            : null;
    final map = CityMap(
      places: places,
      pickup: pickup,
      drop: drop,
      stops: List.unmodifiable(_stops),
      bike: _bike,
      showRoute: drop != null && _phase != RidePhase.arriving,
      searching: _phase == RidePhase.searching,
      vehicle: vehicle,
      vehicleFrom: rl == null && _phase == RidePhase.arriving && pickup != null ? driverStartFor(placePt(pickup)) : null,
    );
    final panel = AnimatedSwitcher(
      duration: const Duration(milliseconds: 250),
      child: KeyedSubtree(key: ValueKey(_phase == RidePhase.ontrip || _phase == RidePhase.arrived ? RidePhase.arriving : _phase), child: _panel(places)),
    );

    return PopScope(
      canPop: _phase == RidePhase.plan || _phase == RidePhase.done || _phase == RidePhase.unmatched,
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
        RidePhase.plan when _scheduled != null => _scheduledView(_scheduled!),
        RidePhase.plan => _plan(places),
        RidePhase.searching => _searching(),
        RidePhase.arriving || RidePhase.arrived || RidePhase.ontrip => _ride?.driver == null ? _searching() : _liveView(),
        RidePhase.done => _done(),
        RidePhase.unmatched => _unmatched(),
      };

  Settings get _settings => ref.watch(configProvider).value?.settings ?? const Settings({});

  /// Feature switches turned off while this screen is open (or a link asked for one): fall back.
  void _applySwitches() {
    final st = _settings;
    if (!st.featureRideScheduling && _at != null) Future.microtask(() { if (mounted) { setState(() => _at = null); _loadQuotes(); } });
    if (!st.featureMultiStop && _stops.isNotEmpty) Future.microtask(() { if (mounted) { setState(() => _stops.clear()); _loadQuotes(); } });
    if (!st.featureCashRides && _payment == PaymentMethod.cash) Future.microtask(() { if (mounted) setState(() => _payment = PaymentMethod.upi); });
  }

  Widget _plan(List<Place> places) {
    _applySwitches();
    final c = context.qf;
    final user = ref.watch(userProvider);
    final saved = ref.watch(savedPlacesProvider).value ?? const <SavedPlace>[];
    final quote = _quote;
    final settings = ref.watch(configProvider).value?.settings ?? const Settings({});
    final canPay = user != null && quote != null ? creditsUsable(settings, user.creditBalance, quote.fare, 0, rideDiscountRoom(settings, widget.service, quote.fare)) : 0;
    final payable = quote == null ? 0 : quote.fare - (_useCredits ? canPay : 0);
    final earns = quote == null ? 0 : creditsEarned(settings, widget.service, payable);
    final walletShort = user != null && quote != null && user.walletBalance < payable;
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
      if (widget.tripOf != null)
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(color: c.success.withValues(alpha: 0.1), border: Border.all(color: c.success.withValues(alpha: 0.3)), borderRadius: BorderRadius.circular(10)),
          child: Text('This ride will be added to your trip.', style: TextStyle(color: c.success, fontSize: 12.5)),
        ),
      Stack(children: [
        Column(children: [
          field(Container(width: 10, height: 10, decoration: BoxDecoration(color: c.success, shape: BoxShape.circle)), 'Pickup location', _pickup,
              () => _pick(true)),
          for (var i = 0; i < _stops.length; i++) ...[
            const SizedBox(height: 8),
            // Room on the right for the swap button, so the remove button stays visible.
            Padding(padding: const EdgeInsets.only(right: 48), child: Row(children: [
              Expanded(
                child: field(
                    Container(
                      width: 18,
                      height: 18,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: c.accent, shape: BoxShape.circle),
                      child: Text('${i + 1}', style: const TextStyle(color: Brand.onGold, fontSize: 11, fontWeight: FontWeight.w700)),
                    ),
                    'Stop ${i + 1}',
                    _stops[i],
                    () => _pickStop(i)),
              ),
              IconButton(
                tooltip: 'Remove stop ${i + 1}',
                icon: const Icon(Icons.close, size: 18),
                onPressed: () {
                  setState(() => _stops.removeAt(i));
                  _loadQuotes();
                },
              ),
            ])),
          ],
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
                        final reversed = _stops.reversed.toList();
                        _stops
                          ..clear()
                          ..addAll(reversed);
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
      if (_settings.featureMultiStop && _stops.length < Rules.rideMaxStops)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => _pickStop(_stops.length),
            icon: const Icon(Icons.add, size: 18),
            label: Text('Add a stop (${(ref.watch(configProvider).value?.settings ?? const Settings({})).rideStopMinutes} min wait included)'),
          ),
        ),
      if (!_bike && _settings.serviceOn(ServiceKey.rentals) && _settings.featureOutstation)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => context.push('/group?type=outstation&pax=2'),
            icon: const Icon(Icons.route, size: 18),
            label: const Text('Going out of town? Outstation cabs'),
          ),
        ),
      const SizedBox(height: 8),
      if (_settings.featureRideScheduling) ...[
      _label('When'),
      Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
        ChoiceChip(
            label: const Text('Ride now'),
            selected: _at == null,
            onSelected: (_) {
              setState(() => _at = null);
              _loadQuotes();
            }),
        ChoiceChip(label: Text(_at == null ? 'Schedule' : dateTime(_at!)), selected: _at != null, onSelected: (_) => _pickTime()),
      ]),
      if (_at != null)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(
              'Fare locked now. Your driver is assigned ${Rules.rideStartWindowMinutes} min before pickup; free cancellation until ${(ref.watch(configProvider).value?.settings ?? const Settings({})).rideScheduleFreeCancelMinutes} min before.',
              style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
        ),
      ],
      if (_quoteErr != null) ...[const SizedBox(height: 14), ErrorBox(_quoteErr!, onRetry: _loadQuotes)],
      if (_loadingQuotes) ...[const SizedBox(height: 16), for (var i = 0; i < 3; i++) const Padding(padding: EdgeInsets.only(bottom: 8), child: Skeleton(height: 66))],
      if (_quotes != null && !_loadingQuotes && _quotes!.isNotEmpty) ...[
        const SizedBox(height: 16),
        _label('Choose a ride · ${_quotes!.first.distanceKm} km · ~${_quotes!.first.durationMin} min'),
        if (_topSurge > 1) _surgeNote(_topSurge, sameSurge: _quotes!.every((q) => q.surge == _topSurge)),
        if (_quotes!.any((q) => q.nightCharge > 0)) _nightNote(),
        if (_quotes!.first.passSaving > 0) _passNote(),
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
                      if (q.option.womenOnly) ...[const SizedBox(width: 6), Pill('Women only', color: c.highlight)],
                    ]),
                    Text('${q.etaMin} min away · ${q.option.description}',
                        maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.fgMuted, fontSize: 12)),
                  ]),
                ),
                const SizedBox(width: 8),
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text(inr(q.fare), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
                  if (q.passSaving > 0) Text('−${inr(q.passSaving)} surge', style: TextStyle(color: c.success, fontSize: 11)),
                  if (q.surge > 1 && !_quotes!.every((x) => x.surge == _topSurge)) Text('×${q.surge.toStringAsFixed(q.surge % 1 == 0 ? 0 : 1)} surge', style: TextStyle(color: c.warning, fontSize: 11)),
                  if (q.nightCharge > 0) Text('incl. ${inr(q.nightCharge)} night', style: TextStyle(color: c.fgMuted, fontSize: 11)),
                  if (q.airportFee > 0) Text('incl. ${inr(q.airportFee)} airport fee', style: TextStyle(color: c.fgMuted, fontSize: 11)),
                ]),
              ]),
            ),
          ),
        const SizedBox(height: 6),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final p in ridePayments.where((p) => p != PaymentMethod.cash || _settings.featureCashRides))
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
        if (canPay > 0)
          CheckboxListTile(
            value: _useCredits,
            onChanged: (v) => setState(() => _useCredits = v ?? false),
            dense: true,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: Text('Use ${inr(canPay)} QuikFly Credits'),
            subtitle: Text('Balance ${inr(user!.creditBalance)}', style: TextStyle(color: c.fgMuted, fontSize: 12)),
          ),
        if (earns > 0)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Row(children: [
              Icon(Icons.toll_outlined, size: 15, color: c.accent),
              const SizedBox(width: 6),
              Expanded(child: Text('Earn ${inr(earns)} QuikFly Credits when the ride is completed.', style: TextStyle(color: c.fgMuted, fontSize: 12))),
            ]),
          ),
        const SizedBox(height: 14),
        GoldButton(
          label: '${_at == null ? 'Book' : 'Schedule'} ${quote?.option.name ?? ''} · ${quote == null ? '' : inr(payable)}',
          onPressed: quote == null || (_payment == PaymentMethod.wallet && walletShort) ? null : _book,
        ),
      ],
    ]);
  }

  String _rideImage(RideOption o) =>
      _bike ? serviceOf(ServiceKey.bike).image : (o.id == 'prime' || o.id == 'suv' ? serviceOf(ServiceKey.rent).image : serviceOf(ServiceKey.car).image);

  /// MVAG 2025: show the surge before booking.

  /// "22-23, 0-5" → "22:00–23:59, 00:00–05:59" (hourRangesText in packages/shared/src/settings.ts).
  String _hourRanges(String s) => s.split(',').map((p) => p.trim()).where((p) => p.contains('-')).map((p) {
        final h = p.split('-').map((x) => int.tryParse(x.trim()) ?? 0).toList();
        String two(int v) => v.toString().padLeft(2, '0');
        return '${two(h[0])}:00–${two(h[1])}:59';
      }).join(', ');

  /// The highest surge in the current quotes (surge rules can differ by ride type).
  double get _topSurge => (_quotes ?? const <FareQuote>[]).fold(1.0, (m, q) => q.surge > m ? q.surge : m);

  Widget _nightNote() {
    final c = context.qf;
    final s = ref.watch(configProvider).value?.settings ?? const Settings({});
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(border: Border.all(color: c.border), borderRadius: BorderRadius.circular(10)),
      child: Text('Night fares: ${s.rideNightPercent}% is added ${_hourRanges(s.rideNightHours)} (India time), shown on each ride.', style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
    );
  }

  Widget _surgeNote(double surge, {bool sameSurge = true}) {
    final c = context.qf;
    final cfg = ref.watch(configProvider).value;
    final s = cfg?.settings ?? const Settings({});
    // The everyday hours are the whole story only while staff have added no surge rules
    // (rules add hours by ride type and weekday; each quote already carries its own surge).
    final listHours = sameSurge && s.surgeHours.isNotEmpty && (cfg?.surgeRules.isEmpty ?? true);
    String x(double v) => v.toStringAsFixed(v % 1 == 0 ? 0 : 1);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(color: c.warning.withValues(alpha: 0.1), border: Border.all(color: c.warning.withValues(alpha: 0.3)), borderRadius: BorderRadius.circular(10)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Busy hours: ${sameSurge ? 'these fares include a ×${x(surge)} surge' : 'some fares include a surge of up to ×${x(surge)}, shown on each ride'} (never more than ×${x(s.surgeCap)}).${listHours ? ' Surge hours: ${s.surgeHours}.' : ''}',
            style: TextStyle(color: c.warning, fontSize: 12.5)),
        if (s.passOnSale)
          GestureDetector(
            onTap: () => context.push('/account/wallet'),
            child: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('Skip surge with QuikFly Pass (${inr(s.passPrice)} for ${s.passDays} days) ›',
                  style: TextStyle(color: c.warning, fontSize: 12.5, fontWeight: FontWeight.w700, decoration: TextDecoration.underline, decorationColor: c.warning)),
            ),
          ),
      ]),
    );
  }

  /// Shown instead of the surge note when the rider's QuikFly Pass took the surge off.
  Widget _passNote() {
    final c = context.qf;
    final s = ref.watch(configProvider).value?.settings ?? const Settings({});
    final surge = s.effectiveSurge.toStringAsFixed(s.effectiveSurge % 1 == 0 ? 0 : 1);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(color: c.success.withValues(alpha: 0.1), border: Border.all(color: c.success.withValues(alpha: 0.3)), borderRadius: BorderRadius.circular(10)),
      child: Text('Busy hours, but your QuikFly Pass takes the ×$surge surge off these fares.', style: TextStyle(color: c.success, fontSize: 12.5)),
    );
  }

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
        Text(_researching ? 'Finding you another captain…' : 'Finding your ${_ride?.quote.option.name ?? _quote?.option.name ?? 'ride'}…',
            textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 4),
        Text(
          _researching
              ? "Your captain couldn't make it. We're asking the next nearest one; you pay nothing extra."
              : _ride?.isLive == true
                  ? 'Asking the nearest captain. You pay only once one accepts.'
                  : 'Matching you with the nearest top-rated driver',
          textAlign: TextAlign.center,
          style: TextStyle(color: c.fgMuted),
        ),
        if (_ride?.isLive == true) ...[
          const SizedBox(height: 12),
          TextButton(onPressed: _cancelSearch, child: Text(_bookingId != null ? 'Cancel (no charge)' : 'Cancel')),
        ],
      ]),
    );
  }

  /// No captain took the ride (and no simulated one stepped in): nothing is owed.
  Widget _unmatched() {
    final c = context.qf;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Column(children: [
        Icon(Icons.person_search_outlined, size: 44, color: c.fgMuted),
        const SizedBox(height: 10),
        Text('No captain found', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 6),
        Text(Rules.noCaptain, textAlign: TextAlign.center, style: TextStyle(color: c.fgMuted)),
        const SizedBox(height: 16),
        GoldButton(label: 'Try again', onPressed: _reset),
      ]),
    );
  }

  Widget _liveView() {
    final c = context.qf;
    final r = _ride!;
    final d = r.driver!;
    final rl = r.live;
    final arrived = _phase == RidePhase.arrived;
    final arriving = _phase == RidePhase.arriving || arrived;
    // A live ride's minutes come from the API; a simulated one's from the clock.
    final left = rl != null
        ? (rl.etaMin ?? (arriving ? r.quote.etaMin : r.quote.durationMin))
        : arriving ? (r.quote.etaMin * (1 - _t)).ceil().clamp(1, 999) : (r.quote.durationMin * (1 - _t)).ceil().clamp(1, 999);
    final progress = rl == null
        ? _t
        : arrived ? 1.0
        : (1 - left / (arriving ? r.quote.etaMin : r.quote.durationMin).clamp(1, 999)).clamp(0.0, 1.0);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (_simFallback)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text('No captain was free, so a simulated captain (demo) is taking this ride.', style: TextStyle(color: c.warning, fontSize: 12.5)),
        ),
      Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(arrived ? 'YOUR CAPTAIN IS HERE' : arriving ? (rl != null ? 'CAPTAIN ON THE WAY' : 'DRIVER ON THE WAY') : 'ON TRIP',
                style: TextStyle(color: c.success, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1)),
            Text(arrived ? 'Meet at the pickup' : arriving ? 'Arriving in $left min' : '$left min to drop', style: Theme.of(context).textTheme.headlineSmall),
            if (arrived) Text('Tell your captain your PIN to start the trip.', style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
          ]),
        ),
        if (arriving)
          Column(children: [
            Text(ref.read(userProvider)?.ridePin == r.otp ? 'YOUR PIN' : 'OTP', style: TextStyle(color: c.fgMuted, fontSize: 11.5, fontWeight: FontWeight.w700)),
            Text(r.otp, style: TextStyle(color: c.accent, fontSize: 24, fontWeight: FontWeight.w700, letterSpacing: 4)),
          ]),
      ]),
      const SizedBox(height: 10),
      ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: progress, minHeight: 6, backgroundColor: c.border)),
      const SizedBox(height: 14),
      Panel(
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: Brand.gold,
            child: Text(d.name[0], style: const TextStyle(color: Brand.onGold, fontWeight: FontWeight.w700, fontSize: 18)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(d.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              Row(children: [
                Icon(Icons.star, size: 14, color: c.accent),
                const SizedBox(width: 3),
                Text('${d.rating} · ${d.trips} trips', style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
              ]),
            ]),
          ),
          IconButton.outlined(tooltip: 'Call driver', onPressed: () => call(d.phone), icon: const Icon(Icons.call, size: 18)),
        ]),
      ),
      const SizedBox(height: 10),
      Panel(
        highlighted: true,
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(d.vehicle, style: TextStyle(color: c.fgSoft)),
              Text(r.quote.option.name, style: TextStyle(color: c.fgSubtle, fontSize: 12)),
            ]),
          ),
          // Number plates are white with black text in both themes.
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(4), border: Border.all(color: Colors.black26)),
            child: Text(d.plate, style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w700, fontFamily: 'monospace')),
          ),
        ]),
      ),
      const SizedBox(height: 12),
      Row(children: [Icon(Icons.trip_origin, size: 16, color: c.success), const SizedBox(width: 8), Expanded(child: Text(r.pickup.name))]),
      const SizedBox(height: 6),
      Row(children: [Icon(Icons.navigation_outlined, size: 16, color: c.accent), const SizedBox(width: 8), Expanded(child: Text(r.drop.name))]),
      const SizedBox(height: 10),
      Divider(color: c.border),
      KeyValue('Fare (${paymentLabel(r.payment)})', inr(r.quote.fare - _creditsPaid), bold: true),
      if (_creditsPaid > 0) KeyValue('Paid with credits', inr(_creditsPaid)),
      const SizedBox(height: 10),
      Row(children: [
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: c.danger, foregroundColor: Brand.onGold, minimumSize: const Size(0, 48)),
          onPressed: () => showSafetySheet(context, onShare: _share, rideId: _ride?.id),
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

  /// Confirmation after booking ahead: no driver yet; start from My Trips near pickup.
  Widget _scheduledView(Ride r) {
    final c = context.qf;
    final s = ref.watch(configProvider).value?.settings ?? const Settings({});
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(height: 8),
      Icon(Icons.event_available, color: c.accent, size: 40),
      const SizedBox(height: 8),
      const Text('Ride scheduled', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 20)),
      if (widget.tripOf != null) Text('Added to your trip', textAlign: TextAlign.center, style: TextStyle(color: c.success, fontSize: 13)),
      const SizedBox(height: 4),
      Text('${r.quote.option.name} · ${r.pickup.name} → ${r.drop.name}', textAlign: TextAlign.center, style: TextStyle(color: c.fgSoft)),
      const SizedBox(height: 8),
      Text(dateTime(r.scheduledFor!), textAlign: TextAlign.center, style: TextStyle(color: c.accent, fontWeight: FontWeight.w700, fontSize: 17)),
      const SizedBox(height: 8),
      Text(
          'Fare ${inr(r.quote.fare)} (${paymentLabel(r.payment)}), locked. Your driver is assigned ${Rules.rideStartWindowMinutes} minutes before pickup: start the ride from My Trips then. Free cancellation until ${s.rideScheduleFreeCancelMinutes} minutes before pickup.',
          textAlign: TextAlign.center,
          style: TextStyle(color: c.fgMuted, fontSize: 13)),
      const SizedBox(height: 16),
      Row(children: [
        Expanded(child: OutlinedButton(onPressed: () => setState(() { _scheduled = null; _at = null; }), child: const Text('Book another'))),
        const SizedBox(width: 10),
        Expanded(child: FilledButton(onPressed: () => context.go('/trips'), child: const Text('My Trips'))),
      ]),
    ]);
  }

  /// Credits the next booking uses (same rule as the API), and what a finished ride earned.
  int _creditsOff() {
    final user = ref.read(userProvider), q = _quote;
    if (!_useCredits || user == null || q == null) return 0;
    final s = ref.read(configProvider).value?.settings ?? const Settings({});
    return creditsUsable(s, user.creditBalance, q.fare, 0, rideDiscountRoom(s, widget.service, q.fare));
  }

  int _earnedNow(Ride r) => creditsEarned(ref.read(configProvider).value?.settings ?? const Settings({}), widget.service, r.quote.fare - _creditsPaid);

  Widget _done() {
    final c = context.qf;
    final r = _ride!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(children: [
        Text('YOU HAVE ARRIVED', style: TextStyle(color: c.success, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1)),
        const SizedBox(height: 4),
        Text(inr(r.quote.fare - _creditsPaid), style: Theme.of(context).textTheme.headlineLarge),
        const SizedBox(height: 4),
        Text('${r.quote.distanceKm} km · ${r.quote.durationMin} min · paid by ${paymentLabel(r.payment)}${_creditsPaid > 0 ? ' + ${inr(_creditsPaid)} credits' : ''}', style: TextStyle(color: c.fgMuted)),
        if (_earnedNow(r) > 0) ...[
          const SizedBox(height: 6),
          Text('${inr(_earnedNow(r))} QuikFly Credits earned', style: TextStyle(color: c.accent, fontWeight: FontWeight.w600)),
        ],
        const SizedBox(height: 16),
        Text('Rate your ride with ${r.driver?.name ?? 'your captain'}'),
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
