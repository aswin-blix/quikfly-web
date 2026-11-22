// Booking confirmed: animated tick and the booking as the API saved it.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../core/format.dart';
import '../../core/services.dart';
import '../../core/trips.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';

final bookingProvider = FutureProvider.family<Booking, String>((ref, id) => ref.watch(apiProvider).booking(id));

class ConfirmedScreen extends ConsumerWidget {
  const ConfirmedScreen({super.key, required this.id, this.booking});
  final String id;
  /// The booking just made, passed by checkout so no extra request is needed.
  final Booking? booking;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final b = booking ?? ref.watch(bookingProvider(id)).value;
    final c = context.qf;
    return Scaffold(
      appBar: AppBar(automaticallyImplyLeading: false, title: const Text('Booking confirmed')),
      body: b == null
          ? const Center(child: CircularProgressIndicator())
          : ScreenList(children: [
              const SizedBox(height: 12),
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0.4, end: 1),
                duration: const Duration(milliseconds: 600),
                curve: Curves.elasticOut,
                builder: (_, v, child) => Transform.scale(scale: v, child: child),
                child: Center(
                  child: Container(
                    width: 96,
                    height: 96,
                    decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: c.success, width: 4)),
                    child: Icon(Icons.check, size: 56, color: c.success),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('Booking confirmed!', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 6),
              Text(
                b.service == ServiceKey.parcel
                    ? "Hand it in before the cut-off below. When it's ready, the collection code appears in My Trips: pass it to the receiver (demo: no SMS is sent)."
                    : "We've saved the details in My Trips. Have a great trip!",
                textAlign: TextAlign.center,
                style: TextStyle(color: c.fgMuted),
              ),
              const SizedBox(height: 20),
              Panel(
                highlighted: true,
                padding: EdgeInsets.zero,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(color: Brand.gold.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                        child: Icon(serviceOf(b.service).icon, color: c.accent),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(b.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text(b.subtitle, style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
                        ]),
                      ),
                    ]),
                  ),
                  Divider(color: c.border),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
                    child: Column(children: [
                      KeyValue('Booking ID', b.id, valueColor: c.accent),
                      for (final (k, v) in b.lines) KeyValue(k, v),
                      Divider(color: c.border),
                      KeyValue('Amount paid', inr(b.amount), bold: true, valueColor: c.accent),
                    ]),
                  ),
                ]),
              ),
              ...() {
                final cfg = ref.watch(configProvider).value;
                final offer = cfg == null || !cfg.settings.featureTripOffers || !cfg.settings.serviceOn(ServiceKey.car) ? null : rideOffer(b, cfg.settings, (id) => cfg.places.where((p) => p.id == id).firstOrNull?.name);
                if (offer == null) return const <Widget>[];
                return [
                  const SizedBox(height: 14),
                  Panel(
                    child: Row(children: [
                      Icon(Icons.local_taxi, color: c.accent),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(offer.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text(offer.text, style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
                        ]),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(onPressed: () => context.push(offer.route), child: const Text('Add a ride')),
                    ]),
                  ),
                ];
              }(),
              const SizedBox(height: 20),
              if (b.service == ServiceKey.parcel) ...[
                OutlinedButton.icon(
                  onPressed: () => context.push('/parcel/${b.id}'),
                  icon: const Icon(Icons.inventory_2_outlined, size: 18),
                  label: const Text('Track parcel'),
                ),
                const SizedBox(height: 10),
              ],
              GoldButton(label: 'View my trips', onPressed: () => context.go('/trips')),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: OutlinedButton(onPressed: () => context.push('/invoice/${b.id}'), child: const Text('Invoice'))),
                const SizedBox(width: 10),
                Expanded(child: OutlinedButton(onPressed: () => context.go('/'), child: const Text('Back to home'))),
              ]),
            ]),
    );
  }
}
