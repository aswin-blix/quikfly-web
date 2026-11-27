// One account, one inbox: the customer app shows booking notifications, QuikFly Partner only
// vendor.* ones, and a partner notification never opens a customer-only page.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:quikfly/api/models.dart';
import 'package:quikfly/screens/account/notifications_screen.dart';
import 'package:quikfly/state/catalog.dart';
import 'package:quikfly/theme/theme.dart';

AppNotification _n(String id, String kind, {String? booking}) =>
    AppNotification(id, kind, 'Title $id', 'Body $id', booking, DateTime(2026, 11, 19), DateTime(2026, 11, 19));

Future<void> _pump(WidgetTester t, NotificationScope scope, List<AppNotification> items) async {
  final router = GoRouter(
    routes: [GoRoute(path: '/', builder: (_, _) => const NotificationsScreen())],
    errorBuilder: (_, s) => Text('NAVIGATED ${s.uri}'),
  );
  await t.pumpWidget(ProviderScope(
    overrides: [
      notificationScopeProvider.overrideWithValue(scope),
      notificationsProvider.overrideWith((ref) async => (items: items, unread: 0)),
    ],
    child: MaterialApp.router(theme: buildTheme(Brightness.light), routerConfig: router),
  ));
  await t.pumpAndSettle();
}

void main() {
  test('each app keeps its own kinds', () {
    expect(NotificationScope.partner.shows('vendor.fleet'), isTrue);
    expect(NotificationScope.partner.shows('booking.confirmed'), isFalse);
    expect(NotificationScope.customer.shows('booking.confirmed'), isTrue);
    expect(NotificationScope.customer.shows('vendor.payout'), isFalse);
    expect(NotificationScope.captain.shows('driver.offer'), isTrue);
    expect(NotificationScope.captain.shows('booking.confirmed'), isFalse);
    expect(NotificationScope.captain.shows('vendor.trip'), isFalse);
    expect(NotificationScope.customer.shows('driver.offer'), isFalse);
    expect(NotificationScope.partner.shows('driver.cancelled'), isFalse);
  });

  testWidgets('partner notifications do not navigate anywhere', (t) async {
    await _pump(t, NotificationScope.partner, [
      _n('1', 'vendor.fleet'),
      _n('2', 'vendor.payout'),
      _n('3', 'vendor.trip', booking: 'B1'), // has a booking id, still must not open /trips
    ]);
    for (final id in ['1', '2', '3']) {
      await t.tap(find.text('Title $id'));
      await t.pumpAndSettle();
      expect(find.textContaining('NAVIGATED'), findsNothing);
    }
  });

  testWidgets('customer booking notifications still open My Trips', (t) async {
    await _pump(t, NotificationScope.customer, [_n('1', 'booking.confirmed', booking: 'B1')]);
    await t.tap(find.text('Title 1'));
    await t.pumpAndSettle();
    expect(find.text('NAVIGATED /trips'), findsOneWidget);
  });
}
