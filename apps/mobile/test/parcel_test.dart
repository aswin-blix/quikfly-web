// Parcels in the app: the rules it copies, the form → checkout → booking path, My Trips, and the
// collection code staying on the sender's parcel screen only.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:quikfly/api/api.dart';
import 'package:quikfly/api/models.dart';
import 'package:quikfly/api/parcel_models.dart';
import 'package:quikfly/core/cancellation.dart';
import 'package:quikfly/core/contact_picker.dart';
import 'package:quikfly/core/credits.dart';
import 'package:quikfly/core/invoice.dart';
import 'package:quikfly/core/parcels.dart';
import 'package:quikfly/core/services.dart';
import 'package:quikfly/screens/account/notifications_screen.dart';
import 'package:quikfly/screens/checkout/checkout_screen.dart';
import 'package:quikfly/screens/parcel/parcel_detail_screen.dart';
import 'package:quikfly/screens/parcel/parcel_screen.dart';
import 'package:quikfly/screens/parcel/track_parcel_screen.dart';
import 'package:quikfly/screens/shell.dart';
import 'package:quikfly/screens/trips/trips_screen.dart';
import 'package:quikfly/state/catalog.dart';
import 'package:quikfly/state/checkout.dart';
import 'package:quikfly/state/providers.dart';
import 'package:quikfly/theme/theme.dart';
import 'package:quikfly/widgets/service_gate.dart';

const _code = '482913';
const _lr = 'QFP-MAA-CBE-ABCDEFGH';
const _terms = {'cancelPolicyParcel': '3h:100, 1h:50', 'gstParcel': 18, 'parcelLiabilityCap': 5000, 'parcelCounterHoldDays': 7};

Json _bookingJson({String state = 'booked', String status = 'confirmed', Duration startsIn = const Duration(days: 2)}) => {
      'id': 'QFP1',
      'service': 'parcel',
      'title': 'Chennai → Coimbatore',
      'subtitle': 'Bus parcel · up to 2 kg',
      'amount': 153,
      'status': status,
      'payment': 'wallet',
      'parcelState': state,
      'createdAt': DateTime.now().toUtc().subtract(const Duration(hours: 5)).toIso8601String(),
      'startsAt': DateTime.now().toUtc().add(startsIn).add(const Duration(seconds: 30)).toIso8601String(),
      'terms': _terms,
      'lines': [
        ['LR number', _lr],
        ['Liability', 'Up to ₹1,500, not insured'],
      ],
    };

Json _counter(String city) => {
      'id': 'pc1',
      'name': 'QuikFly Parcel, $city',
      'address': 'Main bus stand, $city (demo address)',
      'hours': '6 AM – 10 PM',
      'phone': '1800 123 4567',
    };

final _options = ParcelOptions.fromJson({
  'departures': [
    for (final day in [28, 29])
      {
        'busId': 'BUS1',
        'from': 'Chennai',
        'to': 'Coimbatore',
        'departAt': '2026-11-${day}T10:30:00.000Z',
        'cutoffAt': '2026-11-${day}T09:30:00.000Z',
        'readyAt': '2026-11-${day}T16:00:00.000Z',
        'fromCounter': _counter('Chennai'),
        'toCounter': _counter('Coimbatore'),
      },
  ],
  'declaration': {
    'version': '2026-11-22',
    'text': "I've described the contents truthfully and none of these items are inside.",
    'prohibited': ['Cash and currency', 'Maps with incorrect boundaries of India'],
  },
});

class _FakeApi extends QuikFlyApi {
  _FakeApi() : super(baseUrl: 'http://test.invalid/v1');

  String state = 'ready';
  final quoted = <Map<String, Object?>>[];
  Map<String, Object?>? booked;

  @override
  Future<ParcelOptions> parcelOptions(String from, String to) async => _options;

  @override
  Future<PriceQuote> quote(Map<String, Object?> request) async {
    quoted.add(request);
    return PriceQuote.fromJson({
      'id': 'QT${quoted.length}',
      'service': 'parcel',
      'lines': [
        {'label': 'Bus parcel, up to 2 kg', 'amount': 120},
        {'label': 'Handling', 'amount': 10},
        {'label': 'GST (18%)', 'amount': 23},
      ],
      'total': 153,
      'expiresAt': DateTime.now().add(const Duration(minutes: 30)).toIso8601String(),
      'parcel': {'liability': 1500},
    });
  }

