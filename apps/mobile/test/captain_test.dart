// QuikFly Captain: the Dart copies of the driver shapes parse what the API sends (the JSON here follows
// packages/shared/src/driver.ts and the smoke checks in apps/api/scripts/smoke-admin.mjs), the offer is
// read aloud in the captain's language, and the home screen shows the offer, the ride and the cash.
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quikfly/api/captain_models.dart';
import 'package:quikfly/api/models.dart';
import 'package:quikfly/api/vendor_models.dart';
import 'package:quikfly/captain/captain_state.dart';
import 'package:quikfly/captain/home_screen.dart';
import 'package:quikfly/captain/notice_screen.dart';
import 'package:quikfly/captain/speech.dart';
import 'package:quikfly/partner/partner_app.dart';
import 'package:quikfly/state/providers.dart';
import 'package:quikfly/theme/theme.dart';
import 'package:quikfly/widgets/ui.dart';

Map<String, dynamic> _place(String id, String name, double x, double y) => {'id': id, 'name': name, 'area': 'Chennai', 'x': x, 'y': y};

Map<String, dynamic> _trip({String payment = 'upi', String model = 'commission'}) => {
      'rideId': 'RD1',
      'service': 'car',
      'rideType': 'Mini',
      'womenOnly': false,
      'pickup': _place('p1', 'Chennai Central', 62, 30),
      'drop': _place('p3', 'T. Nagar', 44, 52),
      'stops': [],
      'distanceKm': 9.1,
      'durationMin': 27,
      'pickupKm': 0,
      'payment': payment,
      'money': {
        'customerPays': 250,
        'gstPaise': 1190,
        'farePaise': 23810,
        'commissionPaise': model == 'commission' ? 4762 : 0,
        'tdsPaise': 25,
        'earningPaise': model == 'commission' ? 19023 : 23785,
        'model': model,
        'dailyFeePaise': model == 'commission' ? 0 : 5000,
      },
    };

Map<String, dynamic> _duty({bool online = true}) => {'online': online, 'position': {'x': 62, 'y': 30}, 'demo': true, 'seenAt': '2026-11-27T10:00:00.000Z'};

final _profile = {
  'driver': {'id': 'VD1', 'name': 'Smoke Vendor', 'phone': '+91 7000000001', 'gender': 'female', 'self': true},
  'vehicle': {'id': 'VV1', 'type': 'car', 'regNumber': 'TN10QF1234'},
  'owner': {'name': 'Smoke Vendor'},
  'blocker': null,
  'notice': {'version': 'captain-2026-11-28', 'agreedAt': '2026-11-28T06:00:00.000Z'},
  'duty': _duty(),
  'rules': {
    'offerSeconds': 15, 'pingIdleSeconds': 15, 'pingBusySeconds': 5, 'searchRadiusKm': 5, 'arrivedRadiusKm': 0.3, 'pinTries': 5, 'pinLockMinutes': 15,
    'cancelPenaltyPercent': 0, 'cancelPenaltyCap': 100,
    'releaseReasons': [
      {'id': 'rider_no_show', 'label': "Rider didn't show up", 'valid': true},
      {'id': 'changed_mind', 'label': "I can't take this ride", 'valid': false},
    ],
    'model': 'commission', 'commissionPercent': 20, 'dailyFeePaise': 0, 'demoLocation': true,
  },
};

CaptainOffer _offer({String payment = 'upi', String model = 'commission'}) => CaptainOffer.fromJson({
      ..._trip(payment: payment, model: model),
      'expiresAt': DateTime.now().add(const Duration(seconds: 12)).toUtc().toIso8601String(),
      'secondsLeft': 12,
    });

User _user() => User.fromJson({
      'id': 'U1', 'name': 'Smoke Vendor', 'phone': '+91 7000000001', 'walletBalance': 0, 'profileComplete': true, 'referralCode': 'QF1',
      'referred': false, 'licence': null, 'autoShareNightRides': false, 'privacyConsent': '2026-11-23',
    });

class _Session extends SessionNotifier {
  @override
  Future<User?> build() async => _user();
}

class _Captain extends CaptainController {
  _Captain(this.live);
  final CaptainLive live;
  @override
  CaptainLive build() => live;
}

