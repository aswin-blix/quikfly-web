// Placeholder for screens of later slices (M2–M5). Removed once every route is built.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../widgets/ui.dart';

class ComingSoonScreen extends StatelessWidget {
  const ComingSoonScreen({super.key, required this.title});
  final String title;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(title)),
        body: ScreenList(children: [
          EmptyState(
            icon: Icons.construction,
            title: '$title is coming in the next build',
            message: 'Meanwhile you can use it on the QuikFly website with the same account.',
            action: OutlinedButton(onPressed: () => context.pop(), child: const Text('Go back')),
          ),
        ]),
      );
}
