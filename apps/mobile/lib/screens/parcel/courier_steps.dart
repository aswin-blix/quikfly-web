// A Quick parcel's captain and pickup code, on the sender's screen only. In the demo there is no
// driver app, so the sender also plays the captain at both hand-offs.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/parcel_models.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';

class CourierSteps extends ConsumerStatefulWidget {
  const CourierSteps({super.key, required this.parcel, required this.onChanged});
  final Parcel parcel;
  final ValueChanged<Parcel> onChanged;

  @override
  ConsumerState<CourierSteps> createState() => _CourierStepsState();
}

class _CourierStepsState extends ConsumerState<CourierSteps> {
  final _code = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _act(Future<Parcel> Function() move) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final next = await move();
      if (!mounted) return;
      setState(() => _busy = false);
      widget.onChanged(next);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = errorText(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final p = widget.parcel;
    final courier = p.courier!;
    final label = TextStyle(color: c.fgMuted, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Panel(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('CAPTAIN (SIMULATED)', style: label),
          const SizedBox(height: 4),
          Text(courier.captain, style: TextStyle(color: c.fgStrong, fontWeight: FontWeight.w600)),
          Text('${courier.vehicle} · ${courier.plate}', style: TextStyle(color: c.fgMuted, fontSize: 13)),
        ]),
      ),
      if (p.pickupOtp != null) ...[
        const SizedBox(height: 12),
        Panel(
          highlighted: true,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('PICKUP CODE', style: label.copyWith(color: c.accent)),
            const SizedBox(height: 4),
            Text(
              p.pickupOtp!,
              semanticsLabel: "Pickup code ${p.pickupOtp!.split('').join(' ')}",
              style: TextStyle(color: c.fgStrong, fontSize: 32, fontWeight: FontWeight.w700, letterSpacing: 6),
            ),
            Text('Give it to the captain when you hand the parcel over.', style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
            if (p.simulated) ...[
              const SizedBox(height: 10),
              GoldButton(
                label: 'The captain has it (demo)',
                loading: _busy,
                onPressed: () => _act(() => ref.read(apiProvider).parcelHandover(p.bookingId, p.pickupOtp!)),
              ),
            ],
          ]),
        ),
      ],
      if (p.state == 'in_transit' && p.simulated) ...[
        const SizedBox(height: 12),
        Panel(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text("Demo: you play the captain. Type the receiver's code to deliver.", style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
            const SizedBox(height: 10),
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(ParcelRules.collectOtpDigits)],
              decoration: const InputDecoration(labelText: "Receiver's code"),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 10),
            GoldButton(
              label: 'Mark delivered',
              loading: _busy,
              onPressed: _code.text.length == ParcelRules.collectOtpDigits
                  ? () => _act(() => ref.read(apiProvider).parcelDeliver(p.bookingId, _code.text))
                  : null,
            ),
          ]),
        ),
      ],
      FormError(_error),
    ]);
  }
}
