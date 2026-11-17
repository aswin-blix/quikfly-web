// Group travel: outstation round trip or local package, days and passengers → vehicles that
// seat everyone, each with an estimate from POST /quotes → compare up to 3 → checkout.
// Mirrors the website's TravelRentalsScreen.
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../core/format.dart';
import '../../state/catalog.dart';
import '../../state/checkout.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/counter.dart';
import '../../widgets/ui.dart';
import '../bus/bus_screens.dart' show DateField;

/// Longest group booking and most vehicles compared at once.
const groupMaxDays = 15, groupMaxPassengers = 45, compareMax = 3;

String vehicleImage(TravelVehicle v) => v.seats <= 7 ? 'assets/images/s4.jpg' : v.seats >= 26 ? 'assets/images/s2.jpg' : 'assets/images/s5.jpg';

class GroupScreen extends ConsumerStatefulWidget {
  const GroupScreen({super.key});
  @override
  ConsumerState<GroupScreen> createState() => _GroupScreenState();
}

class _GroupScreenState extends ConsumerState<GroupScreen> {
  bool _outstation = true;
  String? _destId;
  DateTime _date = DateTime.now().add(const Duration(days: 2));
  int _days = 2, _pax = 10;
  final _compare = <String>[];
  final _quotes = <String, PriceQuote>{};
  String? _quoteErr;
  bool _quoting = false;
  String? _booking;
  Timer? _debounce;
  String? _lastKey;
  int _seq = 0;

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Map<String, Object?> _request(TravelVehicle v) => {
        'service': 'rentals',
        'vehicleId': v.id,
        'trip': _outstation ? 'outstation' : 'local',
        if (_outstation) 'destinationId': _destId,
        'days': _days,
      };

