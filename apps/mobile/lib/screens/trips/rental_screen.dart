// Self-drive rental (/rental/:id): where it is, the pickup and return readings, extensions and
// the deposit settlement; the checklist (/rental/:id/:stage) takes the five photos, the
// odometer and the fuel level to start or end it. Staff settle the deposit in admin.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../api/rental_models.dart';
import '../../core/format.dart';
import '../../state/catalog.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';

final rentalProvider = FutureProvider.autoDispose.family<Rental, String>((ref, id) => ref.watch(apiProvider).rental(id));

String rentalStateLabel(String s) => switch (s) {
      'on_trip' => 'On trip',
      'returned' => 'Returned · deposit being checked',
      'settled' => 'Deposit settled',
      _ => 'Not started',
    };

class RentalScreen extends ConsumerWidget {
  const RentalScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final rental = ref.watch(rentalProvider(id));
    final booking = ref.watch(bookingsProvider).value?.where((b) => b.id == id).firstOrNull;
    // The km plan the rental was booked under.
    final settings = ref.watch(configProvider).value?.settings.withTerms(booking?.terms);
    return Scaffold(
      appBar: AppBar(title: const Text('Self-drive rental')),
      body: rental.when(
        loading: () => const ScreenList(children: [Skeleton(height: 120), SizedBox(height: 12), Skeleton(height: 160)]),
        error: (e, _) => ScreenList(children: [ErrorBox(errorText(e), onRetry: () => ref.invalidate(rentalProvider(id)))]),
        data: (r) {
          final s = r.settlement;
          return ScreenList(onRefresh: () async => ref.invalidate(rentalProvider(id)), children: [
            Panel(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(booking?.title ?? 'Your car', style: Theme.of(context).textTheme.titleMedium)),
                  Pill(rentalStateLabel(r.state), color: r.state == 'returned' ? c.warning : c.accent),
                ]),
                const SizedBox(height: 8),
                KeyValue('Pickup', rentalTime(r.start)),
                KeyValue(r.extensions.isEmpty ? 'Return by' : 'Return by (extended)', rentalTime(r.endsAt)),
                KeyValue('Km plan', r.kmPlan == 'unlimited' ? 'Unlimited' : '${settings?.rentLimitedKmPerDay ?? 140} km/day'),
                if (r.pickup != null) KeyValue('At pickup', '${r.pickup!.odometerKm} km · ${fuelLabel(r.pickup!.fuel)}'),
                if (r.dropoff != null) KeyValue('At return', '${r.dropoff!.odometerKm} km · ${fuelLabel(r.dropoff!.fuel)}'),
                if (r.extensions.isNotEmpty) KeyValue('Extended', '+${r.extendedHours} hrs (${inr(r.extendedAmount)})'),
              ]),
            ),
            const SizedBox(height: 12),
            if (r.state == 'booked') ...[
              Text('At pickup, take five photos of the car (every side and the odometer with the fuel gauge) and note the reading. They protect you if there\'s a question about damage later.',
                  style: TextStyle(color: c.fgMuted)),
              const SizedBox(height: 12),
              GoldButton(label: 'Start rental', icon: Icons.key_outlined, onPressed: () => context.push('/rental/$id/pickup')),
            ],
            if (r.state == 'on_trip')
              GoldButton(label: 'End rental', icon: Icons.check_circle_outline, onPressed: () => context.push('/rental/$id/return')),
            if (r.canExtend) ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => showModalBottomSheet(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => _ExtendSheet(rental: r)),
                icon: const Icon(Icons.more_time, size: 18),
                label: const Text('Extend'),
              ),
            ],
            if (r.state == 'returned')
              Text('Thanks! QuikFly is checking the car. Your deposit settlement follows within ${settings?.rentDepositRefundHours ?? 48} hours.', style: TextStyle(color: c.fgMuted)),
            if (s != null)
              Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Deposit settlement', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text('${s.kmDriven} km driven${s.kmIncluded != null ? ' (${s.kmIncluded} km included)' : ' (unlimited km)'}', style: TextStyle(color: c.fgMuted, fontSize: 13)),
                  const SizedBox(height: 8),
                  KeyValue('Deposit', inr(s.deposit)),
                  for (final l in s.lines) KeyValue(l.label, '−${inr(l.amount)}', valueColor: c.danger),
                  Divider(color: c.border),
                  KeyValue(booking?.payment == 'wallet' ? 'Returned to wallet' : 'Due back to you', inr(s.depositReturned), bold: true),
                  if (s.due > 0) KeyValue('Still owed', '${inr(s.due)} (demo: not collected)', valueColor: c.danger),
                  if (s.damageNote != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Damage: ${s.damageNote}', style: TextStyle(color: c.fgSubtle, fontSize: 12))),
                ]),
              ),
          ]);
        },
      ),
    );
  }
}

