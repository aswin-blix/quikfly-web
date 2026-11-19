// The app's strings come from packages/shared/i18n (shared with the website). lib/l10n is
// generated from them by `flutter gen-l10n` (also run by flutter build); this fails when the
// catalog changed without regenerating, and checks Tamil and Hindi load with Material.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quikfly/core/language.dart';
import 'package:quikfly/l10n/app_localizations.dart';

void main() {
  test('lib/l10n is generated from the current catalog (run flutter gen-l10n)', () {
    final en = jsonDecode(File('../../packages/shared/i18n/app_en.arb').readAsStringSync()) as Map<String, dynamic>;
    final generated = File('lib/l10n/app_localizations.dart').readAsStringSync();
    bool has(String k) => generated.contains('String get $k;') || generated.contains('String $k(');
    final stale = [for (final k in en.keys) if (!k.startsWith('@') && !has(k)) k];
    expect(stale, isEmpty, reason: 'regenerate with: flutter gen-l10n');
  });

  test('every app language is supported', () {
    expect(supportedLocales.map((l) => l.languageCode).toSet(), appLanguages.keys.toSet());
  });

  for (final (code, name) in [('en', 'English'), ('ta', 'தமிழ்'), ('hi', 'हिन्दी')]) {
    testWidgets('$code strings and Material widgets load', (t) async {
      late L l;
      await t.pumpWidget(MaterialApp(
        locale: Locale(code),
        localizationsDelegates: localizationsDelegates,
        supportedLocales: supportedLocales,
        home: Builder(builder: (context) {
          l = L.of(context);
          return Scaffold(appBar: AppBar(title: Text(l.langMenu)), body: const BackButton());
        }),
      ));
      expect(l.langName, name);
      expect(MaterialLocalizations.of(t.element(find.byType(BackButton))).backButtonTooltip, isNotEmpty);
    });
  }
}
