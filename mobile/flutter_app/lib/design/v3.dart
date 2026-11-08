// LUNO Harbor V3 — original dispatch-desk design language.
//
// Metaphor: a harbour control desk. Conversations are vessels at berths,
// unread markers are signal lamps, the rail is the dispatch console.
// Deliberately NOT a conference/landing look: no hero, no feature grid,
// no bento, no aurora blobs, no gradient headline text, no purple accent,
// no single global radius, no glassmorphism, no emoji feature icons.
//
// Brand direction (user-requested): reference layout with the LUNO brand
// blues. Light chrome aliases the frozen PO tokens; LunoBrand below covers
// the theme-independent brand moments (splash, covers, badges).
import 'package:flutter/material.dart';

import '../legacy_tokens.dart';

/// Harbor daylight tokens. Light chrome follows the LUNO brand blues
/// (frozen PO tokens); only the night palette keeps the pine look.
abstract final class HarborLight {
  static const fog = lunoBg; // page ground
  static const surface = Color(0xFFFFFFFF);
  static const chart = Color(0xFFE4E9F2); // inset / wash panels, blue grey
  static const ink = lunoNavy;
  static const drift = lunoSlateGray; // secondary text
  static const channel = lunoMistGray; // hairlines
  static const harbor = lunoDeepBlue; // primary brand blue
  static const onHarbor = Color(0xFFFFFFFF);
  static const beacon = Color(0xFFE4572E); // signal vermilion: unread, calls, key CTAs
  static const onBeacon = Color(0xFFFFFFFF);
  static const seaGlass = Color(0xFFE3EBFF); // selected wash, light brand blue
  static const buoyBg = Color(0xFFFFF3D6);
  static const buoyInk = Color(0xFF7A5B00);
  static const danger = Color(0xFFC22E3D); // kept: AA-chosen functional red
  static const success = Color(0xFF2E7D32); // kept: AA-chosen functional green
  static const warning = Color(0xFF7A5B00);
  static const info = Color(0xFF1D6FB8);
  static const tide = Color(0xFF1D6FB8); // links / info
  static const mine = lunoPrimary; // own chat bubble, brand blue
  static const theirs = Color(0xFFFFFFFF);
}

/// Harbor night tokens.
abstract final class HarborDark {
  static const fog = Color(0xFF0A1413); // deep water
  static const surface = Color(0xFF12201E);
  static const chart = Color(0xFF1B2E2A);
  static const ink = Color(0xFFE9F2EF);
  static const drift = Color(0xFF9DB0AA);
  static const channel = Color(0xFF2A3E39);
  static const harbor = Color(0xFF6FD3B6); // sea-glass primary
  static const onHarbor = Color(0xFF0A1A17);
  static const beacon = Color(0xFFFF7A59);
  static const onBeacon = Color(0xFF23110B);
  static const seaGlass = Color(0xFF1E3A33);
  static const buoyBg = Color(0xFF3A2F0E);
  static const buoyInk = Color(0xFFFFD98A);
  static const danger = Color(0xFFFF98A0);
  static const success = Color(0xFF7BC98A);
  static const warning = Color(0xFFFFD98A);
  static const info = Color(0xFF7FB9EC);
  static const tide = Color(0xFF7FB9EC);
  static const mine = Color(0xFF2A5A4E);
  static const theirs = Color(0xFF1B2E2A);
}

/// Harbor elevation: two quiet shadows, no glow. Mirrors design-v3.tokens.json.
abstract final class HarborShadow {
  static const sm = [
    BoxShadow(offset: Offset(0, 2), blurRadius: 8, color: Color(0x1F12211E)),
  ];
  static const md = [
    BoxShadow(offset: Offset(0, 16), blurRadius: 48, color: Color(0x1412211E)),
  ];
  static const smDark = [
    BoxShadow(offset: Offset(0, 2), blurRadius: 8, color: Color(0x55000000)),
  ];
  static const mdDark = [
    BoxShadow(offset: Offset(0, 16), blurRadius: 48, color: Color(0x40000000)),
  ];
}

