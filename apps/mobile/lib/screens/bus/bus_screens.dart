// Bus: search (cities from /config) → results (date strip, filters, sort) → seat map
// (seat prices from the API, total from POST /quotes) → checkout. Mirrors the website's BusScreens.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../core/bus_changes.dart';
import '../../core/cancellation.dart';
import '../../state/catalog.dart';
import '../../core/format.dart';
import '../../state/checkout.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../../core/services.dart';

/// Date strip on the results page: days shown, and how many before the searched date.
const dateStripDays = 7;
const dateStripBefore = 3;
/// Most seats one booking can hold.
const maxSeats = 6;
const _genderLabel = {'female': 'Female', 'male': 'Male', 'other': 'Other'};
/// "Highly rated" filter threshold.
const highRating = 4.3;

String busSearchPath(String from, String to, DateTime date) =>
    Uri(path: '/bus/search', queryParameters: {'from': from, 'to': to, 'date': isoDate(date)}).toString();

DateTime _today() {
  final n = DateTime.now();
  return DateTime(n.year, n.month, n.day);
}

DateTime parseIso(String? s, DateTime fallback) => DateTime.tryParse(s ?? '') ?? fallback;

/* ───────────── /bus ───────────── */

class BusScreen extends ConsumerStatefulWidget {
  const BusScreen({super.key});
  @override
  ConsumerState<BusScreen> createState() => _BusScreenState();
}

class _BusScreenState extends ConsumerState<BusScreen> {
  String? _from, _to;
  DateTime _date = _today().add(const Duration(days: 1));

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final config = ref.watch(configProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Bus tickets')),
      body: config.when(
        loading: () => const ScreenList(children: [Skeleton(height: 260)]),
        error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(configProvider))]),
        data: (cfg) {
          final cities = cfg.cities.map((x) => x.name).toList();
          final from = _from ?? (cities.contains('Chennai') ? 'Chennai' : cities.firstOrNull);
          final to = _to ?? cities.firstWhere((x) => x != from, orElse: () => '');
          final faqs = cfg.faqs.where((f) => f.category == 'Bus' || f.category == 'Payments').toList();
          return ScreenList(children: [
            Text('2,500+ operators, live seat maps, women-only seats and instant refunds.', style: TextStyle(color: c.fgMuted)),
            const SizedBox(height: 14),
            Panel(
              highlighted: true,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(
                    child: Column(children: [
                      _CityField(label: 'From', value: from, cities: cities, onChanged: (v) => setState(() => _from = v)),
                      const SizedBox(height: 10),
                      _CityField(label: 'To', value: to.isEmpty ? null : to, cities: cities.where((x) => x != from).toList(), onChanged: (v) => setState(() => _to = v)),
                    ]),
                  ),
                  const SizedBox(width: 8),
                  IconButton.outlined(
                    tooltip: 'Swap cities',
                    icon: const Icon(Icons.swap_vert),
                    onPressed: () => setState(() {
                      _from = to;
                      _to = from;
                    }),
                  ),
                ]),
                const SizedBox(height: 10),
                _DateField(label: 'Date of journey', date: _date, first: _today(), onChanged: (d) => setState(() => _date = d)),
                const SizedBox(height: 8),
                Wrap(spacing: 8, children: [
                  for (final (label, days) in [('Today', 0), ('Tomorrow', 1), ('Day after', 2)])
                    ChoiceChip(
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      label: Text(label),
                      selected: _date == _today().add(Duration(days: days)),
                      onSelected: (_) => setState(() => _date = _today().add(Duration(days: days))),
                    ),
                ]),
                const SizedBox(height: 14),
                GoldButton(
                  label: 'Search buses',
                  icon: Icons.search,
                  onPressed: from == null || to.isEmpty || from == to ? null : () => context.push(busSearchPath(from, to, _date)),
                ),
              ]),
            ),
            if (cfg.popularRoutes.isNotEmpty) ...[
              const SizedBox(height: 28),
              const SectionTitle('Where India travels by bus', eyebrow: 'Popular routes'),
              for (final r in cfg.popularRoutes)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Panel(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    onTap: () => context.push(busSearchPath(r.from, r.to, _today().add(const Duration(days: 1)))),
                    child: Row(children: [
                      Icon(Icons.directions_bus, color: c.accent, size: 20),
                      const SizedBox(width: 12),
                      Expanded(child: Text('${r.from}  →  ${r.to}', style: const TextStyle(fontWeight: FontWeight.w600))),
                      Text('Tomorrow', style: TextStyle(color: c.fgSubtle, fontSize: 12)),
                      Icon(Icons.chevron_right, color: c.fgSubtle),
                    ]),
                  ),
                ),
            ],
            const SizedBox(height: 20),
            const SectionTitle('Every detail before you pay', eyebrow: 'Why QuikFly bus'),
            for (final (icon, title, text) in const [
              (Icons.event_seat, 'Choose your seat', 'Live seat layout with lower and upper berth prices.'),
              (Icons.place, 'Exact boarding points', 'Landmarks and timings for every pickup point.'),
              (Icons.woman, 'Women-only seats', 'Seats reserved for women travellers, clearly marked.'),
              (Icons.replay, 'Instant refunds', 'Cancel online, refund to wallet instantly.'),
            ])
              ListTile(contentPadding: EdgeInsets.zero, leading: Icon(icon, color: c.accent), title: Text(title), subtitle: Text(text)),
            if (faqs.isNotEmpty) ...[
              const SizedBox(height: 16),
              const SectionTitle('Bus booking help', eyebrow: 'FAQ'),
              FaqList(faqs),
            ],
          ]);
        },
      ),
    );
  }
}

