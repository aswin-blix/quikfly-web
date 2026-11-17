// Rent a car: city, pickup/return and self-drive / chauffeur → cars (filters) → car page with
// km plan, protection and delivery, priced by POST /quotes → checkout (self-drive needs a
// licence). Mirrors the website's RentScreens; the list shows rates, the API prices the trip.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../api/models.dart';
import '../../core/format.dart';
import '../../state/catalog.dart';
import '../../state/checkout.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';

/// Default pickup and return times (apps/web/src/lib/rentals.ts RENTAL_DEFAULTS).
abstract final class RentalDefaults {
  /// Earliest pickup, in hours from now.
  static const leadHours = 3;
  /// Hub opening hours; pickups outside them move to the next morning.
  static const openHour = 8, closeHour = 20, morningHour = 10;
  static const durationHours = 24;
  /// Shortest billable rental and longest booking (BOOKING_LIMITS in pricing.ts).
  static const minHours = 4, maxDays = 30;
}

/// Km plans and protection labels (RENT_PLANS / RENT_PROTECTION_LABEL in pricing.ts).
const rentPlans = {'limited': ('140 km/day', '₹12/km beyond limit'), 'unlimited': ('Unlimited km', 'Drive as much as you like')};
const rentProtection = {'standard': ('Standard', 'You pay up to ₹10,000 for damage'), 'peace': ('Peace of mind', 'You pay up to ₹2,000 for damage')};

(DateTime, DateTime) defaultRentalWindow([DateTime? now]) {
  final n = now ?? DateTime.now();
  var s = n.add(const Duration(hours: RentalDefaults.leadHours));
  s = DateTime(s.year, s.month, s.day, s.hour);
  if (s.hour >= RentalDefaults.closeHour) {
    s = DateTime(s.year, s.month, s.day + 1, RentalDefaults.morningHour);
  } else if (s.hour < RentalDefaults.openHour) {
    s = DateTime(s.year, s.month, s.day, RentalDefaults.morningHour);
  }
  return (s, s.add(const Duration(hours: RentalDefaults.durationHours)));
}

/// "YYYY-MM-DDTHH:mm", the local date-time format the API's rent quotes take.
String localInput(DateTime d) => DateFormat("yyyy-MM-dd'T'HH:mm").format(d);

/// Billable hours (at least the minimum), for the "26 hrs · 2 days" summary.
int rentHours(DateTime a, DateTime b) {
  final h = (b.difference(a).inMinutes / 60).ceil();
  return h < RentalDefaults.minHours ? RentalDefaults.minHours : h;
}

String carImage(RentalCar c) => const ['SUV', 'Luxury', 'MUV'].contains(c.category) ? 'assets/images/s4.jpg' : 'assets/images/s1.jpg';

/// The trip being planned, shared by the list and the car page.
class RentTrip {
  const RentTrip({required this.city, required this.start, required this.end, required this.self});
  final String city;
  final DateTime start, end;
  final bool self;
  bool get valid => end.isAfter(start) && end.difference(start).inDays <= RentalDefaults.maxDays;
  RentTrip copyWith({String? city, DateTime? start, DateTime? end, bool? self}) =>
      RentTrip(city: city ?? this.city, start: start ?? this.start, end: end ?? this.end, self: self ?? this.self);
}

class RentTripNotifier extends Notifier<RentTrip> {
  @override
  RentTrip build() {
    final (s, e) = defaultRentalWindow();
    return RentTrip(city: 'Chennai', start: s, end: e, self: true);
  }

  void set(RentTrip t) => state = t;
}

final rentTripProvider = NotifierProvider<RentTripNotifier, RentTrip>(RentTripNotifier.new);

Future<DateTime?> pickDateTime(BuildContext context, DateTime initial) async {
  final now = DateTime.now();
  final d = await showDatePicker(context: context, initialDate: initial.isBefore(now) ? now : initial, firstDate: now, lastDate: now.add(const Duration(days: 120)));
  if (d == null || !context.mounted) return null;
  final t = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(initial));
  if (t == null) return null;
  return DateTime(d.year, d.month, d.day, t.hour, t.minute);
}

/* ───────────── /rent ───────────── */

class RentScreen extends ConsumerStatefulWidget {
  const RentScreen({super.key});
  @override
  ConsumerState<RentScreen> createState() => _RentScreenState();
}

class _RentScreenState extends ConsumerState<RentScreen> {
  final _cats = <String>{};
  String _trans = 'any';
  final _fuel = <String>{};
  bool _seats7 = false;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final trip = ref.watch(rentTripProvider);
    final setTrip = ref.read(rentTripProvider.notifier).set;
    final cities = (ref.watch(configProvider).value?.cities ?? const <NamedItem>[]).map((x) => x.name).toList();
    final cars = ref.watch(carsProvider);
    final hours = rentHours(trip.start, trip.end);
    final days = (hours / 24).ceil().clamp(1, 999);

