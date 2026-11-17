// Booking confirmed: animated tick and the booking as the API saved it.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../core/format.dart';
import '../../core/services.dart';
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
              Text("We've saved the details in My Trips. Have a great trip!", textAlign: TextAlign.center, style: TextStyle(color: c.fgMuted)),
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
              const SizedBox(height: 20),
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
