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
    expect(quotes.every((q) => q.surge >= 1 && q.surge <= config.settings.surgeCap), isTrue);
    // A ride booked ahead (India time, two days out) is quoted and parsed with its pickup time.
    final ahead = DateTime.now().toUtc().add(const Duration(days: 2, minutes: 330)).toIso8601String().substring(0, 16);
    expect(await api.rideQuotes(ServiceKey.car, a.id, b.id, scheduledFor: ahead), isNotEmpty);
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
    final travel = DateTime.now().add(const Duration(days: 30)).toIso8601String().substring(0, 10);
    final q = await api.quote({'service': 'tours', 'tourId': tours.first.id, 'adults': 2, 'kids': 0, 'start': travel});
    expect(q.total, greaterThan(0));
    expect(q.lines, isNotEmpty);
    final tour = await api.tour(tours.first.slug);
    expect(tour.id, tours.first.id);
    // A coupon is checked against the quote, then the booking is charged the quote (minus the coupon).
    final code = config.offers.where((o) => o.service == 'tours' || o.service == 'all').firstOrNull?.code;
    var expected = q.total;
    if (code != null) {
      final check = await api.checkCoupon(code, quoteId: q.id);
      expect(check.total, lessThanOrEqualTo(q.total));
      expected = check.total;
    }
    final booking = await api.createBooking(
        service: ServiceKey.tours, title: 'Contract test tour', subtitle: tour.location, payment: PaymentMethod.upi, lines: const [], quoteId: q.id, couponCode: code);
    expect(booking.amount, expected);
    expect((await api.booking(booking.id)).id, booking.id);
    expect(booking.startsAt, isNotNull);
    final cancelled = await api.cancelBooking(booking.id);
    expect(cancelled.refundAmount, isNotNull);
    expect((await api.cars()), isNotEmpty);
    expect((await api.travelVehicles()), isNotEmpty);
    final date = DateTime.now().add(const Duration(days: 2)).toIso8601String().substring(0, 10);
    final buses = await api.buses('Chennai', 'Bengaluru', date);
    expect(buses, isNotEmpty);
    final seats = await api.seats(buses.first.id, 'Chennai', 'Bengaluru', date);
    expect(seats.where((s) => !s.booked), isNotEmpty);
    // Booked seats say who holds them; women-only seats sit next to a woman.
    expect(seats.where((s) => s.booked).every((s) => s.bookedGender != null), isTrue);
  });

  test('rental quotes and licence', () async {
    final cars = await api.cars();
    final start = DateTime.now().add(const Duration(days: 3));
    String fmt(DateTime d) => d.toIso8601String().substring(0, 16);
    final rent = await api.quote({
      'service': 'rent', 'carId': cars.first.id, 'mode': 'self', 'start': fmt(start), 'end': fmt(start.add(const Duration(hours: 26))),
      'kmPlan': 'limited', 'protection': 'standard', 'doorstep': false,
    });
    expect(rent.service, ServiceKey.rent);
    expect(rent.lines.length, greaterThanOrEqualTo(2));
    // A chauffeur booking across a night carries the night charge line (when the setting is on).
    final chauffeur = await api.quote({
      'service': 'rent', 'carId': cars.first.id, 'mode': 'driver', 'start': fmt(start), 'end': fmt(start.add(const Duration(hours: 26))),
      'kmPlan': 'limited', 'protection': 'standard', 'doorstep': false,
    });
    if (config.settings.rentDriverNightCharge > 0) expect(chauffeur.lines.any((l) => l.label.startsWith('Driver night charge')), isTrue);
    final vehicles = await api.travelVehicles();
    final group = await api.quote({'service': 'rentals', 'vehicleId': vehicles.first.id, 'trip': 'outstation', 'destinationId': config.groupDestinations.first.id, 'days': 2, 'start': fmt(start).substring(0, 10)});
    expect(group.total, greaterThan(0));
    final local = await api.quote({'service': 'rentals', 'vehicleId': vehicles.first.id, 'trip': 'local', 'days': 1, 'start': fmt(start).substring(0, 10)});
    expect(local.total, vehicles.first.localPackage);
    final u = await api.submitLicence('TN0920190001234', fmt(DateTime.now().add(const Duration(days: 400))).substring(0, 10));
    expect(u.licence.status, anyOf(LicenceStatus.pending, LicenceStatus.verified));
    expect(u.licence.number, 'TN0920190001234');
  });

  test('errors carry the API message', () async {
    await expectLater(api.verifyOtp('+91 $phone', '0000'), throwsA(isA<ApiException>().having((e) => e.message, 'message', isNotEmpty)));
  });

  test('account sections write and read back', () async {
    final u = await api.updateProfile({'email': 'contract@example.com', 'gender': 'female', 'dob': '1995-06-15', 'gst': {'gstin': '33ABCDE1234F1Z5', 'name': 'Contract Co'}});
    expect(u.email, 'contract@example.com');
    expect(u.gender, Gender.female);
    expect(u.gst?.gstin, '33ABCDE1234F1Z5');
    final places = await api.savePlace('home', config.places.first.id);
    final home = places.firstWhere((p) => p.kind == 'home');
    expect(home.place.id, config.places.first.id);
    expect((await api.removePlace(home.id)).any((p) => p.id == home.id), isFalse);
    final ts = await api.addTraveller('Contract Kid', 9, Gender.other);
    final kid = ts.firstWhere((t) => t.name == 'Contract Kid');
    expect(kid.age, 9);
    await api.removeTraveller(kid.id);
    final cs = await api.contacts();
    if (cs.length < Rules.emergencyContacts) {
      final added = await api.addContact('Contract Contact', '9876543210', relation: 'Friend');
      final x = added.firstWhere((c) => c.name == 'Contract Contact');
      expect(x.relation, 'Friend');
      await api.removeContact(x.id);
    }
    await api.updateProfile({'gst': null});
  });

  test('wallet and saved lists parse', () async {
    expect(await api.wallet(), isA<List<WalletTransaction>>());
    expect(await api.savedPlaces(), isA<List<SavedPlace>>());
    expect(await api.travellers(), isA<List<Traveller>>());
    expect(await api.contacts(), isA<List<EmergencyContact>>());
    expect(await api.bookings(), isA<List<Booking>>());
  });
}
