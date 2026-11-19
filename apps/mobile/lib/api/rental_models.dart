// Self-drive rentals (packages/shared/src/rental.ts): the pickup and return checklist,
// extensions and the deposit settlement. Keep the sides, fuel levels and rules in step.

import 'models.dart';

/// RENTAL_PHOTO_SIDES and RENTAL_PHOTO_LABEL.
const rentalPhotoSides = <String, String>{
  'front': 'Front',
  'back': 'Back',
  'left': 'Left side',
  'right': 'Right side',
  'odometer': 'Odometer and fuel gauge',
};

/// FUEL_EIGHTHS and fuelLabel(): fuel in eighths of a tank, 0 (empty) to 8 (full).
const fuelEighths = 8;
String fuelLabel(int n) => n <= 0 ? 'Empty' : n >= fuelEighths ? 'Full' : n == 4 ? 'Half' : '$n/8';

/// RENTAL_RULES.extendHours: the choices offered (each at most Settings.rentExtendMaxHours).
const rentalExtendHours = [1, 2, 3, 4, 6, 12, 24, 48];

/// A local India time "YYYY-MM-DDTHH:mm" as shown to the customer: "20 Nov, 6:30 pm".
String rentalTime(String local) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final p = local.split('T');
  final d = p[0].split('-').map(int.parse).toList();
  final t = p[1].split(':').map(int.parse).toList();
  final h = t[0] % 12 == 0 ? 12 : t[0] % 12;
  return '${d[2]} ${months[d[1] - 1]}, $h:${t[1].toString().padLeft(2, '0')} ${t[0] < 12 ? 'am' : 'pm'}';
}

class RentalReading {
  const RentalReading(this.odometerKm, this.fuel, this.at);
  final int odometerKm, fuel;
  final String at;
  static RentalReading? fromJson(Object? j) => j == null ? null : RentalReading(_n((j as Json)['odometerKm']), _n(j['fuel']), '${j['at']}');
}

int _n(Object? v) => (v as num?)?.round() ?? 0;

class FareLineItem {
  const FareLineItem(this.label, this.amount);
  final String label;
  final int amount;
  factory FareLineItem.fromJson(Json j) => FareLineItem('${j['label']}', _n(j['amount']));
}

class RentalSettlement {
  const RentalSettlement(this.kmDriven, this.kmIncluded, this.lines, this.damageNote, this.deductions, this.deposit, this.depositReturned, this.due);
  final int kmDriven, deductions, deposit, depositReturned, due;
  final int? kmIncluded;
  final List<FareLineItem> lines;
  final String? damageNote;
  static RentalSettlement? fromJson(Object? v) {
    if (v == null) return null;
    final j = v as Json;
    return RentalSettlement(_n(j['kmDriven']), j['kmIncluded'] == null ? null : _n(j['kmIncluded']),
        [for (final l in (j['lines'] as List? ?? const [])) FareLineItem.fromJson(l as Json)], j['damageNote'] as String?,
        _n(j['deductions']), _n(j['deposit']), _n(j['depositReturned']), _n(j['due']));
  }
}

/// GET /bookings/:id/rental. state: booked → on_trip → returned → settled.
class Rental {
  const Rental(this.bookingId, this.state, this.start, this.endsAt, this.kmPlan, this.deposit, this.pickup, this.dropoff, this.photos, this.extensions, this.settlement);
  final String bookingId, state, start, endsAt, kmPlan;
  final int deposit;
  final RentalReading? pickup, dropoff;
  /// Photo sides uploaded so far: {'pickup': [...], 'return': [...]}.
  final Map<String, List<String>> photos;
  final List<(int hours, int amount)> extensions;
  final RentalSettlement? settlement;

  bool get canExtend => state == 'booked' || state == 'on_trip';
  int get extendedHours => extensions.fold(0, (s, e) => s + e.$1);
  int get extendedAmount => extensions.fold(0, (s, e) => s + e.$2);

  factory Rental.fromJson(Json j) {
    final p = (j['photos'] as Json?) ?? const {};
    return Rental(
      '${j['bookingId']}', '${j['state']}', '${j['start']}', '${j['endsAt']}', '${j['kmPlan']}', _n(j['deposit']),
      RentalReading.fromJson(j['pickup']), RentalReading.fromJson(j['dropoff']),
      {for (final s in ['pickup', 'return']) s: [for (final x in (p[s] as List? ?? const [])) '$x']},
      [for (final e in (j['extensions'] as List? ?? const [])) (_n((e as Json)['hours']), _n(e['amount']))],
      RentalSettlement.fromJson(j['settlement']),
    );
  }
}

/// GET /bookings/:id/rental/extension?hours=N
class ExtensionQuote {
  const ExtensionQuote(this.lines, this.total, this.endsAt);
  final List<FareLineItem> lines;
  final int total;
  final String endsAt;
  factory ExtensionQuote.fromJson(Json j) => ExtensionQuote([for (final l in (j['lines'] as List)) FareLineItem.fromJson(l as Json)], _n(j['total']), '${j['endsAt']}');
}