/// Harbor type scale in logical px. Mirrors design-v3.tokens.json typePx.
abstract final class HarborType {
  static const display = 22.0;
  static const title = 17.0;
  static const body = 15.0;
  static const small = 12.0;
  static const micro = 11.0;
}

/// Deliberately varied radii: each surface has its own corner voice.
abstract final class HarborRadius {
  static const control = 10.0; // buttons, inputs
  static const card = 14.0; // list cards
  static const avatar = 12.0; // rounded-square identities
  static const sheet = 22.0; // bottom sheets, dialogs
  static const lamp = 999.0; // pills, badges
  // Chat bubbles are asymmetric: the tight corner points at the sender side.
  static const mine = BorderRadius.only(
    topLeft: Radius.circular(16),
    topRight: Radius.circular(4),
    bottomLeft: Radius.circular(16),
    bottomRight: Radius.circular(16),
  );
  static const theirs = BorderRadius.only(
    topLeft: Radius.circular(4),
    topRight: Radius.circular(16),
    bottomLeft: Radius.circular(16),
    bottomRight: Radius.circular(16),
  );
}

abstract final class LunoHarbor {
  static ThemeData theme(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final scheme = ColorScheme(
      brightness: brightness,
      primary: dark ? HarborDark.harbor : HarborLight.harbor,
      onPrimary: dark ? HarborDark.onHarbor : HarborLight.onHarbor,
      secondary: dark ? HarborDark.beacon : HarborLight.beacon,
      onSecondary: dark ? HarborDark.onBeacon : HarborLight.onBeacon,
      error: dark ? HarborDark.danger : HarborLight.danger,
      onError: Colors.white,
      surface: dark ? HarborDark.surface : HarborLight.surface,
      onSurface: dark ? HarborDark.ink : HarborLight.ink,
      surfaceContainerLowest: dark ? HarborDark.fog : HarborLight.fog,
      surfaceContainerLow: dark ? HarborDark.chart : HarborLight.chart,
      surfaceContainerHigh: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
      outline: dark ? HarborDark.channel : HarborLight.channel,
      outlineVariant: dark ? HarborDark.drift : HarborLight.drift,
    );
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      brightness: brightness,
      scaffoldBackgroundColor: dark ? HarborDark.fog : HarborLight.fog,
    );
    final ink = dark ? HarborDark.ink : HarborLight.ink;
    final drift = dark ? HarborDark.drift : HarborLight.drift;
    return base.copyWith(
      // Strict type hierarchy: display / title / body / detail / caption.
      // System stack on purpose — no bundled webfont, no Inter-everywhere.
      textTheme: base.textTheme.copyWith(
        displaySmall: base.textTheme.displaySmall?.copyWith(
          fontSize: 26, fontWeight: FontWeight.w800, color: ink, height: 1.15,
          letterSpacing: -0.3),
        titleLarge: base.textTheme.titleLarge?.copyWith(
          fontSize: 17, fontWeight: FontWeight.w700, color: ink, height: 1.25),
        titleMedium: base.textTheme.titleMedium?.copyWith(
          fontSize: 15, fontWeight: FontWeight.w700, color: ink, height: 1.3),
        bodyLarge: base.textTheme.bodyLarge?.copyWith(
          fontSize: 14, fontWeight: FontWeight.w400, color: ink, height: 1.45),
        bodyMedium: base.textTheme.bodyMedium?.copyWith(
          fontSize: 13, fontWeight: FontWeight.w400, color: ink, height: 1.45),
        bodySmall: base.textTheme.bodySmall?.copyWith(
          fontSize: 12, fontWeight: FontWeight.w500, color: drift, height: 1.4),
        labelSmall: base.textTheme.labelSmall?.copyWith(
          fontSize: 11, fontWeight: FontWeight.w700, color: drift, height: 1.3),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: dark ? HarborDark.surface : HarborLight.surface,
        foregroundColor: ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: base.textTheme.titleMedium?.copyWith(color: ink, fontWeight: FontWeight.w700, fontSize: 15),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: dark ? HarborDark.chart : Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        hintStyle: TextStyle(fontSize: 13, color: drift),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(HarborRadius.control),
          borderSide: BorderSide(color: dark ? HarborDark.channel : HarborLight.channel)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(HarborRadius.control),
          borderSide: BorderSide(color: dark ? HarborDark.channel : HarborLight.channel)),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(HarborRadius.control),
          borderSide: BorderSide(color: scheme.primary, width: 1.6)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 46),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HarborRadius.control)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(48, 46),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HarborRadius.control)),
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HarborRadius.lamp)),
      ),
      dividerTheme: DividerThemeData(
        color: dark ? HarborDark.channel : HarborLight.channel, thickness: 1),
      cardTheme: base.cardTheme.copyWith(
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HarborRadius.card)),
      ),
      listTileTheme: base.listTileTheme.copyWith(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2)),
    );
  }

  /// Page transition: quick fade+rise, honours reduced motion.
  static Widget transition(
    BuildContext context,
    Animation<double> animation,
    Widget child,
  ) {
    if (MediaQuery.disableAnimationsOf(context)) return child;
    final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position: Tween<Offset>(begin: const Offset(0, 0.02), end: Offset.zero).animate(curved),
        child: child,
      ),
    );
  }
}