Future<void> _pump(WidgetTester t, CaptainLive live, {CaptainLookup? lookup, VendorApplication? vendor, VendorFleet? fleet, Size size = const Size(390, 2000), double textScale = 1, Brightness brightness = Brightness.light}) async {
  // A 390 px wide phone by default (rule 8), tall enough that the whole home screen is built.
  t.view.physicalSize = size * 3;
  t.view.devicePixelRatio = 3;
  t.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(t.view.reset);
  addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
  // A fresh scope each time: a ProviderScope keeps its first overrides when pumped again.
  await t.pumpWidget(ProviderScope(
    key: UniqueKey(),
    overrides: [
      sessionProvider.overrideWith(_Session.new),
      captainLookupProvider.overrideWith((ref) async => lookup ?? CaptainLookup.fromJson({'captain': _profile})),
      captainProvider.overrideWith(() => _Captain(live)),
      captainSummaryProvider.overrideWith((ref) async => const CaptainSummary('2026-11-27', 2, 38046, 25000)),
      configProvider.overrideWith((ref) => Completer<AppConfig>().future), // no map in these tests
      // Owner-driver sign-up (captainSelfSignup): the partner application and fleet of this account.
      vendorProvider.overrideWith((ref) async => vendor),
      fleetProvider.overrideWith((ref) async => fleet),
    ],
    child: MaterialApp(theme: buildTheme(brightness), home: const CaptainHomeScreen()),
  ));
  // The captain lookup, then (no driver record) the partner application: a frame each.
  await t.pump();
  await t.pump();
  await t.pump();
}

