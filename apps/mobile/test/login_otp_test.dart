// The OTP step for screen readers. The four boxes are drawings over one invisible field, and that
// field has to stay in the semantics tree: without it TalkBack users can't sign in (either app).
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quikfly/api/api.dart';
import 'package:quikfly/api/models.dart';
import 'package:quikfly/screens/auth/login_screen.dart';
import 'package:quikfly/state/providers.dart';
import 'package:quikfly/theme/theme.dart';

class _Api extends QuikFlyApi {
  _Api() : super(baseUrl: 'http://test.invalid/v1');
  final verified = <String>[];

  @override
  Future<void> sendOtp(String phone) async {}

  @override
  Future<AuthResult> verifyOtp(String phone, String otp) async {
    verified.add(otp);
    throw Exception('Wrong OTP');
  }
}

const _apps = {
  'QuikFly': LoginScreen(),
  'QuikFly Partner': LoginScreen(showReferral: false, intro: 'Partner sign-in'),
};

Future<_Api> _openOtpStep(WidgetTester t, LoginScreen screen) async {
  final api = _Api();
  await t.pumpWidget(ProviderScope(
    overrides: [apiProvider.overrideWithValue(api), userProvider.overrideWithValue(null)],
    child: MaterialApp(theme: buildTheme(Brightness.light), home: screen),
  ));
  await t.pump(const Duration(seconds: 1));
  await t.enterText(find.byType(TextField).first, '9000000001');
  await t.tap(find.text('Send OTP'));
  await t.pumpAndSettle();
  return api;
}

/// The text fields a screen reader can reach.
List<SemanticsNode> _fields() =>
    find.semantics.byPredicate((n) => n.getSemanticsData().flagsCollection.isTextField).evaluate().toList();

void main() {
  for (final MapEntry(key: app, value: screen) in _apps.entries) {
    group(app, () {
      testWidgets('a screen reader gets one labelled OTP field', (t) async {
        final handle = t.ensureSemantics();
        await _openOtpStep(t, screen);
        final fields = _fields();
        expect(fields, hasLength(1));
        final data = fields.single.getSemanticsData();
        expect(data.label, '4-digit OTP');
        expect(data.hasAction(SemanticsAction.tap), isTrue, reason: 'double-tap opens the keyboard');
        handle.dispose();
      });

      testWidgets('typed digits are read from the field, not again from each box', (t) async {
        final handle = t.ensureSemantics();
        await _openOtpStep(t, screen);
        await t.enterText(find.byType(TextField), '57');
        await t.pumpAndSettle();
        expect(_fields().single.getSemanticsData().value, '57');
        expect(find.semantics.byLabel(RegExp(r'^[57]$')), findsNothing);
        handle.dispose();
      });

      testWidgets('a code entered through the screen reader is verified', (t) async {
        final handle = t.ensureSemantics();
        final api = await _openOtpStep(t, screen);
        t.semantics.tap(find.semantics.byPredicate((n) => n.getSemanticsData().flagsCollection.isTextField));
        await t.pumpAndSettle();
        expect(t.testTextInput.isVisible, isTrue);
        final field = _fields().single;
        field.owner!.performAction(field.id, SemanticsAction.setText, '1234');
        await t.pumpAndSettle();
        expect(api.verified, ['1234']);
        handle.dispose();
      });
    });
  }
}
