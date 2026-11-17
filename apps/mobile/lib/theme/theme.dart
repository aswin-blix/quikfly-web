// Builds Material themes from the tokens. Change colours in tokens.dart, not here.
import 'package:flutter/material.dart';
import 'tokens.dart';

ThemeData buildTheme(Brightness brightness) {
  final c = brightness == Brightness.dark ? QfColors.dark : QfColors.light;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: Brand.gold,
    onPrimary: Brand.onGold,
    secondary: c.accent,
    onSecondary: Brand.onGold,
    error: c.danger,
    onError: c.bg,
    surface: c.surface,
    onSurface: c.fg,
    surfaceContainerHighest: c.surfaceRaised,
    outline: c.border,
    outlineVariant: c.border,
  );
  final base = ThemeData(brightness: brightness, colorScheme: scheme, useMaterial3: true, fontFamily: Brand.bodyFont);
  final text = base.textTheme.apply(bodyColor: c.fg, displayColor: c.fgStrong, fontFamily: Brand.bodyFont);
  OutlineInputBorder border(Color color, [double w = 1]) =>
      OutlineInputBorder(borderRadius: BorderRadius.circular(Brand.radiusField), borderSide: BorderSide(color: color, width: w));

  return base.copyWith(
    scaffoldBackgroundColor: c.bg,
    extensions: [c],
    textTheme: text.copyWith(
      headlineLarge: text.headlineLarge?.copyWith(fontFamily: Brand.headingFont, fontSize: 30, height: 1.1),
      headlineMedium: text.headlineMedium?.copyWith(fontFamily: Brand.headingFont, fontSize: 24, height: 1.15),
      headlineSmall: text.headlineSmall?.copyWith(fontFamily: Brand.headingFont, fontSize: 20, height: 1.2),
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w700, fontSize: 19),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w600, fontSize: 16),
      titleSmall: text.titleSmall?.copyWith(fontWeight: FontWeight.w600, fontSize: 14),
      bodyMedium: text.bodyMedium?.copyWith(fontSize: 14.5),
      bodySmall: text.bodySmall?.copyWith(color: c.fgMuted, fontSize: 12.5),
      labelLarge: text.labelLarge?.copyWith(fontWeight: FontWeight.w600, fontSize: 15),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: c.bg,
      foregroundColor: c.fgStrong,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontFamily: Brand.bodyFont, fontWeight: FontWeight.w700, fontSize: 19, color: c.fgStrong),
    ),
    dividerTheme: DividerThemeData(color: c.border, thickness: 1, space: 1),
    cardTheme: CardThemeData(
      color: c.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Brand.radiusPanel), side: BorderSide(color: c.border)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Brand.gold,
        foregroundColor: Brand.onGold,
        disabledBackgroundColor: c.surfaceRaised,
        disabledForegroundColor: c.fgSubtle,
        minimumSize: const Size(64, 52),
        textStyle: const TextStyle(fontFamily: Brand.bodyFont, fontWeight: FontWeight.w700, fontSize: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.fg,
        side: BorderSide(color: c.borderStrong),
        minimumSize: const Size(64, 48),
        textStyle: const TextStyle(fontFamily: Brand.bodyFont, fontWeight: FontWeight.w600, fontSize: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: c.accent, textStyle: const TextStyle(fontFamily: Brand.bodyFont, fontWeight: FontWeight.w600)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.field,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      labelStyle: TextStyle(color: c.fgMuted),
      floatingLabelStyle: TextStyle(color: c.accent),
      hintStyle: TextStyle(color: c.fgSubtle),
      helperStyle: TextStyle(color: c.fgSubtle),
      errorStyle: TextStyle(color: c.danger),
      border: border(c.border),
      enabledBorder: border(c.border),
      focusedBorder: border(c.accent, 1.5),
      errorBorder: border(c.danger),
      focusedErrorBorder: border(c.danger, 1.5),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: c.surface,
      selectedColor: Brand.gold.withValues(alpha: 0.16),
      side: BorderSide(color: c.border),
      labelStyle: TextStyle(color: c.fgSoft, fontFamily: Brand.bodyFont, fontWeight: FontWeight.w500),
      secondaryLabelStyle: TextStyle(color: c.accent, fontFamily: Brand.bodyFont, fontWeight: FontWeight.w600),
      checkmarkColor: c.accent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Brand.radiusChip)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.surface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: Brand.gold.withValues(alpha: 0.18),
      height: 66,
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(
            fontFamily: Brand.bodyFont,
            fontSize: 12,
            fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
            color: s.contains(WidgetState.selected) ? c.accent : c.fgMuted,
          )),
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? c.accent : c.fgMuted)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: c.borderStrong,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    ),
    dialogTheme: DialogThemeData(backgroundColor: c.surface, surfaceTintColor: Colors.transparent),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.surfaceRaised,
      contentTextStyle: TextStyle(color: c.fgStrong, fontFamily: Brand.bodyFont),
      actionTextColor: c.accent,
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Colors.white : c.fgSubtle),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Brand.goldDark : c.surfaceRaised),
      trackOutlineColor: WidgetStateProperty.all(c.border),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Brand.gold : Colors.transparent),
        foregroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Brand.onGold : c.fgSoft),
        side: WidgetStateProperty.all(BorderSide(color: c.border)),
        textStyle: WidgetStateProperty.all(const TextStyle(fontFamily: Brand.bodyFont, fontWeight: FontWeight.w600, fontSize: 13)),
      ),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: c.accent),
    listTileTheme: ListTileThemeData(iconColor: c.fgMuted, textColor: c.fg),
  );
}
