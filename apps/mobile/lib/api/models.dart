// Dart copies of the API's shapes. The source of truth is packages/shared/src/types.ts
// (and settings.ts): when a type changes there, change it here in the same PR.
// Only fields the app reads are parsed; unknown fields are ignored.

typedef Json = Map<String, dynamic>;

List<T> _list<T>(Object? v, T Function(Json) f) => ((v as List?) ?? const []).map((e) => f(e as Json)).toList();
List<String> _strings(Object? v) => ((v as List?) ?? const []).map((e) => '$e').toList();
int _int(Object? v) => (v as num?)?.round() ?? 0;
double _num(Object? v) => (v as num?)?.toDouble() ?? 0;

/// Service keys, as the API spells them.
enum ServiceKey {
  bike,
  car,
  bus,
  tours,
  rent,
  rentals;

  static ServiceKey parse(String s) => ServiceKey.values.firstWhere((k) => k.name == s, orElse: () => ServiceKey.car);
}

enum PaymentMethod { upi, card, netbanking, wallet, cash }

enum BookingStatus {
  confirmed,
  ongoing,
  completed,
  cancelled;

  static BookingStatus parse(String s) => BookingStatus.values.firstWhere((k) => k.name == s, orElse: () => BookingStatus.confirmed);
  bool get active => this == confirmed || this == ongoing;
}

enum LicenceStatus { none, pending, verified, rejected }

enum Gender { female, male, other }

class Licence {
  const Licence({required this.status, this.number, this.expiry, this.note});
  final LicenceStatus status;
  final String? number;
  final String? expiry;
  final String? note;
  factory Licence.fromJson(Json? j) => Licence(
        status: LicenceStatus.values.firstWhere((s) => s.name == j?['status'], orElse: () => LicenceStatus.none),
        number: j?['number'] as String?,
        expiry: j?['expiry'] as String?,
        note: j?['note'] as String?,
      );
}

class GstDetails {
  const GstDetails(this.gstin, this.name);
  final String gstin;
  final String name;
  Json toJson() => {'gstin': gstin, 'name': name};
}

class User {
  const User({
    required this.id,
    required this.name,
    required this.phone,
    required this.walletBalance,
    this.email,
    this.gender,
    this.dob,
    required this.profileComplete,
    required this.referralCode,
    required this.referred,
    required this.licence,
    this.gst,
    required this.autoShareNightRides,
  });
  final String id, name, phone, referralCode;
  final int walletBalance;
  final String? email, dob;
  final Gender? gender;
  final bool profileComplete, referred, autoShareNightRides;
  final Licence licence;
  final GstDetails? gst;

  String get firstName => name.trim().isEmpty ? 'there' : name.trim().split(' ').first;

  factory User.fromJson(Json j) => User(
        id: j['id'] as String,
        name: (j['name'] as String?) ?? '',
        phone: (j['phone'] as String?) ?? '',
        walletBalance: _int(j['walletBalance']),
        email: j['email'] as String?,
        gender: Gender.values.where((g) => g.name == j['gender']).firstOrNull,
        dob: j['dob'] as String?,
        profileComplete: j['profileComplete'] == true,
        referralCode: (j['referralCode'] as String?) ?? '',
        referred: j['referred'] == true,
        licence: Licence.fromJson(j['licence'] as Json?),
        gst: j['gst'] == null ? null : GstDetails('${(j['gst'] as Json)['gstin']}', '${(j['gst'] as Json)['name']}'),
        autoShareNightRides: j['autoShareNightRides'] == true,
      );
}

class AuthResult {
  const AuthResult(this.token, this.user, this.isNew, this.restored);
  final String token;
  final User user;
  final bool isNew, restored;
  factory AuthResult.fromJson(Json j) =>
      AuthResult(j['token'] as String, User.fromJson(j['user'] as Json), j['isNew'] == true, j['restored'] == true);
}

class Place {
  const Place({required this.id, required this.name, required this.area, required this.x, required this.y});
  final String id, name, area;
  /// Position on the demo map (0–100).
  final double x, y;
  factory Place.fromJson(Json j) =>
      Place(id: j['id'] as String, name: '${j['name']}', area: '${j['area'] ?? ''}', x: _num(j['x']), y: _num(j['y']));
}

