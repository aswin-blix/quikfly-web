// QuikFly Captain: Dart copies of the driver shapes in packages/shared/src/driver.ts and geo.ts.
// When a type changes there, change it here in the same PR (test/captain_models_test.dart).
import 'dart:math' as math;
import 'models.dart';

int _int(Object? v) => (v as num?)?.round() ?? 0;
double _num(Object? v) => (v as num?)?.toDouble() ?? 0;
DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();

/// A point on the demo city map (0–100, x east, y south), like a Place.
class MapPoint {
  const MapPoint(this.x, this.y);
  final double x, y;
  static MapPoint? maybe(Object? j) => j is Map ? MapPoint(_num(j['x']), _num(j['y'])) : null;
  Map<String, double> toJson() => {'x': x, 'y': y};
  @override
  bool operator ==(Object other) => other is MapPoint && other.x == x && other.y == y;
  @override
  int get hashCode => Object.hash(x, y);
}

/// The demo map and the real world (packages/shared/src/geo.ts). Used for the Maps link only.
class CityGeo {
  static const centerLat = 13.06, centerLng = 80.24, mapSize = 100.0;
  /// RIDE_SIM.kmPerMapUnit in packages/shared/src/pricing.ts.
  static const kmPerMapUnit = 0.32;
  static const _kmPerDegreeLat = 111.2;
  static double get _kmPerDegreeLng => 111.32 * math.cos(centerLat * math.pi / 180);

  static ({double lat, double lng}) toLatLng(double x, double y) => (
        lat: centerLat - ((y - mapSize / 2) * kmPerMapUnit) / _kmPerDegreeLat,
        lng: centerLng + ((x - mapSize / 2) * kmPerMapUnit) / _kmPerDegreeLng,
      );

  static double distanceKm(MapPoint a, double x, double y) => math.sqrt(math.pow(a.x - x, 2) + math.pow(a.y - y, 2)) * kmPerMapUnit;
}

/// DRIVER_RULES / Settings as the API reports them (GET /driver → rules).
class CaptainRules {
  const CaptainRules({
    required this.offerSeconds, required this.pingIdleSeconds, required this.pingBusySeconds, required this.searchRadiusKm,
    required this.arrivedRadiusKm, required this.pinTries, required this.pinLockMinutes, required this.cancelPenaltyPercent,
    required this.cancelPenaltyCap, required this.releaseReasons, required this.model, required this.commissionPercent,
    required this.dailyFeePaise, required this.demoLocation,
  });
  final int offerSeconds, pingIdleSeconds, pingBusySeconds, pinTries, pinLockMinutes, cancelPenaltyPercent, cancelPenaltyCap, dailyFeePaise;
  final double searchRadiusKm, arrivedRadiusKm, commissionPercent;
  final List<ReleaseReason> releaseReasons;
  /// 'commission' or 'dailyFee'.
  final String model;
  final bool demoLocation;

  bool get onDailyFee => model == 'dailyFee';

  /// Used until the profile arrives (an older API sends no rules): the shared defaults.
  static const fallback = CaptainRules(
    offerSeconds: 15, pingIdleSeconds: 15, pingBusySeconds: 5, searchRadiusKm: 5, arrivedRadiusKm: 0.3, pinTries: 5, pinLockMinutes: 15,
    cancelPenaltyPercent: 0, cancelPenaltyCap: 100, releaseReasons: [], model: 'commission', commissionPercent: 20, dailyFeePaise: 0, demoLocation: true,
  );

  factory CaptainRules.fromJson(Json? j) => j == null
      ? fallback
      : CaptainRules(
          offerSeconds: _int(j['offerSeconds']), pingIdleSeconds: _int(j['pingIdleSeconds']), pingBusySeconds: _int(j['pingBusySeconds']),
          searchRadiusKm: _num(j['searchRadiusKm']), arrivedRadiusKm: _num(j['arrivedRadiusKm']), pinTries: _int(j['pinTries']),
          pinLockMinutes: _int(j['pinLockMinutes']), cancelPenaltyPercent: _int(j['cancelPenaltyPercent']), cancelPenaltyCap: _int(j['cancelPenaltyCap']),
          releaseReasons: [for (final r in (j['releaseReasons'] as List? ?? const [])) ReleaseReason.fromJson(r as Json)],
          model: '${j['model'] ?? 'commission'}', commissionPercent: _num(j['commissionPercent']), dailyFeePaise: _int(j['dailyFeePaise']),
          demoLocation: j['demoLocation'] != false,
        );
}

