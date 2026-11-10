// LUNO BRAND DESIGN TOKENS — mandatory spec (§7 directive), 1:1 with
// apps/user-web/src/styles/design-tokens.css. Every surface must reference
// these tokens only; no hardcoded colors.
//
// Notes on exactness:
// - Dark-mode semantic status colors are NOT overridden in §7, so both
//   brightnesses share LunoStatus.
// - §7 fixes typography COLORS but no numeric type scale, so this file keeps
//   the platform text sizes and applies token colors only.
import 'package:flutter/material.dart';

/// Light (§7 :root / [data-theme="light"]).
abstract final class LunoLight {
  // Brand & Accent (LUNO Royal Blue)
  static const primary = Color(0xFF2563EB);
  static const primaryHover = Color(0xFF1D4ED8);
  static const primaryActive = Color(0xFF1E40AF);
  static const primarySoft = Color(0xFFEFF6FF);
  static const unreadAccent = Color(0xFFF59E0B);

  // Backgrounds & Surfaces
  static const bgApp = Color(0xFFF8FAFC);
  static const bgRail = Color(0xFF0F172A);
  static const bgPanel = Color(0xFFFFFFFF);
  static const bgChatRoom = Color(0xFFF1F5F9);
  static const surfaceElevated = Color(0xFFFFFFFF);
  static const surfaceHover = Color(0xFFF1F5F9);
  static const surfaceActive = Color(0xFFE2E8F0);
  static const surfaceInput = Color(0xFFF8FAFC);

  // Chat Bubbles
  static const bubbleMineBg = Color(0xFF2563EB);
  static const bubbleMineText = Color(0xFFFFFFFF);
  static const bubbleTheirsBg = Color(0xFFFFFFFF);
  static const bubbleTheirsText = Color(0xFF0F172A);
  static const bubbleSystemBg = Color.fromRGBO(15, 23, 42, 0.06);
  static const bubbleSystemText = Color(0xFF475569);

  // Typography Colors
  static const textPrimary = Color(0xFF0F172A);
  static const textSecondary = Color(0xFF475569);
  static const textMuted = Color(0xFF94A3B8);
  static const textOnBrand = Color(0xFFFFFFFF);

  // Borders & Dividers
  static const borderSubtle = Color(0xFFE2E8F0);
  static const borderStrong = Color(0xFFCBD5E1);
  static const borderFocus = Color(0xFF2563EB);

  // Shadows
  static const shadowSm = BoxShadow(
      offset: Offset(0, 1),
      blurRadius: 2,
      color: Color.fromRGBO(15, 23, 42, 0.05));
  static const shadowMd = BoxShadow(
      offset: Offset(0, 4),
      blurRadius: 12,
      color: Color.fromRGBO(15, 23, 42, 0.08));
  static const shadowLg = BoxShadow(
      offset: Offset(0, 12),
      blurRadius: 32,
      color: Color.fromRGBO(15, 23, 42, 0.14));
}

/// Dark (§7 [data-theme="dark"]).
abstract final class LunoDark {
  // Brand & Accent
  static const primary = Color(0xFF3B82F6);
  static const primaryHover = Color(0xFF60A5FA);
  static const primaryActive = Color(0xFF2563EB);
  static const primarySoft = Color.fromRGBO(59, 130, 246, 0.15);
  static const unreadAccent = Color(0xFFFBBF24);

  // Backgrounds & Surfaces
  static const bgApp = Color(0xFF090D16);
  static const bgRail = Color(0xFF05080F);
  static const bgPanel = Color(0xFF0F172A);
  static const bgChatRoom = Color(0xFF090D16);
  static const surfaceElevated = Color(0xFF1E293B);
  static const surfaceHover = Color(0xFF1E293B);
  static const surfaceActive = Color(0xFF334155);
  static const surfaceInput = Color(0xFF1E293B);

  // Chat Bubbles
  static const bubbleMineBg = Color(0xFF2563EB);
  static const bubbleMineText = Color(0xFFFFFFFF);
  static const bubbleTheirsBg = Color(0xFF1E293B);
  static const bubbleTheirsText = Color(0xFFF8FAFC);
  static const bubbleSystemBg = Color.fromRGBO(255, 255, 255, 0.08);
  static const bubbleSystemText = Color(0xFF94A3B8);

  // Typography Colors
  static const textPrimary = Color(0xFFF8FAFC);
  static const textSecondary = Color(0xFF94A3B8);
  static const textMuted = Color(0xFF64748B);
  static const textOnBrand = Color(0xFFFFFFFF);

  // Borders & Dividers
  static const borderSubtle = Color(0xFF1E293B);
  static const borderStrong = Color(0xFF334155);
  static const borderFocus = Color(0xFF3B82F6);

  // Shadows
  static const shadowSm = BoxShadow(
      offset: Offset(0, 1), blurRadius: 2, color: Color.fromRGBO(0, 0, 0, 0.3));
  static const shadowMd = BoxShadow(
      offset: Offset(0, 4),
      blurRadius: 12,
      color: Color.fromRGBO(0, 0, 0, 0.45));
  static const shadowLg = BoxShadow(
      offset: Offset(0, 12),
      blurRadius: 32,
      color: Color.fromRGBO(0, 0, 0, 0.65));
}

/// Semantic status — shared by both brightnesses (§7 dark has no override).
abstract final class LunoStatus {
  static const online = Color(0xFF10B981);
  static const busy = Color(0xFFEF4444);
  static const away = Color(0xFFF59E0B);
}

/// Radii (§7 --radius-*).
abstract final class LunoRadius {
  static const sm = 8.0;
  static const md = 12.0;
  static const bubble = 18.0;
  static const bubbleTail = 4.0;
  static const full = 9999.0;
}

/// Fixed layout dimensions (§7 layout tokens).
abstract final class LunoLayout {
  static const navRailWidth = 64.0;
  static const listPaneWidth = 340.0;
  static const drawerWidth = 320.0;
  static const headerHeight = 60.0;
  static const bottomNavHeight = 56.0;
}

/// Ready ThemeData built only from §7 tokens.
abstract final class LunoTheme {
  static ThemeData theme(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final scheme = ColorScheme(
      brightness: brightness,
      primary: dark ? LunoDark.primary : LunoLight.primary,
      onPrimary: LunoLight.textOnBrand,
      secondary: dark ? LunoDark.primaryHover : LunoLight.primaryHover,
      onSecondary: LunoLight.textOnBrand,
      error: LunoStatus.busy,
      onError: LunoLight.textOnBrand,
      surface: dark ? LunoDark.surfaceElevated : LunoLight.surfaceElevated,
      onSurface: dark ? LunoDark.textPrimary : LunoLight.textPrimary,
    );
    final text = ThemeData(brightness: brightness).textTheme;
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: dark ? LunoDark.bgApp : LunoLight.bgApp,
      textTheme: text.apply(
        bodyColor: dark ? LunoDark.textPrimary : LunoLight.textPrimary,
        displayColor: dark ? LunoDark.textPrimary : LunoLight.textPrimary,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor:
            dark ? LunoDark.surfaceElevated : LunoLight.surfaceElevated,
        foregroundColor: dark ? LunoDark.textPrimary : LunoLight.textPrimary,
      ),
      cardTheme: CardThemeData(
        color: dark ? LunoDark.surfaceElevated : LunoLight.surfaceElevated,
      ),
      dividerColor: dark ? LunoDark.borderSubtle : LunoLight.borderSubtle,
    );
  }

  static ThemeData get light => theme(Brightness.light);
  static ThemeData get dark => theme(Brightness.dark);
}
