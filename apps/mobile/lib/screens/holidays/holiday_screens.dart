// Holidays: list with theme / duration / budget filters and sort, then a package page with
// itinerary, inclusions and policies, travellers and a live total from POST /quotes.
// Mirrors the website's HolidayScreens.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../core/cancellation.dart';
import '../../core/format.dart';
import '../../state/catalog.dart';
import '../../state/checkout.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/art.dart';
import '../../widgets/counter.dart';
import '../../widgets/ui.dart';
import '../bus/bus_screens.dart' show DateField;
import '../home/home_screen.dart' show TourTile;

const _themes = [('all', 'All'), ('beach', 'Beaches'), ('hills', 'Hill stations'), ('spiritual', 'Spiritual'), ('women', 'Women only'), ('seniors', 'Seniors'), ('international', 'International'), ('weekend', 'Weekend'), ('heritage', 'Heritage')];

/// Holidays can start this many days from today at the earliest.
const holidayLeadDays = 3;
/// Default start date offset for a new holiday quote.
const holidayDefaultDays = 14;

enum _Dur {
  any('Any'),
  short('1–3 days'),
  mid('4–5 days'),
  long('6+ days');

  const _Dur(this.label);
  final String label;
  bool has(int days) => switch (this) { any => true, short => days <= 3, mid => days >= 4 && days <= 5, long => days >= 6 };
}

enum _Sort { popular, price, duration }

class HolidaysScreen extends ConsumerStatefulWidget {
  const HolidaysScreen({super.key});
  @override
  ConsumerState<HolidaysScreen> createState() => _HolidaysScreenState();
}

class _HolidaysScreenState extends ConsumerState<HolidaysScreen> {
  String _theme = 'all';
  var _dur = _Dur.any;
  int? _budget;
  var _sort = _Sort.popular;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final tours = ref.watch(toursProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Holiday packages')),
      body: tours.when(
        loading: () => const ScreenList(children: [Skeleton(height: 50), SizedBox(height: 12), Skeleton(height: 220), SizedBox(height: 12), Skeleton(height: 220)]),
        error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(toursProvider))]),
        data: (all) {
          final top = all.isEmpty ? 0 : all.map((t) => t.price).reduce((a, b) => a > b ? a : b);
          final bottom = all.isEmpty ? 0 : all.map((t) => t.price).reduce((a, b) => a < b ? a : b);
          final budget = _budget ?? top;
          final shown = all.where((t) => (_theme == 'all' || t.themes.contains(_theme)) && _dur.has(t.days) && t.price <= budget).toList()
            ..sort((a, b) => switch (_sort) {
                  _Sort.price => a.price.compareTo(b.price),
                  _Sort.duration => a.days.compareTo(b.days),
                  _Sort.popular => b.rating.compareTo(a.rating),
                });
          final wide = MediaQuery.sizeOf(context).width > 600;
          return ScreenList(
            onRefresh: () async => ref.invalidate(toursProvider),
            children: [
              Text('Handpicked itineraries with hotels, transfers and sightseeing sorted.', style: TextStyle(color: c.fgMuted)),
              const SizedBox(height: 12),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  for (final (k, l) in _themes)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(label: Text(l), selected: _theme == k, onSelected: (_) => setState(() => _theme = k)),
                    ),
                ]),
              ),
              const SizedBox(height: 10),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  for (final d in _Dur.values)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        label: Text(d.label),
                        selected: _dur == d,
                        onSelected: (_) => setState(() => _dur = d),
                      ),
                    ),
                ]),
              ),
              if (top > bottom) ...[
                const SizedBox(height: 6),
                Row(children: [
                  Text('Budget up to', style: TextStyle(color: c.fgMuted)),
                  const Spacer(),
                  Text(inr(budget), style: TextStyle(color: c.accent, fontWeight: FontWeight.w700)),
                ]),
                Slider(
                  value: budget.toDouble().clamp(bottom.toDouble(), top.toDouble()),
                  min: bottom.toDouble(),
                  max: top.toDouble(),
                  divisions: ((top - bottom) / 1000).ceil().clamp(1, 100),
                  onChanged: (v) => setState(() => _budget = v.round() >= top ? null : v.round()),
                ),
              ],
              Row(children: [
                Expanded(child: Text('${shown.length} package${shown.length == 1 ? '' : 's'}', style: const TextStyle(fontWeight: FontWeight.w700))),
                DropdownButton<_Sort>(
                  value: _sort,
                  underline: const SizedBox.shrink(),
                  items: const [
                    DropdownMenuItem(value: _Sort.popular, child: Text('Most popular')),
                    DropdownMenuItem(value: _Sort.price, child: Text('Price: low to high')),
                    DropdownMenuItem(value: _Sort.duration, child: Text('Shortest first')),
                  ],
                  onChanged: (v) => setState(() => _sort = v ?? _sort),
                ),
              ]),
              const SizedBox(height: 8),
              if (shown.isEmpty)
                const EmptyState(icon: Icons.beach_access, title: 'No packages match', message: 'Try a bigger budget or another theme.')
              else
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: wide ? 2 : 1,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: wide ? 1.35 : 1.25,
                  children: [for (final t in shown) _TourCard(t)],
                ),
            ],
          );
        },
      ),
    );
  }
}

