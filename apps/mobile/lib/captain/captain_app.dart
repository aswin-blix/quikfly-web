// The QuikFly Captain app: its router and app shell. Screens live next to this file.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/language.dart';
import '../partner/fleet_screens.dart';
import '../partner/onboarding_screens.dart';
import '../partner/section_screen.dart';
import '../screens/account/notifications_screen.dart';
import '../screens/account/privacy_screens.dart';
import '../screens/auth/login_screen.dart';
import '../screens/not_found.dart';
import '../state/providers.dart';
import '../state/push.dart';
import '../theme/theme.dart';
import '../partner/partner_app.dart' show fleetProvider, vendorProvider;
import 'account_screens.dart';
import 'captain_state.dart';
import 'home_screen.dart';

final captainRouter = GoRouter(
  routes: [
    GoRoute(path: '/', builder: (_, _) => const CaptainHomeScreen()),
    GoRoute(
      path: '/login',
      builder: (_, _) => const LoginScreen(
        showReferral: false,
        intro: 'Sign in with the mobile number your fleet owner registered for you in QuikFly Partner.',
      ),
    ),
    GoRoute(path: '/trips', builder: (_, _) => const CaptainTripsScreen()),
    GoRoute(path: '/account', builder: (_, _) => const CaptainAccountScreen()),
    GoRoute(path: '/how', builder: (_, _) => const HowItWorksScreen()),
    GoRoute(path: '/privacy', builder: (_, _) => const PrivacyScreen()),
    GoRoute(path: '/privacy/data', builder: (_, _) => const PrivacyDataScreen()),
    GoRoute(path: '/notifications', builder: (_, _) => const NotificationsScreen()),
    // Owner-drivers register inside Captain (setting captainSelfSignup) with QuikFly Partner's own screens:
    // the application's sections, onboarding, their vehicle, and themselves as the driver. Home ('/') shows
    // the registration checklist until they are a captain (home_screen.dart).
    GoRoute(path: '/section/:id', builder: (_, s) => SectionScreen(section: s.pathParameters['id']!)),
    GoRoute(path: '/vehicles/new', builder: (_, _) => const SectionScreen(section: 'vehicle', vehicleId: 'new')),
    GoRoute(path: '/vehicle/:id', builder: (_, s) => VehicleScreen(id: s.pathParameters['id']!)),
    GoRoute(path: '/vehicle/:id/:part', builder: (_, s) => SectionScreen(section: s.pathParameters['part']!, vehicleId: s.pathParameters['id'])),
    GoRoute(path: '/drivers/new', builder: (_, _) => const DriverFormScreen()),
    GoRoute(path: '/driver/:id', builder: (_, s) => DriverScreen(id: s.pathParameters['id']!)),
    GoRoute(path: '/driver/:id/licence', builder: (_, s) => DriverFormScreen(driverId: s.pathParameters['id'])),
    GoRoute(path: '/onboarding/payment', builder: (_, _) => const PaymentScreen()),
    GoRoute(path: '/onboarding/agreement', builder: (_, _) => const AgreementScreen()),
    GoRoute(path: '/onboarding/sticker', builder: (_, _) => const StickerScreen()),
  ],
  // A link to a page this app doesn't have shows a friendly screen, and Back returns home.
  errorBuilder: (_, _) => const NotFoundScreen(),
);

class CaptainApp extends ConsumerStatefulWidget {
  const CaptainApp({super.key});
  @override
  ConsumerState<CaptainApp> createState() => _CaptainAppState();
}

class _CaptainAppState extends ConsumerState<CaptainApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // An offer's push asks for the state at once instead of waiting for the next heartbeat.
    WidgetsBinding.instance.addPostFrameCallback((_) => ref.read(pushProvider.notifier).start(captainRouter, onData: (_) => ref.read(captainProvider.notifier).refresh()));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Version 1 keeps the captain online only while the app is in front (background location is step 7).
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(configProvider);
      ref.invalidate(captainLookupProvider);
      ref.invalidate(captainSummaryProvider);
      // An owner-driver's application may have been reviewed meanwhile.
      ref.invalidate(vendorProvider);
      ref.invalidate(fleetProvider);
      ref.read(captainProvider.notifier).setForeground(true);
    } else if (state == AppLifecycleState.paused) {
      ref.read(captainProvider.notifier).setForeground(false);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(sessionProvider);
    ref.watch(configProvider);
    ref.watch(captainProvider); // keeps the heartbeat alive for the whole app
    return MaterialApp.router(
      title: 'QuikFly Captain',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: ref.watch(themeModeProvider),
      locale: ref.watch(appLocaleProvider),
      localizationsDelegates: localizationsDelegates,
      supportedLocales: supportedLocales,
      routerConfig: captainRouter,
      scaffoldMessengerKey: pushMessengerKey,
      builder: (_, child) => PrivacyGate(child: child!),
    );
  }
}
