import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/theme/luno_theme.dart';

// §7 brand tokens: exact HEX parity with
// apps/user-web/src/styles/design-tokens.css. Any drift fails here.
void main() {
  test('light brand and surfaces match spec', () {
    expect(LunoLight.primary, const Color(0xFF058237));
    expect(LunoLight.primaryHover, const Color(0xFF046D2E));
    expect(LunoLight.primaryActive, const Color(0xFF035A25));
    expect(LunoLight.primarySoft, const Color(0xFFE6F7EC));
    expect(LunoLight.unreadAccent, const Color(0xFF06C755));
    expect(LunoLight.bgApp, const Color(0xFFF5F7F6));
    expect(LunoLight.bgRail, const Color(0xFF1E242B));
    expect(LunoLight.bgPanel, const Color(0xFFFFFFFF));
    expect(LunoLight.bgChatRoom, const Color(0xFF8CABD9));
    expect(LunoLight.surfaceActive, const Color(0xFFE6F7EC));
    expect(LunoLight.surfaceInput, const Color(0xFFF2F4F3));
  });

  test('light bubbles and text match spec', () {
    expect(LunoLight.bubbleMineBg, const Color(0xFF95EC69));
    expect(LunoLight.bubbleTheirsBg, const Color(0xFFFFFFFF));
    expect(LunoLight.bubbleTheirsText, const Color(0xFF111827));
    expect(LunoLight.bubbleSystemBg,
        const Color.fromRGBO(17, 24, 39, 0.24));
    expect(LunoLight.textPrimary, const Color(0xFF111827));
    expect(LunoLight.textSecondary, const Color(0xFF52606D));
    expect(LunoLight.textMuted, const Color(0xFF7B8794));
    expect(LunoLight.borderFocus, const Color(0xFF058237));
  });

  test('dark palette matches spec', () {
    expect(LunoDark.primary, const Color(0xFF06C755));
    expect(LunoDark.primaryHover, const Color(0xFF24DB6F));
    expect(LunoDark.unreadAccent, const Color(0xFF06C755));
    expect(LunoDark.bgApp, const Color(0xFF0F1419));
    expect(LunoDark.bgRail, const Color(0xFF0C1015));
    expect(LunoDark.bgPanel, const Color(0xFF171F26));
    expect(LunoDark.surfaceActive, const Color(0xFF123322));
    expect(LunoDark.bubbleTheirsBg, const Color(0xFF222E38));
    expect(LunoDark.bubbleTheirsText, const Color(0xFFF1F5F9));
    expect(LunoDark.textMuted, const Color(0xFF64748B));
    expect(LunoDark.borderFocus, const Color(0xFF06C755));
  });

  test('status, radii and layout match spec', () {
    expect(LunoStatus.online, const Color(0xFF06C755));
    expect(LunoStatus.busy, const Color(0xFFEF4444));
    expect(LunoStatus.away, const Color(0xFFF59E0B));
    expect(LunoRadius.sm, 8.0);
    expect(LunoRadius.md, 12.0);
    expect(LunoRadius.bubble, 18.0);
    expect(LunoRadius.bubbleTail, 4.0);
    expect(LunoLayout.navRailWidth, 64.0);
    expect(LunoLayout.listPaneWidth, 340.0);
    expect(LunoLayout.drawerWidth, 320.0);
    expect(LunoLayout.headerHeight, 60.0);
    expect(LunoLayout.bottomNavHeight, 56.0);
  });

  test('theme factory uses only spec colors', () {
    final light = LunoTheme.theme(Brightness.light);
    expect(light.colorScheme.primary, const Color(0xFF058237));
    expect(light.scaffoldBackgroundColor, const Color(0xFFF5F7F6));
    final dark = LunoTheme.theme(Brightness.dark);
    expect(dark.colorScheme.primary, const Color(0xFF06C755));
    expect(dark.scaffoldBackgroundColor, const Color(0xFF0F1419));
  });

  test('type scale matches §7-2 exactly', () {
    expect(LunoType.titleSize, 16.0);
    expect(LunoType.titleWeight, FontWeight.w600);
    expect(LunoType.titleHeight, 1.35);
    expect(LunoType.listNameSize, 15.0);
    expect(LunoType.listNameWeight, FontWeight.w600);
    expect(LunoType.listNameHeight, 1.4);
    expect(LunoType.bubbleSize, 15.0);
    expect(LunoType.bubbleWeight, FontWeight.w400);
    expect(LunoType.bubbleHeight, 1.48);
    expect(LunoType.inputSize, 16.0);
    expect(LunoType.subSize, 13.0);
    expect(LunoType.subWeight, FontWeight.w400);
    expect(LunoType.subMaxLines, 2);
    expect(LunoType.stampSize, 11.0);
    expect(LunoType.stampWeight, FontWeight.w500);
    expect(LunoType.stampHeight, 1.2);
    expect(LunoType.tabular, const FontFeature.tabularFigures());
  });

  test('bubble geometry matches §7-3 exactly', () {
    expect(
        LunoBubble.mine,
        const BorderRadius.only(
          topLeft: Radius.circular(18),
          topRight: Radius.circular(18),
          bottomRight: Radius.circular(4),
          bottomLeft: Radius.circular(18),
        ));
    expect(
        LunoBubble.theirs,
        const BorderRadius.only(
          topLeft: Radius.circular(4),
          topRight: Radius.circular(18),
          bottomRight: Radius.circular(18),
          bottomLeft: Radius.circular(18),
        ));
    expect(LunoBubble.gapInner, 3.0);
    expect(LunoBubble.gapBreak, 12.0);
    expect(LunoBubble.avatarSize, 36.0);
    expect(LunoBubble.continuedIndent, 44.0);
    expect(LunoBubble.maxWidthMobileFraction, 0.76);
    expect(LunoBubble.maxWidthDesktop, 520.0);
    expect(LunoBubble.burstWindow, const Duration(seconds: 60));
  });

  test('theme factory maps §7-4 surfaces', () {
    final light = LunoTheme.theme(Brightness.light);
    expect(light.primaryColor, const Color(0xFF058237));
    expect(light.cardColor, const Color(0xFFFFFFFF));
    expect(light.appBarTheme.elevation, 0);
    expect(light.appBarTheme.scrolledUnderElevation, 0.5);
    expect(light.appBarTheme.backgroundColor, const Color(0xFFFFFFFF));
    expect(light.appBarTheme.systemOverlayStyle,
        SystemUiOverlayStyle.dark);
    expect(light.textTheme.titleLarge?.fontSize, 16.0);
    expect(light.textTheme.titleMedium?.fontSize, 15.0);
    expect(light.textTheme.bodyLarge?.fontSize, 15.0);
    expect(light.textTheme.bodyLarge?.height, 1.48);
    expect(light.textTheme.bodyMedium?.fontSize, 13.0);
    expect(light.textTheme.bodyMedium?.color, const Color(0xFF52606D));
    expect(light.textTheme.labelSmall?.fontSize, 11.0);
    expect(LunoTheme.chatRoomBackgroundColor(Brightness.light),
        const Color(0xFF8CABD9));
    expect(LunoTheme.unreadAccentColor(Brightness.light),
        const Color(0xFF06C755));
    final dark = LunoTheme.theme(Brightness.dark);
    expect(dark.primaryColor, const Color(0xFF06C755));
    expect(dark.cardColor, const Color(0xFF1E2832));
    expect(dark.appBarTheme.backgroundColor, const Color(0xFF1E2832));
    expect(dark.appBarTheme.systemOverlayStyle,
        SystemUiOverlayStyle.light);
    expect(LunoTheme.chatRoomBackgroundColor(Brightness.dark),
        const Color(0xFF131A22));
    expect(LunoTheme.unreadAccentColor(Brightness.dark),
        const Color(0xFF06C755));
  });
}
