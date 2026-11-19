// The headset "Help" button on the Partner app's registration screens: a sheet with partner
// support's number (and WhatsApp when the owner has set one), so help is one tap away.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/support_models.dart';
import '../widgets/ui.dart';
import 'home_screen.dart' show partnerSettings;

class PartnerHelpButton extends ConsumerWidget {
  const PartnerHelpButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => IconButton(
    tooltip: 'Help',
    icon: const Icon(Icons.headset_mic_outlined),
    onPressed: () => showModalBottomSheet<void>(context: context, showDragHandle: true, builder: (_) => const _HelpSheet()),
  );
}

class _HelpSheet extends ConsumerWidget {
  const _HelpSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = partnerSettings(ref);
    final phone = s.companyPhone;
    final chat = whatsappLink(s.whatsappNumber, 'Hi, I need help with my QuikFly Partner registration.');
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Need help?', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 6),
            const Text('Stuck on a step or not sure which document to add? Our partner team will walk you through it.'),
            const SizedBox(height: 18),
            GoldButton(
              label: 'Call $phone',
              icon: Icons.call_outlined,
              onPressed: () => launchUrl(Uri(scheme: 'tel', path: phone.replaceAll(' ', ''))),
            ),
            if (chat != null) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => launchUrl(chat, mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.chat_outlined),
                label: const Text('Chat on WhatsApp'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