    Widget timeField(String label, DateTime v, ValueChanged<DateTime> on) => Expanded(
          child: InkWell(
            borderRadius: BorderRadius.circular(Brand.radiusField),
            onTap: () async {
              final d = await pickDateTime(context, v);
              if (d != null) on(d);
            },
            child: InputDecorator(decoration: InputDecoration(labelText: label), child: Text(dateTime(v), style: const TextStyle(fontSize: 13.5))),
          ),
        );

    return Scaffold(
      appBar: AppBar(title: const Text('Rent a car')),
      body: ScreenList(
        onRefresh: () async => ref.invalidate(carsProvider),
        children: [
          Text('Self-drive freedom or a chauffeur for the day. Doorstep delivery and flexible km plans.', style: TextStyle(color: c.fgMuted)),
          const SizedBox(height: 12),
          Panel(
            highlighted: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              SegmentedButton<bool>(
                showSelectedIcon: false,
                segments: const [ButtonSegment(value: true, label: Text('Self-drive')), ButtonSegment(value: false, label: Text('With driver'))],
                selected: {trip.self},
                onSelectionChanged: (s) => setTrip(trip.copyWith(self: s.first)),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: cities.contains(trip.city) ? trip.city : null,
                decoration: const InputDecoration(labelText: 'City'),
                items: [for (final x in cities) DropdownMenuItem(value: x, child: Text(x))],
                onChanged: (v) => v == null ? null : setTrip(trip.copyWith(city: v)),
              ),
              const SizedBox(height: 10),
              Row(children: [
                timeField('Pickup', trip.start, (d) => setTrip(trip.copyWith(start: d, end: d.isBefore(trip.end) ? null : d.add(const Duration(hours: 24))))),
                const SizedBox(width: 10),
                timeField('Return', trip.end, (d) => setTrip(trip.copyWith(end: d))),
              ]),
              if (!trip.valid)
                FormError(trip.end.isAfter(trip.start) ? 'Rentals can be up to ${RentalDefaults.maxDays} days.' : 'Return time must be after pickup.')
              else
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text('$hours hrs · $days day${days > 1 ? 's' : ''} · ${trip.self ? 'fuel not included' : 'fuel and driver included'}',
                      style: TextStyle(color: c.fgSubtle, fontSize: 12.5)),
                ),
            ]),
          ),
          const SizedBox(height: 14),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final cat in const ['Hatchback', 'Sedan', 'SUV', 'MUV', 'Luxury'])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(label: Text(cat), selected: _cats.contains(cat), onSelected: (on) => setState(() => on ? _cats.add(cat) : _cats.remove(cat))),
                ),
            ]),
          ),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final t in const ['any', 'Manual', 'Automatic'])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(label: Text(t == 'any' ? 'Any gearbox' : t), selected: _trans == t, onSelected: (_) => setState(() => _trans = t)),
                ),
              for (final f in const ['Petrol', 'Diesel', 'EV'])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(label: Text(f), selected: _fuel.contains(f), onSelected: (on) => setState(() => on ? _fuel.add(f) : _fuel.remove(f))),
                ),
              FilterChip(label: const Text('7+ seats'), selected: _seats7, onSelected: (v) => setState(() => _seats7 = v)),
            ]),
          ),
          const SizedBox(height: 12),
          ...cars.when(
            loading: () => const [Skeleton(height: 240), SizedBox(height: 12), Skeleton(height: 240)],
            error: (e, _) => [ErrorBox(errorText(e), onRetry: () => ref.invalidate(carsProvider))],
            data: (all) {
              final shown = all
                  .where((x) =>
                      (_cats.isEmpty || _cats.contains(x.category)) &&
                      (_trans == 'any' || x.transmission == _trans) &&
                      (_fuel.isEmpty || _fuel.contains(x.fuel)) &&
                      (!_seats7 || x.seats >= 7))
                  .toList();
              if (shown.isEmpty) return const [EmptyState(icon: Icons.directions_car, title: 'No cars match these filters')];
              return [
                for (final car in shown)
                  Padding(padding: const EdgeInsets.only(bottom: 12), child: _CarCard(car: car, trip: trip)),
              ];
            },
          ),
        ],
      ),
    );
  }
}

