// The logo has a transparent background and suits light and dark screens: it must never sit
// on a badge or background of its own again (owner, 2026-11-19), and the asset must stay
// transparent (it's rendered from brand/quikfly-logo.svg by scripts/logo.mjs).
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quikfly/theme/theme.dart';
import 'package:quikfly/widgets/logo.dart';

void main() {
  for (final b in Brightness.values) {
    testWidgets('AppLogo is the bare image in ${b.name} mode', (t) async {
      await t.pumpWidget(MaterialApp(theme: buildTheme(b), home: const Scaffold(body: Center(child: AppLogo(height: 40)))));
      final logo = find.byType(AppLogo);
      expect(find.descendant(of: logo, matching: find.byType(Image)), findsOneWidget);
      expect(find.descendant(of: logo, matching: find.byType(DecoratedBox)), findsNothing);
      expect(find.descendant(of: logo, matching: find.byType(ColoredBox)), findsNothing);
      expect(find.descendant(of: logo, matching: find.byType(Container)), findsNothing);
    });
  }

  test('logo.png is a transparent RGBA image', () {
    final bytes = File('assets/images/logo.png').readAsBytesSync();
    final header = ByteData.sublistView(bytes, 16, 26);
    expect(bytes.sublist(1, 4), 'PNG'.codeUnits);
    expect(header.getUint8(9), 6, reason: 'colour type 6 = RGBA (has an alpha channel)');
    expect(header.getUint32(0) / header.getUint32(4), closeTo(1504 / 458, 0.02), reason: 'same shape as the SVG');
  });
}