void main() {
  test('the profile, its rules and a state with an offer parse', () {
    final p = CaptainLookup.fromJson({'captain': _profile}).captain!;
    expect(p.regNumber, 'TN10QF1234');
    expect(p.rules.offerSeconds, 15);
    expect(p.rules.releaseReasons.first.valid, isTrue);
    expect(p.duty.position, const MapPoint(62, 30));
    final s = CaptainState.fromJson({'duty': _duty(), 'offer': {..._trip(), 'expiresAt': '2026-11-27T10:00:15.000Z', 'secondsLeft': 15}, 'ride': null});
    expect(s.offer!.trip.money.earningPaise, 19023);
    expect(s.offer!.trip.pickup.name, 'Chennai Central');
    expect(s.ride, isNull);
    final none = CaptainLookup.fromJson({'captain': null, 'reason': "This number isn't registered"});
    expect(none.captain, isNull);
    expect(none.reason, contains('registered'));
  });

  test('a ride and a finished trip parse', () {
    final s = CaptainState.fromJson({
      'duty': _duty(),
      'offer': null,
      'ride': {..._trip(payment: 'cash'), 'phase': 'arrived', 'riderName': 'Guest', 'riderPhone': '+91 6000000000', 'booked': true, 'collectCash': 250, 'pinTriesLeft': 4, 'pinLockedUntil': null},
      'done': {'rideId': 'RD1', 'earningPaise': 19023, 'collectCash': 250},
    });
    expect(s.ride!.phase, 'arrived');
    expect(s.ride!.collectCash, 250);
    expect(s.ride!.trip.cash, isTrue);
    expect(s.done!.collectCash, 250);
  });

  test('older APIs without rules fall back to the shared defaults', () {
    expect(CaptainRules.fromJson(null).pinTries, 5);
  });

  test('offers are read in the captain\'s language', () {
    final o = _offer(payment: 'cash');
    expect(offerSentence(o, 'en'), 'Mini ride. Chennai Central to T. Nagar. 9.1 kilometres. 250 rupees, cash.');
    expect(offerSentence(o, 'ta'), contains('ரூபாய்'));
    expect(offerSentence(o, 'hi'), contains('रुपये'));
  });

  test('the Maps link point is the same place as on the API\'s map', () {
    final c = CityGeo.toLatLng(50, 50);
    expect(c.lat, closeTo(13.06, 1e-9));
    expect(c.lng, closeTo(80.24, 1e-9));
  });

  testWidgets('an offer shows the whole trip and the money split', (t) async {
    final live = CaptainLive(state: CaptainState(duty: CaptainDuty.fromJson(_duty()), offer: _offer(), ride: null));
    await _pump(t, live);
    expect(find.text('New Mini ride'), findsOneWidget);
    expect(find.textContaining('Chennai Central', findRichText: true), findsOneWidget);
    expect(find.text('Vehicle earns'), findsOneWidget);
    expect(find.text('₹190.23'), findsOneWidget);
    expect(find.text('−₹0.25'), findsOneWidget); // TDS, exact
    expect(find.text('Accept'), findsOneWidget);
    expect(find.textContaining('Declining is free'), findsOneWidget);
    // Today's totals.
    expect(find.text('Cash you hold'), findsOneWidget);
    expect(find.text('₹250'), findsWidgets);
  });

  testWidgets('on the daily fee, an offer says QuikFly takes no share', (t) async {
    final live = CaptainLive(state: CaptainState(duty: CaptainDuty.fromJson(_duty()), offer: _offer(model: 'dailyFee'), ride: null));
    await _pump(t, live);
    expect(find.text('None (daily fee)'), findsOneWidget);
  });

  testWidgets('at the pickup the captain enters the rider\'s PIN', (t) async {
    final ride = CaptainRide.fromJson({..._trip(payment: 'cash'), 'phase': 'arrived', 'riderName': 'Guest', 'riderPhone': '+91 6000000000', 'booked': true, 'collectCash': 250, 'pinTriesLeft': 4, 'pinLockedUntil': null});
    await _pump(t, CaptainLive(state: CaptainState(duty: CaptainDuty.fromJson(_duty()), offer: null, ride: ride)));
    expect(find.text('At the pickup'), findsOneWidget);
    expect(find.text("Rider's PIN"), findsOneWidget);
    expect(find.text('4 tries left.'), findsOneWidget);
    expect(find.text('Collect ₹250 in cash at the end.'), findsOneWidget);
    expect(find.byTooltip('Call the rider'), findsOneWidget);
  });

  testWidgets('a cash trip ends on a full screen "Collect ₹"', (t) async {
    await _pump(t, CaptainLive(state: CaptainState(duty: CaptainDuty.fromJson(_duty()), offer: null, ride: null), done: const CaptainDone('RD1', 19023, 250)));
    expect(find.text('Collect ₹250'), findsOneWidget);
    expect(find.text('Cash collected'), findsOneWidget);
  });

  // Phone, landscape phone, tablet; larger text; dark mode. Any overflow fails the test.
  for (final (size, scale, b) in [
    (const Size(390, 2000), 1.3, Brightness.light),
    (const Size(740, 1400), 1.0, Brightness.dark),
    (const Size(1366, 2000), 1.0, Brightness.dark),
  ]) {
    testWidgets('the offer, the ride and the cash screen fit ${size.width.round()} px at ${scale}x, ${b.name}', (t) async {
      final duty = CaptainDuty.fromJson(_duty());
      final ride = CaptainRide.fromJson({..._trip(payment: 'cash'), 'phase': 'arrived', 'riderName': 'Guest', 'riderPhone': '+91 6000000000', 'booked': true, 'collectCash': 250, 'pinTriesLeft': 4, 'pinLockedUntil': null});
      await _pump(t, CaptainLive(state: CaptainState(duty: duty, offer: _offer(payment: 'cash'), ride: null)), size: size, textScale: scale, brightness: b);
      expect(find.text('Accept'), findsOneWidget);
      await _pump(t, CaptainLive(state: CaptainState(duty: duty, offer: null, ride: ride)), size: size, textScale: scale, brightness: b);
      expect(find.text('Start the trip'), findsOneWidget);
      await _pump(t, CaptainLive(state: CaptainState(duty: duty, offer: null, ride: null), done: const CaptainDone('RD1', 19023, 250)), size: size, textScale: scale, brightness: b);
      expect(find.text('Cash collected'), findsOneWidget);
    });
  }

  test('a GPS fix is sent as lat/lng, a demo location as a map point', () {
    expect(const GpsFix(13.06, 80.24).toJson(), {'lat': 13.06, 'lng': 80.24});
    expect(const MapPoint(62, 30).toJson(), {'x': 62.0, 'y': 30.0});
  });

  CaptainLookup offlineWith({required bool demoLocation}) => CaptainLookup.fromJson({
        'captain': {
          ..._profile,
          'duty': _duty(online: false),
          'rules': {...(_profile['rules'] as Map<String, dynamic>), 'demoLocation': demoLocation},
        },
      });
  CaptainLive offline() => CaptainLive(state: CaptainState(duty: CaptainDuty.fromJson(_duty(online: false)), offer: null, ride: null));

  testWidgets('offline, a captain goes online with their phone\'s location', (t) async {
    await _pump(t, offline(), lookup: offlineWith(demoLocation: false));
    expect(find.text('Go online'), findsOneWidget);
    expect(find.textContaining("Uses your phone's location"), findsOneWidget);
    expect(find.text('Use a demo location instead'), findsNothing); // the owner turned demo locations off
  });

  testWidgets('before agreeing to the captains\' notice, a captain is asked to read it and can\'t go online', (t) async {
    final lookup = CaptainLookup.fromJson({
      'captain': {..._profile, 'duty': _duty(online: false), 'blocker': captainNoticeNeeded, 'notice': {'version': 'captain-2026-11-28', 'agreedAt': null}},
    });
    expect(lookup.captain!.noticeAgreed, isFalse);
    await _pump(t, offline(), lookup: lookup);
    expect(find.text('Before your first ride'), findsOneWidget);
    expect(find.text('Read and agree'), findsOneWidget);
    expect(find.text(captainNoticeNeeded), findsNothing); // the card says it; no second error box
    final goOnline = t.widget<GoldButton>(find.widgetWithText(GoldButton, 'Go online'));
    expect(goOnline.onPressed, isNull);
  });

  testWidgets('once agreed, the notice card is gone', (t) async {
    await _pump(t, offline(), lookup: offlineWith(demoLocation: false));
    expect(find.text('Before your first ride'), findsNothing);
  });

  testWidgets('the captains\' notice screen shows the text and "I agree"', (t) async {
    final notice = CaptainNotice({
      'version': 'captain-2026-11-28', 'updated': '2026-11-28', 'title': 'QuikFly Captain: your location and trips',
      'summary': ['We keep only your latest position.'],
      'sections': [{'title': 'Who sees it', 'points': ['The rider of your current ride.']}],
    });
    t.view.physicalSize = const Size(390, 2000) * 3;
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    await t.pumpWidget(ProviderScope(
      overrides: [
        sessionProvider.overrideWith(_Session.new),
        captainNoticeProvider.overrideWith((ref) async => notice),
        captainLookupProvider.overrideWith((ref) async => CaptainLookup.fromJson({
              'captain': {..._profile, 'notice': {'version': 'captain-2026-11-28', 'agreedAt': null}},
            })),
      ],
      child: MaterialApp(theme: buildTheme(Brightness.dark), home: const CaptainNoticeScreen()),
    ));
    await t.pump();
    await t.pump();
    expect(find.text('QuikFly Captain: your location and trips'), findsOneWidget);
    expect(find.text('We keep only your latest position.'), findsOneWidget);
    expect(find.text('Who sees it'), findsOneWidget);
    expect(find.text('I agree'), findsOneWidget);
    expect(find.text('Not now'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('while demo locations are allowed, a captain can pick one instead', (t) async {
    await _pump(t, offline(), lookup: offlineWith(demoLocation: true));
    await t.tap(find.text('Use a demo location instead'));
    await t.pump();
    expect(find.text('Go online here'), findsOneWidget);
    expect(find.text('Use my location instead'), findsOneWidget);
  });

  testWidgets('with self sign-up on, a number with no driver record can register its own vehicle', (t) async {
    await _pump(t, const CaptainLive(), lookup: CaptainLookup.fromJson({'captain': null, 'reason': "This number isn't registered as a QuikFly captain yet.", 'selfSignup': true}));
    expect(find.text('Register your own vehicle'), findsOneWidget);
  });

  testWidgets('a live partner who is not a captain yet adds themselves as the driver', (t) async {
    await _pump(t, const CaptainLive(),
        lookup: CaptainLookup.fromJson({'captain': null, 'reason': "This number isn't registered as a QuikFly captain yet.", 'selfSignup': true}),
        vendor: VendorApplication.fromJson({'id': 'VN1', 'status': 'active'}),
        fleet: VendorFleet.fromJson({'vehicles': [], 'drivers': []}));
    expect(find.text("You're a QuikFly partner"), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Add yourself as the driver'), findsOneWidget);
  });

  testWidgets('a number with no driver record is told what to do', (t) async {
    await _pump(t, const CaptainLive(), lookup: CaptainLookup.fromJson({'captain': null, 'reason': "This number isn't registered as a QuikFly captain yet."}));
    expect(find.text('Not set up as a captain yet'), findsOneWidget);
    expect(find.textContaining("isn't registered"), findsOneWidget);
    expect(find.text('Register your own vehicle'), findsNothing); // self sign-up is off
  });
}
