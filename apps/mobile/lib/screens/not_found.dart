// Shown for an unknown address (e.g. an old link).
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../widgets/ui.dart';

class NotFoundScreen extends StatelessWidget {
  const NotFoundScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(),
        body: ScreenList(children: [
          EmptyState(
            icon: Icons.explore_off_outlined,
            title: "We couldn't find that page",
            message: 'It may have moved. Everything is reachable from the home screen.',
            action: OutlinedButton(onPressed: () => context.go('/'), child: const Text('Back to home')),
          ),
        ]),
      );
}
