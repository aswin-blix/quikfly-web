// A live partner's trips and money: the dashboard revenue card (any date range), cab and
// driver performance, the Trips tab and trip detail, the Money tab (balance, payout request,
// paying what's owed, monthly statements kept for every month, ledger, payouts) and Account.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/api.dart';
import '../core/format.dart';
import '../state/providers.dart';
import '../theme/tokens.dart';
import '../widgets/ui.dart';
import 'home_screen.dart' show partnerSettings;
import 'partner_app.dart';

typedef DayRange = ({String from, String to});

DateTime _today() {
  final n = DateTime.now();
  return DateTime(n.year, n.month, n.day);
}

/// The date range the dashboard and trips show (default: the last 7 days), shared by both tabs.
class RangeNotifier extends Notifier<DateTimeRange> {
  @override
  DateTimeRange build() => DateTimeRange(start: _today().subtract(const Duration(days: 6)), end: _today());
  void set(DateTimeRange r) => state = r;
}

final partnerRangeProvider = NotifierProvider<RangeNotifier, DateTimeRange>(RangeNotifier.new);
DayRange dayRange(DateTimeRange r) => (from: isoDate(r.start), to: isoDate(r.end));

final summaryProvider = FutureProvider.family<VendorTripSummary, DayRange>((ref, r) => ref.watch(apiProvider).vendorSummary(r.from, r.to));
final tripsProvider = FutureProvider.family<List<VendorTrip>, DayRange>((ref, r) => ref.watch(apiProvider).vendorTrips(r.from, r.to));
final moneyProvider = FutureProvider<VendorMoney?>((ref) async {
  final status = ref.watch(vendorProvider.select((a) => a.value?.status));
  if (status != 'active') return null;
  return ref.watch(apiProvider).vendorMoney();
});

/// Refresh everything money-related (after a payout request, a payment, pull-to-refresh).
void refreshMoney(WidgetRef ref) {
  ref.invalidate(summaryProvider);
  ref.invalidate(tripsProvider);
  ref.invalidate(moneyProvider);
}

/// A tappable date range with a full calendar picker (any range, not just recent days).
class RangeBar extends ConsumerWidget {
  const RangeBar({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final r = ref.watch(partnerRangeProvider);
    String label(DateTime d) => shortDate(d);
    return InkWell(
      borderRadius: BorderRadius.circular(Brand.radiusField),
      onTap: () async {
        final picked = await showDateRangePicker(
          context: context,
          firstDate: DateTime(2025),
          lastDate: _today(),
          initialDateRange: r,
          helpText: 'Show trips from',
        );
        if (picked != null) ref.read(partnerRangeProvider.notifier).set(picked);
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.date_range, size: 18, color: c.accent),
          const SizedBox(width: 6),
          Text('${label(r.start)} – ${label(r.end)}', style: TextStyle(color: c.fgMuted)),
          Icon(Icons.expand_more, size: 18, color: c.fgMuted),
        ]),
      ),
    );
  }
}

/// Home: revenue for the range, cash / online / discount, net earnings; cab and driver performance.
class RevenueSection extends ConsumerWidget {
  const RevenueSection({super.key, required this.fleet});
  final VendorFleet fleet;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final s = ref.watch(summaryProvider(dayRange(ref.watch(partnerRangeProvider))));
    Widget part(String value, String label) => Expanded(
          child: Column(children: [
            Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
            Text(label, style: TextStyle(color: c.fgMuted, fontSize: 12)),
          ]),
        );
    Widget perf(String title, String value, String sub) => Container(
          width: 160,
          margin: const EdgeInsets.only(right: 10),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(Brand.radiusPanel), border: Border.all(color: c.border)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(value, style: TextStyle(color: c.accent, fontWeight: FontWeight.w700, fontSize: 16)),
            Text(sub, style: TextStyle(color: c.fgMuted, fontSize: 12)),
          ]),
        );
    return s.when(
      loading: () => const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
      error: (e, _) => ErrorBox(errorText(e), onRetry: () => ref.invalidate(summaryProvider)),
      data: (sum) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Panel(
          padding: EdgeInsets.zero,
          child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Revenue', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  const RangeBar(),
                ])),
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text(inrPaise(sum.gross), style: TextStyle(color: c.accent, fontWeight: FontWeight.w800, fontSize: 20)),
                  Text('Net earnings: ${inrPaise(sum.earning)}', style: TextStyle(color: c.success, fontSize: 12.5, fontWeight: FontWeight.w600)),
                ]),
              ]),
            ),
            Divider(height: 1, color: c.border),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Row(children: [part(inrPaise(sum.cash), 'Cash'), part(inrPaise(sum.online), 'Online'), part(inrPaise(sum.discount), 'Discount')]),
            ),
            Divider(height: 1, color: c.border),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Text('${sum.trips} completed trip${sum.trips == 1 ? '' : 's'}. Discounts (coupons, credits) are QuikFly\'s cost.',
                  style: TextStyle(color: c.fgSubtle, fontSize: 12)),
            ),
          ]),
        ),
        const SizedBox(height: 16),
        const Text('Cab performance', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
        const SizedBox(height: 8),
        if (sum.vehicles.isEmpty)
          Text('No completed trips in this range.', style: TextStyle(color: c.fgMuted))
        else
          SizedBox(
            height: 104,
            child: ListView(scrollDirection: Axis.horizontal, children: [
              for (final v in sum.vehicles) perf(VendorRules.formatReg(v.reg), inrPaise(v.earning), 'Rides: ${v.trips}'),
            ]),
          ),
        const SizedBox(height: 16),
        const Text('Driver performance', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
        const SizedBox(height: 8),
        if (sum.drivers.isEmpty)
          Text('No completed trips in this range.', style: TextStyle(color: c.fgMuted))
        else
          SizedBox(
            height: 104,
            child: ListView(scrollDirection: Axis.horizontal, children: [
              for (final d in sum.drivers) perf(d.name, inrPaise(d.earning), 'Rides: ${d.trips}'),
            ]),
          ),
      ]),
    );
  }
}

