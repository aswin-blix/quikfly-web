// Every page address written in QuikFly Captain's code must be a route of the Captain router.
// Guards against links to pages only the other apps have (e.g. '/account/wallet'), which showed go_router's red
// "no routes for location" page and left Back with nothing to go to.
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Captain screens only link to pages the Captain app has', () {
    final routerSrc = File('lib/captain/captain_app.dart').readAsStringSync();
    final patterns = [
      for (final m in RegExp(r"path: '([^']+)'").allMatches(routerSrc))
        RegExp('^${m.group(1)!.replaceAll(RegExp(r':\w+'), '[^/]+')}\$'),
    ];
    expect(patterns, isNotEmpty);

    // Captain also mounts QuikFly Partner's registration screens for owner-drivers (captainSelfSignup), so every
    // address those link to must exist here too; the Partner app's own shell and money screens aren't mounted.
    final partner = Directory('lib/partner').listSync().whereType<File>()
        .where((f) => f.path.endsWith('.dart') && !f.path.endsWith('partner_app.dart') && !f.path.endsWith('money_screens.dart'));
    final files = [File('lib/main_captain.dart'), ...Directory('lib/captain').listSync().whereType<File>().where((f) => f.path.endsWith('.dart')), ...partner];
    final bad = <String>[];
    for (final f in files) {
      // Quoted addresses: '/…' with no spaces; interpolations stand for one path segment.
      for (final m in RegExp(r"'(/[^'\s]*)'").allMatches(f.readAsStringSync())) {
        final path = m.group(1)!.replaceAll(RegExp(r'\$\{[^}]*\}|\$\w+'), 'x');
        if (!patterns.any((p) => p.hasMatch(path))) bad.add('${f.path}: ${m.group(1)}');
      }
    }
    expect(bad, isEmpty, reason: 'Links to pages the Captain router lacks');
  });
}
