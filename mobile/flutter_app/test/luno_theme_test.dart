import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/theme/luno_theme.dart';

// §7 brand tokens: exact HEX parity with
// apps/user-web/src/styles/design-tokens.css. Any drift fails here.
void main() {
  test('light brand and surfaces match spec', () {
    expect(LunoLight.primary, const Color(0xFF2563EB));
    expect(LunoLight.primaryHover, const Color(0xFF1D4ED8));
    expect(LunoLight.primaryActive, const Color(0xFF1E40AF));
    expect(LunoLight.primarySoft, const Color(0xFFEFF6FF));
    expect(LunoLight.unreadAccent, const Color(0xFFF59E0B));
    expect(LunoLight.bgApp, const Color(0xFFF8FAFC));
    expect(LunoLight.bgRail, const Color(0xFF0F172A));
    expect(LunoLight.bgPanel, const Color(0xFFFFFFFF));
    expect(LunoLight.bgChatRoom, const Color(0xFFF1F5F9));
    expect(LunoLight.surfaceActive, const Color(0xFFE2E8F0));
    expect(LunoLight.surfaceInput, const Color(0xFFF8FAFC));
  });

  test('light bubbles and text match spec', () {
    expect(LunoLight.bubbleMineBg, const Color(0xFF2563EB));
    expect(LunoLight.bubbleTheirsBg, const Color(0xFFFFFFFF));
    expect(LunoLight.bubbleTheirsText, const Color(0xFF0F172A));
    expect(LunoLight.bubbleSystemBg,
        const Color.fromRGBO(15, 23, 42, 0.06));
    expect(LunoLight.textPrimary, const Color(0xFF0F172A));
    expect(LunoLight.textSecondary, const Color(0xFF475569));
    expect(LunoLight.textMuted, const Color(0xFF94A3B8));
    expect(LunoLight.borderFocus, const Color(0xFF2563EB));
  });

  test('dark palette matches spec', () {
    expect(LunoDark.primary, const Color(0xFF3B82F6));
    expect(LunoDark.primaryHover, const Color(0xFF60A5FA));
    expect(LunoDark.unreadAccent, const Color(0xFFFBBF24));
    expect(LunoDark.bgApp, const Color(0xFF090D16));
    expect(LunoDark.bgRail, const Color(0xFF05080F));
    expect(LunoDark.bgPanel, const Color(0xFF0F172A));
    expect(LunoDark.surfaceActive, const Color(0xFF334155));
    expect(LunoDark.bubbleTheirsBg, const Color(0xFF1E293B));
    expect(LunoDark.bubbleTheirsText, const Color(0xFFF8FAFC));
    expect(LunoDark.textMuted, const Color(0xFF64748B));
    expect(LunoDark.borderFocus, const Color(0xFF3B82F6));
  });

  test('status, radii and layout match spec', () {
    expect(LunoStatus.online, const Color(0xFF10B981));
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
    expect(light.colorScheme.primary, const Color(0xFF2563EB));
    expect(light.scaffoldBackgroundColor, const Color(0xFFF8FAFC));
    final dark = LunoTheme.theme(Brightness.dark);
    expect(dark.colorScheme.primary, const Color(0xFF3B82F6));
    expect(dark.scaffoldBackgroundColor, const Color(0xFF090D16));
  });
}