class _CityField extends StatelessWidget {
  const _CityField({required this.label, required this.value, required this.cities, required this.onChanged});
  final String label;
  final String? value;
  final List<String> cities;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => DropdownButtonFormField<String>(
        initialValue: cities.contains(value) ? value : null,
        isExpanded: true,
        decoration: InputDecoration(labelText: label),
        items: [for (final c in cities) DropdownMenuItem(value: c, child: Text(c))],
        onChanged: (v) => v == null ? null : onChanged(v),
      );
}

/// A date input that opens the platform date picker.
class _DateField extends StatelessWidget {
  const _DateField({required this.label, required this.date, required this.first, required this.onChanged});
  final String label;
  final DateTime date, first;
  final ValueChanged<DateTime> onChanged;

  @override
  Widget build(BuildContext context) => DateField(label: label, date: date, first: first, onChanged: onChanged);
}

class DateField extends StatelessWidget {
  const DateField({super.key, required this.label, required this.date, required this.first, required this.onChanged, this.last});
  final String label;
  final DateTime date, first;
  final DateTime? last;
  final ValueChanged<DateTime> onChanged;

  @override
  Widget build(BuildContext context) => InkWell(
        borderRadius: BorderRadius.circular(Brand.radiusField),
        onTap: () async {
          final d = await showDatePicker(
            context: context,
            initialDate: date.isBefore(first) ? first : date,
            firstDate: first,
            lastDate: last ?? first.add(const Duration(days: 180)),
          );
          if (d != null) onChanged(d);
        },
        child: InputDecorator(
          decoration: InputDecoration(labelText: label, suffixIcon: const Icon(Icons.calendar_today, size: 18)),
          child: Text(shortDate(date)),
        ),
      );
}

/// Expandable questions and answers.
class FaqList extends StatelessWidget {
  const FaqList(this.faqs, {super.key});
  final List<Faq> faqs;
  @override
  Widget build(BuildContext context) => Panel(
        padding: EdgeInsets.zero,
        child: Column(children: [
          for (final f in faqs)
            Theme(
              data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                title: Text(f.q, style: const TextStyle(fontWeight: FontWeight.w600)),
                childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                expandedAlignment: Alignment.centerLeft,
                children: [Text(f.a, style: TextStyle(color: context.qf.fgMuted))],
              ),
            ),
        ]),
      );
}

/* ───────────── /bus/search ───────────── */

enum _Slot {
  early('Before 6 AM', Icons.wb_twilight),
  morning('6 AM – 12 PM', Icons.wb_sunny_outlined),
  afternoon('12 PM – 6 PM', Icons.wb_cloudy_outlined),
  night('After 6 PM', Icons.nightlight_outlined);

  const _Slot(this.label, this.icon);
  final String label;
  final IconData icon;
  bool has(int hour) => switch (this) {
        early => hour < 6,
        morning => hour >= 6 && hour < 12,
        afternoon => hour >= 12 && hour < 18,
        night => hour >= 18,
      };
}

enum _Sort { depart, price, rating }

final _busesProvider = FutureProvider.family<List<Bus>, (String, String, String)>(
    (ref, a) => ref.watch(apiProvider).buses(a.$1, a.$2, a.$3));

