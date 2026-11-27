// The ride the captain is on: go to the pickup, say you've arrived, start with the rider's PIN, end at
// the drop. Then a full-screen "Collect ₹X" for cash rides, so cash is never missed.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/api.dart';
import '../api/models.dart';
import '../core/format.dart';
import '../theme/tokens.dart';
import '../widgets/ui.dart';
import 'captain_state.dart';
import 'offer_card.dart';

/// Opens Google Maps (or any maps app) with directions to a place on the demo map. A link: no paid maps.
Future<void> openDirections(Place p) async {
  final at = CityGeo.toLatLng(p.x, p.y);
  final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${at.lat.toStringAsFixed(5)},${at.lng.toStringAsFixed(5)}');
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

class RidePanel extends ConsumerStatefulWidget {
  const RidePanel(this.ride, {super.key});
  final CaptainRide ride;
  @override
  ConsumerState<RidePanel> createState() => _RidePanelState();
}

class _RidePanelState extends ConsumerState<RidePanel> {
  final _pin = TextEditingController();

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  CaptainController get _ctl => ref.read(captainProvider.notifier);

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final r = widget.ride, t = r.trip;
    final live = ref.watch(captainProvider);
    final (title, hint) = switch (r.phase) {
      'arriving' => ('Go to the pickup', 'Say you\'ve arrived when you reach ${t.pickup.name}.'),
      'arrived' => ('At the pickup', r.booked ? 'Ask ${r.riderName.isEmpty ? 'the rider' : r.riderName} for their 4-digit ride PIN.' : 'Waiting for the rider to confirm the booking in their app.'),
      _ => ('On the trip', 'Drop at ${t.drop.name}. End the trip there.'),
    };
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(title, style: Theme.of(context).textTheme.titleLarge)),
          Pill(t.cash ? 'Cash' : 'Paid online', color: t.cash ? c.warning : c.success),
        ]),
        const SizedBox(height: 4),
        Text(hint, style: TextStyle(color: c.fgMuted)),
        const SizedBox(height: 12),
        RouteLines(pickup: t.pickup, drop: t.drop, stops: t.stops),
        const SizedBox(height: 10),
        Row(children: [
          Icon(Icons.person_outline, size: 20, color: c.fgMuted),
          const SizedBox(width: 6),
          Expanded(child: Text(r.riderName.isEmpty ? 'Rider' : r.riderName, style: const TextStyle(fontWeight: FontWeight.w600))),
          if (r.riderPhone != null)
            IconButton(
              tooltip: 'Call the rider',
              icon: const Icon(Icons.call_outlined),
              onPressed: () => launchUrl(Uri.parse('tel:${r.riderPhone!.replaceAll(' ', '')}')),
            ),
          IconButton(
            tooltip: r.phase == 'ontrip' ? 'Directions to the drop' : 'Directions to the pickup',
            icon: const Icon(Icons.directions_outlined),
            onPressed: () => openDirections(r.phase == 'ontrip' ? t.drop : t.pickup),
          ),
        ]),
        if (r.collectCash != null) ...[
          const SizedBox(height: 4),
          Text('Collect ${inr(r.collectCash!)} in cash at the end.', style: TextStyle(color: c.warning, fontWeight: FontWeight.w600)),
        ],
        const SizedBox(height: 12),
        if (live.error != null) FormError(live.error),
        ..._actions(context, r, live),
      ]),
    );
  }

  List<Widget> _actions(BuildContext context, CaptainRide r, CaptainLive live) {
    final c = context.qf;
    final id = r.trip.rideId;
    final giveBack = TextButton(onPressed: live.busy ? null : () => _giveBack(context, r), child: const Text("I can't do this ride"));
    switch (r.phase) {
      case 'arriving':
        return [GoldButton(label: "I've arrived", icon: Icons.place, loading: live.busy, onPressed: () => _ctl.arrived(id)), Center(child: giveBack)];
      case 'arrived':
        final locked = r.pinLockedUntil != null && r.pinLockedUntil!.isAfter(DateTime.now());
        return [
          TextField(
            controller: _pin,
            enabled: r.booked && !locked,
            keyboardType: TextInputType.number,
            maxLength: 4,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 26, letterSpacing: 12, fontWeight: FontWeight.w700),
            decoration: const InputDecoration(labelText: "Rider's PIN", counterText: ''),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 6),
          Text(
            locked
                ? 'Too many wrong PINs. Try again after ${TimeOfDay.fromDateTime(r.pinLockedUntil!).format(context)}, or call QuikFly support.'
                : '${r.pinTriesLeft} ${r.pinTriesLeft == 1 ? 'try' : 'tries'} left.',
            style: TextStyle(color: locked ? c.danger : c.fgSubtle, fontSize: 12.5),
          ),
          const SizedBox(height: 10),
          GoldButton(
            label: 'Start the trip',
            icon: Icons.play_arrow,
            loading: live.busy,
            onPressed: !r.booked || locked || _pin.text.length != 4 ? null : () async {
              final err = await _ctl.start(id, _pin.text);
              if (err != null) _pin.clear();
              setState(() {});
            },
          ),
          Center(child: giveBack),
        ];
      default:
        return [
          GoldButton(
            label: 'End the trip',
            icon: Icons.flag,
            loading: live.busy,
            onPressed: () async {
              if (await confirm(context, title: 'End the trip here?', message: 'Only at ${r.trip.drop.name}, with the rider dropped off.', yes: 'End trip')) {
                await _ctl.complete(id);
              }
            },
          ),
        ];
    }
  }

  /// Giving the ride back: pick a reason. Valid reasons are free; others may cost the vehicle's owner a penalty.
  Future<void> _giveBack(BuildContext context, CaptainRide r) async {
    final rules = ref.read(captainRulesProvider);
    final reasons = rules.releaseReasons;
    final penalty = rules.cancelPenaltyPercent > 0
        // As the API works it out (releasePenaltyPaise): a share of the fare before coupons, capped.
        ? inr(((r.trip.money.farePaise + r.trip.money.gstPaise) / 100 * rules.cancelPenaltyPercent / 100).clamp(0, rules.cancelPenaltyCap))
        : null;
    final picked = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
          Text('Why can\'t you do this ride?', style: Theme.of(ctx).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text('The rider pays nothing and the ride goes to the next captain.', style: TextStyle(color: ctx.qf.fgMuted)),
          const SizedBox(height: 8),
          for (final reason in reasons)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(reason.label),
              subtitle: reason.valid || penalty == null ? null : Text('Your owner may be charged $penalty', style: TextStyle(color: ctx.qf.warning)),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.pop(ctx, reason.id),
            ),
        ]),
      ),
    );
    if (picked != null) await _ctl.release(r.trip.rideId, picked);
  }
}