const _tripStatus = {'confirmed': 'Upcoming', 'ongoing': 'On trip', 'completed': 'Completed', 'cancelled': 'Cancelled'};

class TripsTab extends ConsumerWidget {
  const TripsTab({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final trips = ref.watch(tripsProvider(dayRange(ref.watch(partnerRangeProvider))));
    return ScreenList(onRefresh: () async => refreshMoney(ref), children: [
      const RangeBar(),
      const SizedBox(height: 8),
      ...trips.when(
        loading: () => [const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))],
        error: (e, _) => [ErrorBox(errorText(e), onRetry: () => ref.invalidate(tripsProvider))],
        data: (list) => list.isEmpty
            ? [const EmptyState(icon: Icons.route_outlined, title: 'No trips in this range', message: 'Rides and trips on your vehicles show up here.')]
            : [
                for (final t in list)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Panel(
                      onTap: () => context.push('/trip/${t.bookingId}', extra: t),
                      child: Row(children: [
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(t.subtitle.isEmpty ? t.title : t.subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                          Text('${dateTime(t.startsAt ?? t.createdAt)} · ${t.regNumber == null ? '' : VendorRules.formatReg(t.regNumber!)} · ${t.driverName ?? ''}',
                              maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: c.fgMuted, fontSize: 12)),
                          Text('${_tripStatus[t.status] ?? t.status} · ${t.payment.toUpperCase()}', style: TextStyle(color: t.status == 'cancelled' ? c.danger : c.fgSubtle, fontSize: 12)),
                        ])),
                        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                          Text(inrPaise(t.earning), style: TextStyle(fontWeight: FontWeight.w700, color: t.status == 'cancelled' ? c.fgSubtle : c.fg)),
                          if (t.estimate && t.status != 'cancelled') Text('estimate', style: TextStyle(color: c.fgSubtle, fontSize: 11)),
                        ]),
                      ]),
                    ),
                  ),
              ],
      ),
    ]);
  }
}