class _TourCard extends StatelessWidget {
  const _TourCard(this.t);
  final TourPackage t;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return Panel(
      padding: EdgeInsets.zero,
      onTap: () => context.push('/holidays/${t.slug}'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(flex: 5, child: TourTile(t)),
        Expanded(
          flex: 4,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 12, children: [
                _fact(context, Icons.calendar_month, '${t.days}D / ${t.nights}N'),
                _fact(context, Icons.hotel, '${t.hotelStars}★ hotels'),
                _fact(context, Icons.restaurant, t.meals),
              ]),
              const SizedBox(height: 6),
              for (final h in t.highlights.take(2))
                Row(children: [
                  Icon(Icons.check, size: 14, color: c.accent),
                  const SizedBox(width: 6),
                  Expanded(child: Text(h, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.fgSoft, fontSize: 13))),
                ]),
              const SizedBox(height: 4),
              Builder(builder: (_) {
                if (t.departures.isEmpty) return Text('Private trip · start any date', style: TextStyle(color: c.fgSubtle, fontSize: 12));
                final next = t.departures.firstWhere((d) => !d.soldOut, orElse: () => t.departures.first);
                return Text(
                  'Group departure ${shortDate(next.day)} from ${next.fromCity} · ${next.soldOut ? 'Sold out' : '${next.seatsLeft} seats left'}${next.filling ? ' · Filling fast' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: next.soldOut ? c.danger : next.filling ? c.warning : c.fgSoft, fontSize: 12),
                );
              }),
              const Spacer(),
              Row(children: [
                Text('View details', style: TextStyle(color: c.accent, fontWeight: FontWeight.w600)),
                Icon(Icons.chevron_right, color: c.accent, size: 18),
              ]),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _fact(BuildContext context, IconData i, String s) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(i, size: 13, color: context.qf.fgMuted),
        const SizedBox(width: 3),
        Text(s, style: TextStyle(color: context.qf.fgMuted, fontSize: 12)),
      ]);
}

/* ───────────── /holidays/:slug ───────────── */

class HolidayDetailScreen extends ConsumerStatefulWidget {
  const HolidayDetailScreen({super.key, required this.slug});
  final String slug;
  @override
  ConsumerState<HolidayDetailScreen> createState() => _HolidayDetailScreenState();
}

class _HolidayDetailScreenState extends ConsumerState<HolidayDetailScreen> {
  DateTime _date = DateTime.now().add(const Duration(days: holidayDefaultDays));
  int _adults = 2, _kids = 0;
  int _tab = 0;
  String? _depId;

