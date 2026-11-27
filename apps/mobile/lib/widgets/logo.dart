// The QuikFly logo: brand/quikfly-logo.svg rendered to a transparent PNG by scripts/logo.mjs
// (Flutter's SVG support drops the logo's glow filters). It was drawn on black, so in light mode it
// sits on a dark plate (the dark theme's surface; shape in Brand.logoPlate*) and in dark mode it shows
// bare. The padding is the same in both themes, so switching never moves the layout.
import 'package:flutter/material.dart';
import '../theme/tokens.dart';

class AppLogo extends StatelessWidget {
  const AppLogo({super.key, this.height = 34});

  /// Height of the logo itself; the plate adds Brand.logoPlatePadY above and below.
  final double height;

  @override
  Widget build(BuildContext context) {
    final logo = Padding(
      padding: EdgeInsets.symmetric(horizontal: height * Brand.logoPlatePadX, vertical: height * Brand.logoPlatePadY),
      child: Image.asset('assets/images/logo.png', height: height, filterQuality: FilterQuality.medium, semanticLabel: 'QuikFly'),
    );
    if (Theme.of(context).brightness == Brightness.dark) return logo;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: QfColors.dark.surface,
        borderRadius: BorderRadius.circular(height * Brand.logoPlateRadius),
      ),
      child: logo,
    );
  }
}