  /// Re-price every vehicle on show after the inputs settle.
  void _requote(List<TravelVehicle> fits) {
    final key = '$_outstation|$_destId|$_days|${fits.map((v) => v.id).join(',')}';
    if (key == _lastKey || (_outstation && _destId == null)) return;
    _lastKey = key;
    _debounce?.cancel();
    final seq = ++_seq;
    setState(() => _quoting = true);
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      try {
        final api = ref.read(apiProvider);
        final list = await Future.wait(fits.map((v) => api.quote(_request(v))));
        if (!mounted || seq != _seq) return;
        setState(() {
          _quotes
            ..clear()
            ..addEntries([for (var i = 0; i < fits.length; i++) MapEntry(fits[i].id, list[i])]);
          _quoteErr = null;
        });
      } catch (e) {
        if (mounted && seq == _seq) setState(() => _quoteErr = errorText(e));
      }
      if (mounted && seq == _seq) setState(() => _quoting = false);
    });
  }

  Future<void> _book(TravelVehicle v, String destName, int localKm) async {
    setState(() => _booking = v.id);
    try {
      // Quotes book once, so checkout gets its own.
      final quote = await ref.read(apiProvider).quote(_request(v));
      ref.read(checkoutProvider.notifier).set(CheckoutDraft(
            service: ServiceKey.rentals,
            title: v.name,
            subtitle: _outstation ? 'Chennai ⇄ $destName round trip' : 'Chennai local · $_days day(s)',
            image: vehicleImage(v),
            summary: [
              ('Trip', _outstation ? 'Round trip to $destName' : 'Local · 8 hr / $localKm km per day'),
              ('Start', shortDate(_date)),
              ('Days', '$_days'),
              ('Passengers', '$_pax'),
            ],
            quote: quote,
            travellers: const ['Lead traveller'],
            policy: 'Free cancellation up to 48 hours before trip start. Tolls, parking and state permits paid on actuals.',
          ));
      if (mounted) context.push('/checkout');
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
    if (mounted) setState(() => _booking = null);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final cfg = ref.watch(configProvider).value;
    final dests = cfg?.groupDestinations ?? const <GroupDestination>[];
    final localKm = cfg?.settings.groupLocalKmPerDay ?? 80;
    _destId ??= dests.where((d) => d.name == 'Pondicherry').firstOrNull?.id ?? dests.firstOrNull?.id;
    final dest = dests.where((d) => d.id == _destId).firstOrNull;
    final vehicles = ref.watch(travelVehiclesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Group travel')),
      body: ScreenList(
        onRefresh: () async => ref.invalidate(travelVehiclesProvider),
        children: [
          Text('Family trips, pilgrimages, weddings and corporate outings. Tempo travellers to 45-seat coaches.', style: TextStyle(color: c.fgMuted)),
          const SizedBox(height: 12),
          Panel(
            highlighted: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              SegmentedButton<bool>(
                showSelectedIcon: false,
                segments: const [ButtonSegment(value: true, label: Text('Outstation')), ButtonSegment(value: false, label: Text('Local'))],
                selected: {_outstation},
                onSelectionChanged: (s) => setState(() => _outstation = s.first),
              ),
              const SizedBox(height: 12),
              if (_outstation)
                DropdownButtonFormField<String>(
                  initialValue: _destId,
                  decoration: const InputDecoration(labelText: 'Chennai to'),
                  items: [for (final d in dests) DropdownMenuItem(value: d.id, child: Text('${d.name} · ${d.km} km'))],
                  onChanged: (v) => setState(() => _destId = v),
                )
              else
                InputDecorator(decoration: const InputDecoration(labelText: 'Package'), child: Text('8 hrs / $localKm km per day')),
              const SizedBox(height: 10),
              DateField(label: 'Start date', date: _date, first: DateTime.now(), onChanged: (d) => setState(() => _date = d)),
              const SizedBox(height: 6),
              Counter(label: 'Days', value: _days, min: 1, max: groupMaxDays, onChanged: (v) => setState(() => _days = v)),
              Counter(label: 'Passengers', value: _pax, min: 1, max: groupMaxPassengers, onChanged: (v) => setState(() => _pax = v)),
            ]),
          ),
          const SizedBox(height: 14),
          ...vehicles.when(
            loading: () => const [Skeleton(height: 220), SizedBox(height: 12), Skeleton(height: 220)],
            error: (e, _) => [ErrorBox(errorText(e), onRetry: () => ref.invalidate(travelVehiclesProvider))],
            data: (all) {
              final fits = all.where((v) => v.seats >= _pax).toList();
              WidgetsBinding.instance.addPostFrameCallback((_) => _requote(fits));
              final comparing = all.where((v) => _compare.contains(v.id)).toList();
              return [
                Text(
                  '${fits.length} vehicle${fits.length == 1 ? '' : 's'} seat $_pax+'
                  '${_outstation && dest != null ? ' · about ${dest.km * 2} km round trip' : ''} · tolls and permits extra · tick up to $compareMax to compare',
                  style: TextStyle(color: c.fgMuted, fontSize: 12.5),
                ),
                if (_quoteErr != null) Padding(padding: const EdgeInsets.only(top: 8), child: ErrorBox(_quoteErr!)),
                const SizedBox(height: 10),
                if (fits.isEmpty) const EmptyState(icon: Icons.airport_shuttle, title: 'No vehicle seats that many', message: 'Try fewer passengers or book two vehicles.'),
                for (final v in fits)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Panel(
                      highlighted: _compare.contains(v.id),
                      padding: EdgeInsets.zero,
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        SizedBox(height: 120, child: Image.asset(vehicleImage(v), fit: BoxFit.cover, semanticLabel: v.name)),
                        Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Expanded(child: Text(v.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
                              Icon(Icons.person_outline, size: 15, color: c.fgMuted),
                              Text(' ${v.seats}', style: TextStyle(color: c.fgMuted)),
                            ]),
                            const SizedBox(height: 6),
                            Wrap(spacing: 6, runSpacing: 6, children: [for (final f in v.features) Pill(f, color: c.fgMuted)]),
                            const SizedBox(height: 6),
                            Text(
                              _outstation
                                  ? '${inr(v.perKm)}/km · min ${v.minKmPerDay} km/day · bata ${inr(v.driverBataPerDay)}/day'
                                  : '${inr(v.localPackage)} per day',
                              style: TextStyle(color: c.fgSubtle, fontSize: 12),
                            ),
                            Divider(color: c.border, height: 20),
                            Row(children: [
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text('Estimated fare', style: TextStyle(color: c.fgSubtle, fontSize: 11.5)),
                                  if (_quoting || _quotes[v.id] == null)
                                    const Padding(padding: EdgeInsets.only(top: 6), child: SizedBox(width: 70, child: LinearProgressIndicator()))
                                  else
                                    Text(inr(_quotes[v.id]!.total), style: TextStyle(color: c.accent, fontWeight: FontWeight.w700, fontSize: 19)),
                                ]),
                              ),
                              FilterChip(
                                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                label: const Text('Compare'),
                                selected: _compare.contains(v.id),
                                onSelected: (on) => setState(() {
                                  if (!on) {
                                    _compare.remove(v.id);
                                  } else if (_compare.length < compareMax) {
                                    _compare.add(v.id);
                                  } else {
                                    toast(context, 'Compare up to $compareMax vehicles.');
                                  }
                                }),
                              ),
                              const SizedBox(width: 8),
                              GoldButton(
                                label: 'Book',
                                expand: false,
                                loading: _booking == v.id,
                                onPressed: _booking != null || (_outstation && dest == null) ? null : () => _book(v, dest?.name ?? '', localKm),
                              ),
                            ]),
                          ]),
                        ),
                      ]),
                    ),
                  ),
                if (comparing.length >= 2) ...[
                  const SectionTitle('Side by side', eyebrow: 'Compare'),
                  Panel(
                    padding: const EdgeInsets.all(12),
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: DataTable(
                        columnSpacing: 18,
                        headingRowHeight: 40,
                        dataRowMinHeight: 36,
                        dataRowMaxHeight: 40,
                        columns: [
                          const DataColumn(label: Text('')),
                          for (final v in comparing) DataColumn(label: Text(v.name, style: const TextStyle(fontWeight: FontWeight.w700))),
                        ],
                        rows: [
                          for (final (label, f) in <(String, String Function(TravelVehicle))>[
                            ('Seats', (v) => '${v.seats}'),
                            ('Per km', (v) => inr(v.perKm)),
                            ('Driver bata/day', (v) => inr(v.driverBataPerDay)),
                            ('Local / day', (v) => inr(v.localPackage)),
                            ('Your estimate', (v) => _quotes[v.id] == null ? '…' : inr(_quotes[v.id]!.total)),
                          ])
                            DataRow(cells: [
                              DataCell(Text(label, style: TextStyle(color: c.fgSubtle))),
                              for (final v in comparing) DataCell(Text(f(v))),
                            ]),
                        ],
                      ),
                    ),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(onPressed: () => setState(_compare.clear), child: const Text('Clear compare')),
                  ),
                ],
              ];
            },
          ),
        ],
      ),
    );
  }
}
