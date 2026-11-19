// Shown for an unknown address (an old link, or a page one app has and the other doesn't).
// Used by both apps' routers. Back always leads home, never out of the app.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../widgets/ui.dart';

class NotFoundScreen extends StatelessWidget {
  const NotFoundScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final canPop = context.canPop();
    return PopScope(
      // Reached with go() the stack holds only this page, so Back would close the app.
      canPop: canPop,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) context.go('/');
      },
      child: Scaffold(
        appBar: AppBar(
          leading: canPop ? null : IconButton(tooltip: 'Home', icon: const Icon(Icons.home_outlined), onPressed: () => context.go('/')),
        ),
        body: ScreenList(children: [
          EmptyState(
            icon: Icons.explore_off_outlined,
            title: "We couldn't find that page",
            message: 'It may have moved. Everything is reachable from the home screen.',
            action: OutlinedButton(onPressed: () => context.go('/'), child: const Text('Back to home')),
          ),
        ]),
      ),
    );
  }
}
