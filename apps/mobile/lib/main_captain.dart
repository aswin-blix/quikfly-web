// QuikFly Captain: the app drivers use to take QuikFly rides (docs/driver-app-plan.md).
// Same project, API, theme and widgets as the other two apps; built as its own APK with
//   flutter build apk --flavor captain -t lib/main_captain.dart   (see apps/mobile/README.md)
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'captain/captain_app.dart';
import 'state/catalog.dart';

void main() => runApp(ProviderScope(
      // One account, one inbox: this app's phones get only captain (driver.*) updates.
      overrides: [notificationScopeProvider.overrideWithValue(NotificationScope.captain)],
      child: const CaptainApp(),
    ));
