// Parses real API responses into the Dart models, so drift between
// packages/shared/src/types.ts and lib/api/models.dart shows up here.
// Needs a running API:  flutter test --dart-define=API_URL=http://127.0.0.1:8787/v1
// Without API_URL it runs against production and makes one test account (+91 9000000002).
import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:quikfly/api/api.dart';
import 'package:quikfly/api/models.dart';
import 'package:quikfly/core/env.dart';

void main() {
  final api = QuikFlyApi(baseUrl: apiUrl);
  final phone = apiUrl.contains('workers.dev') ? '9000000002' : '9${(Random().nextInt(900000000) + 100000000)}';
  late AppConfig config;

  setUpAll(() async {
    config = await api.config();
    final r = await api.verifyOtp('+91 $phone', demoOtp);
    api.token = r.token;
    if (r.isNew) await api.updateProfile({'name': 'App Contract Test'});
  });

  test('config lists and settings parse', () {
    expect(config.places, isNotEmpty);
    expect(config.rideOptions, isNotEmpty);
    expect(config.offers.every((o) => o.code.isNotEmpty), isTrue);
    expect(config.settings.welcomeCredit, greaterThanOrEqualTo(0));
    expect(config.settings.gstRate(ServiceKey.rent), greaterThan(0));
  });

  test('user parses', () async {
    final u = await api.me();
    expect(u.phone, contains(phone));
    expect(u.profileComplete, isTrue);
    expect(u.referralCode, isNotEmpty);
  });

  test('ride quote and booking by rideId', () async {
    final a = config.places[0], b = config.places[1];
    final quotes = await api.rideQuotes(ServiceKey.car, a.id, b.id);
    expect(quotes, isNotEmpty);
    final ride = await api.bookRide(quotes.first.option.id, a.id, b.id, PaymentMethod.cash);
    expect(ride.otp, hasLength(4));
    final link = await api.shareRide(ride.id);
    expect(link.token, isNotEmpty);
    expect(link.expiresAt.isAfter(DateTime.now()), isTrue);
    final booking = await api.createBooking(
        service: ServiceKey.car, title: 'Contract test ride', subtitle: '${a.name} → ${b.name}', payment: PaymentMethod.cash, lines: const [], rideId: ride.id);
    expect(booking.amount, quotes.first.fare);
    final cancelled = await api.cancelBooking(booking.id);
    expect(cancelled.status, BookingStatus.cancelled);
  });

  test('catalog and quotes parse', () async {
    final tours = await api.tours();
    expect(tours, isNotEmpty);
    final q = await api.quote({'service': 'tours', 'tourId': tours.first.id, 'adults': 2, 'kids': 0});
    expect(q.total, greaterThan(0));
    expect(q.lines, isNotEmpty);
    expect((await api.cars()), isNotEmpty);
    expect((await api.travelVehicles()), isNotEmpty);
    final date = DateTime.now().add(const Duration(days: 2)).toIso8601String().substring(0, 10);
    final buses = await api.buses('Chennai', 'Bengaluru', date);
    expect(buses, isNotEmpty);
    final seats = await api.seats(buses.first.id, 'Chennai', 'Bengaluru', date);
    expect(seats.where((s) => !s.booked), isNotEmpty);
  });

  test('errors carry the API message', () async {
    await expectLater(api.verifyOtp('+91 $phone', '0000'), throwsA(isA<ApiException>().having((e) => e.message, 'message', isNotEmpty)));
  });

  test('wallet and saved lists parse', () async {
    expect(await api.wallet(), isA<List<WalletTransaction>>());
    expect(await api.savedPlaces(), isA<List<SavedPlace>>());
    expect(await api.travellers(), isA<List<Traveller>>());
    expect(await api.contacts(), isA<List<EmergencyContact>>());
    expect(await api.bookings(), isA<List<Booking>>());
  });
}
