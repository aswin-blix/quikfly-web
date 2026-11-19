// Every page address written in QuikFly Partner's code must be a route of the Partner router.
// Guards against links to customer-only pages (e.g. '/trips'), which showed go_router's red
// "no routes for location" page and left Back with nothing to go to.
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Partner screens only link to pages the Partner app has', () {
    final routerSrc = File('lib/partner/partner_app.dart').readAsStringSync();
    final patterns = [
      for (final m in RegExp(r"path: '([^']+)'").allMatches(routerSrc))
        RegExp('^${m.group(1)!.replaceAll(RegExp(r':\w+'), '[^/]+')}\$'),
    ];
    expect(patterns, isNotEmpty);

    final files = [File('lib/main_partner.dart'), ...Directory('lib/partner').listSync().whereType<File>().where((f) => f.path.endsWith('.dart'))];
    final bad = <String>[];
    for (final f in files) {
      // Quoted addresses: '/…' with no spaces; interpolations stand for one path segment.
      for (final m in RegExp(r"'(/[^'\s]*)'").allMatches(f.readAsStringSync())) {
        final path = m.group(1)!.replaceAll(RegExp(r'\$\{[^}]*\}|\$\w+'), 'x');
        if (!patterns.any((p) => p.hasMatch(path))) bad.add('${f.path}: ${m.group(1)}');
      }
    }
    expect(bad, isEmpty, reason: 'Links to pages the Partner router lacks');
  });
}
