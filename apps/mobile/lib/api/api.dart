// The QuikFly REST API, one method per endpoint (table in apps/api/README.md).
// Screens never call Dio directly; they use this class through `apiProvider`.
// Rule: the app never sends an amount. Bookings carry a quoteId (POST /quotes) or a rideId.
import 'package:dio/dio.dart';
import '../core/env.dart';
import 'models.dart';

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

  // ── Account ──
  /// Send only what changes; null clears a field. Saving a name completes sign-up.
  Future<User> updateProfile(Map<String, Object?> changes) => _patch('/me', (d) => User.fromJson(d as Json), changes);
  Future<void> sendPhoneChangeOtp(String phone) => _post('/me/phone/otp', _ignore, {'phone': phone});
  Future<User> changePhone(String phone, String otp) => _post('/me/phone', (d) => User.fromJson(d as Json), {'phone': phone, 'otp': otp});
  Future<void> logoutEverywhere() => _post('/me/logout-all', _ignore);
  Future<void> deleteAccount(String otp) => _post('/me/delete', _ignore, {'otp': otp});
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
  Future<List<EmergencyContact>> addContact(String name, String phone, {String? relation}) =>
      _post('/me/contacts', _listOf(EmergencyContact.fromJson), {'name': name, 'phone': phone, 'relation': ?relation});
  Future<List<EmergencyContact>> removeContact(String id) => _delete('/me/contacts/$id', _listOf(EmergencyContact.fromJson));

  Future<List<WalletTransaction>> wallet() => _get('/me/wallet', _listOf(WalletTransaction.fromJson));

  // ── Notifications ──
  Future<({List<AppNotification> items, int unread})> notifications() => _get('/me/notifications', (d) {
        final j = d as Json;
        return (items: ((j['items'] as List?) ?? const []).map((x) => AppNotification.fromJson(x as Json)).toList(), unread: (j['unread'] as num?)?.round() ?? 0);
      });

  /// Marks [ids] read, or everything when null; returns what's still unread.
  Future<int> markNotificationsRead([List<String>? ids]) =>
      _post('/me/notifications/read', (d) => ((d as Json)['unread'] as num?)?.round() ?? 0, {'ids': ?ids});

  /// Registers this phone's Firebase token for push (used once Firebase is set up).
  Future<void> registerPushDevice(String token, String platform) => _post('/me/push-devices', _ignore, {'token': token, 'platform': platform});
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

  Future<List<Booking>> bookings() => _get('/bookings', _listOf(Booking.fromJson));
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
      });
  /// [reason] is a ride cancel reason key; a valid one waives the ride cancellation fee.
  Future<Booking> cancelBooking(String id, {String? reason}) =>
      _post('/bookings/$id/cancel', (d) => Booking.fromJson(d as Json), {'reason': ?reason});
  Future<Booking> completeBooking(String id) => _post('/bookings/$id/complete', (d) => Booking.fromJson(d as Json));
}