/// Why a captain gives an accepted ride back (CAPTAIN_RELEASE_REASONS); `valid` ones never cost anything.
class ReleaseReason {
  const ReleaseReason(this.id, this.label, this.valid);
  final String id, label;
  final bool valid;
  factory ReleaseReason.fromJson(Json j) => ReleaseReason('${j['id']}', '${j['label']}', j['valid'] == true);
}

class CaptainDuty {
  const CaptainDuty({required this.online, required this.position, required this.demo, required this.seenAt});
  final bool online;
  final MapPoint? position;
  final bool demo;
  final DateTime? seenAt;
  factory CaptainDuty.fromJson(Json j) =>
      CaptainDuty(online: j['online'] == true, position: MapPoint.maybe(j['position']), demo: j['demo'] == true, seenAt: _date(j['seenAt']));
}

/// GET /driver → captain.
class CaptainProfile {
  const CaptainProfile({
    required this.driverId, required this.name, required this.phone, required this.gender, required this.self,
    required this.vehicleType, required this.regNumber, required this.ownerName, required this.blocker, required this.duty, required this.rules,
  });
  final String driverId, name, phone, ownerName;
  final String? gender, vehicleType, regNumber, blocker;
  final bool self;
  final CaptainDuty duty;
  final CaptainRules rules;

  factory CaptainProfile.fromJson(Json j) {
    final d = j['driver'] as Json;
    final v = j['vehicle'] as Json?;
    return CaptainProfile(
      driverId: '${d['id']}', name: '${d['name']}', phone: '${d['phone']}', gender: d['gender'] as String?, self: d['self'] == true,
      vehicleType: v?['type'] as String?, regNumber: v?['regNumber'] as String?, ownerName: '${(j['owner'] as Json?)?['name'] ?? ''}',
      blocker: j['blocker'] as String?, duty: CaptainDuty.fromJson(j['duty'] as Json), rules: CaptainRules.fromJson(j['rules'] as Json?),
    );
  }
}

/// GET /driver: the profile, or why this number isn't a captain (and whether it may register its own vehicle).
class CaptainLookup {
  const CaptainLookup(this.captain, this.reason, {this.selfSignup = false});
  final CaptainProfile? captain;
  final String? reason;
  /// Settings.captainSelfSignup: offer owner-driver registration.
  final bool selfSignup;
  factory CaptainLookup.fromJson(Json j) => CaptainLookup(
        j['captain'] == null ? null : CaptainProfile.fromJson(j['captain'] as Json),
        j['reason'] as String?,
        selfSignup: j['selfSignup'] == true,
      );
}

/// What a trip is worth to the vehicle. Paise, except [customerPays] (₹).
class CaptainMoney {
  const CaptainMoney({
    required this.customerPays, required this.gstPaise, required this.farePaise, required this.commissionPaise, required this.tdsPaise,
    required this.earningPaise, required this.model, required this.dailyFeePaise,
  });
  final int customerPays, gstPaise, farePaise, commissionPaise, tdsPaise, earningPaise, dailyFeePaise;
  final String model;
  bool get onDailyFee => model == 'dailyFee';
  factory CaptainMoney.fromJson(Json j) => CaptainMoney(
        customerPays: _int(j['customerPays']), gstPaise: _int(j['gstPaise']), farePaise: _int(j['farePaise']), commissionPaise: _int(j['commissionPaise']),
        tdsPaise: _int(j['tdsPaise']), earningPaise: _int(j['earningPaise']), model: '${j['model'] ?? 'commission'}', dailyFeePaise: _int(j['dailyFeePaise']),
      );
}

/// A trip as the captain sees it: CaptainTrip, plus the offer or ride fields when present.
class CaptainTrip {
  const CaptainTrip({
    required this.rideId, required this.service, required this.rideType, required this.womenOnly, required this.pickup, required this.drop,
    required this.stops, required this.distanceKm, required this.durationMin, required this.pickupKm, required this.payment, required this.money,
  });
  final String rideId, service, rideType;
  final bool womenOnly;
  final Place pickup, drop;
  final List<Place> stops;
  final double distanceKm;
  final int durationMin;
  final double? pickupKm;
  final PaymentMethod payment;
  final CaptainMoney money;

  bool get cash => payment == PaymentMethod.cash;

