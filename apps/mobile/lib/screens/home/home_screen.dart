// Home: greeting, the six services, offers, popular bus routes, trending holidays,
// safety and FAQs. Every list comes from the API (GET /config, GET /tours).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../core/format.dart';
import '../../core/services.dart';
import '../../state/catalog.dart';
import '../../state/providers.dart';
import '../../widgets/service_gate.dart';
import '../../theme/tokens.dart';
import '../../widgets/art.dart';
import '../../widgets/logo.dart';
import '../../widgets/offer_card.dart';
import '../../widgets/theme_toggle.dart';
import '../../widgets/ui.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final user = ref.watch(userProvider);
    final config = ref.watch(configProvider);

    Future<void> refresh() async {
      ref.invalidate(configProvider);
      ref.invalidate(toursProvider);
      await ref.read(sessionProvider.notifier).refresh();
      await ref.read(configProvider.future).catchError((_) => ref.read(configProvider).value!);
    }

    return Scaffold(
      appBar: AppBar(
        titleSpacing: Brand.gutter,
        title: const AppLogo(height: 34),
        actions: [
          if (user != null)
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: ActionChip(
                avatar: Icon(Icons.account_balance_wallet_outlined, size: 17, color: c.accent),
                label: Text(inr(user.walletBalance)),
                onPressed: () => context.push('/account/wallet'),
              ),
            ),
          if (user != null) const _Bell(),
          const ThemeToggle(),
          const SizedBox(width: 8),
        ],
      ),
      body: ScreenList(onRefresh: refresh, children: [
        _Hero(name: user?.firstName),
        const SizedBox(height: 20),
        const _ServiceGrid(),
        const SizedBox(height: 28),
        ...config.when(
          loading: () => const [Skeleton(height: 150), SizedBox(height: 16), Skeleton(height: 90)],
          error: (e, _) => [ErrorBox(errorText(e), onRetry: () => ref.invalidate(configProvider))],
          data: (cfg) => [
            if (cfg.offers.isNotEmpty) ...[
              SectionTitle('Offers for you', eyebrow: 'Save more',
                  action: TextButton(onPressed: () => context.go('/offers'), child: const Text('See all'))),
              SizedBox(
                height: 158,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: cfg.offers.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 12),
                  itemBuilder: (_, i) => SizedBox(width: 280, child: OfferCard(cfg.offers[i], compact: true)),
                ),
              ),
              const SizedBox(height: 28),
            ],
            if (cfg.popularRoutes.isNotEmpty) ...[
              const SectionTitle('Popular bus routes', eyebrow: 'Travels'),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final r in cfg.popularRoutes)
                  ActionChip(
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    avatar: Icon(Icons.directions_bus, size: 16, color: c.accent),
                    label: Text('${r.from} → ${r.to}'),
                    onPressed: () => context.push(Uri(path: '/bus/search', queryParameters: {
                      'from': r.from,
                      'to': r.to,
                      'date': isoDate(DateTime.now().add(const Duration(days: 1))),
                    }).toString()),
                  ),
              ]),
              const SizedBox(height: 28),
            ],
          ],
        ),
        const _TrendingHolidays(),
        const SizedBox(height: 28),
        const _Safety(),
        const SizedBox(height: 28),
        Panel(
          onTap: () => context.push('/help'),
          child: Row(children: [
            Icon(Icons.help_outline, color: c.accent),
            const SizedBox(width: 12),
            const Expanded(child: Text('Questions? Visit the help centre', style: TextStyle(fontWeight: FontWeight.w600))),
            Icon(Icons.chevron_right, color: c.fgSubtle),
          ]),
        ),
      ]),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({this.name});
  final String? name;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final t = Theme.of(context).textTheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(name == null ? "India's all-in-one travel super app" : 'Hi $name, where to today?',
          style: TextStyle(color: c.accent, fontWeight: FontWeight.w600)),
      const SizedBox(height: 6),
      Text.rich(
        TextSpan(children: [
          const TextSpan(text: 'Every journey.\n'),
          TextSpan(text: 'One super app.', style: TextStyle(color: c.accent)),
        ]),
        style: t.headlineLarge,
      ),
      const SizedBox(height: 8),
      Text('Bike taxis in minutes, cabs across town, sleeper buses, holidays and rentals. One login, one wallet.',
          style: TextStyle(color: c.fgMuted)),
    ]);
  }
}

class _ServiceGrid extends ConsumerWidget {
  const _ServiceGrid();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wide = MediaQuery.sizeOf(context).width > 600;
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: wide ? 3 : 2,
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.05,
      children: [for (final s in openServices(ref.watch(configProvider).value?.settings ?? const Settings({}))) _ServiceTile(s)],
    );
  }
}

