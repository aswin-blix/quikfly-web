// The notification inbox (the website's /notifications). Opening it marks everything read.
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
    // Opening the inbox reads everything (unread ones keep their highlight until you leave).
    inbox.whenData((d) {
      if (!_marked && d.unread > 0) {
        _marked = true;
        ref.read(apiProvider).markNotificationsRead().then((_) => ref.invalidate(unreadProvider)).catchError((_) {});
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
              const EmptyState(icon: Icons.notifications_none, title: 'Nothing yet', message: 'Bookings, refunds and ride reminders show up here.')
            else
              for (final n in d.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Panel(
                    highlighted: n.readAt == null,
                    onTap: n.kind == 'credits.earned'
                        ? () => context.push('/account/wallet')
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