class _CarCard extends StatelessWidget {
  const _CarCard({required this.car, required this.trip});
  final RentalCar car;
  final RentTrip trip;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return Panel(
      padding: EdgeInsets.zero,
      onTap: trip.valid ? () => context.push('/rent/${car.id}') : null,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SizedBox(
          height: 140,
          child: Stack(fit: StackFit.expand, children: [
            Image.asset(carImage(car), fit: BoxFit.cover, semanticLabel: car.name),
            Positioned(left: 10, top: 10, child: _badge('${car.category} · ${car.year}')),
            Positioned(right: 10, top: 10, child: _badge('★ ${car.rating}')),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(car.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
            const SizedBox(height: 4),
            Text('${car.seats} seats · ${car.transmission} · ${car.fuel}', style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
            const SizedBox(height: 8),
            Wrap(spacing: 6, runSpacing: 6, children: [for (final f in car.features) Pill(f, color: c.fgMuted)]),
            const SizedBox(height: 10),
            Divider(color: c.border),
            Row(children: [
              Expanded(
                child: Text.rich(TextSpan(children: [
                  TextSpan(text: inr(car.pricePerHour), style: TextStyle(color: c.accent, fontWeight: FontWeight.w700, fontSize: 18)),
                  TextSpan(text: ' /hr', style: TextStyle(color: c.fgMuted)),
                  if (!trip.self) TextSpan(text: '  + driver ${inr(car.driverPerDay)}/day', style: TextStyle(color: c.fgMuted, fontSize: 12)),
                ])),
              ),
              GoldButton(label: 'Select', expand: false, onPressed: trip.valid ? () => context.push('/rent/${car.id}') : null),
            ]),
          ]),
        ),
      ]),
    );
  }

  // Badges sit on the photo, so they stay light-on-dark in both themes.
  Widget _badge(String s) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(6)),
        child: Text(s, style: const TextStyle(color: Colors.white, fontSize: 11.5)),
      );
}

/* ───────────── /rent/:id ───────────── */

class RentDetailScreen extends ConsumerStatefulWidget {
  const RentDetailScreen({super.key, required this.id});
  final String id;
  @override
  ConsumerState<RentDetailScreen> createState() => _RentDetailScreenState();
}

class _RentDetailScreenState extends ConsumerState<RentDetailScreen> {
  String _km = 'limited', _prot = 'standard';
  bool _doorstep = false;
  late final LiveQuote _live = LiveQuote(ref.read(apiProvider))..addListener(() => setState(() {}));
  bool _booking = false;

  Map<String, Object?> _request(RentalCar car, RentTrip t) => {
        'service': 'rent',
        'carId': car.id,
        'mode': t.self ? 'self' : 'driver',
        'start': localInput(t.start),
        'end': localInput(t.end),
        'kmPlan': _km,
        'protection': _prot,
        'doorstep': _doorstep,
      };

  @override
  void dispose() {
    _live.dispose();
    super.dispose();
  }