class _ServiceTile extends StatelessWidget {
  const _ServiceTile(this.s);
  final ServiceMeta s;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return Panel(
      padding: EdgeInsets.zero,
      onTap: () => context.push(s.route),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(child: Image.asset(s.image, fit: BoxFit.cover, semanticLabel: s.action)),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 9, 12, 10),
          child: Row(children: [
            Icon(s.icon, size: 18, color: c.accent),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.action, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14), maxLines: 1, overflow: TextOverflow.ellipsis),
                Text(s.tagline, style: TextStyle(color: c.fgMuted, fontSize: 11.5), maxLines: 1, overflow: TextOverflow.ellipsis),
              ]),
            ),
          ]),
        ),
      ]),
    );
  }
}

class _TrendingHolidays extends ConsumerWidget {
  const _TrendingHolidays();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tours = ref.watch(toursProvider);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SectionTitle('Trending holidays', eyebrow: 'Getaways',
          action: TextButton(onPressed: () => context.push('/holidays'), child: const Text('See all'))),
      tours.when(
        loading: () => const Skeleton(height: 190),
        error: (e, _) => ErrorBox(errorText(e), onRetry: () => ref.invalidate(toursProvider)),
        data: (list) => list.isEmpty
            ? const EmptyState(icon: Icons.beach_access, title: 'No holiday packages right now')
            : SizedBox(
                height: 196,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: list.length.clamp(0, 6),
                  separatorBuilder: (_, _) => const SizedBox(width: 12),
                  itemBuilder: (_, i) => SizedBox(width: 230, child: TourTile(list[i])),
                ),
              ),
      ),
    ]);
  }
}

/// A holiday package tile on hue artwork. Used on home and the holidays list.
class TourTile extends ConsumerWidget {
  const TourTile(this.tour, {super.key});
  final TourPackage tour;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Package prices are before GST; the quote adds it (pricing audit R1).
    final gst = (ref.watch(configProvider).value?.settings ?? const Settings({})).gstRate(ServiceKey.tours);
    return Material(
      borderRadius: BorderRadius.circular(Brand.radiusPanel),
      clipBehavior: Clip.antiAlias,
      child: Ink(
        decoration: BoxDecoration(gradient: hueGradient(tour.hue)),
        child: InkWell(
          onTap: () => context.push('/holidays/${tour.slug}'),
          child: Stack(children: [
            Positioned(
              right: -18,
              top: -10,
              child: Icon(themeIcon(tour.themes.firstOrNull ?? ''), size: 120, color: Colors.white.withValues(alpha: 0.12)),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  if (tour.tag != null) Pill(tour.tag!, color: onArt),
                  const Spacer(),
                  const Icon(Icons.star, size: 15, color: Brand.goldLight),
                  const SizedBox(width: 3),
                  Text(tour.rating.toStringAsFixed(1), style: const TextStyle(color: onArt, fontWeight: FontWeight.w600)),
                ]),
                const Spacer(),
                Text(tour.title, maxLines: 2, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: onArt, fontWeight: FontWeight.w700, fontSize: 17, height: 1.2)),
                const SizedBox(height: 2),
                Text('${tour.location} · ${tour.nights}N/${tour.days}D', style: const TextStyle(color: onArtMuted, fontSize: 12.5)),
                const SizedBox(height: 8),
                Text.rich(TextSpan(children: [
                  TextSpan(text: inr(tour.price), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  TextSpan(text: gst > 0 ? ' / person + GST' : ' / person', style: const TextStyle(fontSize: 12)),
                ]), style: const TextStyle(color: onArt)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

class _Safety extends StatelessWidget {
  const _Safety();

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    Widget item(IconData i, String title, String text) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(i, color: c.accent, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
                Text(text, style: TextStyle(color: c.fgMuted, fontSize: 13)),
              ]),
            ),
          ]),
        );
    return Panel(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const SectionTitle('Safety on every trip', eyebrow: 'Ride safe'),
        item(Icons.verified_user_outlined, 'Verified drivers', 'Every driver is background-checked and rated after each ride.'),
        item(Icons.share_location, 'Share your trip', 'Send a live link so family can follow your ride.'),
        item(Icons.sos_outlined, 'SOS in one tap', 'Call our 24×7 safety line or your emergency contacts from the ride screen.'),
      ]),
    );
  }
}

/// Notification bell with the unread count.
class _Bell extends ConsumerWidget {
  const _Bell();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadProvider).value ?? 0;
    return IconButton(
      tooltip: unread > 0 ? 'Notifications, $unread unread' : 'Notifications',
      onPressed: () async {
        await context.push('/notifications');
        ref.invalidate(notificationsProvider);
      },
      icon: Badge(isLabelVisible: unread > 0, label: Text(unread > 9 ? '9+' : '$unread'), child: const Icon(Icons.notifications_none)),
    );
  }
}