class SavedPlace {
  const SavedPlace(this.id, this.kind, this.label, this.place);
  final String id, kind, label;
  final Place place;
  factory SavedPlace.fromJson(Json j) => SavedPlace(j['id'] as String, '${j['kind']}', '${j['label']}', Place.fromJson(j['place'] as Json));
}

class Traveller {
  const Traveller(this.id, this.name, this.age, this.gender);
  final String id, name;
  final int age;
  final Gender gender;
  factory Traveller.fromJson(Json j) => Traveller(
      j['id'] as String, '${j['name']}', _int(j['age']), Gender.values.firstWhere((g) => g.name == j['gender'], orElse: () => Gender.other));
}

class EmergencyContact {
  const EmergencyContact(this.id, this.name, this.phone, this.relation);
  final String id, name, phone;
  final String? relation;
  factory EmergencyContact.fromJson(Json j) => EmergencyContact(j['id'] as String, '${j['name']}', '${j['phone']}', j['relation'] as String?);
}

class WalletTransaction {
  const WalletTransaction(this.id, this.kind, this.amount, this.note, this.bookingId, this.createdAt);
  final String id, kind, note;
  final int amount;
  final String? bookingId;
  final DateTime createdAt;
  factory WalletTransaction.fromJson(Json j) => WalletTransaction(j['id'] as String, '${j['kind']}', _int(j['amount']), '${j['note'] ?? ''}',
      j['bookingId'] as String?, DateTime.tryParse('${j['createdAt']}')?.toLocal() ?? DateTime.now());
}

class RideOption {
  const RideOption(this.id, this.service, this.name, this.description, this.seats, this.models);
  final String id, name, description;
  final ServiceKey service;
  final int seats;
  final List<String> models;
  factory RideOption.fromJson(Json j) => RideOption(j['id'] as String, ServiceKey.parse('${j['service']}'), '${j['name']}',
      '${j['description'] ?? ''}', _int(j['seats']), _strings(j['models']));
}

class FareQuote {
  const FareQuote(this.option, this.fare, this.distanceKm, this.durationMin, this.etaMin);
  final RideOption option;
  final int fare, durationMin, etaMin;
  final double distanceKm;
  factory FareQuote.fromJson(Json j) =>
      FareQuote(RideOption.fromJson(j['option'] as Json), _int(j['fare']), _num(j['distanceKm']), _int(j['durationMin']), _int(j['etaMin']));
}

class Driver {
  const Driver(this.name, this.rating, this.trips, this.vehicle, this.plate, this.phone);
  final String name, vehicle, plate, phone;
  final double rating;
  final int trips;
  factory Driver.fromJson(Json j) =>
      Driver('${j['name']}', _num(j['rating']), _int(j['trips']), '${j['vehicle']}', '${j['plate']}', '${j['phone'] ?? ''}');
}

class Ride {
  const Ride(this.id, this.quote, this.pickup, this.drop, this.driver, this.otp, this.payment);
  final String id, otp, payment;
  final FareQuote quote;
  final Place pickup, drop;
  final Driver driver;
  factory Ride.fromJson(Json j) => Ride(j['id'] as String, FareQuote.fromJson(j['quote'] as Json), Place.fromJson(j['pickup'] as Json),
      Place.fromJson(j['drop'] as Json), Driver.fromJson(j['driver'] as Json), '${j['otp']}', '${j['payment']}');
}

class Bus {
  const Bus({
    required this.id,
    required this.operator,
    required this.type,
    required this.ac,
    required this.sleeper,
    required this.depart,
    required this.arrive,
    required this.duration,
    required this.fare,
    required this.seatsLeft,
    required this.rating,
    required this.amenities,
    required this.boardingPoints,
  });
  final String id, operator, type, depart, arrive, duration;
  final bool ac, sleeper;
  final int fare, seatsLeft;
  final double rating;
  final List<String> amenities, boardingPoints;
  factory Bus.fromJson(Json j) => Bus(
        id: j['id'] as String,
        operator: '${j['operator']}',
        type: '${j['type']}',
        ac: j['ac'] == true,
        sleeper: j['sleeper'] == true,
        depart: '${j['depart']}',
        arrive: '${j['arrive']}',
        duration: '${j['duration']}',
        fare: _int(j['fare']),
        seatsLeft: _int(j['seatsLeft']),
        rating: _num(j['rating']),
        amenities: _strings(j['amenities']),
        boardingPoints: _strings(j['boardingPoints']),
      );
}

