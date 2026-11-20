// Parses real API responses into the Dart models, so drift between
// packages/shared/src/types.ts and lib/api/models.dart shows up here.
// Needs a running API:  flutter test --dart-define=API_URL=http://127.0.0.1:8787/v1
// Without API_URL it runs against production and makes one test account (+91 9000000002).
import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:quikfly/api/api.dart';
import 'package:quikfly/api/models.dart';
import 'package:quikfly/api/rental_models.dart';
import 'package:quikfly/api/support_models.dart';
import 'package:quikfly/core/env.dart';
import 'package:quikfly/core/format.dart';

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
    // The API sends each protection plan's damage excess (pricing audit R2); the app's fallbacks are only for an older API.
    expect(config.settings.rentExcess('standard'), greaterThan(0));
    expect(config.settings.rentExcess('peace'), greaterThan(0));
  });

  test('user parses', () async {
    final u = await api.me();
    expect(u.phone, contains(phone));
    expect(u.profileComplete, isTrue);
    expect(u.referralCode, isNotEmpty);
  });

  test('privacy notice, consent and data export', () async {
    final n = await api.privacyNotice();
    expect(n.version, matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
    expect(n.summary, isNotEmpty);
    expect(n.sections.every((s) => s.title.isNotEmpty && s.points.isNotEmpty), isTrue);
    expect(n.contact.email, contains('@'));
    final u = await api.giveConsent(n.version);
    expect(u.privacyConsent, n.version);
    final data = await api.exportData();
    expect(data['noticeVersion'], n.version);
    expect(((data['data'] as Map)['account'] as List).single['phone'], contains(phone));
  });

  test('ride quote and booking by rideId', () async {
    final a = config.places[0], b = config.places[1];
    final quotes = await api.rideQuotes(ServiceKey.car, a.id, b.id);
    expect(quotes, isNotEmpty);
    expect(quotes.every((q) => q.surge >= 1 && q.surge <= config.settings.surgeCap), isTrue);
    // A ride booked ahead (India time, two days out) is quoted and parsed with its pickup time.
    final ahead = DateTime.now().toUtc().add(const Duration(days: 2, minutes: 330)).toIso8601String().substring(0, 16);
    expect(await api.rideQuotes(ServiceKey.car, a.id, b.id, scheduledFor: ahead), isNotEmpty);
    // Through a stop: the trip gets longer.
    final stop = (await api.places('')).firstWhere((p) => p.id != a.id && p.id != b.id);
    final via = await api.rideQuotes(ServiceKey.car, a.id, b.id, stopIds: [stop.id]);
    expect(via.first.durationMin, greaterThan(quotes.first.durationMin));
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
    // A package booked by start date; group tours (with departures) are booked by departure, checked below.
    final anyDate = tours.firstWhere((t) => t.departures.isEmpty, orElse: () => tours.first);
    final group = tours.where((t) => t.departures.any((d) => d.seatsLeft >= 1)).firstOrNull;
    if (group != null) {
      final dep = group.departures.firstWhere((d) => d.seatsLeft >= 1);
      expect(dep.seatsLeft <= dep.seats, isTrue);
      final dq = await api.quote({'service': 'tours', 'tourId': group.id, 'adults': 1, 'kids': 0, 'start': travel, 'departureId': dep.id});
      expect(dq.lines.first.amount, dep.price);
    }
    final q = await api.quote({'service': 'tours', 'tourId': anyDate.id, 'adults': 2, 'kids': 0, 'start': travel});
    expect(q.total, greaterThan(0));
    expect(q.lines, isNotEmpty);
    final tour = await api.tour(anyDate.slug);
    expect(tour.id, anyDate.id);
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
    // One-way outstation cab: billed as a single day.
    final oneWay = await api.quote({'service': 'rentals', 'vehicleId': vehicles.first.id, 'trip': 'oneway', 'destinationId': config.groupDestinations.first.id, 'days': 1, 'start': fmt(start).substring(0, 10)});
    expect(oneWay.lines.first.label, contains('one way'));
    final local = await api.quote({'service': 'rentals', 'vehicleId': vehicles.first.id, 'trip': 'local', 'days': 1, 'start': fmt(start).substring(0, 10)});
    expect(local.total, vehicles.first.localPackage);
    final u = await api.submitLicence('TN0920190001234', fmt(DateTime.now().add(const Duration(days: 400))).substring(0, 10));
    expect(u.licence.status, anyOf(LicenceStatus.pending, LicenceStatus.verified));
    expect(u.licence.number, 'TN0920190001234');
  });

  test('notification inbox parses and marks read', () async {
    final inbox = await api.notifications();
    expect(inbox.unread, greaterThanOrEqualTo(0));
    expect(await api.markNotificationsRead(), 0);
  });

  test('partner application parses (QuikFly Partner app)', () async {
    final before = await api.vendorApplication();
    final app = before ?? await api.startVendorApplication();
    expect(app.sections.keys, containsAll(vendorSections));
    if (app.editable) {
      final reg = 'TN${10 + Random().nextInt(89)}QF${1000 + Random().nextInt(8999)}';
      final now = DateTime.now();
      final saved = await api.saveVendorSection('vehicle', {
        'city': config.cities.first.name, 'type': 'tempo', 'fuel': 'petrol_diesel', 'regNumber': reg,
        'purchaseDate': '${now.year - 1}-01-15',
      });
      expect(saved.vehicle?.regNumber, reg);
      expect(saved.sections['vehicle']?.state, 'filled');
      expect(VendorRules.regNumber.hasMatch(reg), isTrue);
    }
  });

  test('partner fleet parses', () async {
    final app = await api.vendorApplication();
    final fleet = await api.vendorFleet();
    if (app?.vehicle != null) expect(fleet.vehicle(app!.vehicle!.id)?.regNumber, app.vehicle!.regNumber);
    expect(fleet.drivers, isA<List<VendorDriver>>());
  });

  test('partner trips, dashboard and money parse', () async {
    if (await api.vendorApplication() == null) await api.startVendorApplication();
    final now = DateTime.now();
    final to = '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    final trips = await api.vendorTrips('2026-01-01', to);
    expect(trips, isA<List<VendorTrip>>());
    final sum = await api.vendorSummary('2026-01-01', to);
    expect(sum.trips, greaterThanOrEqualTo(0));
    final money = await api.vendorMoney();
    expect(money.minPayout, greaterThan(0));
    expect(inrPaise(123456789), '₹12,34,567.89');
    expect(inrPaise(-5), '−₹0.05');
  });

  test('QuikFly Pass: buy, then surge-hour fares carry no surge', () async {
    final s = config.settings;
    expect(s.passPrice, greaterThanOrEqualTo(0));
    expect((await api.me()).passUntil == null || (await api.me()).passUntil!.isAfter(DateTime.now()), isTrue);
    // Production: parse only (don't spend the shared test account's wallet on every run).
    if (apiUrl.contains('workers.dev') || !s.passOnSale) return;
    final until = await api.buyPass();
    expect((await api.me()).passUntil, until);
    final peak = int.parse(RegExp(r'(\d{1,2})\s*-').firstMatch(s.surgeHours)!.group(1)!);
    final day = DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30, days: 2));
    final at = '${day.toIso8601String().substring(0, 10)}T${peak.toString().padLeft(2, '0')}:00';
    final quotes = await api.rideQuotes(ServiceKey.car, config.places[0].id, config.places[1].id, scheduledFor: at);
    expect(quotes.every((q) => q.surge == 1 && q.passSaving > 0), isTrue);
  });

  test('bus changes: seats, m-ticket, cancel a seat, change bus', () async {
    // Every booking parses the new fields (production: parse only).
    for (final b in await api.bookings()) {
      expect(b.seats.every((s) => s.id.isNotEmpty), isTrue);
      if (b.service == ServiceKey.bus && b.status == BookingStatus.confirmed) expect(b.ticketToken, isNotNull);
    }
    if (apiUrl.contains('workers.dev')) return;
    final date = isoDate(DateTime.now().add(const Duration(days: 45)));
    final buses = await api.buses('Chennai', 'Bengaluru', date);
    Future<List<Seat>> free(Bus bus, int n) async =>
        (await api.seats(bus.id, 'Chennai', 'Bengaluru', date)).where((s) => !s.booked && !s.ladies).take(n).toList();
    final three = await free(buses[4], 3);
    final q = await api.quote({'service': 'bus', 'busId': buses[4].id, 'from': 'Chennai', 'to': 'Bengaluru', 'date': date,
      'seatIds': [for (final s in three) s.id], 'genders': ['male', 'male', 'male']});
    final booked = await api.createBooking(service: ServiceKey.bus, title: 'Chennai → Bengaluru', subtitle: 'Contract bus', payment: PaymentMethod.upi, quoteId: q.id,
        lines: [('Date', date), ('Seats', three.map((s) => s.id).join(', ')), ('Traveller names', 'Arun A, Bala B, Chandra C')]);
    expect(booked.seats.length, 3);
    expect(booked.ticketToken, isNotNull);
    final cut = await api.cancelSeats(booked.id, [three[1].id]);
    expect(cut.seats.map((s) => s.id), [three[0].id, three[2].id]);
    expect(cut.line('Traveller names'), 'Arun A, Chandra C');
    final two = await free(buses[5], 2);
    final q2 = await api.quote({'service': 'bus', 'busId': buses[5].id, 'from': 'Chennai', 'to': 'Bengaluru', 'date': date,
      'seatIds': [for (final s in two) s.id], 'genders': ['male', 'male']});
    final moved = await api.reschedule(booked.id, q2.id, 'Contract bus 2', [('Date', date)]);
    expect(moved.booking.rescheduledAt, isNotNull);
    expect(moved.booking.seats.map((s) => s.id), [for (final s in two) s.id]);
    await api.cancelBooking(booked.id);
  });

  test('Safety Preferences and women-only rides', () async {
    final me = await api.me();
    expect(['off', 'night', 'always'].contains(me.autoShareRides), isTrue);
    // Production: parse only (don't change the shared test account's profile).
    if (apiUrl.contains('workers.dev')) return;
    final u = await api.updateProfile({'gender': 'female', 'autoShareRides': 'always', 'ridePin': '5937'});
    expect(u.autoShareRides, 'always');
    expect(u.ridePin, '5937');
    final quotes = await api.rideQuotes(ServiceKey.bike, config.places[0].id, config.places[1].id);
    final pink = quotes.where((q) => q.option.womenOnly).firstOrNull;
    expect(pink, isNotNull);
    final ride = await api.bookRide(pink!.option.id, config.places[0].id, config.places[1].id, PaymentMethod.upi);
    expect(ride.otp, '5937');
    await api.cancelRide(ride.id);
    final back = await api.updateProfile({'ridePin': null, 'autoShareRides': 'off'});
    expect(back.ridePin, isNull);
  });

  test('support tickets: open, reply, close (and a callback)', () async {
    final list = await api.tickets();
    expect(list.every((t) => supportTopics.containsKey(t.topic)), isTrue);
    expect(whatsappLink('90000 12345', 'Hi')?.toString(), 'https://wa.me/919000012345?text=Hi');
    // Production: parse only (no tickets in the real staff queue).
    if (apiUrl.contains('workers.dev')) return;
    final t = await api.openTicket('refund', 'App contract test: where is my refund?');
    expect(t.status, 'open');
    expect(t.messages.single.fromStaff, isFalse);
    final r = await api.replyTicket(t.id, 'Adding a little more detail.');
    expect(r.messages.length, 2);
    expect((await api.ticket(t.id)).messages.length, 2);
    expect((await api.closeTicket(t.id)).closed, isTrue);
    final cb = await api.requestCallback(name: 'App Contract Test', phone: phone, topic: 'holiday', preferredTime: 'evening', ref: 'Test holiday');
    expect(cb.isCallback, isTrue);
    expect(cb.preferredTime, 'evening');
    expect(cb.ref, 'Test holiday');
  });

  test('self-drive rental: checklist, extension, return', () async {
    final cars = await api.cars();
    String localIn(int minutes) => DateTime.now().toUtc().add(Duration(minutes: 330 + minutes)).toIso8601String().substring(0, 16);
    final q = await api.quote({'service': 'rent', 'carId': cars.first.id, 'mode': 'self', 'start': localIn(15), 'end': localIn(15 + 360), 'kmPlan': 'limited', 'protection': 'standard', 'doorstep': false});
    final b = await api.createBooking(service: ServiceKey.rent, title: 'App contract rental', subtitle: 'Lifecycle', payment: PaymentMethod.upi, lines: const [], quoteId: q.id);
    expect(b.rentalState, 'booked');
    final r = await api.rental(b.id);
    expect(r.state, 'booked');
    expect(r.photos['pickup'], isEmpty);
    // Production: parse only, then cancel (no returned cars in the real staff queue).
    if (apiUrl.contains('workers.dev')) {
      await api.cancelBooking(b.id);
      return;
    }
    final jpeg = [0xff, 0xd8, 0xff, 0xe0, ...List.filled(256, 7)];
    for (final side in rentalPhotoSides.keys) {
      await api.uploadRentalPhoto(b.id, 'pickup', side, jpeg);
    }
    final started = await api.startRental(b.id, 41000, 8);
    expect(started.state, 'on_trip');
    expect(started.pickup?.odometerKm, 41000);
    final ext = await api.extensionQuote(b.id, 2);
    expect(ext.total, greaterThan(0));
    final extended = await api.extendRental(b.id, 2);
    expect(extended.endsAt, ext.endsAt);
    expect(extended.extendedHours, 2);
    for (final side in rentalPhotoSides.keys) {
      await api.uploadRentalPhoto(b.id, 'return', side, jpeg);
    }
    final back = await api.endRental(b.id, 41150, 7);
    expect(back.state, 'returned');
    expect(back.dropoff?.fuel, 7);
  });

  test('credits summary parses', () async {
    final sum = await api.credits();
    expect(sum.balance, greaterThanOrEqualTo(0));
    expect(sum.nextExpiry == null, sum.balance == 0);
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
