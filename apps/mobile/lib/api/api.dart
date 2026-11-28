// The QuikFly REST API, one method per endpoint (table in apps/api/README.md).
// Screens never call Dio directly; they use this class through `apiProvider`.
// Rule: the app never sends an amount. Bookings carry a quoteId (POST /quotes) or a rideId.
import 'package:dio/dio.dart';
import '../core/env.dart';
import 'captain_models.dart';
import 'models.dart';
import 'parcel_models.dart';
import 'rental_models.dart';
import 'support_models.dart';
import 'vendor_models.dart';

export 'captain_models.dart';
export 'vendor_models.dart';

/// An error to show the user: the API's own `{ message }`, or a plain network message.
class ApiException implements Exception {
  const ApiException(this.message, {this.status});
  final String message;
  final int? status;
  bool get unauthorised => status == 401;
  @override
  String toString() => message;
}

class QuikFlyApi {
  QuikFlyApi({String baseUrl = apiUrl})
      : _dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 20),
          contentType: 'application/json',
          headers: {'Accept': ServiceKey.clientAccept},
        )) {
    _dio.interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
      if (token != null) o.headers['Authorization'] = 'Bearer $token';
      h.next(o);
    }));
  }

  final Dio _dio;

  /// Customer session token, set by the session notifier.
  String? token;

  /// Called when the API says the session is gone (401 on a signed-in call).
  void Function()? onUnauthorised;

  Future<T> _send<T>(Future<Response<dynamic>> Function() call, T Function(dynamic data) parse) async {
    try {
      final r = await call();
      return parse(r.data);
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      final data = e.response?.data;
      final msg = data is Map && data['message'] is String ? data['message'] as String : null;
      if (status == 401 && token != null) onUnauthorised?.call();
      if (msg != null) throw ApiException(msg, status: status);
      if (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout || e.type == DioExceptionType.receiveTimeout) {
        throw const ApiException("Can't reach QuikFly. Check your internet connection and try again.");
      }
      throw ApiException('Something went wrong (${status ?? 'no response'}). Please try again.', status: status);
    }
  }

  Future<T> _get<T>(String path, T Function(dynamic) parse, [Map<String, dynamic>? query]) =>
      _send(() => _dio.get(path, queryParameters: query), parse);
  Future<T> _post<T>(String path, T Function(dynamic) parse, [Object? body]) => _send(() => _dio.post(path, data: body ?? const {}), parse);
  Future<T> _put<T>(String path, T Function(dynamic) parse, Object body) => _send(() => _dio.put(path, data: body), parse);
  Future<T> _patch<T>(String path, T Function(dynamic) parse, Object body) => _send(() => _dio.patch(path, data: body), parse);
  Future<T> _delete<T>(String path, T Function(dynamic) parse) => _send(() => _dio.delete(path), parse);

  static List<T> Function(dynamic) _listOf<T>(T Function(Json) f) => (d) => (d as List).map((e) => f(e as Json)).toList();
  static void _ignore(dynamic _) {}

  // ── Start-up ──
  Future<AppConfig> config() => _get('/config', (d) => AppConfig.fromJson(d as Json));

  // ── Auth ──
  Future<void> sendOtp(String phone) => _post('/auth/otp', _ignore, {'phone': phone});
  Future<AuthResult> verifyOtp(String phone, String otp) => _post('/auth/verify', (d) => AuthResult.fromJson(d as Json), {'phone': phone, 'otp': otp});
  Future<void> logout() => _post('/auth/logout', _ignore);
  Future<User> me() => _get('/auth/me', (d) => User.fromJson(d as Json));

  // ── Partner (vendor) registration: the QuikFly Partner app ──
  VendorApplication? _vendorOrNull(dynamic d) {
    final a = (d as Json)['application'];
    return a == null ? null : VendorApplication.fromJson(a as Json);
  }

  VendorApplication _vendor(dynamic d) => VendorApplication.fromJson(d as Json);

  // ── Self-drive rentals: checklist, extensions (stage: pickup | return; side: front | back | left | right | odometer) ──
  Rental _rental(dynamic d) => Rental.fromJson(d as Json);
  Future<Rental> rental(String bookingId) => _get('/bookings/$bookingId/rental', _rental);
  Future<Rental> uploadRentalPhoto(String bookingId, String stage, String side, List<int> bytes) => _send(
        () => _dio.put('/bookings/$bookingId/rental/photos/$stage/$side',
            data: Stream.fromIterable([bytes]), options: Options(contentType: 'image/jpeg', headers: {Headers.contentLengthHeader: bytes.length})),
        _rental,
      );
  String rentalPhotoUrl(String bookingId, String stage, String side) => '${_dio.options.baseUrl}/bookings/$bookingId/rental/photos/$stage/$side';
  Future<Rental> startRental(String bookingId, int odometerKm, int fuel) => _post('/bookings/$bookingId/rental/start', _rental, {'odometerKm': odometerKm, 'fuel': fuel});
  Future<ExtensionQuote> extensionQuote(String bookingId, int hours) =>
      _get('/bookings/$bookingId/rental/extension', (d) => ExtensionQuote.fromJson(d as Json), {'hours': '$hours'});
  Future<Rental> extendRental(String bookingId, int hours) => _post('/bookings/$bookingId/rental/extend', (d) => Rental.fromJson((d as Json)['rental'] as Json), {'hours': hours});
  Future<Rental> endRental(String bookingId, int odometerKm, int fuel) => _post('/bookings/$bookingId/rental/return', _rental, {'odometerKm': odometerKm, 'fuel': fuel});

  // ── Support: callbacks (signed-in ones are linked to the account) and tickets ──
  SupportTicket _ticket(dynamic d) => SupportTicket.fromJson(d as Json);
  Future<SupportTicket> requestCallback({required String name, required String phone, required String topic, required String preferredTime, String? message, String? ref}) =>
      _post('/support/callbacks', _ticket, {'name': name, 'phone': phone, 'topic': topic, 'preferredTime': preferredTime, 'message': ?message, 'ref': ?ref});
  Future<List<SupportTicket>> tickets() => _get('/me/tickets', (d) => [for (final t in d as List) SupportTicket.fromJson(t as Json)]);
  Future<SupportTicket> ticket(String id) => _get('/me/tickets/$id', _ticket);
  Future<SupportTicket> openTicket(String topic, String message, {String? bookingId}) =>
      _post('/me/tickets', _ticket, {'topic': topic, 'message': message, 'bookingId': ?bookingId});
  Future<SupportTicket> replyTicket(String id, String body) => _post('/me/tickets/$id/messages', _ticket, {'body': body});
  Future<SupportTicket> closeTicket(String id) => _post('/me/tickets/$id/close', _ticket);

  /// The partner application, or null before one is started.
  Future<VendorApplication?> vendorApplication() => _get('/vendor', _vendorOrNull);
  Future<VendorApplication> startVendorApplication() => _post('/vendor', _vendor);
  Future<VendorApplication> saveVendorSection(String section, Json body) => _put('/vendor/sections/$section', _vendor, body);

  /// Uploads a document photo (JPEG, PNG or WebP bytes) for 'photo', 'rc' or 'insurance'.
  Future<VendorApplication> uploadVendorDocument(String kind, List<int> bytes, {String contentType = 'image/jpeg'}) => _send(
        () => _dio.put('/vendor/documents/$kind',
            data: Stream.fromIterable([bytes]),
            options: Options(contentType: contentType, headers: {Headers.contentLengthHeader: bytes.length})),
        _vendor,
      );

  /// Where the app loads a document photo from; needs [authHeaders].
  String vendorDocumentUrl(String kind) => '${_dio.options.baseUrl}/vendor/documents/$kind';
  Map<String, String> get authHeaders => {if (token != null) 'Authorization': 'Bearer $token'};

  Future<VendorApplication> resetVendorApplication() => _post('/vendor/reset', _vendor);
  Future<VendorApplication> submitVendorApplication() => _post('/vendor/submit', _vendor);
  Future<VendorApplication> payVendorJoiningFee() => _post('/vendor/onboarding/payment', _vendor);
  Future<VendorApplication> acceptVendorAgreement(String name) => _post('/vendor/onboarding/agreement', _vendor, {'name': name, 'accept': true});
  Future<VendorApplication> requestVendorSticker() => _post('/vendor/onboarding/sticker', _vendor);

  // ── QuikFly Captain (/driver): every action returns the captain's state ──
  CaptainState _captainState(dynamic d) => CaptainState.fromJson(d as Json);
  Future<CaptainLookup> captain() => _get('/driver', (d) => CaptainLookup.fromJson(d as Json));
  /// [position]: a GPS fix, or a demo location (a map point) while the owner allows those.
  Future<CaptainState> setCaptainDuty(bool online, {CaptainPosition? position}) =>
      _post('/driver/duty', _captainState, {'online': online, if (position != null) 'position': position.toJson()});
  Future<CaptainState> captainPing({CaptainPosition? position}) => _post('/driver/ping', _captainState, {if (position != null) 'position': position.toJson()});
  /// Agrees to the captains' notice (CaptainNotice.version); returns the profile with the blocker cleared.
  Future<CaptainLookup> agreeCaptainNotice(String version) => _post('/driver/notice', (d) => CaptainLookup.fromJson(d as Json), {'version': version});
  Future<CaptainSummary> captainSummary() => _get('/driver/summary', (d) => CaptainSummary.fromJson(d as Json));
  Future<List<CaptainTripItem>> captainTrips() => _get('/driver/trips', _listOf(CaptainTripItem.fromJson));
  Future<CaptainState> acceptOffer(String rideId) => _post('/driver/offers/$rideId/accept', _captainState);
  Future<CaptainState> declineOffer(String rideId) => _post('/driver/offers/$rideId/decline', _captainState);
  Future<CaptainState> captainArrived(String rideId) => _post('/driver/rides/$rideId/arrived', _captainState);
  Future<CaptainState> captainStart(String rideId, String otp) => _post('/driver/rides/$rideId/start', _captainState, {'otp': otp});
  Future<CaptainState> captainComplete(String rideId) => _post('/driver/rides/$rideId/complete', _captainState);
  Future<CaptainState> captainRelease(String rideId, String reason) => _post('/driver/rides/$rideId/cancel', _captainState, {'reason': reason});

  // ── Partner fleet (live partners): every call returns the whole fleet ──
  VendorFleet _fleet(dynamic d) => VendorFleet.fromJson(d as Json);
  Future<VendorFleet> vendorFleet() => _get('/vendor/fleet', _fleet);
  Future<VendorFleet> addVendorVehicle(Json details) => _post('/vendor/vehicles', _fleet, details);

  /// part: details · rc · insurance · audit (rc/insurance on a live vehicle is a renewal QuikFly checks).
  Future<VendorFleet> saveVendorVehicle(String id, String part, Json body) => _put('/vendor/vehicles/$id/$part', _fleet, body);
  Future<VendorFleet> uploadVendorVehicleDocument(String id, String kind, List<int> bytes) => _send(
        () => _dio.put('/vendor/vehicles/$id/documents/$kind',
            data: Stream.fromIterable([bytes]), options: Options(contentType: 'image/jpeg', headers: {Headers.contentLengthHeader: bytes.length})),
        _fleet,
      );
  String vendorVehicleDocumentUrl(String id, String kind) => '${_dio.options.baseUrl}/vendor/vehicles/$id/documents/$kind';
  Future<VendorFleet> submitVendorVehicle(String id) => _post('/vendor/vehicles/$id/submit', _fleet);
  Future<VendorFleet> setVendorVehicleActive(String id, bool active) => _patch('/vendor/vehicles/$id', _fleet, {'active': active});
  Future<VendorFleet> deleteVendorVehicle(String id) => _delete('/vendor/vehicles/$id', _fleet);
  Future<VendorFleet> addVendorDriver(Json body) => _post('/vendor/drivers', _fleet, body);
  Future<VendorFleet> saveVendorDriverLicence(String id, Json body) => _put('/vendor/drivers/$id/licence', _fleet, body);
  Future<VendorFleet> uploadVendorDriverLicence(String id, List<int> bytes) => _send(
        () => _dio.put('/vendor/drivers/$id/documents/dl',
            data: Stream.fromIterable([bytes]), options: Options(contentType: 'image/jpeg', headers: {Headers.contentLengthHeader: bytes.length})),
        _fleet,
      );
  String vendorDriverLicenceUrl(String id) => '${_dio.options.baseUrl}/vendor/drivers/$id/documents/dl';
  Future<VendorFleet> assignVendorDriver(String id, String? vehicleId) => _post('/vendor/drivers/$id/assign', _fleet, {'vehicleId': vehicleId});
  Future<VendorFleet> removeVendorDriver(String id) => _delete('/vendor/drivers/$id', _fleet);

  // ── Partner trips and money (dates are India YYYY-MM-DD) ──
  Future<List<VendorTrip>> vendorTrips(String from, String to) =>
      _get('/vendor/trips', (d) => [for (final t in d as List) VendorTrip(t as Json)], {'from': from, 'to': to});
  Future<VendorTripSummary> vendorSummary(String from, String to) => _get('/vendor/summary', (d) => VendorTripSummary(d as Json), {'from': from, 'to': to});
  Future<VendorMoney> vendorMoney() => _get('/vendor/money', (d) => VendorMoney(d as Json));
  Future<VendorMoney> requestVendorPayout() => _post('/vendor/payouts', (d) => VendorMoney(d as Json));

  /// Demo: settles what the partner owes QuikFly without collecting anything.
  Future<VendorMoney> payVendorDues() => _post('/vendor/payments', (d) => VendorMoney(d as Json));

  // ── Account ──
  /// Send only what changes; null clears a field. Saving a name completes sign-up.
  Future<User> updateProfile(Map<String, Object?> changes) => _patch('/me', (d) => User.fromJson(d as Json), changes);
  Future<void> sendPhoneChangeOtp(String phone) => _post('/me/phone/otp', _ignore, {'phone': phone});
  Future<User> changePhone(String phone, String otp) => _post('/me/phone', (d) => User.fromJson(d as Json), {'phone': phone, 'otp': otp});
  Future<void> logoutEverywhere() => _post('/me/logout-all', _ignore);
  Future<void> deleteAccount(String otp) => _post('/me/delete', _ignore, {'otp': otp});

  // ── Privacy (DPDP) ──
  Future<PrivacyNotice> privacyNotice() => _get('/privacy', (d) => PrivacyNotice(d as Json));
  Future<CaptainNotice> captainNotice() => _get('/privacy/captain', (d) => CaptainNotice(d as Json));
  Future<User> giveConsent(String version) => _post('/me/consent', (d) => User.fromJson(d as Json), {'version': version});

  /// Everything QuikFly holds about this account, as the JSON the API sends (saved as a file).
  Future<Json> exportData() => _get('/me/export', (d) => d as Json);
  Future<User> applyReferral(String code) => _post('/me/referral', (d) => User.fromJson(d as Json), {'code': code});
  Future<User> submitLicence(String number, String expiry) =>
      _put('/me/licence', (d) => User.fromJson(d as Json), {'number': number, 'expiry': expiry});

  Future<List<SavedPlace>> savedPlaces() => _get('/me/places', _listOf(SavedPlace.fromJson));
  Future<List<SavedPlace>> savePlace(String kind, String placeId, {String? label}) =>
      _post('/me/places', _listOf(SavedPlace.fromJson), {'kind': kind, 'placeId': placeId, 'label': ?label});
  Future<List<SavedPlace>> removePlace(String id) => _delete('/me/places/$id', _listOf(SavedPlace.fromJson));

  Future<List<Traveller>> travellers() => _get('/me/travellers', _listOf(Traveller.fromJson));
  Future<List<Traveller>> addTraveller(String name, int age, Gender gender) =>
      _post('/me/travellers', _listOf(Traveller.fromJson), {'name': name, 'age': age, 'gender': gender.name});
  Future<List<Traveller>> removeTraveller(String id) => _delete('/me/travellers/$id', _listOf(Traveller.fromJson));

  Future<List<EmergencyContact>> contacts() => _get('/me/contacts', _listOf(EmergencyContact.fromJson));

  /// SOS from the safety sheet: a record for the QuikFly safety desk (admin → SOS). Nothing is dispatched automatically yet.
  Future<SosReceipt> raiseSos({String? rideId, String? bookingId, double? lat, double? lng, String? note}) =>
      _post('/me/sos', (d) => SosReceipt.fromJson(d as Json), {'rideId': ?rideId, 'bookingId': ?bookingId, 'lat': ?lat, 'lng': ?lng, 'note': ?note});
  Future<List<EmergencyContact>> addContact(String name, String phone, {String? relation}) =>
      _post('/me/contacts', _listOf(EmergencyContact.fromJson), {'name': name, 'phone': phone, 'relation': ?relation});
  Future<List<EmergencyContact>> removeContact(String id) => _delete('/me/contacts/$id', _listOf(EmergencyContact.fromJson));

  Future<List<WalletTransaction>> wallet() => _get('/me/wallet', _listOf(WalletTransaction.fromJson));
  Future<CreditSummary> credits() => _get('/me/credits', (d) => CreditSummary.fromJson(d as Json));

  /// Buys a QuikFly Pass from the wallet; returns when the pass now ends.
  Future<DateTime> buyPass() => _post('/me/pass', (d) => DateTime.parse((d as Json)['passUntil'] as String).toLocal());

  // ── Notifications ──
  Future<({List<AppNotification> items, int unread})> notifications() => _get('/me/notifications', (d) {
        final j = d as Json;
        return (items: ((j['items'] as List?) ?? const []).map((x) => AppNotification.fromJson(x as Json)).toList(), unread: (j['unread'] as num?)?.round() ?? 0);
      });

  /// Marks [ids] read, or everything when null; returns what's still unread.
  Future<int> markNotificationsRead([List<String>? ids]) =>
      _post('/me/notifications/read', (d) => ((d as Json)['unread'] as num?)?.round() ?? 0, {'ids': ?ids});

  /// Registers this phone's Firebase token for push (used once Firebase is set up).
  /// [app] = 'customer' or 'partner': the API sends each app only its own kinds (vendor.* to Partner).
  Future<void> registerPushDevice(String token, String platform, {required String app}) =>
      _post('/me/push-devices', _ignore, {'token': token, 'platform': platform, 'app': app});
  Future<void> removePushDevice(String token) => _delete('/me/push-devices/${Uri.encodeComponent(token)}', _ignore);

  // ── Rides ──
  Future<List<Place>> places(String q) => _get('/places', _listOf(Place.fromJson), {'q': q});
  /// [scheduledFor] = local "YYYY-MM-DDTHH:mm" (India) for a ride booked ahead.
  /// [stopIds] = up to Rules.rideMaxStops places between pickup and drop, in order.
  Future<List<FareQuote>> rideQuotes(ServiceKey service, String pickupId, String dropId, {String? scheduledFor, List<String> stopIds = const []}) =>
      _post('/rides/quote', _listOf(FareQuote.fromJson), {
        'service': service.name, 'pickupId': pickupId, 'dropId': dropId, 'scheduledFor': ?scheduledFor, if (stopIds.isNotEmpty) 'stopIds': stopIds,
      });
  Future<Ride> bookRide(String optionId, String pickupId, String dropId, PaymentMethod payment, {String? scheduledFor, List<String> stopIds = const []}) =>
      _post('/rides', (d) => Ride.fromJson(d as Json), {
        'optionId': optionId, 'pickupId': pickupId, 'dropId': dropId, 'payment': payment.name, 'scheduledFor': ?scheduledFor,
        if (stopIds.isNotEmpty) 'stopIds': stopIds,
      });
  Future<Ride> ride(String id) => _get('/rides/$id', (d) => Ride.fromJson(d as Json));

  /// Starts a scheduled ride near pickup time (driver assigned, live trip begins).
  Future<Ride> startRide(String id) => _post('/rides/$id/start', (d) => Ride.fromJson(d as Json));
  Future<void> cancelRide(String id) => _post('/rides/$id/cancel', _ignore);
  Future<ShareLink> shareRide(String id) => _post('/rides/$id/share', (d) => ShareLink.fromJson(d as Json));

  // ── Bus ──
  Future<List<Bus>> buses(String from, String to, String date) => _get('/buses', _listOf(Bus.fromJson), {'from': from, 'to': to, 'date': date});
  Future<List<Seat>> seats(String busId, String from, String to, String date) =>
      _get('/buses/$busId/seats', _listOf(Seat.fromJson), {'from': from, 'to': to, 'date': date});

  // ── Catalog ──
  Future<List<TourPackage>> tours() => _get('/tours', _listOf(TourPackage.fromJson));
  Future<TourPackage> tour(String slug) => _get('/tours/$slug', (d) => TourPackage.fromJson(d as Json));
  Future<List<RentalCar>> cars() => _get('/rentals/cars', _listOf(RentalCar.fromJson));
  Future<RentalCar> car(String id) => _get('/rentals/cars/$id', (d) => RentalCar.fromJson(d as Json));
  Future<List<TravelVehicle>> travelVehicles() => _get('/rentals/travel-vehicles', _listOf(TravelVehicle.fromJson));

  // ── Prices and bookings ──
  /// Prices a bus, tour, rent or group booking. See QuoteRequest in packages/shared/src/types.ts.
  Future<PriceQuote> quote(Map<String, Object?> request) => _post('/quotes', (d) => PriceQuote.fromJson(d as Json), request);
  Future<CouponCheck> checkCoupon(String code, {String? quoteId, String? rideId}) =>
      _post('/offers/check', (d) => CouponCheck.fromJson(d as Json), {'code': code, 'quoteId': ?quoteId, 'rideId': ?rideId});

  /// Leaves out any service newer than this app, rather than showing it as another one.
  Future<List<Booking>> bookings() => _get(
      '/bookings', (d) => [for (final b in d as List) if (ServiceKey.known((b as Json)['service'])) Booking.fromJson(b)]);
  Future<Booking> booking(String id) => _get('/bookings/$id', (d) => Booking.fromJson(d as Json));
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
  }) =>
      _post('/bookings', (d) => Booking.fromJson(d as Json), {
        'service': service.name,
        'title': title,
        'subtitle': subtitle,
        'payment': payment.name,
        'lines': [for (final l in lines) [l.$1, l.$2]],
        'quoteId': ?quoteId,
        'rideId': ?rideId,
        'couponCode': ?couponCode,
        'tripOf': ?tripOf,
        if (useCredits) 'useCredits': true,
        if (receiver != null) 'receiver': {'name': receiver.name, 'phone': receiver.phone},
        'contents': ?contents,
        'declaration': ?declaration,
      });

  // ── Parcels (packages/shared/src/parcel.ts): priced by quote(), booked by createBooking() ──
  Future<ParcelOptions> parcelOptions(String from, String to) =>
      _get('/parcels/options', (d) => ParcelOptions.fromJson(d as Json), {'from': from, 'to': to});

  /// The sender's parcel, with the collection code while it's ready.
  Future<Parcel> parcel(String bookingId) => _get('/bookings/$bookingId/parcel', (d) => Parcel.fromJson(d as Json));

  /// Demo: the sender confirms the captain has it, with the pickup code.
  Future<Parcel> parcelHandover(String bookingId, String otp) =>
      _post('/bookings/$bookingId/parcel/handover', (d) => Parcel.fromJson(d as Json), {'otp': otp});

  /// Demo: the sender plays the captain, with the receiver's code.
  Future<Parcel> parcelDeliver(String bookingId, String otp) =>
      _post('/bookings/$bookingId/parcel/deliver', (d) => Parcel.fromJson(d as Json), {'otp': otp});

  /// Public: no sign-in, first names only.
  Future<ParcelTracking> trackParcel(String lr) => _get('/track/${Uri.encodeComponent(lr)}', (d) => ParcelTracking.fromJson(d as Json));
  /// [reason] is a ride cancel reason key; a valid one waives the ride cancellation fee.
  Future<Booking> cancelBooking(String id, {String? reason}) =>
      _post('/bookings/$id/cancel', (d) => Booking.fromJson(d as Json), {'reason': ?reason});
  Future<Booking> completeBooking(String id) => _post('/bookings/$id/complete', (d) => Booking.fromJson(d as Json));

  /// Bus tickets: cancel some seats (their share comes back per the bus policy).
  Future<Booking> cancelSeats(String id, List<String> seatIds) => _post('/bookings/$id/cancel-seats', (d) => Booking.fromJson(d as Json), {'seatIds': seatIds});

  /// Bus tickets: move once to the bus of [quoteId]; the difference is settled. Returns the booking and what was charged or refunded.
  Future<({Booking booking, int charged, int refunded})> reschedule(String id, String quoteId, String subtitle, List<(String, String)> lines) =>
      _post('/bookings/$id/reschedule', (d) {
        final j = d as Json;
        return (booking: Booking.fromJson(j['booking'] as Json), charged: (j['charged'] as num?)?.round() ?? 0, refunded: (j['refunded'] as num?)?.round() ?? 0);
      }, {'quoteId': quoteId, 'subtitle': subtitle, 'lines': [for (final l in lines) [l.$1, l.$2]]});
}
