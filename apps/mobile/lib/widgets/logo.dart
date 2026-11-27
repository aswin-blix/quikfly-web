// The QuikFly logo: brand/quikfly-logo.svg rendered to a transparent PNG by scripts/logo.mjs
// (Flutter's SVG support drops the logo's glow filters). It reads on light and dark screens
// alike, so it never sits on a badge or background of its own.
import 'package:flutter/material.dart';

class AppLogo extends StatelessWidget {
  const AppLogo({super.key, this.height = 34});
  final double height;

  @override
  Widget build(BuildContext context) =>
      Image.asset('assets/images/logo.png', height: height, filterQuality: FilterQuality.medium, semanticLabel: 'QuikFly');
}
