// /parcels/track?lr=: public tracking for whoever has the LR number. First names only, no code.
// It works while the service is off, so parcels already sent can still be followed.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../api/parcel_models.dart';
import '../../core/parcels.dart';
import '../../state/providers.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';
import 'parcel_widgets.dart';
import 'polling.dart';

class TrackParcelScreen extends ConsumerStatefulWidget {
  const TrackParcelScreen({super.key, this.lr});
  final String? lr;
  @override
  ConsumerState<TrackParcelScreen> createState() => _TrackParcelScreenState();
}

class _TrackParcelScreenState extends ConsumerState<TrackParcelScreen> with PollsWhileVisible {
  late final _entry = TextEditingController(text: widget.lr ?? '');
  String _lr = '';
  ParcelTracking? _found;
  String? _error;
  bool _loading = false;

  @override
  bool get keepPolling => _lr.isNotEmpty && !const {'collected', 'cancelled', 'unclaimed'}.contains(_found?.state);

  @override
  void initState() {
    super.initState();
    if (_entry.text.trim().isNotEmpty) WidgetsBinding.instance.addPostFrameCallback((_) => _track());
  }

  @override
  void dispose() {
    _entry.dispose();
    super.dispose();
  }

  Future<void> _track() async {
    final lr = _entry.text.trim().toUpperCase();
    if (lr.isEmpty || !mounted) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _lr = lr;
      _found = null;
      _error = null;
      _loading = true;
    });
    await poll();
  }

  @override
  Future<void> poll() async {
    final lr = _lr;
    if (lr.isEmpty || !mounted) return;
    try {
      final t = await ref.read(apiProvider).trackParcel(lr);
      if (mounted && lr == _lr) {
        setState(() {
          _found = t;
          _error = null;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted && lr == _lr) {
        setState(() {
          _error = errorText(e);
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final t = _found;
    final over = t != null && const {'collected', 'cancelled', 'unclaimed'}.contains(t.state);
    return Scaffold(
      appBar: AppBar(title: const Text('Track a parcel')),
      body: ScreenList(children: [
        const SizedBox(height: 8),
        TextField(
          controller: _entry,
          textCapitalization: TextCapitalization.characters,
          textInputAction: TextInputAction.search,
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9-]')), LengthLimitingTextInputFormatter(30)],
          decoration: const InputDecoration(labelText: 'LR number', hintText: 'Starts with QFP-'),
          onSubmitted: (_) => _track(),
        ),
        const SizedBox(height: 10),
        GoldButton(label: 'Track', icon: Icons.search, loading: _loading, onPressed: _track),
        const SizedBox(height: 16),
        if (_error != null) ...[ErrorBox(_error!, onRetry: _track), const SizedBox(height: 12)],
        if (t != null) ...[
          Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('${t.from} → ${t.to}', style: Theme.of(context).textTheme.titleLarge),
              Text(t.lr, style: TextStyle(color: c.fgMuted)),
              const SizedBox(height: 8),
              Align(alignment: Alignment.centerLeft, child: Pill(parcelStateLabel(t.state), color: parcelStateColor(c, t.state))),
              const SizedBox(height: 16),
              ParcelTimeline(state: t.state, events: t.events, departAt: t.departAt, readyAt: t.readyAt),
            ]),
          ),
          const SizedBox(height: 12),
          Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (t.sender != null) KeyValue('From', t.sender!),
              if (t.receiver != null) KeyValue('For', t.receiver!),
              if (t.collectAt != null && t.state != 'cancelled') ...[
                const SizedBox(height: 8),
                CounterBlock(
                  title: 'Collect at',
                  counter: t.collectAt!,
                  when: t.state == 'ready' && t.holdUntil != null ? 'Held until ${parcelTime(t.holdUntil!)}' : null,
                ),
              ],
              if (!over) ...[
                const SizedBox(height: 8),
                Text('To collect it you need a code. The sender gets it when the parcel is ready and passes it to you (demo: no SMS is sent).',
                    style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
              ],
            ]),
          ),
          if (!over && t.simulated) ...[const SizedBox(height: 12), const SimulatedNote()],
        ],
      ]),
    );
  }
}
