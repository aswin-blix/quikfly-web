// Parcels: Dart copies of packages/shared/src/parcel.ts (shapes, labels and the few rules the app
// checks early). The API decides the price, every move and every refund; change both together.
import 'models.dart';

/// The booking line with the LR number (PARCEL_LR_LINE).
const parcelLrLine = 'LR number';

/// A parcel's states in the order it passes through when nothing goes wrong (PARCEL_JOURNEY).
const parcelJourney = ['booked', 'at_counter', 'on_bus', 'reached', 'ready', 'collected'];

/// States a booking can still be cancelled from: not yet on the bus (PARCEL_CANCELLABLE).
const parcelCancellable = {'booked', 'at_counter'};

const parcelStateLabels = {
  'booked': 'Booked',
  'at_counter': 'At the counter',
  'on_bus': 'On the bus',
  'reached': 'Reached the destination',
  'ready': 'Ready for collection',
  'collected': 'Collected',
  'unclaimed': 'Unclaimed',
  'cancelled': 'Cancelled',
};
String parcelStateLabel(String state) => parcelStateLabels[state] ?? state.replaceAll('_', ' ');

const parcelCategories = {
  'documents': 'Documents',
  'clothes': 'Clothes',
  'food': 'Food',
  'electronics': 'Electronics',
  'medicines': 'Medicines',
  'gifts': 'Gifts',
  'other': 'Other',
};

/// A band's key is its heaviest weight in kg.
const parcelWeightBands = ['2', '5', '10', '20'];
String parcelBandLabel(String band) => 'up to $band kg';

const parcelSizes = {'backpack': 'Fits a backpack', 'box': 'A box'};

/// PARCEL_RULES, as far as the app checks them.
abstract final class ParcelRules {
  static const contentsMin = 3, contentsMax = 80, bookingDays = 7, collectOtpDigits = 6;

  /// Enough digits to show a value is over the limit, instead of cutting it down to one under.
  static const valueDigitsMax = 7;

  /// How often an open parcel or tracking page re-checks while the app is on screen.
  static const poll = Duration(seconds: 30);
}

DateTime? _time(Object? v) => v == null ? null : DateTime.tryParse('$v');

class ParcelCounter {
  const ParcelCounter(this.name, this.address, this.hours, this.phone);
  final String name, address, hours;

  /// Empty on the public tracking page.
  final String phone;
  factory ParcelCounter.fromJson(Json j) => ParcelCounter('${j['name']}', '${j['address']}', '${j['hours']}', '${j['phone'] ?? ''}');
}

ParcelCounter? _counter(Object? v) => v is Map ? ParcelCounter.fromJson(Map<String, dynamic>.from(v)) : null;

/// A bus a parcel can be booked on.
class ParcelDeparture {
  const ParcelDeparture({
    required this.busId,
    required this.from,
    required this.to,
    required this.departIso,
    required this.departAt,
    required this.cutoffAt,
    required this.readyAt,
    required this.fromCounter,
    required this.toCounter,
  });
  final String busId, from, to;

  /// As the API wrote it: the quote sends it back unchanged.
  final String departIso;
  final DateTime departAt, cutoffAt, readyAt;
  final ParcelCounter fromCounter, toCounter;

  /// Two operators' buses can leave at the same time, and bus ids repeat across days.
  String get key => '$busId@$departIso';

  factory ParcelDeparture.fromJson(Json j) => ParcelDeparture(
        busId: '${j['busId']}',
        from: '${j['from']}',
        to: '${j['to']}',
        departIso: '${j['departAt']}',
        departAt: DateTime.parse('${j['departAt']}'),
        cutoffAt: DateTime.parse('${j['cutoffAt']}'),
        readyAt: DateTime.parse('${j['readyAt']}'),
        fromCounter: ParcelCounter.fromJson(j['fromCounter'] as Json),
        toCounter: ParcelCounter.fromJson(j['toCounter'] as Json),
      );
}

/// What the sender agrees to; its version goes back with the booking.
class ParcelDeclaration {
  const ParcelDeclaration(this.version, this.text, this.prohibited);
  final String version, text;
  final List<String> prohibited;
  factory ParcelDeclaration.fromJson(Json j) =>
      ParcelDeclaration('${j['version']}', '${j['text']}', [for (final x in (j['prohibited'] as List?) ?? const []) '$x']);
}

