// QuikFly Partner: the app vehicle owners use to register and run their vehicles on QuikFly.
// Same project, API, theme and widgets as the customer app; built as its own APK with
//   flutter build apk --flavor partner -t lib/main_partner.dart   (see apps/mobile/README.md)
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'partner/partner_app.dart';
import 'state/catalog.dart';

void main() => runApp(ProviderScope(
      // The account's inbox also holds customer bookings; this app shows partner updates only.
      overrides: [notificationScopeProvider.overrideWithValue(NotificationScope.partner)],
      child: const PartnerApp(),
    ));