/// Small vertical signal lamp used for unread / active states.
class LampBar extends StatelessWidget {
  final double height;
  final double width;
  const LampBar({super.key, this.height = 22, this.width = 3});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: dark ? HarborDark.beacon : HarborLight.beacon,
        borderRadius: BorderRadius.circular(HarborRadius.lamp),
      ),
    );
  }
}

/// Rounded-square identity tile (people, channels, rooms).
class IdentityTile extends StatelessWidget {
  final String glyph;
  final Color color;
  final double size;
  const IdentityTile({super.key, required this.glyph, required this.color, this.size = 40});

  @override
  Widget build(BuildContext context) {
    final ch = glyph.isEmpty ? '?' : glyph.characters.first;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(HarborRadius.avatar),
      ),
      child: Text(ch,
          style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: size * 0.42)),
    );
  }
}

/// LUNO brand-fixed tokens (identical in both brightnesses).
/// Values alias the frozen PO tokens in legacy_tokens.dart.
abstract final class LunoBrand {
  static const primary = lunoPrimary;
  static const deep = lunoDeepBlue;
}

/// Circular identity avatar in the reference style (people, profiles).
class LineAvatar extends StatelessWidget {
  final String glyph;
  final Color color;
  final double size;
  const LineAvatar({super.key, required this.glyph, required this.color, this.size = 48});

  @override
  Widget build(BuildContext context) {
    final ch = glyph.isEmpty ? '?' : glyph.characters.first;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      child: Text(ch,
          style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: size * 0.4)),
    );
  }
}

/// Orbit Crew badge: a crew member's face plus name.
/// The crew faces are canonical product data (lunoOrbitCrewStickers in
/// legacy_tokens.dart, pinned by messenger_test.dart) — this renders the
/// product's own characters, not decorative icons.
class CrewBadge extends StatelessWidget {
  final String emoji;
  final String name;
  final double size;
  final Color? background;
  final Color? nameColor;
  const CrewBadge(
      {super.key,
      required this.emoji,
      required this.name,
      this.size = 52,
      this.background,
      this.nameColor});

  /// Luno the mascot for empty states.
  const CrewBadge.mascot(
      {super.key, this.size = 64, this.background, this.nameColor})
      : emoji = '🚀🔥',
        name = 'Luno';

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final bg =
        background ?? (dark ? HarborDark.seaGlass : HarborLight.seaGlass);
    final fg = nameColor ?? (dark ? HarborDark.ink : HarborLight.ink);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
          child: Text(emoji, style: TextStyle(fontSize: size * 0.4)),
        ),
        const SizedBox(height: 4),
        Text(name,
            style: TextStyle(
                fontSize: 11, fontWeight: FontWeight.w700, color: fg)),
      ],
    );
  }
}
