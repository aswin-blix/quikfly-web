// A trip's bookings on a timeline, each with its own invoice, and the trip total
// (the website's /trip page).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../api/parcel_models.dart';
import '../../core/format.dart';
import '../../core/services.dart';
import '../../core/trips.dart';
import '../../state/catalog.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'trips_screen.dart' show statusLabel;

class TripScreen extends ConsumerWidget {
  const TripScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final all = ref.watch(bookingsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Trip summary')),
      body: all.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(bookingsProvider))]),
        data: (list) {
          final items = list.where((b) => b.tripId == id).toList()..sort((a, b) => bookingWhen(a).compareTo(bookingWhen(b)));
          if (items.isEmpty) return const ScreenList(children: [EmptyState(icon: Icons.route_outlined, title: 'This trip was not found')]);
          final live = items.where((b) => b.status != BookingStatus.cancelled);
          final total = live.fold<int>(0, (sum, b) => sum + b.amount);
          return ScreenList(children: [
            Text('${items.length} bookings · each has its own tax invoice (services carry different GST rates).',
                style: TextStyle(color: c.fgMuted, fontSize: 13)),
            const SizedBox(height: 12),
            for (final b in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Panel(
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Icon(serviceOf(b.service).icon, color: c.accent),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(b.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                        if (b.subtitle.isNotEmpty) Text(b.subtitle, style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
                        Text('${dateTime(bookingWhen(b))} · ${b.parcelState != null ? parcelStateLabel(b.parcelState!) : statusLabel(b.status)}', style: TextStyle(color: c.fgSubtle, fontSize: 12)),
                      ]),
                    ),
                    Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text(inr(b.amount), style: const TextStyle(fontWeight: FontWeight.w700)),
                      if (b.status != BookingStatus.cancelled)
                        TextButton(onPressed: () => context.push('/invoice/${b.id}'), child: const Text('Invoice')),
                    ]),
                  ]),
                ),
              ),
            Divider(color: c.border),
            KeyValue(live.length < items.length ? 'Trip total (cancelled left out)' : 'Trip total', inr(total), bold: true, valueColor: c.accent),
          ]);
        },
      ),
    );
  }
}