class BusResultsScreen extends ConsumerStatefulWidget {
  const BusResultsScreen({super.key, required this.from, required this.to, required this.date, this.changeId});
  final String from, to;
  final DateTime date;

  /// Moving this bus booking to another bus or date (from My Trips); null for a new booking.
  final String? changeId;
  @override
  ConsumerState<BusResultsScreen> createState() => _BusResultsScreenState();
}

class _BusResultsScreenState extends ConsumerState<BusResultsScreen> {
  late DateTime _date = widget.date;
  final _slots = <_Slot>{};
  final _types = <String>{};
  final _ops = <String>{};
  bool _rated = false;
  int? _maxPrice;
  var _sort = _Sort.depart;

  int get _activeCount => _slots.length + _types.length + _ops.length + (_rated ? 1 : 0) + (_maxPrice != null ? 1 : 0);

  void _clear() => setState(() {
        _slots.clear();
        _types.clear();
        _ops.clear();
        _rated = false;
        _maxPrice = null;
      });

  List<Bus> _apply(List<Bus> all) {
    var l = all.where((b) {
      final h = int.tryParse(b.depart.split(':').first) ?? 0;
      if (_slots.isNotEmpty && !_slots.any((s) => s.has(h))) return false;
      if (_types.contains('AC') && !b.ac) return false;
      if (_types.contains('Non AC') && b.ac) return false;
      if (_types.contains('Sleeper') && !b.sleeper) return false;
      if (_types.contains('Seater') && b.sleeper) return false;
      if (_ops.isNotEmpty && !_ops.contains(b.operator)) return false;
      if (_rated && b.rating < highRating) return false;
      if (_maxPrice != null && b.fare > _maxPrice!) return false;
      return true;
    }).toList();
    l.sort((a, b) => switch (_sort) {
          _Sort.price => a.fare.compareTo(b.fare),
          _Sort.rating => b.rating.compareTo(a.rating),
          _Sort.depart => a.depart.compareTo(b.depart),
        });
    return l;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final buses = ref.watch(_busesProvider((widget.from, widget.to, isoDate(_date))));
    final change = widget.changeId == null
        ? null
        : (ref.watch(bookingsProvider).value ?? const <Booking>[])
            .where((b) => b.id == widget.changeId && b.service == ServiceKey.bus && b.status == BookingStatus.confirmed)
            .firstOrNull;
    final today = _today();
    var stripStart = _date.subtract(const Duration(days: dateStripBefore));
    if (stripStart.isBefore(today)) stripStart = today;
    final days = [for (var i = 0; i < dateStripDays; i++) stripStart.add(Duration(days: i))];

    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${widget.from} → ${widget.to}', style: const TextStyle(fontSize: 17)),
          Text(shortDate(_date), style: TextStyle(color: c.fgMuted, fontSize: 12.5, fontWeight: FontWeight.w400)),
        ]),
      ),
      body: Column(children: [
        if (change != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(Brand.gutter, 8, Brand.gutter, 0),
            child: Panel(
              highlighted: true,
              child: Text(
                'Changing booking ${change.id}: pick ${change.seats.length} seat${change.seats.length > 1 ? 's' : ''} on another bus or date. '
                'The fare difference is settled when you confirm. A ticket can be changed once.',
                style: TextStyle(color: c.fgSoft, fontSize: 13),
              ),
            ),
          ),
        // Date strip
        SizedBox(
          height: 56,
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: Brand.gutter, vertical: 6),
            scrollDirection: Axis.horizontal,
            itemCount: days.length,
            separatorBuilder: (_, _) => const SizedBox(width: 6),
            itemBuilder: (_, i) {
              final d = days[i];
              final on = d == _date;
              return ChoiceChip(
                showCheckmark: false,
                selected: on,
                selectedColor: Brand.gold,
                labelStyle: TextStyle(color: on ? Brand.onGold : c.fgSoft, fontWeight: on ? FontWeight.w700 : FontWeight.w500),
                label: Text(shortDate(d)),
                onSelected: (_) => setState(() => _date = d),
              );
            },
          ),
        ),
        Expanded(
          child: buses.when(
            loading: () => const ScreenList(children: [Skeleton(height: 130), SizedBox(height: 10), Skeleton(height: 130), SizedBox(height: 10), Skeleton(height: 130)]),
            error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(_busesProvider))]),
            data: (all) {
              final shown = _apply(all);
              return ScreenList(children: [
                Row(children: [
                  Expanded(child: Text('${shown.length} bus${shown.length == 1 ? '' : 'es'}', style: const TextStyle(fontWeight: FontWeight.w700))),
                  ActionChip(
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    avatar: Icon(Icons.tune, size: 16, color: c.accent),
                    label: Text(_activeCount > 0 ? 'Filters ($_activeCount)' : 'Filters'),
                    onPressed: () => _filters(all),
                  ),
                ]),
                const SizedBox(height: 8),
                SegmentedButton<_Sort>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(value: _Sort.depart, label: Text('Departure')),
                    ButtonSegment(value: _Sort.price, label: Text('Cheapest')),
                    ButtonSegment(value: _Sort.rating, label: Text('Top rated')),
                  ],
                  selected: {_sort},
                  onSelectionChanged: (s) => setState(() => _sort = s.first),
                ),
                const SizedBox(height: 12),
                if (shown.isEmpty)
                  EmptyState(
                    icon: Icons.directions_bus,
                    title: all.isEmpty ? 'No buses on this date' : 'No buses match these filters',
                    action: all.isEmpty ? null : OutlinedButton(onPressed: _clear, child: const Text('Clear filters')),
                  )
                else
                  for (final b in shown)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _BusCard(bus: b, from: widget.from, to: widget.to, date: _date, change: change),
                    ),
              ]);
            },
          ),
        ),
      ]),
    );
  }

  void _filters(List<Bus> all) {
    final operators = {for (final b in all) b.operator}.toList()..sort();
    final top = all.isEmpty ? 3000 : all.map((b) => b.fare).reduce((a, b) => a > b ? a : b);
    final bottom = all.isEmpty ? 0 : all.map((b) => b.fare).reduce((a, b) => a < b ? a : b);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(builder: (ctx, setSheet) {
        void upd(VoidCallback f) {
          setState(f);
          setSheet(() {});
        }

        final c = ctx.qf;
        final maxPrice = (_maxPrice ?? top).clamp(bottom, top);
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.8,
          maxChildSize: 0.95,
          builder: (_, scroll) => ListView(controller: scroll, padding: const EdgeInsets.fromLTRB(Brand.gutter, 0, Brand.gutter, 24), children: [
            Row(children: [
              Text('Filters', style: Theme.of(ctx).textTheme.titleLarge),
              const Spacer(),
              if (_activeCount > 0) TextButton(onPressed: () => upd(_clear), child: Text('Clear all ($_activeCount)')),
            ]),
            const SizedBox(height: 8),
            Text('Departure time', style: TextStyle(color: c.fgMuted, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final s in _Slot.values)
                FilterChip(
                  avatar: Icon(s.icon, size: 16),
                  label: Text(s.label),
                  selected: _slots.contains(s),
                  onSelected: (on) => upd(() => on ? _slots.add(s) : _slots.remove(s)),
                ),
            ]),
            const SizedBox(height: 16),
            Text('Bus type', style: TextStyle(color: c.fgMuted, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final t in const ['AC', 'Non AC', 'Sleeper', 'Seater'])
                FilterChip(label: Text(t), selected: _types.contains(t), onSelected: (on) => upd(() => on ? _types.add(t) : _types.remove(t))),
            ]),
            const SizedBox(height: 16),
            Row(children: [
              Text('Max price', style: TextStyle(color: c.fgMuted, fontWeight: FontWeight.w600)),
              const Spacer(),
              Text(inr(maxPrice), style: TextStyle(color: c.accent, fontWeight: FontWeight.w700)),
            ]),
            if (top > bottom)
              Slider(
                value: maxPrice.toDouble(),
                min: bottom.toDouble(),
                max: top.toDouble(),
                divisions: ((top - bottom) / 50).ceil().clamp(1, 100),
                onChanged: (v) => upd(() => _maxPrice = v.round() >= top ? null : v.round()),
              ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Highly rated (4.3+)'),
              value: _rated,
              onChanged: (v) => upd(() => _rated = v),
            ),
            const SizedBox(height: 8),
            Text('Operators', style: TextStyle(color: c.fgMuted, fontWeight: FontWeight.w600)),
            for (final o in operators)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                title: Text(o),
                value: _ops.contains(o),
                onChanged: (on) => upd(() => on == true ? _ops.add(o) : _ops.remove(o)),
              ),
            const SizedBox(height: 12),
            GoldButton(label: 'Show buses', onPressed: () => Navigator.pop(ctx)),
          ]),
        );
      }),
    );
  }
}

