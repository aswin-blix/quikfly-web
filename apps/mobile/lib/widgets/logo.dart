// The QuikFly logo. The artwork is gold and silver made for dark backgrounds, so in light
// mode it sits on a small dark badge until a light-mode logo file exists (roadmap backlog).
import 'package:flutter/material.dart';
import '../theme/tokens.dart';

class AppLogo extends StatelessWidget {
  const AppLogo({super.key, this.height = 34});
  final double height;

  @override
  Widget build(BuildContext context) {
    final img = Image.asset('assets/images/logo.png', height: height, semanticLabel: 'QuikFly');
    if (Theme.of(context).brightness == Brightness.dark) return img;
    return DecoratedBox(
      decoration: BoxDecoration(color: QfColors.dark.bg, borderRadius: BorderRadius.circular(height * 0.3)),
      child: Padding(padding: EdgeInsets.symmetric(horizontal: height * 0.25, vertical: height * 0.08), child: img),
    );
  }
}