class Seat {
  const Seat(this.id, this.label, this.deck, this.row, this.col, this.sleeper, this.booked, this.ladies, this.price);
  final String id, label, deck;
  final int row, col, price;
  final bool sleeper, booked, ladies;
  factory Seat.fromJson(Json j) => Seat(j['id'] as String, '${j['label']}', '${j['deck']}', _int(j['row']), _int(j['col']), j['sleeper'] == true,
      j['booked'] == true, j['ladies'] == true, _int(j['price']));
}

class TourPackage {
  const TourPackage({
    required this.id,
    required this.slug,
    required this.themes,
    required this.hotelStars,
    required this.meals,
    required this.title,
    required this.location,
    required this.days,
    required this.nights,
    required this.price,
    required this.rating,
    this.tag,
    required this.highlights,
    required this.includes,
    required this.itinerary,
    required this.hue,
  });
  final String id, slug, meals, title, location;
  final List<String> themes, highlights, includes, itinerary;
  final int hotelStars, days, nights, price;
  final double rating, hue;
  final String? tag;
  factory TourPackage.fromJson(Json j) => TourPackage(
        id: j['id'] as String,
        slug: '${j['slug']}',
        themes: _strings(j['themes']),
        hotelStars: _int(j['hotelStars']),
        meals: '${j['meals'] ?? ''}',
        title: '${j['title']}',
        location: '${j['location']}',
        days: _int(j['days']),
        nights: _int(j['nights']),
        price: _int(j['price']),
        rating: _num(j['rating']),
        tag: j['tag'] as String?,
        highlights: _strings(j['highlights']),
        includes: _strings(j['includes']),
        itinerary: _strings(j['itinerary']),
        hue: _num(j['hue']),
      );
}

class RentalCar {
  const RentalCar({
    required this.id,
    required this.name,
    required this.category,
    required this.seats,
    required this.transmission,
    required this.fuel,
    required this.pricePerHour,
    required this.driverPerDay,
    required this.rating,
    required this.trips,
    required this.year,
    required this.features,
  });
  final String id, name, category, transmission, fuel;
  final int seats, pricePerHour, driverPerDay, trips, year;
  final double rating;
  final List<String> features;
  factory RentalCar.fromJson(Json j) => RentalCar(
        id: j['id'] as String,
        name: '${j['name']}',
        category: '${j['category']}',
        seats: _int(j['seats']),
        transmission: '${j['transmission']}',
        fuel: '${j['fuel']}',
        pricePerHour: _int(j['pricePerHour']),
        driverPerDay: _int(j['driverPerDay']),
        rating: _num(j['rating']),
        trips: _int(j['trips']),
        year: _int(j['year']),
        features: _strings(j['features']),
      );
}

class TravelVehicle {
  const TravelVehicle(this.id, this.name, this.seats, this.perKm, this.minKmPerDay, this.driverBataPerDay, this.localPackage, this.features);
  final String id, name;
  final int seats, perKm, minKmPerDay, driverBataPerDay, localPackage;
  final List<String> features;
  factory TravelVehicle.fromJson(Json j) => TravelVehicle(j['id'] as String, '${j['name']}', _int(j['seats']), _int(j['perKm']),
      _int(j['minKmPerDay']), _int(j['driverBataPerDay']), _int(j['localPackage']), _strings(j['features']));
}

class Booking {
  const Booking(this.id, this.service, this.title, this.subtitle, this.amount, this.status, this.createdAt, this.payment, this.lines,
      {this.startsAt, this.refundAmount});
  final String id, title, subtitle, payment;
  final ServiceKey service;
  final int amount;
  final BookingStatus status;
  final DateTime createdAt;
  final List<(String, String)> lines;

  /// When the trip starts (from the quote); null for rides and older bookings.
  final DateTime? startsAt;

  /// What the cancellation policy refunded, once cancelled.
  final int? refundAmount;
  factory Booking.fromJson(Json j) => Booking(
        j['id'] as String,
        ServiceKey.parse('${j['service']}'),
        '${j['title']}',
        '${j['subtitle'] ?? ''}',
        _int(j['amount']),
        BookingStatus.parse('${j['status']}'),
        DateTime.tryParse('${j['createdAt']}')?.toLocal() ?? DateTime.now(),
        '${j['payment']}',
        ((j['lines'] as List?) ?? const []).map((l) => ('${(l as List)[0]}', '${l[1]}')).toList(),
        startsAt: j['startsAt'] == null ? null : DateTime.tryParse('${j['startsAt']}')?.toLocal(),
        refundAmount: j['refundAmount'] == null ? null : _int(j['refundAmount']),
      );
}