class _BusCard extends StatelessWidget {
  const _BusCard({required this.bus, required this.from, required this.to, required this.date, this.change});
  final Bus bus;
  final String from, to;
  final DateTime date;
  final Booking? change;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final b = bus;
    final own = b.operator == 'QuikFly Travels';
    return Panel(
      highlighted: own,
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => SeatScreen(bus: b, from: from, to: to, date: date, change: change))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text(b.operator, style: const TextStyle(fontWeight: FontWeight.w700)),
                if (own) const Pill('OWN FLEET'),
              ]),
              Text(b.type, style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
            ]),
          ),
          Pill(b.rating.toStringAsFixed(1), color: c.success, icon: Icons.star),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(b.depart, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
            Text(from, style: TextStyle(color: c.fgSubtle, fontSize: 12)),
          ]),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Column(children: [
                Row(children: [
                  Container(width: 7, height: 7, decoration: BoxDecoration(color: c.success, shape: BoxShape.circle)),
                  Expanded(child: Container(height: 1, color: c.border)),
                  Container(width: 7, height: 7, decoration: const BoxDecoration(color: Brand.gold, shape: BoxShape.circle)),
                ]),
                const SizedBox(height: 3),
                Text(b.duration, style: TextStyle(color: c.fgSubtle, fontSize: 11.5)),
              ]),
            ),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(b.arrive, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
            Text(to, style: TextStyle(color: c.fgSubtle, fontSize: 12)),
          ]),
        ]),
        const SizedBox(height: 10),
        Divider(color: c.border),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(
            child: Text('${b.seatsLeft} seats left${b.amenities.isNotEmpty ? ' · ${b.amenities.take(2).join(' · ')}' : ''}',
                style: TextStyle(color: b.seatsLeft < 10 ? c.warning : c.fgMuted, fontSize: 12.5)),
          ),
          Text('from ', style: TextStyle(color: c.fgSubtle, fontSize: 12)),
          Text(inr(b.fare), style: TextStyle(color: c.accent, fontWeight: FontWeight.w700, fontSize: 18)),
        ]),
      ]),
    );
  }
}

