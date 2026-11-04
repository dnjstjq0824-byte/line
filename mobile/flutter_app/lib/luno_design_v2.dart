import 'package:flutter/material.dart';

/// Versioned visual system only. API, authentication and message state are unchanged.
abstract final class LunoDesignV2 {
  static ThemeData theme(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final scheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFF4B4DED),
      brightness: brightness,
      primary: dark ? const Color(0xFFA3A4FF) : const Color(0xFF4B4DED),
      onPrimary: dark ? const Color(0xFF191A37) : Colors.white,
      surface: dark ? const Color(0xFF1A1D29) : Colors.white,
      onSurface: dark ? const Color(0xFFEEEEF7) : const Color(0xFF202333),
      outline: dark ? const Color(0xFF34394B) : const Color(0xFFE3E6EF),
    );
    final base = ThemeData(useMaterial3: true, colorScheme: scheme, brightness: brightness);
    return base.copyWith(
      scaffoldBackgroundColor: dark ? const Color(0xFF11131C) : const Color(0xFFF5F6FA),
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: base.textTheme.titleMedium?.copyWith(color: scheme.onSurface, fontWeight: FontWeight.w600),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: dark ? const Color(0xFF242836) : const Color(0xFFF5F6FA),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: scheme.outline)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: scheme.outline)),
      ),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(
        minimumSize: const Size(48, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      )),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surface,
        indicatorColor: dark ? const Color(0xFF292947) : const Color(0xFFEEEEFF),
        height: 76,
      ),
      dividerTheme: DividerThemeData(color: scheme.outline, thickness: 1),
    );
  }
}