/// GET /parcels/options.
class ParcelOptions {
  const ParcelOptions(this.departures, this.declaration);
  final List<ParcelDeparture> departures;
  final ParcelDeclaration declaration;
  factory ParcelOptions.fromJson(Json j) => ParcelOptions(
        [for (final d in (j['departures'] as List?) ?? const []) ParcelDeparture.fromJson(d as Json)],
        ParcelDeclaration.fromJson(j['declaration'] as Json),
      );
}

class ParcelEvent {
  const ParcelEvent(this.state, this.at, this.note);
  final String state;
  final DateTime at;

  /// A staff note for the sender; never on the tracking page.
  final String? note;
  factory ParcelEvent.fromJson(Json j) => ParcelEvent('${j['state']}', DateTime.parse('${j['at']}'), j['note'] as String?);
}

List<ParcelEvent> _events(Object? v) => [for (final e in (v as List?) ?? const []) ParcelEvent.fromJson(e as Json)];

/// GET /bookings/:id/parcel: the sender's parcel, with the collection code while it's ready.
class Parcel {
  const Parcel({
    required this.bookingId,
    required this.lr,
    required this.state,
    required this.from,
    required this.to,
    required this.departAt,
    required this.readyAt,
    required this.holdUntil,
    required this.fromCounter,
    required this.toCounter,
    required this.contents,
    required this.receiverName,
    required this.receiverPhone,
    required this.liability,
    required this.events,
    required this.collectOtp,
    required this.simulated,
  });
  final String bookingId, lr, state, from, to, contents, receiverName, receiverPhone;
  final DateTime? departAt, readyAt, holdUntil;
  final ParcelCounter? fromCounter, toCounter;
  final int liability;
  final List<ParcelEvent> events;

  /// Only here, and only while ready: never in booking lines, notifications or shared text.
  final String? collectOtp;

  /// The demo moves parcels by the timetable: say so.
  final bool simulated;

  factory Parcel.fromJson(Json j) => Parcel(
        bookingId: '${j['bookingId']}',
        lr: '${j['lr']}',
        state: '${j['state']}',
        from: '${j['from']}',
        to: '${j['to']}',
        departAt: _time(j['departAt']),
        readyAt: _time(j['readyAt']),
        holdUntil: _time(j['holdUntil']),
        fromCounter: _counter(j['fromCounter']),
        toCounter: _counter(j['toCounter']),
        contents: '${j['contents'] ?? ''}',
        receiverName: '${(j['receiver'] as Map?)?['name'] ?? ''}',
        receiverPhone: '${(j['receiver'] as Map?)?['phone'] ?? ''}',
        liability: (j['liability'] as num?)?.round() ?? 0,
        events: _events(j['events']),
        collectOtp: j['collectOtp'] as String?,
        simulated: j['simulated'] == true,
      );
}

/// GET /track/:lr: for whoever has the LR number. First names only, no code.
class ParcelTracking {
  const ParcelTracking({
    required this.lr,
    required this.state,
    required this.from,
    required this.to,
    required this.departAt,
    required this.readyAt,
    required this.holdUntil,
    required this.sender,
    required this.receiver,
    required this.collectAt,
    required this.events,
    required this.simulated,
  });
  final String lr, state, from, to;
  final DateTime? departAt, readyAt, holdUntil;

  /// First names; null once that person's data was erased.
  final String? sender, receiver;
  final ParcelCounter? collectAt;
  final List<ParcelEvent> events;
  final bool simulated;

  factory ParcelTracking.fromJson(Json j) => ParcelTracking(
        lr: '${j['lr']}',
        state: '${j['state']}',
        from: '${j['from']}',
        to: '${j['to']}',
        departAt: _time(j['departAt']),
        readyAt: _time(j['readyAt']),
        holdUntil: _time(j['holdUntil']),
        sender: j['sender'] as String?,
        receiver: j['receiver'] as String?,
        collectAt: _counter(j['collectAt']),
        events: _events(j['events']),
        simulated: j['simulated'] == true,
      );
}