  /// The chosen group departure (or the first with room), when the package has departures.
  DepartureView? _dep(TourPackage t) {
    if (t.departures.isEmpty) return null;
    final n = _adults + _kids;
    return t.departures.where((d) => d.id == _depId && d.seatsLeft >= n).firstOrNull ?? t.departures.where((d) => d.seatsLeft >= n).firstOrNull;
  }
  late final LiveQuote _live = LiveQuote(ref.read(apiProvider))..addListener(() => setState(() {}));
  bool _booking = false;
  Settings get _settings => ref.read(configProvider).value?.settings ?? const Settings({});

  Map<String, Object?> _request(TourPackage t) {
    final dep = _dep(t);
    return {
      'service': 'tours', 'tourId': t.id, 'adults': _adults, 'kids': _kids,
      'start': dep?.date ?? isoDate(_date),
      if (dep != null) 'departureId': dep.id,
    };
  }

  @override
  void dispose() {
    _live.dispose();
    super.dispose();
  }

  Future<void> _book(TourPackage t) async {
    setState(() => _booking = true);
    try {
      final quote = await _live.fresh(_request(t));
      ref.read(checkoutProvider.notifier).set(CheckoutDraft(
            service: ServiceKey.tours,
            title: t.title,
            subtitle: '${t.location} · ${t.days}D/${t.nights}N',
            summary: [
              if (_dep(t) case final dep?) ('Departure', '${shortDate(dep.day)} from ${dep.fromCity}') else ('Start date', shortDate(_date)),
              ('Travellers', '$_adults adult${_adults > 1 ? 's' : ''}${_kids > 0 ? ', $_kids child${_kids > 1 ? 'ren' : ''}' : ''}'),
              ('Hotels', '${t.hotelStars}★ · ${t.meals}'),
              ('Includes', t.includes.join(', ')),
            ],
            quote: quote,
            travellers: [for (var i = 1; i <= _adults; i++) 'Adult $i', for (var i = 1; i <= _kids; i++) 'Child $i'],
            policy: cancelPolicyText(_settings, ServiceKey.tours),
          ));
      if (mounted) context.push('/checkout');
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
    if (mounted) setState(() => _booking = false);
  }

  @override
  Widget build(BuildContext context) {
    final tour = ref.watch(tourProvider(widget.slug));
    return tour.when(
      loading: () => Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(
        appBar: AppBar(title: const Text('Holiday package')),
        body: ScreenList(children: [
          EmptyState(
            icon: Icons.beach_access,
            title: 'Package not found',
            message: errorText(e),
            action: OutlinedButton(onPressed: () => context.go('/'), child: const Text('Back to home')),
          ),
        ]),
      ),
      data: (t) {
        // Ask the API for the total whenever the travellers change.
        WidgetsBinding.instance.addPostFrameCallback((_) => _live.update(_request(t)));
        return _page(t);
      },
    );
  }

  Widget _page(TourPackage t) {
    final c = context.qf;
    final t2 = Theme.of(context).textTheme;
    final flights = t.includes.any((i) => i.toLowerCase().contains('flight'));
    final similar = (ref.watch(toursProvider).value ?? const <TourPackage>[])
        .where((x) => x.id != t.id && x.themes.any(t.themes.contains))
        .take(4)
        .toList();
    return Scaffold(
      body: CustomScrollView(slivers: [
        SliverAppBar(
          pinned: true,
          expandedHeight: 230,
          foregroundColor: onArt,
          backgroundColor: hueColor(t.hue, l: 0.3),
          flexibleSpace: FlexibleSpaceBar(
            titlePadding: const EdgeInsetsDirectional.only(start: 56, bottom: 14, end: 16),
            title: Text(t.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: onArt, fontSize: 17, fontWeight: FontWeight.w700)),
            background: DecoratedBox(
              decoration: BoxDecoration(gradient: hueGradient(t.hue)),
              child: Stack(children: [
                Positioned(right: -20, top: 30, child: Icon(themeIcon(t.themes.firstOrNull ?? ''), size: 180, color: Colors.white.withValues(alpha: 0.12))),
                Positioned(
                  left: Brand.gutter,
                  bottom: 48,
                  right: Brand.gutter,
                  child: Row(children: [
                    Text(t.location, style: const TextStyle(color: onArtMuted)),
                    const SizedBox(width: 10),
                    const Icon(Icons.star, size: 15, color: Brand.goldLight),
                    const SizedBox(width: 3),
                    Text(t.rating.toStringAsFixed(1), style: const TextStyle(color: onArt, fontWeight: FontWeight.w600)),
                    if (t.tag != null) ...[const SizedBox(width: 10), Pill(t.tag!, color: onArt)],
                  ]),
                ),
              ]),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Constrained(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Brand.gutter, 16, Brand.gutter, 24),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final (i, l) in [
                    (Icons.schedule, '${t.days} days / ${t.nights} nights'),
                    (Icons.hotel, '${t.hotelStars}★ hotels'),
                    (Icons.restaurant, t.meals),
                    (flights ? Icons.flight : Icons.local_taxi, flights ? 'Flights included' : 'Private cab'),
                    (Icons.photo_camera_outlined, 'Sightseeing'),
                  ])
                    Chip(avatar: Icon(i, size: 16, color: c.accent), label: Text(l)),
                ]),
                const SizedBox(height: 16),
                SegmentedButton<int>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(value: 0, label: Text('Itinerary')),
                    ButtonSegment(value: 1, label: Text('Inclusions')),
                    ButtonSegment(value: 2, label: Text('Policies')),
                  ],
                  selected: {_tab},
                  onSelectionChanged: (s) => setState(() => _tab = s.first),
                ),
                const SizedBox(height: 12),
                AnimatedSwitcher(duration: const Duration(milliseconds: 200), child: KeyedSubtree(key: ValueKey(_tab), child: _tabBody(t))),
                const SizedBox(height: 20),
                Panel(
                  highlighted: true,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text(t.departures.isEmpty ? 'Starting from' : 'Per person on this departure', style: TextStyle(color: c.fgSubtle, fontSize: 12)),
                    Text.rich(TextSpan(children: [
                      TextSpan(text: inr(_dep(t)?.price ?? t.price), style: TextStyle(color: c.accent, fontSize: 26, fontWeight: FontWeight.w700)),
                      TextSpan(text: ' /person', style: TextStyle(color: c.fgMuted)),
                    ])),
                    const SizedBox(height: 12),
                    if (t.departures.isEmpty)
                      DateField(
                        label: 'Start date',
                        date: _date,
                        first: DateTime.now().add(const Duration(days: holidayLeadDays)),
                        onChanged: (d) => setState(() => _date = d),
                      )
                    else ...[
                      Text('GROUP DEPARTURE', style: TextStyle(color: c.fgMuted, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1)),
                      const SizedBox(height: 6),
                      RadioGroup<String>(
                        groupValue: _dep(t)?.id,
                        onChanged: (v) => setState(() => _depId = v),
                        child: Column(children: [
                          for (final d in t.departures)
                            Builder(builder: (_) {
                              final full = d.seatsLeft < _adults + _kids;
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Opacity(
                                  opacity: full ? 0.5 : 1,
                                  child: RadioListTile<String>(
                                    value: d.id,
                                    enabled: !full,
                                    dense: true,
                                    contentPadding: EdgeInsets.zero,
                                    title: Text('${shortDate(d.day)} · from ${d.fromCity}', style: const TextStyle(fontWeight: FontWeight.w600)),
                                    subtitle: Text(
                                      '${d.soldOut ? 'Sold out' : '${d.seatsLeft} of ${d.seats} seats left'}${d.filling ? ' · Filling fast' : ''}${d.price != t.price ? ' · ${inr(d.price)}' : ''}',
                                      style: TextStyle(color: d.soldOut ? c.danger : d.filling ? c.warning : c.fgMuted, fontSize: 12),
                                    ),
                                  ),
                                ),
                              );
                            }),
                        ]),
                      ),
                      if (_dep(t) == null)
                        Text('No departure has seats for ${_adults + _kids} travellers. Try fewer travellers.', style: TextStyle(color: c.warning, fontSize: 12)),
                    ],
                    const SizedBox(height: 8),
                    Counter(label: 'Adults', value: _adults, min: 1, max: 10, onChanged: (v) => setState(() => _adults = v)),
                    Counter(label: 'Children (5–11)', value: _kids, min: 0, max: 8, onChanged: (v) => setState(() => _kids = v)),
                    Divider(color: c.border),
                    Row(children: [
                      Text('Total incl. GST', style: TextStyle(color: c.fgMuted)),
                      const Spacer(),
                      if (_live.loading)
                        const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      else if (_live.quote != null)
                        Text(inr(_live.quote!.total), style: t2.headlineSmall),
                    ]),
                    if (_live.error != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_live.error!, style: TextStyle(color: c.danger))),
                    const SizedBox(height: 12),
                    GoldButton(label: 'Book now', loading: _booking, onPressed: _live.loading || (t.departures.isNotEmpty && _dep(t) == null) ? null : () => _book(t)),
                    const SizedBox(height: 6),
                    Text('Demo: no payment is taken',
                        textAlign: TextAlign.center, style: TextStyle(color: c.fgSubtle, fontSize: 11.5)),
                  ]),
                ),
                if (similar.isNotEmpty) ...[
                  const SizedBox(height: 28),
                  const SectionTitle('Similar getaways', eyebrow: 'You may also like'),
                  SizedBox(
                    height: 196,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: similar.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 12),
                      itemBuilder: (_, i) => SizedBox(width: 230, child: TourTile(similar[i])),
                    ),
                  ),
                ],
              ]),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _tabBody(TourPackage t) {
    final c = context.qf;
    switch (_tab) {
      case 0:
        return Column(children: [
          for (var i = 0; i < t.itinerary.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  width: 30,
                  height: 30,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: c.accent), color: c.bg),
                  child: Text('${i + 1}', style: TextStyle(color: c.accent, fontWeight: FontWeight.w700, fontSize: 12)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Panel(
                    padding: const EdgeInsets.all(12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('DAY ${i + 1}', style: TextStyle(color: c.accent, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1)),
                      const SizedBox(height: 2),
                      Text(t.itinerary[i]),
                    ]),
                  ),
                ),
              ]),
            ),
        ]);
      case 1:
        return Column(children: [
          Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Included', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              for (final x in [...t.includes, ...t.highlights])
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Icon(Icons.check, size: 16, color: c.success),
                    const SizedBox(width: 8),
                    Expanded(child: Text(x)),
                  ]),
                ),
            ]),
          ),
          const SizedBox(height: 10),
          Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Not included', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              for (final x in const ['Personal expenses', 'Entry tickets unless mentioned', 'Lunch', 'Travel insurance'])
                Padding(padding: const EdgeInsets.symmetric(vertical: 3), child: Text('•  $x', style: TextStyle(color: c.fgMuted))),
            ]),
          ),
        ]);
      default:
        Widget p(String title, String text, [IconData? icon]) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  if (icon != null) ...[Icon(icon, size: 16, color: c.success), const SizedBox(width: 6)],
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                ]),
                const SizedBox(height: 2),
                Text(text, style: TextStyle(color: c.fgMuted)),
              ]),
            );
        return Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            p('Cancellation', '${cancelPolicyText(_settings, ServiceKey.tours)} Counted from midnight on the start date; wallet refunds are instant.', Icons.verified_user_outlined),
            p('Payment', 'Pay in full at booking, from your QuikFly wallet or the payment methods at checkout.'),
            p('Price', 'Per person, twin sharing, including GST (${_settings.gstRate(ServiceKey.tours)}%). Children (5–11) pay ${_settings.tourChildPercent}% of the adult price.'),
          ]),
        );
    }
  }
}