/* ───────────── seat map ───────────── */

String _addMin(String hhmm, int m) {
  final p = hhmm.split(':').map((x) => int.tryParse(x) ?? 0).toList();
  final t = (p[0] * 60 + p[1] + m) % 1440;
  return '${(t ~/ 60).toString().padLeft(2, '0')}:${(t % 60).toString().padLeft(2, '0')}';
}

class SeatScreen extends ConsumerStatefulWidget {
  const SeatScreen({super.key, required this.bus, required this.from, required this.to, required this.date, this.change});
  final Bus bus;
  final String from, to;
  final DateTime date;

  /// Change mode: the booking moving to this bus (same number of seats and travellers).
  final Booking? change;
  @override
  ConsumerState<SeatScreen> createState() => _SeatScreenState();
}

class _SeatScreenState extends ConsumerState<SeatScreen> {
  List<Seat>? _seats;
  String? _err;
  final _picked = <String>[];

  /// Who sits in each picked seat; women-only seats need 'female' (the API checks too).
  final _genders = <String, String>{};
  var _deck = 'lower';
  int _boarding = 0, _dropping = 0;
  late final LiveQuote _live = LiveQuote(ref.read(apiProvider))..addListener(() => setState(() {}));
  bool _proceeding = false;

  Bus get _bus => widget.bus;
  int get _maxSeats => widget.change?.seats.length ?? maxSeats;
  List<String> get _drops => ['${widget.to} – Main Bus Stand', '${widget.to} – Ring Road', '${widget.to} – City Center'];
  List<String> get _bTimes => [_bus.depart, _addMin(_bus.depart, 20), _addMin(_bus.depart, 45)];
  List<String> get _dTimes => [for (var i = 0; i < 3; i++) _addMin(_bus.arrive, i * 15)];

