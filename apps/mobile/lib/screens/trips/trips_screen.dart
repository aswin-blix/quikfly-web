// My Trips: Upcoming / Past / Cancelled, expandable details, cancel (wallet payments are refunded per the cancellation policy).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../api/models.dart';
import '../../core/bus_changes.dart';
import '../../core/cancellation.dart';
import '../../core/format.dart';
import '../../core/services.dart';
import '../../core/trips.dart';
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

            int tripSize(String id) => all.where((x) => x.tripId == id).length;
            bool inTrip(Booking b) => b.tripId != null && tripSize(b.tripId!) > 1;

            Widget tab(bool Function(Booking) test, String empty) {
              final list = all.where(test).toList();
              // A trip's bookings stay together (in time order) where its first booking appears.
              final ordered = <Booking>[];
              for (var i = 0; i < list.length; i++) {
                final b = list[i];
                if (!inTrip(b)) {
                  ordered.add(b);
                } else if (list.indexWhere((x) => x.tripId == b.tripId) == i) {
                  ordered.addAll(list.where((x) => x.tripId == b.tripId).toList()..sort((x, y) => bookingWhen(x).compareTo(bookingWhen(y))));
                }
              }
              return ScreenList(onRefresh: refresh, children: [
                if (list.isEmpty)
                  EmptyState(
                    icon: Icons.luggage_outlined,
                    title: empty,
                    action: OutlinedButton(onPressed: () => context.go('/'), child: const Text('Book something')),
                  )
                else
                  for (var i = 0; i < ordered.length; i++) ...[
                    if (inTrip(ordered[i]) && (i == 0 || ordered[i - 1].tripId != ordered[i].tripId))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(children: [
                          Icon(Icons.route, size: 18, color: context.qf.accent),
                          const SizedBox(width: 6),
                          Expanded(child: Text('Trip · ${tripSize(ordered[i].tripId!)} bookings', style: const TextStyle(fontWeight: FontWeight.w700))),
                          TextButton(onPressed: () => context.push('/trip/${ordered[i].tripId}'), child: const Text('Trip summary')),
                        ]),
                      ),
                    Padding(
                      padding: EdgeInsets.only(bottom: 12, left: inTrip(ordered[i]) ? 12 : 0),
                      child: BookingCard(ordered[i]),
                    ),
                  ],
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
    final (percent, refund) = refundPreview(ref.read(configProvider).value?.settings ?? const Settings({}), b);
    final ok = await confirm(context,
        title: 'Cancel this booking?',
        message: refund == 0
            ? "It's too close to the start for a refund under the cancellation policy."
            : b.payment != 'wallet'
                ? '${inr(refund)}${percent < 100 ? ' ($percent%)' : ''} is due back under the cancellation policy.'
                : '${inr(refund)}${percent < 100 ? ' ($percent%)' : ''} goes back to your QuikFly wallet at once.',
        yes: 'Cancel booking',
        danger: true);
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      final done = await ref.read(apiProvider).cancelBooking(b.id);
      ref.invalidate(bookingsProvider);
      await ref.read(sessionProvider.notifier).refresh();
      final back = done.refundAmount ?? 0;
      if (mounted) {
        toast(context, back == 0 ? 'Cancelled. No refund under the cancellation policy.' : b.payment != 'wallet' ? 'Cancelled. Refund due: ${inr(back)}.' : 'Cancelled. ${inr(back)} refunded to your wallet.');
      }
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  /// Bus tickets: pick some seats to cancel (the others stay booked), with the refund shown first.
  Future<void> _cancelSeats() async {
    final b = widget.booking;
    final settings = ref.read(configProvider).value?.settings ?? const Settings({});
    final picked = await showModalBottomSheet<List<String>>(
      context: context,
      showDragHandle: true,
      builder: (ctx) {
        final chosen = <String>[];
        return StatefulBuilder(builder: (ctx, setSheet) {
          final c = ctx.qf;
          final err = chosen.isEmpty ? null : seatCancelError(b, chosen);
          final (refund, percent) = chosen.isEmpty ? (0, 100) : seatCancelRefund(settings, b, chosen);
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(Brand.gutter, 0, Brand.gutter, Brand.gutter),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Cancel some seats', style: Theme.of(ctx).textTheme.titleLarge),
                const SizedBox(height: 4),
                Text('Which seats? The others stay booked.', style: TextStyle(color: c.fgMuted)),
                const SizedBox(height: 12),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final s in b.seats)
                    FilterChip(
                      label: Text(s.id),
                      selected: chosen.contains(s.id),
                      onSelected: (on) => setSheet(() => on ? chosen.add(s.id) : chosen.remove(s.id)),
                    ),
                ]),
                const SizedBox(height: 12),
                if (err != null)
                  Text(err, style: TextStyle(color: c.warning, fontSize: 13))
                else if (chosen.isNotEmpty)
                  Text(
                    refund > 0
                        ? '${inr(refund)}${percent < 100 ? ' ($percent%)' : ''} ${b.payment == 'wallet' ? 'comes back to your wallet' : 'is due back'}.'
                        : "It's too close to departure for a refund.",
                    style: TextStyle(color: c.fgSoft),
                  ),
                const SizedBox(height: 12),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(foregroundColor: c.danger, side: BorderSide(color: c.danger.withValues(alpha: 0.5))),
                  onPressed: chosen.isEmpty || err != null ? null : () => Navigator.pop(ctx, [...chosen]),
                  child: Text('Cancel ${chosen.isEmpty ? '' : '${chosen.length} '}seat${chosen.length == 1 ? '' : 's'}'),
                ),
              ]),
            ),
          );
        });
      },
    );
    if (picked == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(apiProvider).cancelSeats(b.id, picked);
      final (refund, _) = seatCancelRefund(settings, b, picked);
      ref.invalidate(bookingsProvider);
      await ref.read(sessionProvider.notifier).refresh();
      if (mounted) {
        toast(context, 'Seat${picked.length > 1 ? 's' : ''} ${picked.join(', ')} cancelled. '
            '${refund == 0 ? 'No refund under the cancellation policy.' : b.payment == 'wallet' ? '${inr(refund)} refunded to your wallet.' : 'Refund due: ${inr(refund)}.'}');
      }
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
    final settings = ref.watch(configProvider).value?.settings ?? const Settings({});
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
              if (b.startsAt != null && !b.lines.any((l) => l.$1 == 'Pickup time')) KeyValue('Starts', dateTime(b.startsAt!)),
              if (b.deposit > 0 && b.status != BookingStatus.cancelled)
                KeyValue(
                    'Refundable deposit',
                    b.status == BookingStatus.completed
                        ? '${inr(b.deposit)} ${b.payment == 'wallet' ? 'returned to wallet' : 'due back'}'
                        : '${inr(b.deposit)} (back after return)'),
              if (b.status == BookingStatus.cancelled && b.cancelFee > 0)
                KeyValue('Cancellation fee', '${inr(b.cancelFee)}${b.payment == 'wallet' ? ' (kept)' : ' (demo: not collected)'}'),
              if (b.status == BookingStatus.cancelled && b.refundAmount != null)
                KeyValue(b.payment == 'wallet' ? 'Refunded to wallet' : 'Refund due', b.refundAmount! > 0 ? inr(b.refundAmount!) : 'Nothing (cancelled too late)'),
              // Bookings usually carry their own "Paid via" / "Payment" line; add one only when they don't.
              if (!b.lines.any((l) => _paymentLines.contains(l.$1))) KeyValue('Paid by', paymentLabel(b.payment)),
              const SizedBox(height: 10),
              // A ride booked ahead starts from here once the driver is assigned.
              if (b.status == BookingStatus.confirmed && b.rideId != null && b.startsAt != null && (b.service == ServiceKey.bike || b.service == ServiceKey.car))
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: b.startsAt!.subtract(const Duration(minutes: Rules.rideStartWindowMinutes)).isAfter(DateTime.now())
                      ? Text('Driver assigned ${Rules.rideStartWindowMinutes} min before pickup; start the ride here then.', style: TextStyle(color: c.fgMuted, fontSize: 12.5))
                      : GoldButton(label: 'Start ride', onPressed: () => context.push('/ride/${b.service == ServiceKey.bike ? 'bike' : 'car'}?ride=${b.rideId}&booking=${b.id}')),
                ),
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
              // Bus tickets: m-ticket, change to another bus (once), cancel some seats.
              if (b.service == ServiceKey.bus && b.status == BookingStatus.confirmed) ...[
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  if (b.ticketToken != null)
                    OutlinedButton.icon(onPressed: () => context.push('/ticket/${b.id}'), icon: const Icon(Icons.qr_code_2, size: 18), label: const Text('m-Ticket')),
                  if (rescheduleError(settings, b) == null)
                    OutlinedButton.icon(
                      onPressed: () {
                        final parts = b.title.split(' → ');
                        context.push(Uri(path: '/bus/search', queryParameters: {
                          'from': parts.first,
                          'to': parts.length > 1 ? parts[1] : '',
                          'date': isoDate(b.startsAt!),
                          'change': b.id,
                        }).toString());
                      },
                      icon: const Icon(Icons.swap_horiz, size: 18),
                      label: const Text('Change bus'),
                    ),
                  if (b.seats.length > 1)
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(foregroundColor: c.danger),
                      onPressed: _busy ? null : _cancelSeats,
                      child: const Text('Cancel some seats'),
                    ),
                ]),
                if (b.rescheduledAt != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text('Changed to this bus on ${dateTime(b.rescheduledAt!)}. A ticket can be changed once.', style: TextStyle(color: c.fgSubtle, fontSize: 12)),
                  ),
              ],
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => context.push('/support/new?booking=${b.id}'),
                  icon: const Icon(Icons.support_agent, size: 18),
                  label: const Text('Get help with this booking'),
                ),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}
