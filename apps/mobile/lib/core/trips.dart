// Trips: bookings that belong together. Dart copy of apps/web/src/lib/trips.ts: after a bus
// or holiday booking, offer a ride that joins its trip.
import 'package:intl/intl.dart';
import '../api/models.dart';

/// Bus boarding points that are places on the ride map (BOARDING_POINT_PLACES in packages/shared).
const boardingPointPlaces = {
  'Chennai – Main Bus Stand': 'p14',
  'Chennai – City Center': 'p1',
  'Chennai – Bypass': 'p11',
};

/// TRIP_RIDE in packages/shared: the cab arrives this long before boarding; holiday rides at this hour.
const tripRideLeadMinutes = 45, tripRideHolidayHour = 6;

/// An instant as India-time "YYYY-MM-DDTHH:mm" (what scheduledFor expects).
String _istLocal(DateTime t) => DateFormat("yyyy-MM-dd'T'HH:mm").format(t.toUtc().add(const Duration(minutes: 330)));

/// Parses "YYYY-MM-DD" + "HH:mm" as India time.
DateTime _ist(String date, String hhmm) => DateTime.parse('${date}T$hhmm:00+05:30');

typedef RideOffer = ({String title, String text, String route});

/// The ride to offer after booking [b], or null (see the website's rideOffer).
RideOffer? rideOffer(Booking b, Settings s, String? Function(String id) placeName, {DateTime? now}) {
  final t = now ?? DateTime.now();
  final starts = b.startsAt;
  if (b.status != BookingStatus.confirmed || starts == null) return null;
  final date = DateFormat('yyyy-MM-dd').format(starts.toUtc().add(const Duration(minutes: 330)));
  final soonest = t.add(Duration(minutes: s.rideScheduleMinMinutes));

  if (b.service == ServiceKey.bus) {
    final dep = b.lines.where((l) => l.$1 == 'Departure').map((l) => l.$2).firstOrNull ?? '';
    final m = RegExp(r'^(\d{2}:\d{2}) from (.+)$').firstMatch(dep);
    final placeId = m == null ? null : boardingPointPlaces[m[2]];
    if (m == null || placeId == null) return null;
    final boarding = _ist(date, m[1]!);
    if (!boarding.isAfter(t)) return null;
    final pickup = boarding.subtract(const Duration(minutes: tripRideLeadMinutes));
    final at = pickup.isBefore(soonest) ? null : _istLocal(pickup);
    return (
      title: 'Get to your bus on time',
      text: 'A cab to ${m[2]} (${placeName(placeId) ?? 'the boarding point'}), ${at != null ? 'arriving about $tripRideLeadMinutes minutes before boarding at ${m[1]}' : 'right now'}.',
      route: Uri(path: '/ride/car', queryParameters: {'to': placeId, 'at': ?at, 'trip': b.id}).toString(),
    );
  }
  if (b.service == ServiceKey.tours) {
    final start = _ist(date, '${tripRideHolidayHour.toString().padLeft(2, '0')}:00');
    if (!start.isAfter(t)) return null;
    final at = start.isBefore(soonest) ? null : _istLocal(start);
    return (
      title: 'Need a ride when your holiday starts?',
      text: "Book a cab to the airport, station or bus stand for the morning you leave. It's added to this trip.",
      route: Uri(path: '/ride/car', queryParameters: {'at': ?at, 'trip': b.id}).toString(),
    );
  }
  return null;
}

/// When a booking happens, for ordering a trip's timeline.
DateTime bookingWhen(Booking b) => b.startsAt ?? b.createdAt;
