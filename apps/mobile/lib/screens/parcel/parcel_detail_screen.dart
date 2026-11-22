// /parcel/:id: the sender's parcel. The collection code appears only here.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import '../../api/parcel_models.dart';
import '../../core/format.dart';
import '../../core/parcels.dart';
import '../../state/catalog.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import '../auth/login_screen.dart';
import 'courier_steps.dart';
import 'parcel_widgets.dart';
import 'polling.dart';

class ParcelDetailScreen extends ConsumerStatefulWidget {
  const ParcelDetailScreen({super.key, required this.id});
  final String id;
  @override
  ConsumerState<ParcelDetailScreen> createState() => _ParcelDetailScreenState();
}

class _ParcelDetailScreenState extends ConsumerState<ParcelDetailScreen> with PollsWhileVisible {
  Parcel? _parcel;
  String? _error;

  @override
  bool get keepPolling => !parcelSettled.contains(_parcel?.state);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => poll());
  }

  @override
  Future<void> poll() async {
    if (!mounted) return;
    final asked = ref.read(userProvider)?.id;
    if (asked == null) return;
    try {
      final p = await ref.read(apiProvider).parcel(widget.id);
      // An answer for an account that has signed out since would leave its code on screen.
      if (!mounted || ref.read(userProvider)?.id != asked) return;
      setState(() {
        _parcel = p;
        _error = null;
      });
      // It moved since My Trips loaded, so that card's label and buttons need the new state.
      final listed = ref.read(bookingsProvider).value?.where((b) => b.id == p.bookingId).firstOrNull;
      if (listed != null && listed.parcelState != p.state) ref.invalidate(bookingsProvider);
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    // The saved session can still be loading when a notification opens this screen.
    ref.listen(userProvider, (prev, next) {
      if (next == null) {
        setState(() => _parcel = null); // signed out: don't leave the code on screen
      } else if (prev?.id != next.id) {
        poll();
      }
    });
    final user = ref.watch(userProvider);
    final p = _parcel;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Your parcel'),
        actions: [IconButton(tooltip: 'Refresh', onPressed: poll, icon: const Icon(Icons.refresh))],
      ),
      body: user == null
          ? ScreenList(children: [
              EmptyState(
                icon: Icons.inventory_2_outlined,
                title: 'Sign in to see your parcel',
                action: GoldButton(label: 'Login', expand: false, onPressed: () => ensureSignedIn(context, ref)),
              ),
            ])
          : p == null
              ? ScreenList(children: [if (_error != null) ErrorBox(_error!, onRetry: poll) else const Skeleton(height: 220)])
              : _body(p),
    );
  }

  Widget _body(Parcel p) {
    final c = context.qf;
    final live = !parcelSettled.contains(p.state);
    final codeName = p.city ? 'Delivery code' : 'Collection code';
    return ScreenList(onRefresh: poll, children: [
      if (_error != null) ...[ErrorBox(_error!, onRetry: poll), const SizedBox(height: 12)],
      // The route gets the whole width; the status drops below it when they don't fit on one line.
      Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, runSpacing: 6, children: [
        Text(p.courier == null ? '${p.from} → ${p.to}' : '${p.courier!.pickup} → ${p.courier!.drop}', style: Theme.of(context).textTheme.titleLarge),
        Pill(parcelStateLabel(p.state), color: parcelStateColor(c, p.state)),
      ]),
      const SizedBox(height: 12),
      if (p.collectOtp != null) ...[
        Panel(
          highlighted: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(codeName.toUpperCase(), style: TextStyle(color: c.accent, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1.2)),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                p.collectOtp!,
                semanticsLabel: '$codeName ${p.collectOtp!.split('').join(' ')}',
                style: TextStyle(color: c.fgStrong, fontSize: 36, fontWeight: FontWeight.w700, letterSpacing: 7),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Give these ${ParcelRules.collectOtpDigits} digits only to ${p.receiverName.isEmpty ? 'the receiver' : p.receiverName}. '
              '${p.city ? 'The captain' : 'The counter'} hands the parcel over to whoever has them. Demo: no SMS is sent.'
              "${p.holdUntil == null ? '' : " It's held until ${parcelTime(p.holdUntil!)}."}",
              style: TextStyle(color: c.fgMuted, fontSize: 12.5),
            ),
          ]),
        ),
        const SizedBox(height: 12),
      ],
      if (p.courier != null && p.state != 'cancelled') ...[
        CourierSteps(
          key: ValueKey(p.state),
          parcel: p,
          onChanged: (next) {
            setState(() => _parcel = next);
            ref.invalidate(bookingsProvider);
          },
        ),
        const SizedBox(height: 12),
      ],
      if (p.state == 'returned') ...[
        const ErrorBox("It's coming back to you. What you paid to send it isn't refunded."),
        const SizedBox(height: 12),
      ],
      if (p.state == 'unclaimed') ...[
        ErrorBox('Nobody collected it within the hold period. To get it back, book a bus parcel from ${p.to} to ${p.from} with yourself as the receiver, then send its LR number through Get help.'),
        const SizedBox(height: 12),
      ],
      Panel(child: ParcelTimeline(city: p.city, state: p.state, events: p.events, departAt: p.departAt, readyAt: p.readyAt)),
      const SizedBox(height: 12),
      Panel(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (p.fromCounter != null) ...[CounterBlock(title: 'Hand in at', counter: p.fromCounter!), const SizedBox(height: 10)],
          if (p.toCounter != null)
            CounterBlock(title: 'Collect at', counter: p.toCounter!, when: p.readyAt == null ? null : 'Expected ${parcelTime(p.readyAt!)}'),
          if (p.fromCounter != null || p.toCounter != null) Divider(color: c.border, height: 24),
          KeyValue('Receiver', p.receiverName.isEmpty ? 'Erased' : p.receiverName),
          if (p.receiverPhone.isNotEmpty) KeyValue('Mobile', phoneDisplay(p.receiverPhone)),
          if (p.contents.isNotEmpty) KeyValue('Contents', p.contents),
          KeyValue('Liability', 'Up to ${inr(p.liability)}, not insured'),
        ]),
      ),
      const SizedBox(height: 12),
      Panel(
        child: Column(children: [
          // Dark on white in both themes, so any scanner reads it.
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(Brand.radiusField)),
            child: QrImageView(data: parcelTrackUrl(p.lr), size: 132, backgroundColor: Colors.white, semanticsLabel: 'QR code to track parcel ${p.lr}'),
          ),
          const SizedBox(height: 10),
          SelectableText(p.lr, textAlign: TextAlign.center, style: TextStyle(color: c.fgStrong, fontWeight: FontWeight.w600)),
          Text('The tracking page shows first names only, and never the code.',
              textAlign: TextAlign.center, style: TextStyle(color: c.fgSubtle, fontSize: 12)),
          const SizedBox(height: 10),
          GoldButton(
            label: 'Share tracking link',
            icon: Icons.ios_share,
            onPressed: () => SharePlus.instance.share(ShareParams(subject: 'QuikFly parcel', text: parcelShareText(p.lr, p.from, p.to, city: p.city))),
          ),
          TextButton.icon(
            onPressed: () => context.push('/support/new?booking=${p.bookingId}'),
            icon: const Icon(Icons.support_agent, size: 18),
            label: const Text('Get help'),
          ),
        ]),
      ),
      if (live && p.simulated) ...[const SizedBox(height: 12), SimulatedNote(city: p.city)],
    ]);
  }
}