/// One trip, like Red Taxi's trip page: collection, fare split, driver, vehicle and route.
class TripDetailScreen extends StatelessWidget {
  const TripDetailScreen({super.key, required this.trip});
  final VendorTrip? trip;
  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final t = trip;
    if (t == null) return Scaffold(appBar: AppBar(), body: const EmptyState(icon: Icons.route_outlined, title: 'Open the trip from the Trips tab'));
    return Scaffold(
      appBar: AppBar(title: Text(t.bookingId)),
      body: ScreenList(children: [
        Panel(child: Column(children: [
          Text('Total collection', style: TextStyle(color: c.fgMuted)),
          Text(inrPaise(t.collected), style: TextStyle(color: c.accent, fontWeight: FontWeight.w800, fontSize: 26)),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: Column(children: [Text(dateTime(t.startsAt ?? t.createdAt), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600)), Text('Date', style: TextStyle(color: c.fgMuted, fontSize: 12))])),
            Expanded(child: Column(children: [Text(_tripStatus[t.status] ?? t.status, style: const TextStyle(fontWeight: FontWeight.w600)), Text('Status', style: TextStyle(color: c.fgMuted, fontSize: 12))])),
            Expanded(child: Column(children: [Text(t.payment.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w600)), Text('Payment', style: TextStyle(color: c.fgMuted, fontSize: 12))])),
          ]),
        ])),
        const SizedBox(height: 12),
        Panel(child: Column(children: [
          KeyValue('Fare (without GST)', inrPaise(t.fare)),
          KeyValue('GST', inrPaise(t.gst)),
          if (t.discount > 0) KeyValue('Discount (QuikFly pays)', inrPaise(t.discount)),
          KeyValue('QuikFly commission', '−${inrPaise(t.commission)}'),
          KeyValue('TDS (0.1%)', '−${inrPaise(t.tds)}'),
          Divider(color: c.border),
          KeyValue(t.estimate ? 'Your earnings (estimate)' : 'Your earnings', inrPaise(t.earning), bold: true),
          if (t.payment == 'cash' && t.status == 'completed')
            Padding(padding: const EdgeInsets.only(top: 6), child: Text('Your driver collected ${inrPaise(t.collected)} in cash; that is netted in your Money tab.', style: TextStyle(color: c.fgSubtle, fontSize: 12))),
        ])),
        const SizedBox(height: 12),
        Panel(child: Column(children: [
          if (t.driverName != null) KeyValue('Driver', t.driverName!),
          if (t.regNumber != null) KeyValue('Vehicle', VendorRules.formatReg(t.regNumber!)),
          KeyValue('Trip', t.title),
          if (t.subtitle.isNotEmpty) KeyValue('Route', t.subtitle),
          if (t.completedAt != null) KeyValue('Completed', dateTime(t.completedAt!)),
        ])),
      ]),
    );
  }
}

class MoneyTab extends ConsumerStatefulWidget {
  const MoneyTab({super.key});
  @override
  ConsumerState<MoneyTab> createState() => _MoneyTabState();
}

class _MoneyTabState extends ConsumerState<MoneyTab> {
  bool _busy = false;

  Future<void> _run(Future<VendorMoney> Function() call, String done) async {
    setState(() => _busy = true);
    try {
      await call();
      refreshMoney(ref);
      if (mounted) toast(context, done);
    } catch (e) {
      if (mounted) toast(context, errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final money = ref.watch(moneyProvider);
    return money.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(moneyProvider))]),
      data: (m) {
        if (m == null) return const Center(child: CircularProgressIndicator());
        final api = ref.read(apiProvider);
        final owed = m.balance >= 0;
        return ScreenList(onRefresh: () async => refreshMoney(ref), children: [
          Panel(
            highlighted: true,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(owed ? 'Eligible payout' : 'You owe QuikFly', style: TextStyle(color: c.fgMuted)),
              Text(inrPaise(m.balance.abs()), style: TextStyle(color: owed ? c.success : c.danger, fontWeight: FontWeight.w800, fontSize: 28)),
              const SizedBox(height: 4),
              Text(owed ? 'Trip earnings less cash your drivers kept and payouts so far.' : 'Your drivers collected more cash than you earned. Settle it to keep things clear.',
                  style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
              const SizedBox(height: 12),
              if (m.pending != null)
                Text('Payout of ${inrPaise(m.pending!.amount)} requested ${dateTime(m.pending!.requestedAt)}. QuikFly pays it to your bank and sends you the reference.',
                    style: TextStyle(color: c.warning))
              else if (owed) ...[
                Text('Minimum payout: ${inrPaise(m.minPayout)}', style: TextStyle(color: c.fgSubtle, fontSize: 12)),
                const SizedBox(height: 8),
                GoldButton(label: 'Request payout', loading: _busy, onPressed: m.balance >= m.minPayout ? () => _run(api.requestVendorPayout, 'Payout requested') : null),
              ] else ...[
                GoldButton(label: 'Pay ${inrPaise(-m.balance)}', loading: _busy, onPressed: () => _run(api.payVendorDues, 'Payment recorded')),
                const SizedBox(height: 6),
                Text('Demo: no money is taken. Online payment comes once QuikFly\'s payment gateway is live.', style: TextStyle(color: c.fgSubtle, fontSize: 12)),
              ],
            ]),
          ),
          const SizedBox(height: 16),
          const Text('Monthly statements', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 8),
          if (m.statements.isEmpty)
            Text('Statements appear after your first completed trip.', style: TextStyle(color: c.fgMuted))
          else
            for (final s in m.statements)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Panel(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text(_monthLabel(s.month), style: const TextStyle(fontWeight: FontWeight.w700))),
                      Text(inrPaise(s.earning), style: TextStyle(color: c.success, fontWeight: FontWeight.w700)),
                    ]),
                    const SizedBox(height: 4),
                    Text('${s.trips} trips · collection ${inrPaise(s.gross)} · commission ${inrPaise(s.commission)} · TDS ${inrPaise(s.tds)} · cash kept ${inrPaise(s.cash)}',
                        style: TextStyle(color: c.fgMuted, fontSize: 12)),
                  ]),
                ),
              ),
          const SizedBox(height: 16),
          const Text('Recent activity', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 8),
          if (m.entries.isEmpty)
            Text('Nothing yet.', style: TextStyle(color: c.fgMuted))
          else
            Panel(
              padding: EdgeInsets.zero,
              child: Column(children: [
                for (var i = 0; i < m.entries.length; i++) ...[
                  if (i > 0) Divider(height: 1, color: c.border),
                  ListTile(
                    dense: true,
                    title: Text(m.entries[i].note, maxLines: 1, overflow: TextOverflow.ellipsis),
                    subtitle: Text('${ledgerLabel[m.entries[i].kind] ?? m.entries[i].kind} · ${dateTime(m.entries[i].at)}'),
                    trailing: Text(inrPaise(m.entries[i].amount), style: TextStyle(fontWeight: FontWeight.w700, color: m.entries[i].amount >= 0 ? c.success : c.fg)),
                  ),
                ],
              ]),
            ),
          if (m.payouts.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Text('Payouts', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 8),
            for (final p in m.payouts)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Panel(child: Row(children: [
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(inrPaise(p.amount), style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text(p.status == 'paid' ? 'Paid · ref ${p.reference}' : p.status == 'rejected' ? 'Not paid: ${p.note ?? ''}' : 'Requested ${dateTime(p.requestedAt)}',
                        style: TextStyle(color: p.status == 'rejected' ? c.danger : c.fgMuted, fontSize: 12)),
                  ])),
                  Icon(p.status == 'paid' ? Icons.check_circle : p.status == 'rejected' ? Icons.cancel_outlined : Icons.schedule,
                      color: p.status == 'paid' ? c.success : p.status == 'rejected' ? c.danger : c.warning),
                ])),
              ),
          ],
        ]);
      },
    );
  }
}

