// Offers: every visible coupon from GET /config, filterable by service.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../state/providers.dart';
import '../../api/models.dart' show Settings;
import '../../widgets/service_gate.dart';
import '../../widgets/offer_card.dart';
import '../../widgets/ui.dart';

class OffersScreen extends ConsumerStatefulWidget {
  const OffersScreen({super.key});
  @override
  ConsumerState<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends ConsumerState<OffersScreen> {
  String _filter = 'all';

  @override
  Widget build(BuildContext context) {
    final config = ref.watch(configProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Offers & coupons')),
      body: config.when(
        loading: () => const ScreenList(children: [Skeleton(height: 160), SizedBox(height: 12), Skeleton(height: 160)]),
        error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(configProvider))]),
        data: (cfg) {
          // "All services" coupons apply everywhere, so they show under every filter.
          final list = cfg.offers.where((o) => _filter == 'all' || o.service == _filter || o.service == 'all').toList();
          return ScreenList(
            onRefresh: () async => ref.invalidate(configProvider),
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  for (final (key, label) in [('all', 'All'), for (final s in openServices(ref.watch(configProvider).value?.settings ?? const Settings({}))) (s.key.name, s.action)])
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(label: Text(label), selected: _filter == key, onSelected: (_) => setState(() => _filter = key)),
                    ),
                ]),
              ),
              const SizedBox(height: 14),
              if (list.isEmpty)
                const EmptyState(icon: Icons.local_offer_outlined, title: 'No offers for this service right now', message: 'Check back soon.')
              else
                for (final o in list) Padding(padding: const EdgeInsets.only(bottom: 12), child: OfferCard(o)),
              Text('Codes are checked when you pay. One code per booking.', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
            ],
          );
        },
      ),
    );
  }
}