  static CaptainTrip parse(Json j) => CaptainTrip(
        rideId: '${j['rideId']}', service: '${j['service']}', rideType: '${j['rideType']}', womenOnly: j['womenOnly'] == true,
        pickup: Place.fromJson(j['pickup'] as Json), drop: Place.fromJson(j['drop'] as Json),
        stops: [for (final s in (j['stops'] as List? ?? const [])) Place.fromJson(s as Json)],
        distanceKm: _num(j['distanceKm']), durationMin: _int(j['durationMin']),
        pickupKm: j['pickupKm'] == null ? null : _num(j['pickupKm']),
        payment: PaymentMethod.values.firstWhere((p) => p.name == j['payment'], orElse: () => PaymentMethod.upi),
        money: CaptainMoney.fromJson(j['money'] as Json),
      );
}

class CaptainOffer {
  const CaptainOffer(this.trip, this.expiresAt, this.secondsLeft);
  final CaptainTrip trip;
  final DateTime expiresAt;
  final int secondsLeft;
  factory CaptainOffer.fromJson(Json j) =>
      CaptainOffer(CaptainTrip.parse(j), _date(j['expiresAt']) ?? DateTime.now(), _int(j['secondsLeft']));
}

/// 'arriving' | 'arrived' | 'ontrip'.
class CaptainRide {
  const CaptainRide({
    required this.trip, required this.phase, required this.riderName, required this.riderPhone, required this.booked,
    required this.collectCash, required this.pinTriesLeft, required this.pinLockedUntil,
  });
  final CaptainTrip trip;
  final String phase, riderName;
  final String? riderPhone;
  final bool booked;
  final int? collectCash;
  final int pinTriesLeft;
  final DateTime? pinLockedUntil;
  factory CaptainRide.fromJson(Json j) => CaptainRide(
        trip: CaptainTrip.parse(j), phase: '${j['phase']}', riderName: '${j['riderName'] ?? ''}', riderPhone: j['riderPhone'] as String?,
        booked: j['booked'] == true, collectCash: j['collectCash'] == null ? null : _int(j['collectCash']),
        pinTriesLeft: _int(j['pinTriesLeft']), pinLockedUntil: _date(j['pinLockedUntil']),
      );
}

/// What a trip that just ended came to (POST /driver/rides/:id/complete).
class CaptainDone {
  const CaptainDone(this.rideId, this.earningPaise, this.collectCash);
  final String rideId;
  final int earningPaise;
  final int? collectCash;
  factory CaptainDone.fromJson(Json j) =>
      CaptainDone('${j['rideId']}', _int(j['earningPaise']), j['collectCash'] == null ? null : _int(j['collectCash']));
}

/// POST /driver/ping and every captain action.
class CaptainState {
  const CaptainState({required this.duty, required this.offer, required this.ride, this.done});
  final CaptainDuty duty;
  final CaptainOffer? offer;
  final CaptainRide? ride;
  final CaptainDone? done;
  factory CaptainState.fromJson(Json j) => CaptainState(
        duty: CaptainDuty.fromJson(j['duty'] as Json),
        offer: j['offer'] == null ? null : CaptainOffer.fromJson(j['offer'] as Json),
        ride: j['ride'] == null ? null : CaptainRide.fromJson(j['ride'] as Json),
        done: j['done'] == null ? null : CaptainDone.fromJson(j['done'] as Json),
      );
}

/// GET /driver/summary: the India day so far. Paise.
class CaptainSummary {
  const CaptainSummary(this.day, this.trips, this.earningPaise, this.cashPaise);
  final String day;
  final int trips, earningPaise, cashPaise;
  factory CaptainSummary.fromJson(Json j) => CaptainSummary('${j['day']}', _int(j['trips']), _int(j['earningPaise']), _int(j['cashPaise']));
}

/// GET /driver/trips: one completed trip. Paise.
class CaptainTripItem {
  const CaptainTripItem(this.bookingId, this.completedAt, this.title, this.subtitle, this.payment, this.paidPaise, this.earningPaise);
  final String bookingId, title, subtitle;
  final DateTime completedAt;
  final PaymentMethod payment;
  final int paidPaise, earningPaise;
  factory CaptainTripItem.fromJson(Json j) => CaptainTripItem(
        '${j['bookingId']}', _date(j['completedAt']) ?? DateTime.now(), '${j['title']}', '${j['subtitle']}',
        PaymentMethod.values.firstWhere((p) => p.name == j['payment'], orElse: () => PaymentMethod.upi), _int(j['paidPaise']), _int(j['earningPaise']),
      );
}
