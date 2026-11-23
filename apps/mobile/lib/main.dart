// QuikFly Android app. Same REST API as the website (apps/api); see apps/mobile/README.md.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/language.dart';
import 'router.dart';
import 'screens/account/privacy_screens.dart';
import 'state/providers.dart';
import 'state/catalog.dart';
import 'state/push.dart';
import 'theme/theme.dart';

void main() => runApp(const ProviderScope(child: QuikFlyApp()));

class QuikFlyApp extends ConsumerStatefulWidget {
  const QuikFlyApp({super.key});
  @override
  ConsumerState<QuikFlyApp> createState() => _QuikFlyAppState();
}

class _QuikFlyAppState extends ConsumerState<QuikFlyApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Phone notifications start after the first frame (nothing happens without a Firebase project).
    WidgetsBinding.instance.addPostFrameCallback((_) => ref.read(pushProvider.notifier).start(router));
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Back in the foreground: re-read /config so admin changes (prices, paused services) show, and the
  // inbox so the bell's count is current.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(configProvider);
      ref.invalidate(notificationsProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Start checking the saved session and loading /config straight away.
    ref.watch(sessionProvider);
    ref.watch(configProvider);
    return MaterialApp.router(
      title: 'QuikFly',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: ref.watch(themeModeProvider),
      locale: ref.watch(appLocaleProvider),
      localizationsDelegates: localizationsDelegates,
      supportedLocales: supportedLocales,
      routerConfig: router,
      scaffoldMessengerKey: pushMessengerKey,
      builder: (_, child) => PrivacyGate(child: child!),
    );
  }
}
