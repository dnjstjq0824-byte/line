// LUNO BRAND DESIGN TOKENS — mandatory spec (§7 directive), 1:1 with
// apps/user-web/src/styles/design-tokens.css. Every surface must reference
// these tokens only; no hardcoded colors.
//
// Notes on exactness:
// - Dark-mode semantic status colors are NOT overridden in §7, so both
//   brightnesses share LunoStatus.
// - §7-2 fixes the numeric type scale (LunoType); §7-3 the bubble geometry
//   (LunoBubble); §7-4 the ThemeData surface mapping below.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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

/// Type scale (§7-2). Web values are rem at 16px root, so px match 1:1.
abstract final class LunoType {
  // Pretendard Variable first; no font asset is bundled yet, so the platform
  // default renders until one ships. The stack mirrors --font-sans.
  static const fontFamily = 'Pretendard';
  static const fontFamilyFallback = <String>[
    'Pretendard',
    'Apple SD Gothic Neo',
    'Noto Sans KR',
    'Roboto',
  ];

  /// Room title / header title: 16px, w600, 1.35.
  static const titleSize = 16.0;
  static const titleWeight = FontWeight.w600;
  static const titleHeight = 1.35;

  /// List name (friend / chat room): 15px, w600, 1.4.
  static const listNameSize = 15.0;
  static const listNameWeight = FontWeight.w600;
  static const listNameHeight = 1.4;

  /// Bubble body: 15px, w400, 1.48.
  static const bubbleSize = 15.0;
  static const bubbleWeight = FontWeight.w400;
  static const bubbleHeight = 1.48;

  /// Message composer: FIXED 16px (iOS Safari force-zooms below 16px).
  static const inputSize = 16.0;

  /// List subtext (recent preview): 13px, w400, max 2 lines.
  static const subSize = 13.0;
  static const subWeight = FontWeight.w400;
  static const subMaxLines = 2;

  /// Timestamps and read count: 11px, w500, 1.2.
  static const stampSize = 11.0;
  static const stampWeight = FontWeight.w500;
  static const stampHeight = 1.2;

  /// Fixed-width numerals for times, badges, read counts and call timers.
  static const tabular = FontFeature.tabularFigures();
}

/// Bubble grouping geometry (§7-3).
abstract final class LunoBubble {
  /// Mine (right): 18px 18px 4px 18px.
  static const mine = BorderRadius.only(
    topLeft: Radius.circular(LunoRadius.bubble),
    topRight: Radius.circular(LunoRadius.bubble),
    bottomRight: Radius.circular(LunoRadius.bubbleTail),
    bottomLeft: Radius.circular(LunoRadius.bubble),
  );

  /// Theirs (left): 4px 18px 18px 18px.
  static const theirs = BorderRadius.only(
    topLeft: Radius.circular(LunoRadius.bubbleTail),
    topRight: Radius.circular(LunoRadius.bubble),
    bottomRight: Radius.circular(LunoRadius.bubble),
    bottomLeft: Radius.circular(LunoRadius.bubble),
  );

  /// In-burst spacing vs sender-change spacing.
  static const gapInner = 3.0;
  static const gapBreak = 12.0;

  /// Lead avatar is 36x36; continuations keep a 44px indent.
  static const avatarSize = 36.0;
  static const continuedIndent = 44.0;

  /// Max bubble width: 76% of the viewport on phones, 520px on tablet/PC.
  static const maxWidthMobileFraction = 0.76;
  static const maxWidthDesktop = 520.0;

  /// Same sender within 60s stays in one visual group.
  static const burstWindow = Duration(seconds: 60);
}

/// Ready ThemeData built only from §7 tokens.
abstract final class LunoTheme {
  /// §7-4 surface mapping (no ThemeData slot exists for these).
  static Color chatRoomBackgroundColor(Brightness brightness) =>
      brightness == Brightness.dark ? LunoDark.bgChatRoom : LunoLight.bgChatRoom;
  static Color unreadAccentColor(Brightness brightness) =>
      brightness == Brightness.dark
          ? LunoDark.unreadAccent
          : LunoLight.unreadAccent;

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
    final ink = dark ? LunoDark.textPrimary : LunoLight.textPrimary;
    final sub = dark ? LunoDark.textSecondary : LunoLight.textSecondary;
    final muted = dark ? LunoDark.textMuted : LunoLight.textMuted;
    final text = ThemeData(brightness: brightness).textTheme;
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      primaryColor: dark ? LunoDark.primary : LunoLight.primary,
      scaffoldBackgroundColor: dark ? LunoDark.bgApp : LunoLight.bgApp,
      cardColor: dark ? LunoDark.surfaceElevated : LunoLight.surfaceElevated,
      fontFamily: LunoType.fontFamily,
      fontFamilyFallback: LunoType.fontFamilyFallback,
      textTheme: text
          .copyWith(
            // §7-2 roles mapped onto Material slots.
            titleLarge: TextStyle(
                fontSize: LunoType.titleSize,
                fontWeight: LunoType.titleWeight,
                height: LunoType.titleHeight,
                color: ink),
            titleMedium: TextStyle(
                fontSize: LunoType.listNameSize,
                fontWeight: LunoType.listNameWeight,
                height: LunoType.listNameHeight,
                color: ink),
            bodyLarge: TextStyle(
                fontSize: LunoType.bubbleSize,
                fontWeight: LunoType.bubbleWeight,
                height: LunoType.bubbleHeight,
                color: ink),
            bodyMedium: TextStyle(
                fontSize: LunoType.subSize,
                fontWeight: LunoType.subWeight,
                color: sub),
            labelSmall: TextStyle(
                fontSize: LunoType.stampSize,
                fontWeight: LunoType.stampWeight,
                height: LunoType.stampHeight,
                color: muted,
                fontFeatures: const [LunoType.tabular]),
          )
          .apply(
            // bodyColor intentionally omitted: bodyMedium keeps
            // textSecondary (§7-2 subtext), not the primary ink.
            displayColor: ink,
          ),
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0.5,
        backgroundColor:
            dark ? LunoDark.surfaceElevated : LunoLight.surfaceElevated,
        foregroundColor: ink,
        systemOverlayStyle:
            dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
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
