// QuikFly Android app. Same REST API as the website (apps/api); see apps/mobile/README.md.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'router.dart';
import 'state/providers.dart';
import 'theme/theme.dart';

void main() => runApp(const ProviderScope(child: QuikFlyApp()));

class QuikFlyApp extends ConsumerWidget {
  const QuikFlyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Start checking the saved session and loading /config straight away.
    ref.watch(sessionProvider);
    ref.watch(configProvider);
    return MaterialApp.router(
      title: 'QuikFly',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: ref.watch(themeModeProvider),
      routerConfig: router,
    );
  }
}