  @override
  Future<Booking> createBooking({
    required ServiceKey service,
    required String title,
    required String subtitle,
    required PaymentMethod payment,
    required List<(String, String)> lines,
    String? quoteId,
    String? rideId,
    String? couponCode,
    String? tripOf,
    bool useCredits = false,
    ({String name, String phone})? receiver,
    String? contents,
    String? declaration,
  }) async {
    booked = {'service': service, 'lines': lines, 'quoteId': quoteId, 'receiver': receiver, 'contents': contents, 'declaration': declaration};
    return Booking.fromJson(_bookingJson());
  }

  @override
  Future<List<Traveller>> travellers() async => const [];

  @override
  Future<List<Booking>> bookings() async => const [];

  @override
  Future<Parcel> parcel(String bookingId) async => Parcel.fromJson({
        'bookingId': bookingId,
        'lr': _lr,
        'state': state,
        'from': 'Chennai',
        'to': 'Coimbatore',
        'departAt': '2026-11-28T10:30:00.000Z',
        'readyAt': '2026-11-28T16:00:00.000Z',
        'holdUntil': '2026-12-05T16:00:00.000Z',
        'fromCounter': _counter('Chennai'),
        'toCounter': _counter('Coimbatore'),
        'contents': 'Two cotton shirts',
        'receiver': {'name': 'Ravi Receiver', 'phone': '+91 9000012345'},
        'liability': 1500,
        'events': [
          {'state': 'booked', 'at': '2026-11-27T05:00:00.000Z', 'note': null},
          {'state': state, 'at': '2026-11-28T16:00:00.000Z', 'note': 'On the shelf by the door'},
        ],
        'collectOtp': state == 'ready' ? _code : null,
        'simulated': true,
      });

  @override
  Future<ParcelTracking> trackParcel(String lr) async => ParcelTracking.fromJson({
        'lr': lr,
        'state': state,
        'from': 'Chennai',
        'to': 'Coimbatore',
        'sender': 'Priya',
        'receiver': 'Ravi',
        'holdUntil': '2026-12-05T16:00:00.000Z',
        'collectAt': _counter('Coimbatore'),
        'events': [
          {'state': state, 'at': '2026-11-28T16:00:00.000Z'},
        ],
        'simulated': true,
      });
}

class _Session extends SessionNotifier {
  _Session(this.user);
  final User? user;
  @override
  Future<User?> build() async => user;
  @override
  Future<void> refresh() async {}
}

final _user = User.fromJson({
  'id': 'U1',
  'name': 'Priya Sender',
  'phone': '+91 9000000001',
  'walletBalance': 500,
  'profileComplete': true,
  'referralCode': 'QF1',
  'referred': false,
  'licence': null,
  'autoShareNightRides': false,
});

AppConfig _config({bool parcels = true}) => AppConfig.fromJson({
      'settings': {'serviceParcel': parcels, 'parcelMaxDeclaredValue': 10000},
      'cities': [
        {'id': 'c1', 'name': 'Chennai'},
        {'id': 'c2', 'name': 'Coimbatore'},
      ],
    });

/// A phone [size] with the screen under test at '/'.
Future<_FakeApi> _pump(
  WidgetTester t,
  Widget home, {
  Size size = const Size(390, 844),
  double textScale = 1,
  Brightness brightness = Brightness.light,
  List<Booking> bookings = const [],
  bool parcels = true,
  bool configLoads = true,
  bool signedIn = true,
  String state = 'ready',
}) async {
  t.view.physicalSize = size;
  t.view.devicePixelRatio = 1;
  t.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(t.view.reset);
  addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
  final api = _FakeApi()..state = state;
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, _) => home),
      GoRoute(path: '/checkout', builder: (_, _) => const CheckoutScreen()),
    ],
    errorBuilder: (_, s) => Scaffold(body: Text('NAVIGATED ${s.uri}')),
  );
  await t.pumpWidget(ProviderScope(
    overrides: [
      apiProvider.overrideWithValue(api),
      sessionProvider.overrideWith(() => _Session(signedIn ? _user : null)),
      userProvider.overrideWithValue(signedIn ? _user : null),
      configProvider.overrideWith((ref) => configLoads ? Future.value(_config(parcels: parcels)) : Future.delayed(const Duration(days: 1), _config)),
      bookingsProvider.overrideWith((ref) async => bookings),
    ],
    child: MaterialApp.router(theme: buildTheme(brightness), routerConfig: router),
  ));
  for (var i = 0; i < 6; i++) {
    await t.pump(const Duration(milliseconds: 200));
  }
  return api;
}