  Future<void> _book(RentalCar car, RentTrip t) async {
    setState(() => _booking = true);
    try {
      final quote = await _live.fresh(_request(car, t));
      ref.read(checkoutProvider.notifier).set(CheckoutDraft(
            service: ServiceKey.rent,
            title: '${car.name} · ${t.self ? 'Self-drive' : 'With driver'}',
            subtitle: '${t.city} · ${car.category}',
            image: carImage(car),
            summary: [
              ('Pickup', dateTime(t.start)),
              ('Return', dateTime(t.end)),
              ('Delivery', _doorstep ? 'Doorstep' : 'Self pickup · ${t.city} hub'),
              if (t.self) ('Plan', '${rentPlans[_km]!.$1} · ${rentProtection[_prot]!.$1}'),
            ],
            quote: quote,
            travellers: const ['Primary driver'],
            needsLicence: t.self,
            policy: 'Free cancellation up to 24 hours before pickup. Deposit refunded within 48 hours of return.',
          ));
      if (mounted) context.push('/checkout');
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
    if (mounted) setState(() => _booking = false);
  }

  @override
  Widget build(BuildContext context) {
    final car = ref.watch(carProvider(widget.id));
    final trip = ref.watch(rentTripProvider);
    return car.when(
      loading: () => Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(
        appBar: AppBar(title: const Text('Rental car')),
        body: ScreenList(children: [EmptyState(icon: Icons.directions_car, title: 'Car not found', message: errorText(e))]),
      ),
      data: (car) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _live.update(trip.valid ? _request(car, trip) : null));
        return _page(car, trip);
      },
    );
  }

  Widget _page(RentalCar car, RentTrip t) {
    final c = context.qf;
    final settings = ref.watch(configProvider).value?.settings ?? const Settings({});
    Widget group<T>(String title, T value, ValueChanged<T> on, List<(T, String, String, String)> options) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(title.toUpperCase(), style: TextStyle(color: c.fgMuted, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1)),
          const SizedBox(height: 8),
          for (final (v, label, sub, badge) in options)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Panel(
                highlighted: v == value,
                padding: const EdgeInsets.all(12),
                onTap: () => on(v),
                child: Row(children: [
                  Icon(v == value ? Icons.radio_button_checked : Icons.radio_button_off, color: v == value ? c.accent : c.fgSubtle, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
                      Text(sub, style: TextStyle(color: c.fgMuted, fontSize: 12)),
                    ]),
                  ),
                  Text(badge, style: TextStyle(color: c.accent, fontSize: 12.5, fontWeight: FontWeight.w600)),
                ]),
              ),
            ),
          const SizedBox(height: 8),
        ]);

    return Scaffold(
      appBar: AppBar(title: Text(car.name)),
      body: ScreenList(children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(Brand.radiusPanel),
          child: SizedBox(height: 190, child: Image.asset(carImage(car), fit: BoxFit.cover, semanticLabel: car.name)),
        ),
        const SizedBox(height: 10),
        Row(children: [
          Icon(Icons.star, size: 16, color: c.accent),
          const SizedBox(width: 4),
          Text('${car.rating} · ${car.trips} trips · ${car.year} model', style: TextStyle(color: c.fgMuted)),
        ]),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final (i, l) in [
            (Icons.person_outline, '${car.seats} seats'),
            (Icons.settings_outlined, car.transmission),
            (Icons.local_gas_station_outlined, car.fuel),
            (Icons.speed, car.category),
          ])
            Chip(avatar: Icon(i, size: 16, color: c.accent), label: Text(l)),
        ]),
        const SizedBox(height: 14),
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [Icon(Icons.place_outlined, size: 16, color: c.accent), const SizedBox(width: 6), Text(t.city)]),
            const SizedBox(height: 4),
            Row(children: [
              Icon(Icons.event, size: 16, color: c.accent),
              const SizedBox(width: 6),
              Expanded(child: Text('${dateTime(t.start)} → ${dateTime(t.end)}')),
            ]),
            const SizedBox(height: 4),
            Row(children: [Icon(Icons.key, size: 16, color: c.accent), const SizedBox(width: 6), Text(t.self ? 'Self-drive' : 'With driver')]),
          ]),
        ),
        const SizedBox(height: 16),
        if (t.self) ...[
          group<String>('Kilometre plan', _km, (v) => setState(() => _km = v), [
            for (final e in rentPlans.entries) (e.key, e.value.$1, e.value.$2, e.key == 'unlimited' ? '+${settings.rentUnlimitedKmExtraPercent}%' : 'Best value'),
          ]),
          group<String>('Damage protection', _prot, (v) => setState(() => _prot = v), [
            for (final e in rentProtection.entries)
              (e.key, e.value.$1, e.value.$2, '${inr(e.key == 'peace' ? settings.rentProtectionPeacePerDay : settings.rentProtectionStandardPerDay)}/day'),
          ]),
        ],
        group<bool>('Delivery', _doorstep, (v) => setState(() => _doorstep = v), [
          (false, 'Self pickup', 'QuikFly hub, ${t.city}', 'Free'),
          (true, 'Doorstep delivery', 'Delivered and collected at your address', inr(settings.rentDoorstepFee)),
        ]),
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(t.self ? 'Documents needed' : 'Your chauffeur', style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            for (final x in t.self
                ? const ['Driving licence (1+ year old)', 'Aadhaar or passport', 'Driver must be 21+']
                : const ['Verified, uniformed driver', 'Fuel and tolls on actuals', 'Night charge ₹250 after 10 PM'])
              Text('•  $x', style: TextStyle(color: c.fgSoft)),
            const SizedBox(height: 10),
            const Text('Features', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            for (final f in [...car.features, 'Sanitised before every trip', '24×7 roadside assistance']) Text('•  $f', style: TextStyle(color: c.fgSoft)),
          ]),
        ),
        const SizedBox(height: 16),
        Panel(
          highlighted: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (!t.valid)
              const FormError('Pick a return time after the pickup (on the previous screen).')
            else if (_live.error != null)
              FormError(_live.error)
            else if (_live.quote == null)
              const Center(child: Padding(padding: EdgeInsets.all(8), child: CircularProgressIndicator()))
            else ...[
              for (final l in _live.quote!.lines) KeyValue(l.label, inr(l.amount)),
              Divider(color: c.border),
              Row(children: [
                Text('Total', style: TextStyle(color: c.fgMuted)),
                const Spacer(),
                if (_live.loading) const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                const SizedBox(width: 8),
                Text(inr(_live.quote!.total), style: TextStyle(color: c.accent, fontSize: 22, fontWeight: FontWeight.w700)),
              ]),
            ],
            const SizedBox(height: 12),
            GoldButton(label: 'Continue to book', loading: _booking, onPressed: !t.valid || _live.loading || _live.quote == null ? null : () => _book(car, t)),
            const SizedBox(height: 6),
            Text('Free cancellation up to 24 hrs before pickup', textAlign: TextAlign.center, style: TextStyle(color: c.fgSubtle, fontSize: 11.5)),
          ]),
        ),
      ]),
    );
  }
}
