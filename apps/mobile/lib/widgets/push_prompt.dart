// Phone notifications, offered where they help: a card in the inbox, after a confirmed booking and
// when a partner goes live; and the "Notifications on this phone" switch in the inbox. Nothing shows
// until the owner's Firebase project is in the build (state/push.dart).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../state/push.dart';
import '../theme/tokens.dart';
import 'ui.dart';

/// The offer to turn notifications on. Shows only while Android can still ask and the person hasn't said "Not now".
class PushPrompt extends ConsumerWidget {
  const PushPrompt({super.key, required this.title, required this.message});
  final String title;
  final String message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(pushProvider).canAsk) return const SizedBox.shrink();
    final c = context.qf;
    final push = ref.read(pushProvider.notifier);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Panel(
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.notifications_active_outlined, color: c.accent),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text(message, style: TextStyle(color: c.fgMuted, fontSize: 13)),
              const SizedBox(height: 10),
              Wrap(spacing: 8, runSpacing: 4, children: [
                FilledButton(onPressed: push.ask, child: const Text('Turn on')),
                TextButton(onPressed: push.dismiss, child: const Text('Not now')),
              ]),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// "Notifications on this phone": the switch once Android has been asked, or how to unblock them.
class PushSwitch extends ConsumerWidget {
  const PushSwitch({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(pushProvider);
    final c = context.qf;
    final push = ref.read(pushProvider.notifier);
    final (String sub, bool? value) = switch (s.status) {
      PushStatus.on => ('On. Updates arrive even when QuikFly is closed.', true),
      PushStatus.off => ('Off. Updates still arrive in this inbox.', false),
      PushStatus.blocked => ('Blocked in Android settings. Allow them in Settings → Apps → QuikFly → Notifications.', null),
      PushStatus.notAsked => ('Get updates even when QuikFly is closed.', false),
      PushStatus.unavailable => ('', null),
    };
    if (s.status == PushStatus.unavailable) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Panel(
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Notifications on this phone', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 2),
              Text(sub, style: TextStyle(color: c.fgMuted, fontSize: 13)),
            ]),
          ),
          if (value != null)
            Switch(
              value: value,
              onChanged: (on) => s.status == PushStatus.notAsked ? push.ask() : push.setEnabled(on),
            ),
        ]),
      ),
    );
  }
}