/// Takes the screen down, so its polling timer isn't left running.
Future<void> _close(WidgetTester t) => t.pumpWidget(const SizedBox());

Future<void> _tap(WidgetTester t, Finder f) async {
  await t.ensureVisible(f);
  await t.pump(const Duration(milliseconds: 350));
  await t.tap(f);
  await t.pump(const Duration(milliseconds: 500));
}

void main() {
  group('copies of the shared rules', () {
    String shared(String file) => File('../../packages/shared/src/$file').readAsStringSync();
    List<String> quoted(String source, String name) =>
        [for (final m in RegExp('"([^"]+)"').allMatches(RegExp('$name[^=]*= *\\[([^\\]]*)\\]').firstMatch(source)!.group(1)!)) m.group(1)!];

    test('match packages/shared/src/parcel.ts', () {
      final ts = shared('parcel.ts');
      expect(parcelJourney, quoted(ts, 'PARCEL_JOURNEY'));
      expect(parcelCancellable, quoted(ts, 'PARCEL_CANCELLABLE').toSet());
      expect(parcelStateLabels.keys, quoted(ts, 'PARCEL_STATES'));
      for (final e in parcelStateLabels.entries) {
        expect(ts, contains('${e.key}: "${e.value}"'));
      }
      expect(parcelCategories.keys, quoted(ts, 'PARCEL_CATEGORIES'));
      expect(parcelWeightBands, quoted(ts, 'PARCEL_WEIGHT_BANDS'));
      expect(parcelSizes.keys, quoted(ts, 'PARCEL_SIZES'));
      expect(ts, contains('export const PARCEL_LR_LINE = "$parcelLrLine"'));
      expect(ts, contains('contentsMin: ${ParcelRules.contentsMin},'));
      expect(ts, contains('contentsMax: ${ParcelRules.contentsMax},'));
      expect(ts, contains('bookingDays: ${ParcelRules.bookingDays},'));
      expect(ts, contains('collectOtpDigits: ${ParcelRules.collectOtpDigits},'));
    });

    test('declare the same services as packages/shared/src/clients.ts', () {
      expect(ServiceKey.declared.map((s) => s.name), quoted(shared('clients.ts'), 'DECLARED_SERVICES'));
      expect(ServiceKey.clientAccept, 'application/json; services=parcel');
    });

    test('every service the app knows has its meta and settings', () {
      for (final s in ServiceKey.values) {
        expect(File(serviceOf(s).image).existsSync(), isTrue, reason: s.name);
        const Settings({})
          ..gstRate(s)
          ..creditPercent(s)
          ..cancelPolicy(s);
      }
      expect(ServiceKey.known('parcel'), isTrue);
      expect(ServiceKey.known('teleport'), isFalse);
    });

    test('the fallbacks match the settings defaults', () {
      final ts = shared('settings.ts');
      const s = Settings({});
      expect(ts, contains('gstParcel: ${s.gstRate(ServiceKey.parcel)},'));
      expect(ts, contains('creditsParcel: ${s.creditPercent(ServiceKey.parcel)},'));
      expect(ts, contains('cancelPolicyParcel: "${s.cancelPolicy(ServiceKey.parcel)}",'));
      expect(ts, contains('parcelMaxKg: ${s.parcelMaxKg},'));
      expect(ts, contains('parcelMaxDeclaredValue: ${s.parcelMaxDeclaredValue},'));
      expect(ts, contains('parcelCounterHoldDays: ${s.parcelCounterHoldDays},'));
    });
  });

  group('money', () {
    const s = Settings({'gstRides': 5});

    test('the refund shown is the parcel policy, where 0.1.16 showed a cab one', () {
      for (final (minutes, refund) in [(300, 153), (120, 77), (30, 0)]) {
        final b = Booking.fromJson(_bookingJson(startsIn: Duration(minutes: minutes)));
        expect(refundPreview(s, b).$2, refund, reason: '$minutes minutes before departure');
      }
    });

    test('the invoice uses the parcel GST the booking was sold with', () {
      final inv = invoiceFor(Booking.fromJson(_bookingJson()), s);
      expect(inv.rate, 18);
      expect(inv.taxable, 129.66);
    });

    test('credits and the policy text', () {
      expect(creditsEarned(s, ServiceKey.parcel, 153), 3);
      expect(cancelPolicyText(s, ServiceKey.parcel), contains('departure'));
    });

    test('parcels are off until the API says on', () {
      expect(const Settings({}).serviceOn(ServiceKey.parcel), isFalse);
      expect(openServices(const Settings({})).map((x) => x.key), isNot(contains(ServiceKey.parcel)));
      expect(openServices(const Settings({'serviceParcel': true})).map((x) => x.key), contains(ServiceKey.parcel));
    });
  });

  group('helpers', () {
    test('times are India time', () {
      expect(parcelTime(DateTime.utc(2026, 11, 28, 10, 30)), '28 Nov, 4:00 pm');
      expect(parcelTime(DateTime.utc(2026, 11, 28, 19)), '29 Nov, 12:30 am');
      expect(parcelTime(DateTime.utc(2026, 11, 28, 10, 30).toLocal()), '28 Nov, 4:00 pm');
    });

    test('a number is never shifted along', () {
      expect(mobileDigits('98765432100'), '9876543210');
      expect(mobileDigits('+91 98765 43210'), '9876543210');
      expect(mobileDigits('098765 43210'), '9876543210');
      expect(mobileDigits('9187654321'), '9187654321');
    });

    test('shared text has the link and nothing private', () {
      final text = parcelShareText(_lr, 'Chennai', 'Coimbatore');
      expect(text, contains('/parcels/track?lr=$_lr'));
      expect(text, isNot(contains(_code)));
    });
  });

  group('contact picker', () {
    TestWidgetsFlutterBinding.ensureInitialized();
    final messenger = TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    tearDown(() => messenger.setMockMethodCallHandler(contactPickerChannel, null));

    test('a mobile comes back as 10 digits', () async {
      messenger.setMockMethodCallHandler(contactPickerChannel, (_) async => {'name': 'Ravi Receiver', 'phone': '+91 90000 12345'});
      expect(await pickContact(), (name: 'Ravi Receiver', phone: '9000012345'));
    });

    test('a landline is not used', () async {
      messenger.setMockMethodCallHandler(contactPickerChannel, (_) async => {'name': 'Office', 'phone': '044 2345 6789'});
      expect((await pickContact())?.phone, isNull);
    });

    test('closed, or no picker on the phone', () async {
      messenger.setMockMethodCallHandler(contactPickerChannel, (_) async => null);
      expect(await pickContact(), isNull);
      messenger.setMockMethodCallHandler(contactPickerChannel, (_) async => throw PlatformException(code: 'unavailable'));
      expect(await pickContact(), isNull);
    });
  });

  group('screens', () {
    testWidgets('form → checkout → booking sends the receiver outside the lines', (t) async {
      final api = await _pump(t, const ParcelScreen());
      expect(find.text('28 Nov, 4:00 pm'), findsOneWidget);

      await _tap(t, find.text('Continue'));
      for (final m in ["Enter the receiver's name.", "Say what's inside, in a few words.", 'Read the list and tick the declaration.']) {
        expect(find.text(m), findsOneWidget);
      }
      expect(api.quoted, isEmpty);

      await t.enterText(find.widgetWithText(TextField, "What it's worth (₹)"), '1500');
      await t.enterText(find.widgetWithText(TextField, "What's inside"), 'Two cotton shirts');
      await t.enterText(find.widgetWithText(TextField, "Receiver's name"), 'Ravi Receiver');
      await t.enterText(find.widgetWithText(TextField, "Receiver's mobile"), '+91 90000 12345');
      await t.pump(const Duration(milliseconds: 600));
      expect(find.text('₹153'), findsOneWidget);
      await _tap(t, find.byType(CheckboxListTile));
      await _tap(t, find.text('Continue'));
      for (var i = 0; i < 5; i++) {
        await t.pump(const Duration(milliseconds: 300));
      }

      final request = api.quoted.last;
      expect(request['departAt'], '2026-11-28T10:30:00.000Z');
      expect(request['declaredValue'], 1500);
      expect([request['pickup'], request['delivery']], ['counter', 'counter']);
      expect(find.text('1. Parcel details'), findsOneWidget);
      expect(find.text('Traveller details'), findsNothing);

      await t.scrollUntilVisible(find.text('Continue to payment'), 300, scrollable: find.byType(Scrollable).first);
      await _tap(t, find.text('Continue to payment'));
      await t.scrollUntilVisible(find.textContaining('Pay ₹'), 300, scrollable: find.byType(Scrollable).first);
      await _tap(t, find.textContaining('Pay ₹'));
      await t.pump(const Duration(seconds: 2));
      await t.pump(const Duration(seconds: 1));

      final sent = api.booked!;
      expect(sent['service'], ServiceKey.parcel);
      expect(sent['receiver'], (name: 'Ravi Receiver', phone: '9000012345'));
      expect(sent['contents'], 'Two cotton shirts');
      expect(sent['declaration'], '2026-11-22');
      expect(sent['lines'], isEmpty, reason: 'no receiver, contents or summary in booking lines');
      await _close(t);
    });

    testWidgets('My Trips: ready offers the code screen and no cancel', (t) async {
      await _pump(t, const TripsScreen(), bookings: [Booking.fromJson(_bookingJson(state: 'ready', status: 'ongoing'))]);
      expect(find.text('Ready for collection'), findsOneWidget);
      await _tap(t, find.text('Chennai → Coimbatore'));
      expect(find.text('Show collection code'), findsOneWidget);
      expect(find.text('Cancel'), findsNothing);
      expect(find.text(_code), findsNothing);
      expect(find.text('Start ride'), findsNothing);
      await _close(t);
    });

    testWidgets('My Trips: at the counter can cancel, on the parcel refund', (t) async {
      await _pump(t, const TripsScreen(),
          bookings: [Booking.fromJson(_bookingJson(state: 'at_counter', status: 'ongoing', startsIn: const Duration(hours: 2)))]);
      await _tap(t, find.text('Chennai → Coimbatore'));
      await _tap(t, find.text('Cancel'));
      expect(find.textContaining('₹77 (50%)'), findsOneWidget);
      await _close(t);
    });

    testWidgets('the sender sees the code', (t) async {
      await _pump(t, const ParcelDetailScreen(id: 'QFP1'));
      expect(find.text(_code), findsOneWidget);
      await _close(t);
    });

    testWidgets('no code once collected', (t) async {
      await _pump(t, const ParcelDetailScreen(id: 'QFP1'), state: 'collected');
      expect(find.text(_code), findsNothing);
      expect(find.text('COLLECTION CODE'), findsNothing);
      await _close(t);
    });

    testWidgets('signed out, the parcel screen shows nothing of it', (t) async {
      await _pump(t, const ParcelDetailScreen(id: 'QFP1'), signedIn: false);
      expect(find.text(_code), findsNothing);
      expect(find.text('Sign in to see your parcel'), findsOneWidget);
      await _close(t);
    });

    testWidgets('tracking shows first names and no code', (t) async {
      await _pump(t, const TrackParcelScreen(lr: _lr), signedIn: false);
      expect(find.text('Ready for collection'), findsWidgets);
      expect(find.text('Ravi'), findsOneWidget);
      expect(find.text(_code), findsNothing);
      await _close(t);
    });

    testWidgets('switched off: paused, no form', (t) async {
      await _pump(t, const ServiceGate(service: ServiceKey.parcel, child: ParcelScreen()), parcels: false);
      expect(find.text('Send a Parcel is paused'), findsOneWidget);
      expect(find.text('Route and bus'), findsNothing);
      await _close(t);
    });

    testWidgets('settings not loaded yet: neither the form nor "paused"', (t) async {
      await _pump(t, const ServiceGate(service: ServiceKey.parcel, child: ParcelScreen()), configLoads: false);
      expect(find.text('Route and bus'), findsNothing);
      expect(find.textContaining('is paused'), findsNothing);
      await _close(t);
      await t.pump(const Duration(days: 1));
    });

    testWidgets('a parcel notification opens that parcel', (t) async {
      t.view.physicalSize = const Size(390, 844);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      final router = GoRouter(
        routes: [GoRoute(path: '/', builder: (_, _) => const NotificationsScreen())],
        errorBuilder: (_, s) => Text('NAVIGATED ${s.uri}'),
      );
      await t.pumpWidget(ProviderScope(
        overrides: [
          notificationsProvider.overrideWith((ref) async => (
                items: [AppNotification('N1', 'parcel.ready', 'Ready', 'Open the parcel', 'QFP1', DateTime(2026, 11, 28), DateTime(2026, 11, 28))],
                unread: 0,
              )),
        ],
        child: MaterialApp.router(theme: buildTheme(Brightness.light), routerConfig: router),
      ));
      await t.pumpAndSettle();
      await t.tap(find.text('Ready'));
      await t.pumpAndSettle();
      expect(find.text('NAVIGATED /parcel/QFP1'), findsOneWidget);
    });

    testWidgets('signing out drops a parcel draft', (t) async {
      t.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'), (_) async => null);
      final box = ProviderContainer(overrides: [apiProvider.overrideWithValue(_SignOutApi()), sessionProvider.overrideWith(() => _Session(_user))]);
      addTearDown(box.dispose);
      await box.read(sessionProvider.future);
      box.read(checkoutProvider.notifier).set(CheckoutDraft(
            service: ServiceKey.parcel,
            title: 't',
            subtitle: 's',
            summary: const [],
            quote: await _FakeApi().quote(const {}),
            travellers: const [],
            policy: '',
            parcel: const ParcelDraft(receiverName: 'Ravi', receiverPhone: '9000012345', contents: 'Shirts', declaration: 'v', declaredValue: 1),
          ));
      await box.read(sessionProvider.notifier).signOut();
      expect(box.read(checkoutProvider), isNull);
    });

    // Flutter fails a test on any overflow, so drawing each screen is the check.
    for (final (size, scale, brightness) in [
      (const Size(320, 640), 1.0, Brightness.light),
      (const Size(390, 844), 1.3, Brightness.dark),
      (const Size(820, 1180), 1.0, Brightness.light),
      (const Size(1366, 900), 1.0, Brightness.dark),
      (const Size(740, 360), 1.0, Brightness.light),
    ]) {
      final at = '${size.width.toInt()}x${size.height.toInt()} text x$scale ${brightness.name}';
      testWidgets('form fits $at', (t) async {
        await _pump(t, const ParcelScreen(), size: size, textScale: scale, brightness: brightness);
        await t.ensureVisible(find.text('Continue'));
        await t.pump();
        await _close(t);
      });
      testWidgets('parcel and tracking fit $at', (t) async {
        await _pump(t, const ParcelDetailScreen(id: 'QFP1'), size: size, textScale: scale, brightness: brightness);
        await _close(t);
        await _pump(t, const TrackParcelScreen(lr: _lr), size: size, textScale: scale, brightness: brightness);
        await _close(t);
      });
      testWidgets('seven services fit the sheet $at', (t) async {
        await _pump(
          t,
          Scaffold(body: Builder(builder: (context) => TextButton(onPressed: () => showServicesSheet(context), child: const Text('Open')))),
          size: size,
          textScale: scale,
          brightness: brightness,
        );
        // The sheet reads the settings once, so let them load first.
        final box = ProviderScope.containerOf(t.element(find.text('Open')));
        await box.read(configProvider.future);
        await t.tap(find.text('Open'));
        await t.pumpAndSettle();
        expect(find.text('Send a Parcel', skipOffstage: false), findsOneWidget);
        await _close(t);
      });
    }
  });
}

class _SignOutApi extends _FakeApi {
  @override
  Future<void> logout() async {}
}
