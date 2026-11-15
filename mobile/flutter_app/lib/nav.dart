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
  // UX4: bottom tabs match the web order (home/chats/news/calls/wallet).
  static const primary = <LunoDestination>[
    LunoDestination('/home', 'mvHome', Icons.home_outlined, Icons.home),
    LunoDestination('/chats', 'navTalks', Icons.chat_bubble_outline, Icons.chat_bubble),
    LunoDestination('/news', 'mvNews', Icons.newspaper_outlined, Icons.newspaper),
    LunoDestination('/calls', 'mvCall', Icons.phone_outlined, Icons.phone),
    LunoDestination('/wallet', 'mvWallet', Icons.account_balance_wallet_outlined, Icons.account_balance_wallet),
  ];
  static const secondary = <LunoDestination>[
    LunoDestination('/shop', 'mvRailShop', Icons.shopping_bag_outlined, Icons.shopping_bag),
    LunoDestination('/apps', 'appWord', Icons.apps_outlined, Icons.apps),
    LunoDestination('/feed', 'navFeed', Icons.play_circle_outline, Icons.play_circle),
    LunoDestination('/lounge', 'navLounge', Icons.forum_outlined, Icons.forum),
    LunoDestination('/keep', 'navKeep', Icons.bookmark_outline, Icons.bookmark),
    LunoDestination('/settings', 'settingsTitle', Icons.settings_outlined, Icons.settings),
    LunoDestination('/console', 'consoleTitle', Icons.radar_outlined, Icons.radar),
  ];
  static const all = <LunoDestination>[...primary, ...secondary];

  /// Deep routes highlight their parent destination (/chats/9 -> /chats).
  static String parentOf(String location) {
    for (final d in all) {
      if (location == d.route || location.startsWith('${d.route}/')) return d.route;
    }
    if (location.startsWith('/stories') || location.startsWith('/channels')) {
      return '/home';
    }
    return location;
  }
}
