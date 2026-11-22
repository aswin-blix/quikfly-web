// Opening the inbox reads it again: the bell loads it when the app starts, and a notification
// that arrived since ("Ready for collection") must show on the first opening, and be marked read.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quikfly/api/api.dart';
import 'package:quikfly/api/models.dart';
import 'package:quikfly/screens/account/notifications_screen.dart';
import 'package:quikfly/state/catalog.dart';
import 'package:quikfly/state/providers.dart';
import 'package:quikfly/theme/theme.dart';

class _Api extends QuikFlyApi {
  _Api() : super(baseUrl: 'http://test.invalid/v1');
  final items = <AppNotification>[];
  final marked = <String>[];
  int reads = 0;

  @override
  Future<({List<AppNotification> items, int unread})> notifications() async {
    reads++;
    return (items: [...items], unread: items.length);
  }

  @override
  Future<int> markNotificationsRead([List<String>? ids]) async {
    marked.addAll(ids ?? const []);
    return 0;
  }
}

final _user = User.fromJson({'id': 'U1', 'name': 'Priya', 'phone': '9000000001', 'profileComplete': true});

AppNotification _note(String id, String title) =>
    AppNotification(id, 'parcel.moved', title, 'Chennai → Coimbatore', 'QFP1', DateTime(2026, 11, 22), null);

Future<void> _open(WidgetTester t, ProviderContainer container) async {
  await t.pumpWidget(UncontrolledProviderScope(
    container: container,
    child: MaterialApp(theme: buildTheme(Brightness.light), home: const NotificationsScreen()),
  ));
  await t.pumpAndSettle();
}

ProviderContainer _container(_Api api) {
  final c = ProviderContainer(overrides: [apiProvider.overrideWithValue(api), userProvider.overrideWithValue(_user)]);
  addTearDown(c.dispose);
  return c;
}

void main() {
  testWidgets('a notification that came after launch shows when the inbox opens', (t) async {
    final api = _Api();
    final c = _container(api);
    await c.read(notificationsProvider.future); // the bell, at launch
    api.items.add(_note('N1', 'Ready for collection'));
    await _open(t, c);
    expect(find.text('Ready for collection'), findsOneWidget);
    expect(api.marked, ['N1']);
  });

  testWidgets('one already in the list does not stop a newer one being marked read', (t) async {
    final api = _Api()..items.add(_note('N1', 'On the bus'));
    final c = _container(api);
    await c.read(notificationsProvider.future);
    api.items.add(_note('N2', 'Reached Coimbatore'));
    await _open(t, c);
    expect(find.text('Reached Coimbatore'), findsOneWidget);
    expect(api.marked, ['N1', 'N2']);
  });

  testWidgets('opened before anything loaded it, it reads once', (t) async {
    final api = _Api()..items.add(_note('N1', 'On the bus'));
    await _open(t, _container(api));
    expect(api.reads, 1);
    expect(api.marked, ['N1']);
  });
}
