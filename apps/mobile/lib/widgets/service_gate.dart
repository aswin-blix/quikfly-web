// Service switches (admin → Settings → Services): a paused service's screens show the
// owner's message instead. The API refuses new bookings for it too. Mirrors the website's
// components/ServiceGate.tsx.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/models.dart';
import '../core/services.dart';
import '../state/providers.dart';
import '../theme/tokens.dart';
import 'ui.dart';

/// Services open for new bookings, in menu order.
List<ServiceMeta> openServices(Settings s) => [for (final x in services) if (s.serviceOn(x.key)) x];

/// Shows [child], or the paused message when [service] is switched off.
class ServiceGate extends ConsumerWidget {
  const ServiceGate({super.key, required this.service, required this.child});
  final ServiceKey service;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(configProvider).value?.settings;
    if (settings == null || settings.serviceOn(service)) return child;
    final c = context.qf;
    return Scaffold(
      appBar: AppBar(title: Text(serviceOf(service).action)),
      body: ScreenList(children: [
        const SizedBox(height: 40),
        Icon(Icons.pause_circle_outline, size: 56, color: c.accent),
        const SizedBox(height: 16),
        Text('${serviceOf(service).action} is paused', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(settings.servicePausedMessage, textAlign: TextAlign.center, style: TextStyle(color: c.fgMuted)),
        const SizedBox(height: 4),
        Text("Bookings you've already made aren't affected. You'll find them in My Trips.", textAlign: TextAlign.center, style: TextStyle(color: c.fgSubtle, fontSize: 12.5)),
        const SizedBox(height: 24),
        Wrap(alignment: WrapAlignment.center, spacing: 12, children: [
          OutlinedButton(onPressed: () => context.go('/'), child: const Text('See other services')),
          OutlinedButton(onPressed: () => context.go('/trips'), child: const Text('My Trips')),
        ]),
      ]),
    );
  }
}
