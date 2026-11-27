// A ride offered to the captain: the whole trip and the whole money split, before they choose
// (docs/driver-app-plan.md, "What makes it different"). Declining is always free.
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api.dart';
import '../api/models.dart';
import '../core/format.dart';
import '../theme/tokens.dart';
import '../widgets/ui.dart';
import 'captain_state.dart';

String rupees(int paise) => inr(paise / 100);

class OfferCard extends ConsumerStatefulWidget {
  const OfferCard(this.offer, {super.key});
  final CaptainOffer offer;
  @override
  ConsumerState<OfferCard> createState() => _OfferCardState();
}

class _OfferCardState extends ConsumerState<OfferCard> {
  late final Timer _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _tick.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final o = widget.offer, t = o.trip;
    final live = ref.watch(captainProvider);
    final rules = ref.watch(captainRulesProvider);
    final left = o.expiresAt.difference(DateTime.now()).inSeconds.clamp(0, 999);
    final total = rules.offerSeconds <= 0 ? 15 : rules.offerSeconds;
    return Panel(
      highlighted: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text('New ${t.rideType} ride', style: Theme.of(context).textTheme.titleLarge)),
          Semantics(
            label: '$left seconds left to answer',
            child: SizedBox(
              width: 46, height: 46,
              child: Stack(alignment: Alignment.center, children: [
                CircularProgressIndicator(value: left / total, strokeWidth: 4, color: left <= 5 ? c.danger : c.accent, backgroundColor: c.border),
                Text('$left', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              ]),
            ),
          ),
        ]),
        const SizedBox(height: 6),
        Wrap(spacing: 6, runSpacing: 6, children: [
          if (t.womenOnly) Pill('Women-only ride', color: c.highlight, icon: Icons.female),
          Pill(t.cash ? 'Cash' : 'Paid online', color: t.cash ? c.warning : c.success, icon: t.cash ? Icons.payments_outlined : Icons.check_circle_outline),
          if (t.pickupKm != null) Pill('${t.pickupKm!.toStringAsFixed(1)} km to pickup', icon: Icons.near_me_outlined),
        ]),
        const SizedBox(height: 12),
        RouteLines(pickup: t.pickup, drop: t.drop, stops: t.stops),
        const SizedBox(height: 8),
        Text('${t.distanceKm.toStringAsFixed(1)} km · about ${t.durationMin} min', style: TextStyle(color: c.fgMuted)),
        const Divider(height: 24),
        MoneySplit(t.money),
        const SizedBox(height: 12),
        if (live.error != null) FormError(live.error),
        Row(children: [
          Expanded(
            child: OutlinedButton(
              onPressed: live.busy ? null : () => ref.read(captainProvider.notifier).decline(t.rideId),
              child: const Text('Decline'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(flex: 2, child: GoldButton(label: 'Accept', icon: Icons.check, loading: live.busy, onPressed: () => ref.read(captainProvider.notifier).accept(t.rideId))),
        ]),
        const SizedBox(height: 8),
        Text('Declining is free: no score, no penalty.', style: TextStyle(color: c.fgSubtle, fontSize: 12.5)),
      ]),
    );
  }
}

/// Pickup, stops and drop, one under the other.
class RouteLines extends StatelessWidget {
  const RouteLines({super.key, required this.pickup, required this.drop, this.stops = const []});
  final Place pickup, drop;
  final List<Place> stops;
  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    Widget line(IconData icon, Color color, Place p) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 8),
            Expanded(child: Text.rich(TextSpan(children: [
              TextSpan(text: p.name, style: const TextStyle(fontWeight: FontWeight.w600)),
              if (p.area.isNotEmpty) TextSpan(text: '  ${p.area}', style: TextStyle(color: c.fgMuted, fontSize: 13)),
            ]))),
          ]),
        );
    return Column(children: [
      line(Icons.trip_origin, c.success, pickup),
      for (final s in stops) line(Icons.more_vert, c.fgMuted, s),
      line(Icons.location_on, c.accent, drop),
    ]);
  }
}

/// What the rider pays and where it goes: QuikFly's share (or no share on the daily fee), TDS, and the vehicle's earning.
class MoneySplit extends StatelessWidget {
  const MoneySplit(this.m, {super.key});
  final CaptainMoney m;
  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return Column(children: [
      KeyValue('Rider pays', inr(m.customerPays)),
      // Coupons and credits are QuikFly's cost: the vehicle earns on the full fare.
      if (m.farePaise + m.gstPaise > m.customerPays * 100) KeyValue('Discount QuikFly covers', '+${rupees(m.farePaise + m.gstPaise - m.customerPays * 100)}'),
      if (m.gstPaise > 0) KeyValue('GST (QuikFly pays it)', '−${rupees(m.gstPaise)}'),
      m.onDailyFee
          ? KeyValue('QuikFly share', 'None (daily fee)', valueColor: c.success)
          : KeyValue('QuikFly share', '−${rupees(m.commissionPaise)}'),
      if (m.tdsPaise > 0) KeyValue('TDS (0.1%)', '−${rupees(m.tdsPaise)}'),
      KeyValue('Vehicle earns', rupees(m.earningPaise), bold: true, valueColor: c.success),
    ]);
  }
}