  Map<String, Object?>? get _request => _picked.isEmpty
      ? null
      : {
          'service': 'bus', 'busId': _bus.id, 'from': widget.from, 'to': widget.to, 'date': isoDate(widget.date), 'seatIds': [..._picked],
          if (_picked.every(_genders.containsKey)) 'genders': [for (final id in _picked) _genders[id]],
        };

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _live.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _err = null);
    try {
      final s = await ref.read(apiProvider).seats(_bus.id, widget.from, widget.to, isoDate(widget.date));
      if (mounted) setState(() => _seats = s);
    } catch (e) {
      if (mounted) setState(() => _err = errorText(e));
    }
  }

  void _toggle(Seat s) {
    setState(() {
      if (_picked.contains(s.id)) {
        _picked.remove(s.id);
      } else if (_picked.length >= _maxSeats) {
        toast(context, widget.change != null ? 'Pick $_maxSeats seat${_maxSeats > 1 ? 's' : ''}, one for each traveller.' : 'You can book up to $maxSeats seats at a time.');
      } else {
        // A change keeps the same travellers: each new seat takes the next traveller's gender.
        final g = s.ladies ? 'female' : widget.change?.seats.elementAtOrNull(_picked.length)?.gender;
        _picked.add(s.id);
        if (g != null) _genders[s.id] = g;
      }
    });
    _live.update(_allNamed ? _request : null);
  }

  bool get _allNamed => _picked.isNotEmpty && _picked.every(_genders.containsKey);

  void _setGender(String seatId, String g) {
    setState(() => _genders[seatId] = g);
    _live.update(_allNamed ? _request : null);
  }

  List<(String, String)> _tripLines(List<Seat> seats) {
    final pts = _bus.boardingPoints;
    return [
      ('Date', shortDate(widget.date)),
      ('Departure', '${_bTimes[_boarding]} from ${pts.isEmpty ? widget.from : pts[_boarding.clamp(0, pts.length - 1)]}'),
      ('Arrival', '${_dTimes[_dropping]} at ${_drops[_dropping]}'),
      ('Seats', seats.map((s) => s.label).join(', ')),
    ];
  }

  /// Change mode: show the difference, then move the booking to these seats.
  Future<void> _change(Booking b, PriceQuote quote, List<Seat> seats) async {
    final s = ref.read(configProvider).value?.settings ?? const Settings({});
    final m = rescheduleAmounts(s, b, quote.total);
    final wallet = b.payment == 'wallet';
    final ok = await confirm(context,
        title: 'Change to this bus?',
        message: 'New total ${inr(quote.total)}${m.fee > 0 ? ' plus a ${inr(m.fee)} change fee' : ''}. '
            '${m.charge > 0 ? 'You pay ${inr(m.charge)} more${wallet ? ' from your wallet' : ''}.' : m.refund > 0 ? '${inr(m.refund)} ${wallet ? 'comes back to your wallet' : 'is due back to you'}.' : 'Nothing more to pay.'} '
            'A ticket can be changed once.',
        yes: 'Change bus');
    if (!ok || !mounted) return;
    final r = await ref.read(apiProvider).reschedule(b.id, quote.id, '${_bus.operator} · ${_bus.type}', _tripLines(seats));
    ref.invalidate(bookingsProvider);
    await ref.read(sessionProvider.notifier).refresh();
    if (!mounted) return;
    toast(context, 'Booking moved to ${_bus.operator}, ${shortDate(widget.date)} ${_bus.depart}. '
        '${r.charged > 0 ? 'Paid ${inr(r.charged)} more.' : r.refunded > 0 ? '${inr(r.refunded)} ${wallet ? 'is back in your wallet' : 'refund due'}.' : 'Same price.'}');
    context.go('/trips');
  }

  Future<void> _proceed() async {
    final seats = _seats!.where((s) => _picked.contains(s.id)).toList();
    setState(() => _proceeding = true);
    try {
      // Quotes book once, so checkout gets a fresh one.
      final quote = await _live.fresh(_request!);
      final change = widget.change;
      if (change != null) {
        await _change(change, quote, seats);
        if (mounted) setState(() => _proceeding = false);
        return;
      }
      ref.read(checkoutProvider.notifier).set(CheckoutDraft(
            service: ServiceKey.bus,
            title: '${widget.from} → ${widget.to}',
            subtitle: '${_bus.operator} · ${_bus.type}',
            image: serviceOf(ServiceKey.bus).image,
            summary: _tripLines(seats),
            quote: quote,
            travellers: [for (final s in seats) 'Seat ${s.label} · ${_genderLabel[_genders[s.id]] ?? ''}'],
            policy: cancelPolicyText(ref.read(configProvider).value?.settings ?? const Settings({}), ServiceKey.bus),
          ));
      if (mounted) context.push('/checkout');
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
    if (mounted) setState(() => _proceeding = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final seats = _seats;
    final chosen = (seats ?? const <Seat>[]).where((s) => _picked.contains(s.id)).toList();
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_bus.operator, style: const TextStyle(fontSize: 17)),
          Text('${_bus.depart} · ${_bus.type}', style: TextStyle(color: c.fgMuted, fontSize: 12.5, fontWeight: FontWeight.w400)),
        ]),
      ),
      body: _err != null
          ? ScreenList(children: [ErrorBox(_err!, onRetry: _load)])
          : seats == null
              ? const Center(child: CircularProgressIndicator())
              : ScreenList(children: [
                  // Single-deck (2+2 seater) buses have no deck switch.
                  if (seats.any((s) => s.deck == 'upper')) ...[
                    SegmentedButton<String>(
                      showSelectedIcon: false,
                      segments: [
                        for (final d in const ['lower', 'upper'])
                          ButtonSegment(
                            value: d,
                            label: Text('${d == 'lower' ? 'Lower' : 'Upper'} · ${_deckPrice(seats, d)}'),
                          ),
                      ],
                      selected: {_deck},
                      onSelectionChanged: (s) => setState(() => _deck = s.first),
                    ),
                    const SizedBox(height: 12),
                  ],
                  _Deck(seats: seats.where((s) => s.deck == _deck).toList(), picked: _picked, onTap: _toggle, driver: _deck == 'lower'),
                  const SizedBox(height: 10),
                  Wrap(spacing: 14, runSpacing: 6, children: [
                    _legend(c.borderStrong, null, 'Available'),
                    _legend(c.accent, Brand.gold, 'Selected'),
                    _legend(c.border, c.border, 'Sold'),
                    _legend(c.highlight.withValues(alpha: 0.5), c.border, 'Booked by a woman'),
                    _legend(c.highlight, null, 'Women only (next to a woman)'),
                  ]),
                  if (chosen.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Text('WHO SITS HERE?', style: TextStyle(color: c.fgMuted, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1)),
                    const SizedBox(height: 4),
                    Text('Seats next to a woman are for women only.', style: TextStyle(color: c.fgSubtle, fontSize: 12)),
                    const SizedBox(height: 8),
                    for (final s in chosen)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(children: [
                          SizedBox(width: 44, child: Text(s.label, style: const TextStyle(fontWeight: FontWeight.w600))),
                          Expanded(
                            child: Wrap(spacing: 6, runSpacing: 6, children: [
                              for (final g in s.ladies ? const ['female'] : const ['female', 'male', 'other'])
                                ChoiceChip(label: Text(_genderLabel[g]!), selected: _genders[s.id] == g, onSelected: (_) => _setGender(s.id, g)),
                            ]),
                          ),
                        ]),
                      ),
                  ],
                  const SizedBox(height: 20),
                  _points('Boarding point', [
                    for (var i = 0; i < _bus.boardingPoints.length && i < 3; i++) (_bus.boardingPoints[i], _bTimes[i]),
                  ], _boarding, (i) => setState(() => _boarding = i)),
                  const SizedBox(height: 12),
                  _points('Dropping point', [for (var i = 0; i < 3; i++) (_drops[i], _dTimes[i])], _dropping, (i) => setState(() => _dropping = i)),
                  const SizedBox(height: 90),
                ]),
      bottomNavigationBar: seats == null
          ? null
          : SafeArea(
              child: Container(
                padding: const EdgeInsets.fromLTRB(Brand.gutter, 10, Brand.gutter, 10),
                decoration: BoxDecoration(color: c.surface, border: Border(top: BorderSide(color: c.border))),
                child: Constrained(
                  child: Row(children: [
                    Expanded(
                      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(chosen.isEmpty ? (widget.change != null ? 'Select $_maxSeats seat${_maxSeats > 1 ? 's' : ''}' : 'Select up to $maxSeats seats') : !_allNamed ? 'Choose who sits in each seat' : 'Seats ${chosen.map((s) => s.label).join(', ')}',
                            maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
                        if (_live.loading)
                          const Padding(padding: EdgeInsets.only(top: 4), child: SizedBox(width: 80, child: LinearProgressIndicator()))
                        else if (_live.error != null)
                          Text(_live.error!, maxLines: 2, style: TextStyle(color: c.danger, fontSize: 12))
                        else if (_live.quote != null)
                          Text('${inr(_live.quote!.total)} incl. GST', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
                      ]),
                    ),
                    const SizedBox(width: 12),
                    GoldButton(
                      expand: false,
                      label: widget.change != null ? 'Change bus' : 'Proceed',
                      loading: _proceeding,
                      onPressed: chosen.isEmpty || !_allNamed || _live.loading || (widget.change != null && chosen.length != _maxSeats) ? null : _proceed,
                    ),
                  ]),
                ),
              ),
            ),
    );
  }

  /// Cheapest seat on a deck, from the API's seat prices.
  String _deckPrice(List<Seat> seats, String deck) {
    final p = seats.where((s) => s.deck == deck).map((s) => s.price);
    return p.isEmpty ? '–' : inr(p.reduce((a, b) => a < b ? a : b));
  }

  Widget _legend(Color border, Color? fill, String label) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 14, height: 14, decoration: BoxDecoration(color: fill, border: Border.all(color: border), borderRadius: BorderRadius.circular(3))),
        const SizedBox(width: 6),
        Text(label, style: TextStyle(color: context.qf.fgMuted, fontSize: 12)),
      ]);

  Widget _points(String title, List<(String, String)> items, int value, ValueChanged<int> onChanged) {
    final c = context.qf;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title.toUpperCase(), style: TextStyle(color: c.fgMuted, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1)),
      const SizedBox(height: 6),
      RadioGroup<int>(
        groupValue: value,
        onChanged: (v) => v == null ? null : onChanged(v),
        child: Column(children: [
          for (var i = 0; i < items.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Panel(
                highlighted: value == i,
                padding: EdgeInsets.zero,
                onTap: () => onChanged(i),
                child: RadioListTile<int>(
                  value: i,
                  dense: true,
                  title: Text(items[i].$1),
                  secondary: Text(items[i].$2, style: TextStyle(color: c.fgMuted)),
                ),
              ),
            ),
        ]),
      ),
    ]);
  }
}

