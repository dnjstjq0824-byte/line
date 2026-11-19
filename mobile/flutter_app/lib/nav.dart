// Single source of truth for Harbor navigation destinations.
import 'package:flutter/material.dart';

import 'util/app_l10n.dart';

class LunoDestination {
  final String route;

  /// F20: localization key for the label (const-safe); resolve with labelIn.
  final String labelKey;
  final IconData icon;
  final IconData activeIcon;
  const LunoDestination(this.route, this.labelKey, this.icon, this.activeIcon);

  String labelIn(AppLocalizations s) {
    switch (labelKey) {
      case 'mvHome':
        return s.mvHome;
      case 'navTalks':
        return s.navTalks;
      case 'tabChats':
        return s.tabChats;
      case 'mvMoreActions':
        return s.mvMoreActions;
      case 'mvNews':
        return s.mvNews;
      case 'mvCall':
        return s.mvCall;
      case 'mvWallet':
        return s.mvWallet;
      case 'mvRailShop':
        return s.mvRailShop;
      case 'appWord':
        return s.appWord;
      case 'navFeed':
        return s.navFeed;
      case 'navLounge':
        return s.navLounge;
      case 'navKeep':
        return 'Keep';
      case 'settingsTitle':
        return s.settingsTitle;
      case 'consoleTitle':
        return s.consoleTitle;
      default:
        return labelKey;
    }
  }
}

abstract final class LunoNav {
  // Bottom tabs match the web shell: home, chats, calls, news, then More
  // (every other destination, one tap away).
  static const primary = <LunoDestination>[
    LunoDestination('/home', 'mvHome', Icons.home_outlined, Icons.home),
    LunoDestination(
        '/chats', 'tabChats', Icons.chat_bubble_outline, Icons.chat_bubble),
    LunoDestination('/calls', 'mvCall', Icons.phone_outlined, Icons.phone),
    LunoDestination(
        '/news', 'mvNews', Icons.newspaper_outlined, Icons.newspaper),
    LunoDestination(
        '/more', 'mvMoreActions', Icons.more_horiz, Icons.more_horiz),
  ];
  static const secondary = <LunoDestination>[
    LunoDestination('/wallet', 'mvWallet',
        Icons.account_balance_wallet_outlined, Icons.account_balance_wallet),
    LunoDestination(
        '/shop', 'mvRailShop', Icons.shopping_bag_outlined, Icons.shopping_bag),
    LunoDestination('/apps', 'appWord', Icons.apps_outlined, Icons.apps),
    LunoDestination(
        '/feed', 'navFeed', Icons.play_circle_outline, Icons.play_circle),
    LunoDestination('/lounge', 'navLounge', Icons.forum_outlined, Icons.forum),
    LunoDestination('/keep', 'navKeep', Icons.bookmark_outline, Icons.bookmark),
    LunoDestination(
        '/settings', 'settingsTitle', Icons.settings_outlined, Icons.settings),
    LunoDestination(
        '/console', 'consoleTitle', Icons.radar_outlined, Icons.radar),
  ];
  static const all = <LunoDestination>[...primary, ...secondary];

  /// Tablet/desktop rails list every destination directly, so the phone-only
  /// "More" index is left out there.
  static List<LunoDestination> get railPrimary =>
      primary.where((d) => d.route != '/more').toList();
  static List<LunoDestination> get rail => [...railPrimary, ...secondary];

  /// Deep routes highlight their parent destination (/chats/9 -> /chats).
  static String parentOf(String location) {
    for (final d in all) {
      if (location == d.route || location.startsWith('${d.route}/'))
        return d.route;
    }
    if (location.startsWith('/stories') || location.startsWith('/channels')) {
      return '/home';
    }
    return location;
  }

  /// Where the Android back button goes from [location], or null to leave
  /// the app. Every screen is reached with context.go (no stack), so without
  /// this the first back press closed LUNO from anywhere.
  /// /chats/1/pins -> /chats/1 -> /chats -> /home -> (exit).
  static String? backTargetOf(String location) {
    if (location == '/home' || location == '/login' || location == '/splash') {
      return null;
    }
    final room = RegExp(r'^/chats/[^/]+').firstMatch(location);
    if (room != null && room.group(0) != location) return room.group(0);
    final parent = parentOf(location);
    if (parent != location) return parent;
    final console = RegExp(r'^/console/').hasMatch(location);
    if (console) return '/console';
    return '/home';
  }
}