class Offer {
  const Offer({
    required this.id,
    required this.code,
    required this.title,
    required this.description,
    required this.service,
    required this.hue,
    required this.percent,
    required this.maxDiscount,
    required this.minAmount,
    this.validUntil,
  });
  final String id, code, title, description;
  /// A ServiceKey name or "all".
  final String service;
  final double hue;
  final int percent, maxDiscount, minAmount;
  final String? validUntil;
  factory Offer.fromJson(Json j) => Offer(
        id: j['id'] as String,
        code: '${j['code']}',
        title: '${j['title']}',
        description: '${j['description'] ?? ''}',
        service: '${j['service']}',
        hue: _num(j['hue']),
        percent: _int(j['percent']),
        maxDiscount: _int(j['maxDiscount']),
        minAmount: _int(j['minAmount']),
        validUntil: j['validUntil'] as String?,
      );
}

class Faq {
  const Faq(this.id, this.q, this.a, this.category);
  final String id, q, a, category;
  factory Faq.fromJson(Json j) => Faq(j['id'] as String, '${j['q']}', '${j['a']}', '${j['category']}');
}

class NamedItem {
  const NamedItem(this.id, this.name);
  final String id, name;
  factory NamedItem.fromJson(Json j) => NamedItem(j['id'] as String, '${j['name']}');
}

class PopularRoute {
  const PopularRoute(this.id, this.from, this.to);
  final String id, from, to;
  factory PopularRoute.fromJson(Json j) => PopularRoute(j['id'] as String, '${j['from']}', '${j['to']}');
}

class GroupDestination {
  const GroupDestination(this.id, this.name, this.km);
  final String id, name;
  final int km;
  factory GroupDestination.fromJson(Json j) => GroupDestination(j['id'] as String, '${j['name']}', _int(j['km']));
}

class FareLine {
  const FareLine(this.label, this.amount);
  final String label;
  final int amount;
  factory FareLine.fromJson(Json j) => FareLine('${j['label']}', _int(j['amount']));
}

/// A price worked out by the API. Bookings refer to it by id (valid until expiresAt, once).
class PriceQuote {
  const PriceQuote(this.id, this.service, this.lines, this.total, this.expiresAt);
  final String id;
  final ServiceKey service;
  final List<FareLine> lines;
  final int total;
  final DateTime expiresAt;
  factory PriceQuote.fromJson(Json j) => PriceQuote(j['id'] as String, ServiceKey.parse('${j['service']}'), _list(j['lines'], FareLine.fromJson),
      _int(j['total']), DateTime.tryParse('${j['expiresAt']}') ?? DateTime.now());
}

class CouponCheck {
  const CouponCheck(this.code, this.discount, this.total);
  final String code;
  final int discount, total;
  factory CouponCheck.fromJson(Json j) => CouponCheck('${j['code']}', _int(j['discount']), _int(j['total']));
}

class ShareLink {
  const ShareLink(this.token, this.expiresAt);
  final String token;
  final DateTime expiresAt;
  factory ShareLink.fromJson(Json j) => ShareLink('${j['token']}', DateTime.tryParse('${j['expiresAt']}') ?? DateTime.now());
}

/// Business settings the owner edits in the admin panel (packages/shared/src/settings.ts).
/// Kept as the raw map plus typed getters for the values the app uses; defaults match DEFAULT_SETTINGS.
class Settings {
  const Settings(this._raw);
  final Json _raw;
  int _i(String k, int d) => (_raw[k] as num?)?.round() ?? d;
  String _s(String k, String d) => (_raw[k] as String?) ?? d;

  int get welcomeCredit => _i('welcomeCredit', 500);
  int get referralBonus => _i('referralBonus', 100);
  int get rentDeposit => _i('rentDeposit', 2000);
  int get tourChildPercent => _i('tourChildPercent', 60);
  int get groupLocalKmPerDay => _i('groupLocalKmPerDay', 80);
  int get rentDoorstepFee => _i('rentDoorstepFee', 299);
  int get rentProtectionStandardPerDay => _i('rentProtectionStandardPerDay', 199);
  int get rentProtectionPeacePerDay => _i('rentProtectionPeacePerDay', 399);
  int get rentUnlimitedKmExtraPercent => _i('rentUnlimitedKmExtraPercent', 25);
  String get safetyLine => _s('safetyLine', '1800 123 4567');

