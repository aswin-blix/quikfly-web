// Generated artwork for catalog items that have no photo (offers, holidays): a gradient
// from the item's `hue`, set by staff in the admin panel. Content on it is always light.
import 'package:flutter/material.dart';

Color hueColor(double hue, {double s = 0.62, double l = 0.42}) => HSLColor.fromAHSL(1, hue % 360, s, l).toColor();

LinearGradient hueGradient(double hue) => LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [hueColor(hue, l: 0.46), hueColor(hue + 28, l: 0.26)],
    );

/// Icon for a holiday theme.
IconData themeIcon(String theme) => switch (theme) {
      'beach' => Icons.beach_access,
      'hills' => Icons.landscape,
      'international' => Icons.flight,
      'weekend' => Icons.weekend,
      'heritage' => Icons.account_balance,
      _ => Icons.explore,
    };

/// Text and icons on artwork stay light in both themes.
const onArt = Colors.white;
const onArtMuted = Color(0xD9FFFFFF);
