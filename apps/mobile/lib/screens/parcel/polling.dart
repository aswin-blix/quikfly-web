// Re-reads while the screen is open and the app is in front, and once when it comes back to the front.
import 'dart:async';

import 'package:flutter/widgets.dart';
import '../../api/parcel_models.dart';

mixin PollsWhileVisible<T extends StatefulWidget> on State<T> {
  Timer? _timer;
  late final AppLifecycleListener _lifecycle;

  /// Reads once. Must cope with the widget being gone when it finishes.
  Future<void> poll();

  /// False once there is nothing left to change.
  bool get keepPolling => true;

  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(onResume: () => poll());
    _timer = Timer.periodic(ParcelRules.poll, (_) {
      final state = WidgetsBinding.instance.lifecycleState;
      if (keepPolling && (state == null || state == AppLifecycleState.resumed)) poll();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _lifecycle.dispose();
    super.dispose();
  }
}
