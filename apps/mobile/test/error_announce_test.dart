// Errors are read out when they appear. TalkBack speaks a live region when it is new or its label
// changes (AccessibilityBridge.java: didChangeLabel), so _Speech applies that same rule here.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quikfly/api/api.dart';
import 'package:quikfly/api/models.dart';
import 'package:quikfly/screens/auth/login_screen.dart';
import 'package:quikfly/state/providers.dart';
import 'package:quikfly/theme/theme.dart';
import 'package:quikfly/widgets/ui.dart';

/// What a screen reader would have said since the last call.
class _Speech {
  var _last = <int, String>{};

  List<String> next() {
    final now = {
      for (final n in find.semantics.byPredicate((n) => n.getSemanticsData().flagsCollection.isLiveRegion).evaluate())
        n.id: n.getSemanticsData().label,
    };
    final said = [
      for (final MapEntry(key: id, value: label) in now.entries)
        if (label.isNotEmpty && _last[id] != label) label,
    ];
    _last = now;
    return said;
  }
}

class _Api extends QuikFlyApi {
  _Api() : super(baseUrl: 'http://test.invalid/v1');

  @override
  Future<void> sendOtp(String phone) async {}

  @override
  Future<AuthResult> verifyOtp(String phone, String otp) async {
    await Future<void>.delayed(const Duration(milliseconds: 100)); // a network round trip
    throw Exception('refused');
  }
}

const _apps = {
  'QuikFly': LoginScreen(),
  'QuikFly Partner': LoginScreen(showReferral: false, intro: 'Partner sign-in'),
};
const _refused = 'Something went wrong. Please try again.';

Future<void> _show(WidgetTester t, Widget child) => t.pumpWidget(MaterialApp(
      theme: buildTheme(Brightness.light),
      home: Scaffold(body: Column(children: [const Text('Other text on the screen'), child])),
    ));

void main() {
  testWidgets('FormError speaks when it appears or changes, and only its own words', (t) async {
    final handle = t.ensureSemantics();
    final speech = _Speech();
    await _show(t, const FormError(null));
    expect(speech.next(), isEmpty);
    await _show(t, const FormError('Wrong OTP.'));
    expect(speech.next(), ['Wrong OTP.']);
    await _show(t, const FormError('Wrong OTP.'));
    expect(speech.next(), isEmpty, reason: 'a rebuild must not repeat it');
    await _show(t, const FormError('Too many tries.'));
    expect(speech.next(), ['Too many tries.']);
    await _show(t, const FormError(null));
    expect(speech.next(), isEmpty);
    await _show(t, const FormError('Too many tries.'));
    expect(speech.next(), ['Too many tries.'], reason: 'cleared, then failed again');
    handle.dispose();
  });

  testWidgets('ErrorBox speaks its message; Retry stays a button of its own', (t) async {
    final handle = t.ensureSemantics();
    var retried = 0;
    await _show(t, ErrorBox("Couldn't load buses.", onRetry: () => retried++));
    expect(_Speech().next(), ["Couldn't load buses."]);
    t.semantics.tap(find.semantics.byLabel('Retry'));
    expect(retried, 1);
    handle.dispose();
  });

  for (final MapEntry(key: app, value: screen) in _apps.entries) {
    testWidgets('$app sign-in: a bad number, then a refused code each time', (t) async {
      final handle = t.ensureSemantics();
      final speech = _Speech();
      await t.pumpWidget(ProviderScope(
        overrides: [apiProvider.overrideWithValue(_Api()), userProvider.overrideWithValue(null)],
        child: MaterialApp(theme: buildTheme(Brightness.light), home: screen),
      ));
      await t.pump(const Duration(seconds: 1));
      speech.next();

      await t.enterText(find.byType(TextField).first, '12345');
      await t.tap(find.text('Send OTP'));
      await t.pump();
      expect(speech.next(), ['Enter a valid 10-digit mobile number']);

      await t.enterText(find.byType(TextField).first, '9000000001');
      await t.tap(find.text('Send OTP'));
      await t.pumpAndSettle();
      speech.next();

      for (final code in ['9999', '8888']) {
        await t.enterText(find.byType(TextField), code);
        await t.pump(); // checking: the old error goes
        speech.next();
        await t.pump(const Duration(milliseconds: 150));
        await t.pump();
        expect(speech.next(), [_refused], reason: 'code $code');
      }
      handle.dispose();
    });
  }

  // Android always reports "no announce", and Flutter then makes a field's errorText a live region.
  // This fails if a Flutter upgrade changes that.
  testWidgets("a field's own error speaks on Android", (t) async {
    final handle = t.ensureSemantics();
    await _show(
      t,
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(context).copyWith(supportsAnnounce: false),
          child: const TextField(decoration: InputDecoration(errorText: 'Enter their name.')),
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(_Speech().next(), ['Enter their name.']);
    handle.dispose();
  });

  test('no screen draws an error as plain Text', () {
    final plain = RegExp(r'\bText\((\w+\.)?_?(\w*[Ee]rr(or)?)!');
    final found = [
      for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart')))
        for (final (i, line) in f.readAsLinesSync().indexed)
          if (plain.hasMatch(line) && !line.contains('LiveError(')) '${f.path}:${i + 1}',
    ];
    expect(found, isEmpty, reason: 'use FormError or ErrorBox, or wrap the Text in LiveError');
  });
}
