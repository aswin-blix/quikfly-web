// QuikFly Captain's state: who the captain is (GET /driver), and while they are online a heartbeat
// (POST /driver/ping) that brings offers and keeps their ride current. Every action returns the new
// state from the API, which owns the ride; the app never moves a ride by itself.
// With GPS (step 7 of docs/driver-app-plan.md) the position stream runs in the background (location.dart), so
// the heartbeat carries on with the app closed. With a demo location (the owner's driverDemoLocation) the captain
// picks a place, the app moves them on a trip, and they stay online only while the app is open.
import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api.dart';
import '../state/providers.dart';
import 'location.dart';
import 'speech.dart';

/// Demo locations: how far the app moves the captain per heartbeat on a trip (map units; 3 ≈ 1 km).
const demoStepUnits = 3.0;

/// GET /driver for whoever is signed in: null when signed out.
final captainLookupProvider = FutureProvider<CaptainLookup?>((ref) async {
  final user = ref.watch(sessionProvider.select((s) => s.value?.id));
  if (user == null) return null;
  return ref.watch(apiProvider).captain();
});

/// The live rules (the profile's, or the shared defaults until it loads).
final captainRulesProvider = Provider<CaptainRules>((ref) => ref.watch(captainLookupProvider).value?.captain?.rules ?? CaptainRules.fallback);

/// Today's trips, earnings and cash held. Refreshed after each completed trip.
final captainSummaryProvider = FutureProvider<CaptainSummary?>((ref) async {
  final captain = ref.watch(captainLookupProvider.select((l) => l.value?.captain?.driverId));
  if (captain == null) return null;
  return ref.watch(apiProvider).captainSummary();
});

/// The captain's completed trips, newest first.
final captainTripsProvider = FutureProvider<List<CaptainTripItem>>((ref) async {
  final captain = ref.watch(captainLookupProvider.select((l) => l.value?.captain?.driverId));
  if (captain == null) return const [];
  return ref.watch(apiProvider).captainTrips();
});

class CaptainLive {
  const CaptainLive({this.state, this.busy = false, this.error, this.done});
  /// The latest state from the API; null until the first answer.
  final CaptainState? state;
  /// An action is in flight (buttons show a spinner and don't take a second tap).
  final bool busy;
  /// The last failed action's message, shown until the next action.
  final String? error;
  /// The trip that just ended, until the captain closes the "Collect cash" / "Trip done" screen.
  final CaptainDone? done;

  bool get online => state?.duty.online ?? false;
  CaptainLive copy({CaptainState? state, bool? busy, String? error, bool clearError = false, CaptainDone? done, bool clearDone = false}) =>
      CaptainLive(state: state ?? this.state, busy: busy ?? this.busy, error: clearError ? null : error ?? this.error, done: clearDone ? null : done ?? this.done);
}

class CaptainController extends Notifier<CaptainLive> {
  Timer? _timer;
  bool _foreground = true;
  String? _announced;
  /// Real GPS while online: the background position stream and its latest fix.
  StreamSubscription<GpsFix>? _gps;
  GpsFix? _fix;
  bool get _usingGps => _gps != null;

  @override
  CaptainLive build() {
    ref.onDispose(() {
      _timer?.cancel();
      _gps?.cancel();
    });
    // A captain who was online (or on a ride) when the app was closed picks up where they were.
    ref.listen(captainLookupProvider, (_, next) {
      final c = next.value?.captain;
      if (c == null) {
        _timer?.cancel();
        state = const CaptainLive();
      } else if (state.state == null) {
        _resume(c);
      }
    });
    final c = ref.read(captainLookupProvider).value?.captain;
    if (c != null) Future.microtask(() => _resume(c));
    return const CaptainLive();
  }

  Future<void> _resume(CaptainProfile c) async {
    if (state.state != null) return;
    state = state.copy(state: CaptainState(duty: c.duty, offer: null, ride: null));
    // Online with GPS when the app was closed: start the position stream again (no prompt: only if already allowed).
    if (c.duty.online && !c.duty.demo && await CaptainGps.allowed()) _startGps();
    // Online, or still on a ride: the first heartbeat brings the offer or the ride back.
    refresh();
  }

  void _startGps() {
    if (_usingGps) return;
    _gps = CaptainGps.watch().listen((f) => _fix = f, onError: (_) {/* the last fix stays; the heartbeat goes on */});
  }

  void _stopGps() {
    _gps?.cancel();
    _gps = null;
    _fix = null;
  }

  QuikFlyApi get _api => ref.read(apiProvider);
  CaptainRules get _rules => ref.read(captainRulesProvider);