String _monthLabel(String ym) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  final parts = ym.split('-');
  final m = parts.length == 2 ? int.tryParse(parts[1]) : null;
  return m == null || m < 1 || m > 12 ? ym : '${months[m - 1]} ${parts[0]}';
}

/// Account (from the app bar): details, payout account, notifications, support, sign out.
class PartnerAccountScreen extends ConsumerWidget {
  const PartnerAccountScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final user = ref.watch(sessionProvider).value;
    final a = ref.watch(vendorProvider).value;
    final settings = partnerSettings(ref);
    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ScreenList(children: [
        Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(user?.name ?? '', style: Theme.of(context).textTheme.titleLarge),
          Text(user?.phone ?? '', style: TextStyle(color: c.fgMuted)),
          const SizedBox(height: 10),
          KeyValue('City', a?.city ?? '—'),
          if (a?.bank != null) KeyValue('Payouts to', '${a!.bank!.ifsc} · •••• ${a.bank!.accountLast4}'),
          if (a?.stickerDoneAt != null) KeyValue('Live since', dateTime(DateTime.parse(a!.stickerDoneAt!).toLocal())),
        ])),
        const SizedBox(height: 12),
        Panel(
          padding: EdgeInsets.zero,
          child: Column(children: [
            ListTile(leading: const Icon(Icons.notifications_none), title: const Text('Notifications'), trailing: const Icon(Icons.chevron_right), onTap: () => context.push('/notifications')),
            Divider(height: 1, color: c.border),
            ListTile(
              leading: const Icon(Icons.support_agent),
              title: const Text('Call partner support'),
              subtitle: Text(settings.companyPhone),
              onTap: () => launchUrl(Uri(scheme: 'tel', path: settings.companyPhone.replaceAll(' ', ''))),
            ),
            Divider(height: 1, color: c.border),
            ListTile(leading: const Icon(Icons.privacy_tip_outlined), title: const Text('Privacy & data'), trailing: const Icon(Icons.chevron_right), onTap: () => context.push('/privacy/data')),
            Divider(height: 1, color: c.border),
            ListTile(
              leading: Icon(Icons.logout, color: c.danger),
              title: Text('Sign out', style: TextStyle(color: c.danger)),
              onTap: () async {
                await ref.read(sessionProvider.notifier).signOut();
                ref.invalidate(vendorProvider);
                if (context.mounted) context.go('/');
              },
            ),
          ]),
        ),
      ]),
    );
  }
}