class _ExtendSheet extends ConsumerStatefulWidget {
  const _ExtendSheet({required this.rental});
  final Rental rental;
  @override
  ConsumerState<_ExtendSheet> createState() => _ExtendSheetState();
}

class _ExtendSheetState extends ConsumerState<_ExtendSheet> {
  int _hours = 2;
  ExtensionQuote? _quote;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _quote = null; _error = null; });
    try {
      final q = await ref.read(apiProvider).extensionQuote(widget.rental.bookingId, _hours);
      if (mounted) setState(() => _quote = q);
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _pay() async {
    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(apiProvider).extendRental(widget.rental.bookingId, _hours);
      ref.invalidate(rentalProvider(widget.rental.bookingId));
      ref.invalidate(bookingsProvider);
      if (mounted) {
        toast(context, 'Extended. ${inr(_quote!.total)} added.');
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final max = ref.watch(configProvider).value?.settings.rentExtendMaxHours ?? 48;
    final payment = ref.watch(bookingsProvider).value?.where((b) => b.id == widget.rental.bookingId).firstOrNull?.payment;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(Brand.gutter, 0, Brand.gutter, 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Extend your rental', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text('Now due back ${rentalTime(widget.rental.endsAt)}.', style: TextStyle(color: c.fgMuted)),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final h in rentalExtendHours.where((h) => h <= max))
              ChoiceChip(label: Text('+$h hr${h > 1 ? 's' : ''}'), selected: _hours == h, onSelected: (_) { setState(() => _hours = h); _load(); }),
          ]),
          const SizedBox(height: 12),
          Panel(
            child: _quote == null
                ? (_error == null ? const Center(child: Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator())) : const SizedBox.shrink())
                : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    for (final l in _quote!.lines) KeyValue(l.label, inr(l.amount)),
                    Divider(color: c.border),
                    KeyValue('Total', inr(_quote!.total), bold: true),
                    const SizedBox(height: 4),
                    Text('New return time: ${rentalTime(_quote!.endsAt)}. ${payment == 'wallet' ? 'Paid from your QuikFly wallet.' : 'Demo: no payment is taken.'}',
                        style: TextStyle(color: c.fgSubtle, fontSize: 12)),
                  ]),
          ),
          FormError(_error),
          const SizedBox(height: 8),
          GoldButton(label: _quote == null ? 'Extend' : 'Extend for ${inr(_quote!.total)}', loading: _busy, onPressed: _quote == null ? null : _pay),
        ]),
      ),
    );
  }
}

class RentalChecklistScreen extends ConsumerStatefulWidget {
  const RentalChecklistScreen({super.key, required this.id, required this.stage});
  final String id;
  /// pickup | return
  final String stage;
  @override
  ConsumerState<RentalChecklistScreen> createState() => _RentalChecklistScreenState();
}

class _RentalChecklistScreenState extends ConsumerState<RentalChecklistScreen> {
  final _odometer = TextEditingController();
  final Map<String, Uint8List> _shots = {};
  Rental? _rental;
  int? _fuel;
  String? _busySide;
  bool _busy = false;
  String? _error;

  bool get _pickup => widget.stage == 'pickup';

  @override
  void dispose() {
    _odometer.dispose();
    super.dispose();
  }