  /// Refund tiers per service ("15d:100, 7d:50"); see core/cancellation.dart. Rides have none.
  String cancelPolicy(ServiceKey s) => switch (s) {
        ServiceKey.bus => _s('cancelPolicyBus', '12h:100, 4h:50'),
        ServiceKey.tours => _s('cancelPolicyTours', '15d:100, 7d:50'),
        ServiceKey.rent => _s('cancelPolicyRent', '24h:100'),
        ServiceKey.rentals => _s('cancelPolicyGroup', '48h:100'),
        ServiceKey.bike || ServiceKey.car => '',
      };
  String get companyName => _s('companyName', 'QuikFly Mobility Pvt. Ltd.');
  String get companyAddress => _s('companyAddress', 'Chennai, Tamil Nadu, India');
  String get companyGstin => _s('companyGstin', '');
  String get companyEmail => _s('companyEmail', 'support@quikfly.in');
  String get companyPhone => _s('companyPhone', '1800 123 4567');

  /// GST rate (%) for a service, as on invoices.
  int gstRate(ServiceKey s) => switch (s) {
        ServiceKey.bike || ServiceKey.car => _i('gstRides', 5),
        ServiceKey.bus => _i('gstBus', 5),
        ServiceKey.tours => _i('gstTours', 5),
        ServiceKey.rent => _i('gstRent', 18),
        ServiceKey.rentals => _i('gstGroup', 5),
      };
}

/// GET /config: everything the app loads at start-up (visible items only).
class AppConfig {
  const AppConfig({
    required this.settings,
    required this.places,
    required this.rideOptions,
    required this.cities,
    required this.busOperators,
    required this.popularRoutes,
    required this.groupDestinations,
    required this.offers,
    required this.faqs,
  });
  final Settings settings;
  final List<Place> places;
  final List<RideOption> rideOptions;
  final List<NamedItem> cities, busOperators;
  final List<PopularRoute> popularRoutes;
  final List<GroupDestination> groupDestinations;
  final List<Offer> offers;
  final List<Faq> faqs;

  factory AppConfig.fromJson(Json j) => AppConfig(
        settings: Settings((j['settings'] as Json?) ?? const {}),
        places: _list(j['places'], Place.fromJson),
        rideOptions: _list(j['rideOptions'], RideOption.fromJson),
        cities: _list(j['cities'], NamedItem.fromJson),
        busOperators: _list(j['busOperators'], NamedItem.fromJson),
        popularRoutes: _list(j['popularRoutes'], PopularRoute.fromJson),
        groupDestinations: _list(j['groupDestinations'], GroupDestination.fromJson),
        offers: _list(j['offers'], Offer.fromJson),
        faqs: _list(j['faqs'], Faq.fromJson),
      );
}

/// Validation rules shared with the API (packages/shared/src/rules.ts). Keep in step.
abstract final class Rules {
  static final phone = RegExp(r'^[6-9]\d{9}$');
  static final email = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$');
  static final gstin = RegExp(r'^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
  static final licence = RegExp(r'^[A-Z]{2}\d{2}(19|20)\d{2}\d{7}$');
  static final referralCode = RegExp(r'^[A-Z0-9]{6,10}$');
  static const nameMin = 2, nameMax = 60, minAge = 13, maxAge = 100;
  static const savedPlaces = 10, travellers = 10, emergencyContacts = 3;
  static const deletionGraceDays = 30;
  static const shareLinkHours = 24;
  /// Local hours [from, to) counted as night for auto-sharing rides.
  static const nightHours = (22, 6);
  /// Simulated ride timings (RIDE_SIMULATION).
  static const rideArrive = Duration(milliseconds: 9000);
  static const rideTrip = Duration(milliseconds: 12000);

  /// "tn09 2019-0001234" → "TN0920190001234"
  static String compactCode(String s) => s.toUpperCase().replaceAll(RegExp(r'[\s-]'), '');
  static bool isNightHour(int h) => nightHours.$1 > nightHours.$2 ? h >= nightHours.$1 || h < nightHours.$2 : h >= nightHours.$1 && h < nightHours.$2;
}
