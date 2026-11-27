// The logo was drawn on black (owner's new logo, 2026-11-27): in light mode it sits on a dark plate,
// in dark mode it shows bare. The asset must stay transparent (rendered from brand/quikfly-logo.svg
// by scripts/logo.mjs), so the plate, not the image, supplies the background.
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quikfly/theme/theme.dart';
import 'package:quikfly/theme/tokens.dart';
import 'package:quikfly/widgets/logo.dart';

Future<Finder> _pump(WidgetTester t, Brightness b) async {
  await t.pumpWidget(MaterialApp(theme: buildTheme(b), home: const Scaffold(body: Center(child: AppLogo(height: 40)))));
  final logo = find.byType(AppLogo);
  expect(find.descendant(of: logo, matching: find.byType(Image)), findsOneWidget);
  return logo;
}

void main() {
  testWidgets('AppLogo is bare in dark mode', (t) async {
    final logo = await _pump(t, Brightness.dark);
    expect(find.descendant(of: logo, matching: find.byType(DecoratedBox)), findsNothing);
    expect(find.descendant(of: logo, matching: find.byType(ColoredBox)), findsNothing);
  });

  testWidgets('AppLogo sits on the dark plate in light mode', (t) async {
    final logo = await _pump(t, Brightness.light);
    final plate = t.widget<DecoratedBox>(find.descendant(of: logo, matching: find.byType(DecoratedBox)));
    expect((plate.decoration as BoxDecoration).color, QfColors.dark.surface);
  });

  testWidgets('switching theme never changes the logo size', (t) async {
    final sizes = <Size>[];
    for (final b in Brightness.values) {
      final logo = await _pump(t, b);
      sizes.add(t.getSize(logo));
    }
    expect(sizes.first, sizes.last);
  });

  test('logo.png is a transparent RGBA image', () {
    final bytes = File('assets/images/logo.png').readAsBytesSync();
    final header = ByteData.sublistView(bytes, 16, 26);
    expect(bytes.sublist(1, 4), 'PNG'.codeUnits);
    expect(header.getUint8(9), 6, reason: 'colour type 6 = RGBA (has an alpha channel)');
    expect(header.getUint32(0) / header.getUint32(4), closeTo(1504 / 458, 0.02), reason: 'same shape as the SVG');
  });
}
