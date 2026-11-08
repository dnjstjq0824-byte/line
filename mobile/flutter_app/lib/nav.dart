// Single source of truth for Harbor navigation destinations.
import 'package:flutter/material.dart';

class LunoDestination {
  final String route;
  final String label;
  final IconData icon;
  final IconData activeIcon;
  const LunoDestination(this.route, this.label, this.icon, this.activeIcon);
}

abstract final class LunoNav {
  static const primary = <LunoDestination>[
    LunoDestination('/home', '홈', Icons.home_outlined, Icons.home),
    LunoDestination('/chats', '대화', Icons.chat_bubble_outline, Icons.chat_bubble),
    LunoDestination('/news', '뉴스', Icons.newspaper_outlined, Icons.newspaper),
    LunoDestination('/calls', '통화', Icons.phone_outlined, Icons.phone),
  ];
  static const secondary = <LunoDestination>[
    LunoDestination('/feed', '피드', Icons.play_circle_outline, Icons.play_circle),
    LunoDestination('/lounge', '라운지', Icons.forum_outlined, Icons.forum),
    LunoDestination('/wallet', '지갑', Icons.account_balance_wallet_outlined, Icons.account_balance_wallet),
    LunoDestination('/keep', 'Keep', Icons.bookmark_outline, Icons.bookmark),
    LunoDestination('/settings', '설정', Icons.settings_outlined, Icons.settings),
    LunoDestination('/console', '콘솔', Icons.radar_outlined, Icons.radar),
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
