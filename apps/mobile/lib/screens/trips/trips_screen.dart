// My Trips: Upcoming / Past / Cancelled, expandable details, cancel (wallet payments are refunded).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../core/format.dart';
import '../../core/services.dart';
import '../../state/catalog.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../auth/login_screen.dart';

class TripsScreen extends ConsumerWidget {
  const TripsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userProvider);
    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('My trips')),
        body: ScreenList(children: [
          EmptyState(
            icon: Icons.confirmation_number_outlined,
            title: 'Sign in to see your trips',
            message: 'Rides, bus tickets, holidays and rentals you book show up here.',
            action: GoldButton(label: 'Login or sign up', expand: false, onPressed: () => ensureSignedIn(context, ref)),
          ),
        ]),
      );
    }
    final bookings = ref.watch(bookingsProvider);
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('My trips'),
          bottom: TabBar(
            labelColor: context.qf.accent,
            indicatorColor: context.qf.accent,
            unselectedLabelColor: context.qf.fgMuted,
            dividerColor: context.qf.border,
            tabs: const [Tab(text: 'Upcoming'), Tab(text: 'Past'), Tab(text: 'Cancelled')],
          ),
        ),
        body: bookings.when(
          loading: () => const ScreenList(children: [Skeleton(height: 96), SizedBox(height: 12), Skeleton(height: 96)]),
          error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(bookingsProvider))]),
          data: (all) {
            Future<void> refresh() async {
              ref.invalidate(bookingsProvider);
              await ref.read(bookingsProvider.future);
            }

            Widget tab(bool Function(Booking) test, String empty) {
              final list = all.where(test).toList();
              return ScreenList(onRefresh: refresh, children: [
                if (list.isEmpty)
                  EmptyState(
                    icon: Icons.luggage_outlined,
                    title: empty,
                    action: OutlinedButton(onPressed: () => context.go('/'), child: const Text('Book something')),
                  )
                else
                  for (final b in list) Padding(padding: const EdgeInsets.only(bottom: 12), child: BookingCard(b)),
              ]);
            }

            return TabBarView(children: [
              tab((b) => b.status.active, 'No upcoming trips'),
              tab((b) => b.status == BookingStatus.completed, 'No past trips yet'),
              tab((b) => b.status == BookingStatus.cancelled, 'No cancelled trips'),
            ]);
          },
        ),
      ),
    );
  }
}

String statusLabel(BookingStatus s) => switch (s) {
      BookingStatus.confirmed => 'Confirmed',
      BookingStatus.ongoing => 'Ongoing',
      BookingStatus.completed => 'Completed',
      BookingStatus.cancelled => 'Cancelled',
    };

/// Booking line labels that already say how it was paid (checkout writes "Paid via", rides "Payment").
const _paymentLines = {'Paid via', 'Payment'};

String paymentLabel(String p) => switch (p) {
      'upi' => 'UPI',
      'card' => 'Card',
      'netbanking' => 'Net banking',
      'wallet' => 'QuikFly wallet',
      'cash' => 'Cash',
      _ => p,
    };

class BookingCard extends ConsumerStatefulWidget {
  const BookingCard(this.booking, {super.key});
  final Booking booking;
  @override
  ConsumerState<BookingCard> createState() => _BookingCardState();
}

class _BookingCardState extends ConsumerState<BookingCard> {
  var _open = false;
  var _busy = false;

  Future<void> _cancel() async {
    final b = widget.booking;
    final ok = await confirm(context,
        title: 'Cancel this booking?',
        message: b.payment == 'wallet' ? '${inr(b.amount)} goes back to your QuikFly wallet at once.' : 'This booking will be cancelled.',
        yes: 'Cancel booking',
        danger: true);
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(apiProvider).cancelBooking(b.id);
      ref.invalidate(bookingsProvider);
      await ref.read(sessionProvider.notifier).refresh();
      if (mounted) toast(context, b.payment == 'wallet' ? 'Cancelled. ${inr(b.amount)} refunded to your wallet.' : 'Booking cancelled.');
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final b = widget.booking;
    final s = serviceOf(b.service);
    final statusColor = switch (b.status) {
      BookingStatus.cancelled => c.danger,
      BookingStatus.completed => c.fgMuted,
      _ => c.success,
    };
    return Panel(
      padding: EdgeInsets.zero,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        InkWell(
          onTap: () => setState(() => _open = !_open),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(color: Brand.gold.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                child: Icon(s.icon, color: c.accent),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(b.title, style: const TextStyle(fontWeight: FontWeight.w700), maxLines: 2, overflow: TextOverflow.ellipsis),
                  if (b.subtitle.isNotEmpty) Text(b.subtitle, style: TextStyle(color: c.fgMuted, fontSize: 13), maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 6),
                  Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                    Pill(statusLabel(b.status), color: statusColor),
                    Text(dateTime(b.createdAt), style: TextStyle(color: c.fgSubtle, fontSize: 12)),
                  ]),
                ]),
              ),
              const SizedBox(width: 8),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(inr(b.amount), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                Icon(_open ? Icons.expand_less : Icons.expand_more, color: c.fgSubtle),
              ]),
            ]),
          ),
        ),
        AnimatedCrossFade(
          duration: const Duration(milliseconds: 200),
          crossFadeState: _open ? CrossFadeState.showSecond : CrossFadeState.showFirst,
          firstChild: const SizedBox(width: double.infinity),
          secondChild: Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(14, 4, 14, 14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Divider(color: c.border),
              const SizedBox(height: 6),
              KeyValue('Booking ID', b.id),
              for (final l in b.lines) KeyValue(l.$1, l.$2),
              // Bookings usually carry their own "Paid via" / "Payment" line; add one only when they don't.
              if (!b.lines.any((l) => _paymentLines.contains(l.$1))) KeyValue('Paid by', paymentLabel(b.payment)),
              const SizedBox(height: 10),
              // Cancelled bookings have no invoice and nothing left to cancel.
              if (b.status != BookingStatus.cancelled)
                Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => context.push('/invoice/${b.id}'),
                    icon: const Icon(Icons.receipt_long_outlined, size: 18),
                    label: const Text('Invoice'),
                  ),
                ),
                if (b.status.active) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(foregroundColor: c.danger, side: BorderSide(color: c.danger.withValues(alpha: 0.5))),
                      onPressed: _busy ? null : _cancel,
                      child: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Cancel'),
                    ),
                  ),
                ],
              ]),
            ]),
          ),
        ),
      ]),
    );
  }
}