  /// The app went to the background or came back (ask now). With GPS the heartbeat carries on in the background
  /// (the position stream keeps the app running); with a demo location it stops until the app is back.
  void setForeground(bool front) {
    _foreground = front;
    if (front) {
      refresh();
    } else if (!_usingGps) {
      _timer?.cancel();
    }
  }

  /// One heartbeat now: where the captain is, and what the API has for them.
  Future<void> refresh() async {
    final s = state.state;
    if (s == null || (!s.duty.online && s.ride == null)) return;
    try {
      _apply(await _api.captainPing(position: _usingGps ? _fix : _demoStep(s)));
    } catch (_) {
      // A missed heartbeat is retried at the next one; the API keeps the captain online for driverStaleSeconds.
      _schedule();
    }
  }

  /// The next demo position on a trip: a step towards the pickup, then towards the drop. Null otherwise.
  MapPoint? _demoStep(CaptainState s) {
    final at = s.duty.position, ride = s.ride;
    if (!s.duty.demo || at == null || ride == null || ride.phase == 'arrived') return null;
    final to = ride.phase == 'arriving' ? ride.trip.pickup : ride.trip.drop;
    final dx = to.x - at.x, dy = to.y - at.y;
    final d = math.sqrt(dx * dx + dy * dy);
    if (d <= demoStepUnits) return MapPoint(to.x, to.y);
    double round(double v) => (v * 100).roundToDouble() / 100;
    return MapPoint(round(at.x + dx / d * demoStepUnits), round(at.y + dy / d * demoStepUnits));
  }

  void _apply(CaptainState s) {
    final offer = s.offer;
    if (offer != null && offer.trip.rideId != _announced) {
      _announced = offer.trip.rideId;
      HapticFeedback.heavyImpact();
      ref.read(voiceProvider.notifier).speak(offer);
    }
    state = state.copy(state: s, done: s.done);
    // Offline (staff set it, or the app went silent too long) with no ride: stop sharing the location.
    if (!s.duty.online && s.ride == null && _usingGps) _stopGps();
    if (s.done != null) {
      ref.invalidate(captainSummaryProvider);
      ref.invalidate(captainTripsProvider);
    }
    _schedule();
  }

  /// The next heartbeat: sooner with an offer or a ride (DRIVER_RULES.pingBusySeconds), none while offline.
  void _schedule() {
    _timer?.cancel();
    final s = state.state;
    if ((!_foreground && !_usingGps) || s == null || (!s.duty.online && s.ride == null)) return;
    final busy = s.offer != null || s.ride != null;
    _timer = Timer(Duration(seconds: busy ? _rules.pingBusySeconds : _rules.pingIdleSeconds), refresh);
  }

  /// Runs an action. Returns the API's message when it failed (also kept in [CaptainLive.error]).
  Future<String?> _run(Future<CaptainState> Function(QuikFlyApi api) call) async {
    if (state.busy) return null;
    state = state.copy(busy: true, clearError: true);
    try {
      _apply(await call(_api));
      state = state.copy(busy: false);
      return null;
    } catch (e) {
      final msg = e is ApiException ? e.message : 'Something went wrong. Please try again.';
      state = state.copy(busy: false, error: msg);
      // The ride may have changed under us (the rider cancelled, the offer ran out): read it again.
      unawaited(refresh());
      return msg;
    }
  }

  /// Online at a demo location the captain picked (no GPS).
  Future<String?> goOnline(MapPoint at) {
    _stopGps();
    return _run((a) => a.setCaptainDuty(true, position: at));
  }

  /// Online with a GPS fix; the position stream then keeps them online with the app closed.
  Future<String?> goOnlineWithGps(GpsFix fix) async {
    final err = await _run((a) => a.setCaptainDuty(true, position: fix));
    if (err == null && state.online) {
      _fix = fix;
      _startGps();
    }
    return err;
  }

  Future<String?> goOffline() async {
    final err = await _run((a) => a.setCaptainDuty(false));
    if (err == null) _stopGps();
    return err;
  }
  Future<String?> accept(String rideId) => _run((a) => a.acceptOffer(rideId));
  Future<String?> decline(String rideId) => _run((a) => a.declineOffer(rideId));
  Future<String?> arrived(String rideId) => _run((a) => a.captainArrived(rideId));
  Future<String?> start(String rideId, String otp) => _run((a) => a.captainStart(rideId, otp));
  Future<String?> complete(String rideId) => _run((a) => a.captainComplete(rideId));
  Future<String?> release(String rideId, String reason) => _run((a) => a.captainRelease(rideId, reason));

  /// Closes the "Collect cash" / "Trip done" screen.
  void dismissDone() => state = state.copy(clearDone: true);

  void clearError() => state = state.copy(clearError: true);
}

final captainProvider = NotifierProvider<CaptainController, CaptainLive>(CaptainController.new);