/// After the trip: a full screen that can't be missed. Cash rides say how much to collect.
class TripDoneScreen extends ConsumerWidget {
  const TripDoneScreen(this.done, {super.key});
  final CaptainDone done;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final cash = done.collectCash;
    return Scaffold(
      backgroundColor: cash != null ? Color.alphaBlend(c.warning.withValues(alpha: 0.12), c.bg) : c.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: Constrained(
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(cash != null ? Icons.payments : Icons.check_circle, size: 72, color: cash != null ? c.warning : c.success),
                const SizedBox(height: 16),
                Semantics(
                  liveRegion: true,
                  child: Text(cash != null ? 'Collect ${inr(cash)}' : 'Trip done', textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800)),
                ),
                const SizedBox(height: 8),
                Text(cash != null ? 'Take this in cash from the rider before they leave.' : 'The rider paid online. Nothing to collect.',
                    textAlign: TextAlign.center, style: TextStyle(color: c.fgMuted, fontSize: 16)),
                const SizedBox(height: 20),
                Text('This trip earns your vehicle ${rupees(done.earningPaise)}.', textAlign: TextAlign.center),
                const SizedBox(height: 28),
                GoldButton(label: cash != null ? 'Cash collected' : 'Done', onPressed: () => ref.read(captainProvider.notifier).dismissDone()),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
