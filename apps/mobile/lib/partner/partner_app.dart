// The QuikFly Partner app: its router, state and app shell. Screens live next to this file.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/api.dart';
import '../screens/account/notifications_screen.dart';
import '../screens/auth/login_screen.dart';
import '../state/providers.dart';
import '../theme/theme.dart';
import 'home_screen.dart';
import 'onboarding_screens.dart';
import 'section_screen.dart';

/// The signed-in partner's application: null when signed out or not started yet.
final vendorProvider = FutureProvider<VendorApplication?>((ref) async {
  final user = ref.watch(sessionProvider.select((s) => s.value?.id));
  if (user == null) return null;
  return ref.watch(apiProvider).vendorApplication();
});

/// Screens call this after an API call that returns the application, so every screen updates.
void setVendor(WidgetRef ref, VendorApplication a) => ref.invalidate(vendorProvider);

final partnerRouter = GoRouter(
  routes: [
    GoRoute(path: '/', builder: (_, _) => const PartnerHomeScreen()),
    GoRoute(path: '/login', builder: (_, _) => const LoginScreen(showReferral: false)),
    GoRoute(path: '/section/:id', builder: (_, s) => SectionScreen(section: s.pathParameters['id']!)),
    GoRoute(path: '/onboarding/payment', builder: (_, _) => const PaymentScreen()),
    GoRoute(path: '/onboarding/agreement', builder: (_, _) => const AgreementScreen()),
    GoRoute(path: '/onboarding/sticker', builder: (_, _) => const StickerScreen()),
    GoRoute(path: '/notifications', builder: (_, _) => const NotificationsScreen()),
  ],
);

class PartnerApp extends ConsumerStatefulWidget {
  const PartnerApp({super.key});
  @override
  ConsumerState<PartnerApp> createState() => _PartnerAppState();
}

class _PartnerAppState extends ConsumerState<PartnerApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Back in the foreground: staff may have reviewed the application meanwhile.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(configProvider);
      ref.invalidate(vendorProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(sessionProvider);
    ref.watch(configProvider);
    return MaterialApp.router(
      title: 'QuikFly Partner',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: ref.watch(themeModeProvider),
      routerConfig: partnerRouter,
    );
  }
}
