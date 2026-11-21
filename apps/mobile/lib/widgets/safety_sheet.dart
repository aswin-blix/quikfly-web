// SOS / safety sheet opened from a live ride. Calls are real tel: links; alerts to
// contacts are simulated (no SMS provider yet) and say so. Mirrors the website's SafetySheet.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api/models.dart';
import '../state/providers.dart';
import '../theme/tokens.dart';
import 'ui.dart';

/// India's single emergency number (police, ambulance, fire).
const emergencyNumber = '112';

final contactsProvider = FutureProvider<List<EmergencyContact>>((ref) async {
  final id = ref.watch(userProvider.select((u) => u?.id));
  if (id == null) return const [];
  return ref.watch(apiProvider).contacts();
});

void call(String number) => launchUrl(Uri(scheme: 'tel', path: number.replaceAll(' ', '')));

Future<void> showSafetySheet(BuildContext context, {required VoidCallback onShare, String? rideId}) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _SafetySheet(onShare: onShare, rideId: rideId),
    );

class _SafetySheet extends ConsumerWidget {
  const _SafetySheet({required this.onShare, this.rideId});
  final VoidCallback onShare;
  /// The live ride the SOS is about, so staff see the driver and route.
  final String? rideId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = context.qf;
    final safetyLine = ref.watch(configProvider).value?.settings.safetyLine ?? '';
    final contacts = ref.watch(contactsProvider);

    Widget row({required IconData icon, required String title, required String sub, required VoidCallback onTap, bool danger = false}) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Material(
            color: danger ? c.danger.withValues(alpha: 0.06) : c.surface,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16), side: BorderSide(color: danger ? c.danger.withValues(alpha: 0.4) : c.border)),
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: danger ? c.danger : Brand.gold.withValues(alpha: 0.12),
                    child: Icon(icon, color: danger ? Brand.onGold : c.accent, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(title, style: TextStyle(fontWeight: FontWeight.w700, color: c.fgStrong)),
                      Text(sub, style: TextStyle(color: c.fgMuted, fontSize: 12.5)),
                    ]),
                  ),
                ]),
              ),
            ),
          ),
        );

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(Brand.gutter, 0, Brand.gutter, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Safety', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          row(
            icon: Icons.sos,
            danger: true,
            title: 'Call $emergencyNumber (emergency)',
            sub: 'Police, ambulance and fire, anywhere in India',
            onTap: () => call(emergencyNumber),
          ),
          row(icon: Icons.support_agent, title: 'Call QuikFly safety line', sub: '$safetyLine · 24×7, stays on the line with you', onTap: () => call(safetyLine)),
          row(
            icon: Icons.share_location,
            title: 'Share live trip',
            sub: 'Send a link to follow this ride on a map',
            onTap: () {
              Navigator.pop(context);
              onShare();
            },
          ),
          ...contacts.when(
            loading: () => const [Skeleton(height: 68)],
            error: (_, _) => const [],
            data: (list) => [
              row(
                icon: Icons.notifications_active_outlined,
                title: list.isNotEmpty ? 'Alert QuikFly and my contacts' : 'Alert QuikFly safety desk',
                sub: list.isNotEmpty
                    ? 'Our safety desk sees your SOS now; your trip link goes to ${list.length} contact${list.length > 1 ? 's' : ''}'
                    : 'Our team sees your SOS now and calls you back',
                onTap: () async {
                  // The record reaches staff (admin → SOS) even when the SMS to contacts is only simulated.
                  String receipt = '';
                  try {
                    receipt = (await ref.read(apiProvider).raiseSos(rideId: rideId)).id;
                  } catch (_) {
                    receipt = '';
                  }
                  if (!context.mounted) return;
                  Navigator.pop(context);
                  final names = list.isEmpty ? '' : ' Trip link to ${list.map((x) => x.name.split(' ').first).join(', ')} (demo: no SMS sent).';
                  toast(context, receipt.isNotEmpty ? "QuikFly's safety desk has your SOS (ref $receipt).$names" : "Couldn't reach QuikFly's safety desk. Call 112 if you are in danger.$names");
                  if (list.isNotEmpty) onShare();
                },
              ),
              if (list.isEmpty)
                row(
                  icon: Icons.person_add_alt,
                  title: 'Add emergency contacts',
                  sub: 'So we can alert them with one tap next time',
                  onTap: () {
                    Navigator.pop(context);
                    context.push('/account/safety');
                  },
                ),
            ],
          ),
        ]),
      ),
    );
  }
}
