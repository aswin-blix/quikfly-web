// Pieces the parcel screens share: the timeline, a counter, the demo label, the state's colour.
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../api/parcel_models.dart';
import '../../core/parcels.dart';
import '../../theme/tokens.dart';
import '../../widgets/ui.dart';

Color parcelStateColor(QfColors c, String state) => switch (state) {
      'booked' || 'at_counter' => c.success,
      'collected' => c.fgMuted,
      'unclaimed' || 'cancelled' => c.danger,
      _ => c.accent,
    };

/// What has happened, then (until it ends) what comes next with planned times.
class ParcelTimeline extends StatelessWidget {
  const ParcelTimeline({super.key, required this.state, required this.events, this.departAt, this.readyAt});
  final String state;
  final List<ParcelEvent> events;
  final DateTime? departAt, readyAt;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    final at = parcelJourney.indexOf(state);
    // -1: cancelled or unclaimed, so nothing comes next.
    final next = at < 0 ? const <String>[] : parcelJourney.sublist(at + 1);
    final planned = {'on_bus': departAt, 'ready': readyAt};
    final total = events.length + next.length;

    Widget step(int i, {required String label, required bool done, String? when, String? note, bool bad = false}) {
      final colour = bad ? c.danger : done ? c.accent : c.borderStrong;
      return Semantics(
        container: true,
        label: '$label${done ? '' : ' (not yet)'}${when == null ? '' : ', $when'}${note == null ? '' : ', note: $note'}',
        excludeSemantics: true,
        child: IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            SizedBox(
              width: 22,
              child: Column(children: [
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  width: 11,
                  height: 11,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: done ? colour : null, border: Border.all(color: colour, width: 1.5)),
                ),
                if (i < total - 1) Expanded(child: Container(width: 1.5, color: done ? c.accent.withValues(alpha: 0.5) : c.border)),
              ]),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(label, style: TextStyle(color: done ? c.fgStrong : c.fgMuted, fontWeight: done ? FontWeight.w600 : FontWeight.w400)),
                  if (when != null) Text(when, style: TextStyle(color: c.fgSubtle, fontSize: 12)),
                  if (note != null && note.isNotEmpty) Text('“$note”', style: TextStyle(color: c.fgMuted, fontSize: 12)),
                ]),
              ),
            ),
          ]),
        ),
      );
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final (i, e) in events.indexed)
        step(i,
            label: parcelStateLabel(e.state),
            done: true,
            when: parcelTime(e.at),
            note: e.note,
            bad: e.state == 'cancelled' || e.state == 'unclaimed'),
      for (final (i, s) in next.indexed)
        step(events.length + i, label: parcelStateLabel(s), done: false, when: planned[s] == null ? null : 'Planned ${parcelTime(planned[s]!)}'),
    ]);
  }
}

class CounterBlock extends StatelessWidget {
  const CounterBlock({super.key, required this.title, required this.counter, this.when});
  final String title;
  final ParcelCounter counter;
  final String? when;

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title.toUpperCase(), style: TextStyle(color: c.fgMuted, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1)),
      const SizedBox(height: 4),
      Text(counter.name, style: TextStyle(color: c.fgStrong, fontWeight: FontWeight.w600)),
      Text(counter.address, style: TextStyle(color: c.fgMuted, fontSize: 13)),
      Text(counter.hours, style: TextStyle(color: c.fgSubtle, fontSize: 12)),
      if (when != null) Text(when!, style: TextStyle(color: c.fgSoft, fontSize: 12.5)),
      if (counter.phone.isNotEmpty)
        TextButton.icon(
          style: TextButton.styleFrom(padding: EdgeInsets.zero),
          onPressed: () async {
            final ok = await launchUrl(Uri(scheme: 'tel', path: counter.phone.replaceAll(' ', ''))).catchError((_) => false);
            if (!ok && context.mounted) toast(context, "Couldn't open the dialler. The number is ${counter.phone}.");
          },
          icon: const Icon(Icons.call_outlined, size: 16),
          label: Text(counter.phone),
        ),
    ]);
  }
}

class SimulatedNote extends StatelessWidget {
  const SimulatedNote({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.qf;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(border: Border.all(color: c.border), borderRadius: BorderRadius.circular(Brand.radiusField)),
      child: Text('Demo: simulated transit. The parcel moves by the bus timetable, not a real bus.', style: TextStyle(color: c.fgMuted, fontSize: 12)),
    );
  }
}