class _Deck extends StatelessWidget {
  const _Deck({required this.seats, required this.picked, required this.onTap, required this.driver});
  final List<Seat> seats;
  final List<String> picked;
  final ValueChanged<Seat> onTap;
  final bool driver;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final rows = seats.isEmpty ? 0 : seats.map((s) => s.row).reduce((a, b) => a > b ? a : b) + 1;
    final four = seats.any((s) => s.col == 3);
    Seat? at(int row, int col) => seats.where((s) => s.row == row && s.col == col).firstOrNull;
    return Panel(
      child: Column(children: [
        if (driver)
          Align(
            alignment: Alignment.centerRight,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.radio_button_checked, size: 16, color: c.fgSubtle),
                const SizedBox(width: 4),
                Text('Driver', style: TextStyle(color: c.fgSubtle, fontSize: 11.5)),
              ]),
            ),
          ),
        for (var r = 0; r < rows; r++)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(children: [
              // Two seats, the aisle, then one seat (two on 2+2 buses): same layout as the website.
              Expanded(child: _cell(context, at(r, 0))),
              const SizedBox(width: 8),
              Expanded(child: _cell(context, at(r, 1))),
              const SizedBox(width: 28),
              Expanded(child: _cell(context, at(r, 2))),
              if (four) ...[const SizedBox(width: 8), Expanded(child: _cell(context, at(r, 3)))],
            ]),
          ),
      ]),
    );
  }

  Widget _cell(BuildContext context, Seat? s) {
    if (s == null) return const SizedBox(height: 56);
    final c = context.qf;
    final on = picked.contains(s.id);
    final byWoman = s.booked && s.bookedGender == 'female';
    final border = s.booked ? (byWoman ? c.highlight.withValues(alpha: 0.5) : c.border) : on ? c.accent : s.ladies ? c.highlight.withValues(alpha: 0.7) : c.borderStrong;
    final fg = s.booked ? c.fgFaint : on ? Brand.onGold : s.ladies ? c.highlight : c.fgSoft;
    return Semantics(
      button: true,
      selected: on,
      label: 'Seat ${s.label}${s.booked ? (byWoman ? ', sold, booked by a woman' : ', sold') : s.ladies ? ', women only' : ''}, ${inr(s.price)}',
      child: Material(
        color: s.booked ? c.border.withValues(alpha: 0.6) : on ? Brand.gold : Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8), side: BorderSide(color: border)),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: s.booked ? null : () => onTap(s),
          child: SizedBox(
            height: s.sleeper ? 72 : 56,
            child: Column(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Container(width: 22, height: 3, decoration: BoxDecoration(color: fg.withValues(alpha: 0.45), borderRadius: BorderRadius.circular(2))),
              ),
              Text(s.booked ? 'Sold' : s.label, style: TextStyle(color: fg, fontSize: 11.5, fontWeight: on ? FontWeight.w700 : FontWeight.w500)),
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(s.booked ? '' : inr(s.price), style: TextStyle(color: fg.withValues(alpha: 0.8), fontSize: 10)),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
