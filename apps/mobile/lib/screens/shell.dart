// The tab shell: Home, Services (a sheet), Offers, My Trips, Account. Same tabs as the
// website's phone bottom bar. Each tab keeps its own navigation stack.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../state/providers.dart';
import '../api/models.dart' show Settings;
import '../widgets/service_gate.dart';
import '../theme/tokens.dart';

class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  // Tab bar slots → shell branches. Slot 1 (Services) opens a sheet instead of a branch.
  static const _servicesSlot = 1;
  int _slotOf(int branch) => branch >= _servicesSlot ? branch + 1 : branch;
  int _branchOf(int slot) => slot > _servicesSlot ? slot - 1 : slot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(userProvider) != null;
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _slotOf(shell.currentIndex),
        onDestinationSelected: (slot) {
          if (slot == _servicesSlot) {
            showServicesSheet(context);
            return;
          }
          final b = _branchOf(slot);
          shell.goBranch(b, initialLocation: b == shell.currentIndex);
        },
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          const NavigationDestination(icon: Icon(Icons.apps), label: 'Services'),
          const NavigationDestination(icon: Icon(Icons.local_offer_outlined), selectedIcon: Icon(Icons.local_offer), label: 'Offers'),
          const NavigationDestination(icon: Icon(Icons.confirmation_number_outlined), selectedIcon: Icon(Icons.confirmation_number), label: 'My Trips'),
          NavigationDestination(
              icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: signedIn ? 'Account' : 'Login'),
        ],
      ),
    );
  }
}

/// "All services" sheet: every service with its tagline.
void showServicesSheet(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) {
      final c = ctx.qf;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(Brand.gutter, 0, Brand.gutter, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('All services', style: Theme.of(ctx).textTheme.titleLarge),
            const SizedBox(height: 12),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: MediaQuery.sizeOf(ctx).width > 600 ? 3 : 2,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.9,
              children: [
                for (final s in openServices(ProviderScope.containerOf(context).read(configProvider).value?.settings ?? const Settings({})))
                  Material(
                    color: c.surfaceRaised,
                    borderRadius: BorderRadius.circular(16),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () {
                        Navigator.pop(ctx);
                        context.push(s.route);
                      },
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          Icon(s.icon, color: c.accent),
                          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(s.action, style: const TextStyle(fontWeight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
                            Text(s.tagline, style: TextStyle(color: c.fgMuted, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
                          ]),
                        ]),
                      ),
                    ),
                  ),
              ],
            ),
          ]),
        ),
      );
    },
  );
}
