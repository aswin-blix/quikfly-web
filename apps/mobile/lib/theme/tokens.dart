// Design tokens: the single place for the app's colours, fonts and radii.
// They mirror apps/web/src/styles/tokens.css so the app and the website look alike.
// Widgets read colours through `context.qf` (QfColors), never raw Color values.
import 'package:flutter/material.dart';

/// Brand values that are the same in every theme.
abstract final class Brand {
  static const gold = Color(0xFFF2C14E);
  static const goldLight = Color(0xFFFFD978);
  static const goldDark = Color(0xFFC8961E);
  static const onGold = Color(0xFF120D00);

  static const bodyFont = 'Outfit';
  static const headingFont = 'ArchivoBlack';

  static const radiusPanel = 20.0;
  static const radiusField = 13.0;
  static const radiusChip = 999.0;

  /// Side gutter of every screen.
  static const gutter = 16.0;
}

/// Theme-dependent colours. One instance for dark (default) and one for light.
@immutable
class QfColors extends ThemeExtension<QfColors> {
  const QfColors({
    required this.bg,
    required this.surface,
    required this.surfaceRaised,
    required this.field,
    required this.border,
    required this.borderStrong,
    required this.fg,
    required this.fgStrong,
    required this.fgSoft,
    required this.fgMuted,
    required this.fgSubtle,
    required this.fgFaint,
    required this.accent,
    required this.accentDeep,
    required this.accentPale,
    required this.success,
    required this.danger,
    required this.warning,
    required this.highlight,
    required this.overlay,
    required this.skeleton,
    required this.mapBg,
    required this.mapGrid,
    required this.mapWater,
    required this.mapPark,
    required this.mapRoad,
    required this.mapRoadLine,
    required this.mapLandmark,
    required this.mapLandmarkText,
    required this.mapLabelBg,
    required this.mapLabelText,
    required this.mapPinOutline,
  });

  final Color bg, surface, surfaceRaised, field, border, borderStrong;
  final Color fg, fgStrong, fgSoft, fgMuted, fgSubtle, fgFaint;
  /// Theme-aware gold for text, icons and outlines (darker in light mode for contrast).
  final Color accent, accentDeep, accentPale;
  final Color success, danger, warning, highlight;
  final Color overlay, skeleton;
  final Color mapBg, mapGrid, mapWater, mapPark, mapRoad, mapRoadLine, mapLandmark, mapLandmarkText, mapLabelBg, mapLabelText, mapPinOutline;

  static const dark = QfColors(
    bg: Color(0xFF07070A),
    surface: Color(0xFF111116),
    surfaceRaised: Color(0xFF1A1A21),
    field: Color(0xFF0D0D12),
    border: Color(0xFF2A2A33),
    borderStrong: Color(0xFF71717A),
    fg: Color(0xFFECECF1),
    fgStrong: Color(0xFFFFFFFF),
    fgSoft: Color(0xFFD4D4D8),
    fgMuted: Color(0xFFA1A1AA),
    fgSubtle: Color(0xFF71717A),
    fgFaint: Color(0xFF52525B),
    accent: Color(0xFFF2C14E),
    accentDeep: Color(0xFFC8961E),
    accentPale: Color(0xFFFFE7A3),
    success: Color(0xFF34D399),
    danger: Color(0xFFF87171),
    warning: Color(0xFFFDBA74),
    highlight: Color(0xFFF9A8D4),
    overlay: Color(0xBF000000),
    skeleton: Color(0xFF17171D),
    mapBg: Color(0xFF0B0C10),
    mapGrid: Color(0xFF16171D),
    mapWater: Color(0xFF0C1A24),
    mapPark: Color(0xFF0F1A12),
    mapRoad: Color(0xFF22232B),
    mapRoadLine: Color(0xFF3A3220),
    mapLandmark: Color(0xFF4A4A55),
    mapLandmarkText: Color(0xFF5D5D6A),
    mapLabelBg: Color(0xFF0B0B0F),
    mapLabelText: Color(0xFFFFFFFF),
    mapPinOutline: Color(0xFF07070A),
  );

  static const light = QfColors(
    bg: Color(0xFFFAF8F3),
    surface: Color(0xFFFFFFFF),
    surfaceRaised: Color(0xFFF3EFE6),
    field: Color(0xFFFFFFFF),
    border: Color(0xFFE5DFD1),
    borderStrong: Color(0xFFA8A294),
    fg: Color(0xFF1B1920),
    fgStrong: Color(0xFF000000),
    fgSoft: Color(0xFF3A3741),
    fgMuted: Color(0xFF5B5864),
    fgSubtle: Color(0xFF767380),
    fgFaint: Color(0xFFA4A1AB),
    accent: Color(0xFF8F5F00),
    accentDeep: Color(0xFFB07D10),
    accentPale: Color(0xFF6B4800),
    success: Color(0xFF0B7A52),
    danger: Color(0xFFC62828),
    warning: Color(0xFFB45309),
    highlight: Color(0xFFBE185D),
    overlay: Color(0x8C141006),
    skeleton: Color(0xFFEFEBE1),
    mapBg: Color(0xFFF1EEE6),
    mapGrid: Color(0xFFE6E2D7),
    mapWater: Color(0xFFCFE3EE),
    mapPark: Color(0xFFD5E6CF),
    mapRoad: Color(0xFFFFFFFF),
    mapRoadLine: Color(0xFFE2C97F),
    mapLandmark: Color(0xFF9A968B),
    mapLandmarkText: Color(0xFF7B776D),
    mapLabelBg: Color(0xFFFFFFFF),
    mapLabelText: Color(0xFF1B1920),
    mapPinOutline: Color(0xFFFFFFFF),
  );

  @override
  QfColors copyWith() => this;

  @override
  QfColors lerp(ThemeExtension<QfColors>? other, double t) => t < 0.5 ? this : (other as QfColors? ?? this);
}

extension QfThemeX on BuildContext {
  QfColors get qf => Theme.of(this).extension<QfColors>()!;
}
