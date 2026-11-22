// The notification inbox (the website's /notifications). Each app shows its own kinds
// (NotificationScope); opening it marks those read.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/format.dart';
import '../../state/catalog.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';

IconData _icon(String kind) => switch (kind) {
      'booking.confirmed' => Icons.confirmation_number_outlined,
      'booking.cancelled' => Icons.replay,
      'booking.cancelled_by_staff' => Icons.cancel_outlined,
      'booking.deposit_returned' => Icons.account_balance_wallet_outlined,
      'booking.changed' => Icons.swap_horiz,
      'licence.approved' => Icons.verified_outlined,
      'licence.rejected' => Icons.badge_outlined,
      'ride.reminder' => Icons.schedule,
      'credits.earned' => Icons.toll_outlined,
      'support.reply' => Icons.support_agent,
      'parcel.moved' || 'parcel.unclaimed' => Icons.inventory_2_outlined,
      'parcel.ready' || 'parcel.collected' => Icons.inventory,
      'vendor.approved' || 'vendor.active' => Icons.verified_outlined,
      'vendor.changes' => Icons.edit_note,
      'vendor.rejected' => Icons.cancel_outlined,
      'vendor.fleet' => Icons.local_taxi_outlined,
      'vendor.trip' => Icons.route_outlined,
      'vendor.payout' => Icons.payments_outlined,
      _ => Icons.notifications_none,
    };

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});
  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool _marked = false;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final inbox = ref.watch(notificationsProvider);
    final partner = ref.watch(notificationScopeProvider) == NotificationScope.partner;
    // Opening the inbox reads what this app shows (unread ones keep their highlight until you
    // leave); the other app's notifications stay unread there.
    inbox.whenData((d) {
      if (!_marked && d.unread > 0) {
        _marked = true;
        final ids = [for (final n in d.items) if (n.readAt == null) n.id];
        ref.read(apiProvider).markNotificationsRead(ids).then((_) => ref.invalidate(unreadProvider)).catchError((_) {});
      }
    });
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: inbox.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(notificationsProvider))]),
        data: (d) => ScreenList(
          onRefresh: () async => ref.invalidate(notificationsProvider),
          children: [
            if (d.items.isEmpty)
              EmptyState(
                  icon: Icons.notifications_none,
                  title: 'Nothing yet',
                  message: partner ? 'Application reviews, vehicle and driver updates, trips and payouts show up here.' : 'Bookings, refunds and ride reminders show up here.')
            else
              for (final n in d.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Panel(
                    highlighted: n.readAt == null,
                    // Partner updates have no page of their own (the home screen shows them), and
                    // the customer pages below don't exist in QuikFly Partner.
                    onTap: partner
                        ? null
                        : n.kind == 'credits.earned'
                        ? () => context.push('/account/wallet')
                        : n.kind == 'support.reply'
                        ? () => context.push('/support')
                        : n.bookingId != null && n.kind.startsWith('parcel.')
                        ? () => context.push('/parcel/${n.bookingId}')
                        : n.bookingId != null
                        ? () => context.go('/trips')
                        : n.kind.startsWith('licence')
                            ? () => context.push('/account/licence')
                            : null,
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Icon(_icon(n.kind), color: c.accent),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(n.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text(n.body, style: TextStyle(color: c.fgMuted, fontSize: 13)),
                          const SizedBox(height: 2),
                          Text(dateTime(n.createdAt), style: TextStyle(color: c.fgSubtle, fontSize: 11.5)),
                        ]),
                      ),
                    ]),
                  ),
                ),
          ],
        ),
      ),
    );
  }
}
