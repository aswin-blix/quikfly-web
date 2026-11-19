// The consent page covers the app only while the signed-in person's consent isn't for the
// current privacy notice version (DPDP), and the screen underneath keeps its state.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quikfly/api/models.dart';
import 'package:quikfly/screens/account/privacy_screens.dart';
import 'package:quikfly/state/providers.dart';
import 'package:quikfly/theme/theme.dart';

final _notice = PrivacyNotice({
  'version': '2026-11-19',
  'updated': '2026-11-19',
  'summary': ['We use your number to sign you in.'],
  'sections': [
    {
      'title': 'Who we are',
      'points': ['QuikFly.'],
    },
  ],
  'contact': {'role': 'Grievance Officer', 'name': 'G', 'email': 'g@q.in', 'phone': '1', 'company': 'Q', 'address': 'Chennai'},
});

User _user(String? consent) => User.fromJson({
  'id': 'U1',
  'name': 'Test',
  'phone': '+91 9000000001',
  'walletBalance': 0,
  'profileComplete': true,
  'referralCode': 'QF1',
  'referred': false,
  'licence': null,
  'autoShareNightRides': false,
  'privacyConsent': consent,
});

Future<void> _pump(WidgetTester t, User? user) => t.pumpWidget(
  ProviderScope(
    overrides: [userProvider.overrideWithValue(user), privacyNoticeProvider.overrideWith((ref) async => _notice)],
    child: MaterialApp(
      theme: buildTheme(Brightness.light),
      builder: (_, child) => PrivacyGate(child: child!),
      home: const Scaffold(body: Text('Home')),
    ),
  ),
);

void main() {
  testWidgets('asks when the person has not agreed yet', (t) async {
    await _pump(t, _user(null));
    await t.pumpAndSettle();
    expect(find.text('Your privacy'), findsOneWidget);
    expect(find.text('I agree, continue'), findsOneWidget);
    expect(find.text('Home'), findsOneWidget, reason: 'the app stays mounted underneath');
  });

  testWidgets('asks again after the notice changes', (t) async {
    await _pump(t, _user('2025-01-01'));
    await t.pumpAndSettle();
    expect(find.text('Your privacy'), findsOneWidget);
  });

  testWidgets('stays out of the way once agreed, and when signed out', (t) async {
    await _pump(t, _user('2026-11-19'));
    await t.pumpAndSettle();
    expect(find.text('Your privacy'), findsNothing);
    await _pump(t, null);
    await t.pumpAndSettle();
    expect(find.text('Your privacy'), findsNothing);
  });

  testWidgets('the full notice opens in place', (t) async {
    await _pump(t, _user(null));
    await t.pumpAndSettle();
    await t.tap(find.text('Read the full privacy notice'));
    await t.pumpAndSettle();
    expect(find.text('Who we are'), findsOneWidget);
    expect(find.text('Contact the Grievance Officer'), findsOneWidget);
  });
}