  Future<void> _take(String side) async {
    try {
      final f = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 1600, maxHeight: 1600, imageQuality: 80);
      if (f == null) return;
      final bytes = await f.readAsBytes();
      setState(() { _busySide = side; _error = null; });
      final r = await ref.read(apiProvider).uploadRentalPhoto(widget.id, widget.stage, side, bytes);
      if (mounted) setState(() { _rental = r; _shots[side] = bytes; });
    } catch (e) {
      if (mounted) setState(() => _error = e is Exception && e.toString().contains('camera') ? 'Couldn\'t open the camera. Check the app\'s permissions.' : errorText(e));
    }
    if (mounted) setState(() => _busySide = null);
  }

  Future<void> _submit(Rental r) async {
    final km = int.tryParse(_odometer.text);
    final done = r.photos[widget.stage] ?? const [];
    if (done.length < rentalPhotoSides.length) return setState(() => _error = 'Add all five photos first.');
    if (km == null) return setState(() => _error = 'Enter the odometer reading in km.');
    if (!_pickup && r.pickup != null && km < r.pickup!.odometerKm) return setState(() => _error = 'The odometer can\'t be lower than at pickup (${r.pickup!.odometerKm} km).');
    final fuel = _fuel ?? (_pickup ? fuelEighths : r.pickup?.fuel ?? fuelEighths);
    setState(() { _busy = true; _error = null; });
    try {
      final api = ref.read(apiProvider);
      if (_pickup) {
        await api.startRental(widget.id, km, fuel);
      } else {
        await api.endRental(widget.id, km, fuel);
      }
      ref.invalidate(rentalProvider(widget.id));
      ref.invalidate(bookingsProvider);
      if (mounted) {
        toast(context, _pickup ? 'Rental started. Drive safe!' : 'Car returned. We\'ll settle your deposit soon.');
        context.pop();
      }
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final loaded = ref.watch(rentalProvider(widget.id));
    final r = _rental ?? loaded.value;
    return Scaffold(
      appBar: AppBar(title: Text(_pickup ? 'Start your rental' : 'End your rental')),
      body: r == null
          ? ScreenList(children: [loaded.hasError ? ErrorBox(errorText(loaded.error!), onRetry: () => ref.invalidate(rentalProvider(widget.id))) : const Skeleton(height: 240)])
          : ScreenList(children: [
              Text(_pickup
                  ? 'Before you drive off, photograph the car from every side and the odometer with the fuel gauge.'
                  : 'Park the car, then photograph it again from every side and the odometer with the fuel gauge.',
                  style: TextStyle(color: c.fgMuted)),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 4 / 3,
                children: [
                  for (final e in rentalPhotoSides.entries)
                    _PhotoTile(
                      label: e.value,
                      has: (r.photos[widget.stage] ?? const []).contains(e.key),
                      bytes: _shots[e.key],
                      busy: _busySide == e.key,
                      onTap: _busySide != null ? null : () => _take(e.key),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _odometer,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                decoration: InputDecoration(labelText: 'Odometer (km)', hintText: !_pickup && r.pickup != null ? 'At pickup: ${r.pickup!.odometerKm}' : 'e.g. 24816'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<int>(
                initialValue: _fuel ?? (_pickup ? fuelEighths : r.pickup?.fuel ?? fuelEighths),
                decoration: const InputDecoration(labelText: 'Fuel level'),
                items: [for (var n = fuelEighths; n >= 0; n--) DropdownMenuItem(value: n, child: Text(fuelLabel(n)))],
                onChanged: (v) => setState(() => _fuel = v),
              ),
              FormError(_error),
              const SizedBox(height: 8),
              GoldButton(label: _pickup ? 'Start rental' : 'End rental', icon: _pickup ? Icons.key_outlined : Icons.check_circle_outline, loading: _busy, onPressed: () => _submit(r)),
              const SizedBox(height: 6),
              Text('${(r.photos[widget.stage] ?? const []).length}/${rentalPhotoSides.length} photos', textAlign: TextAlign.center, style: TextStyle(color: c.fgSubtle, fontSize: 12)),
            ]),
    );
  }
}

class _PhotoTile extends StatelessWidget {
  const _PhotoTile({required this.label, required this.has, required this.bytes, required this.busy, required this.onTap});
  final String label;
  final bool has, busy;
  final Uint8List? bytes;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return Material(
      color: has ? c.accent.withValues(alpha: 0.08) : c.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Brand.radiusField), side: BorderSide(color: has ? c.accent.withValues(alpha: 0.6) : c.border)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Stack(fit: StackFit.expand, children: [
          if (bytes != null) ...[Image.memory(bytes!, fit: BoxFit.cover), Container(color: c.bg.withValues(alpha: 0.6))],
          Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4)) : Icon(has ? Icons.check_circle : Icons.photo_camera_outlined, color: c.accent),
            const SizedBox(height: 4),
            Padding(padding: const EdgeInsets.symmetric(horizontal: 6), child: Text(label, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
            Text(has ? 'Retake' : 'Take photo', style: TextStyle(color: c.fgMuted, fontSize: 12)),
          ]),
        ]),
      ),
    );
  }
}
