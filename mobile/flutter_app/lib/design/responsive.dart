// Four-device adaptive layer. LayoutBuilder decides the device class,
// MediaQuery supplies scale/motion/platform — each class gets its own
// redesigned chrome, never a scaled copy of another.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../nav.dart';
import '../state/session.dart';
import 'v3.dart';

enum DeviceKind { compactApp, mobile, tablet, desktop }

abstract final class LunoBreakpoints {
  static const double compactMax = 400;
  static const double mobileMax = 720;
  static const double tabletMax = 1120;

  static DeviceKind kindOf(double width) {
    if (width < compactMax) return DeviceKind.compactApp;
    if (width < mobileMax) return DeviceKind.mobile;
    if (width < tabletMax) return DeviceKind.tablet;
    return DeviceKind.desktop;
  }
}

class DeviceScope extends InheritedWidget {
  final DeviceKind kind;
  const DeviceScope({super.key, required this.kind, required super.child});

  static DeviceKind of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<DeviceScope>()?.kind ??
      LunoBreakpoints.kindOf(MediaQuery.sizeOf(context).width);

  @override
  bool updateShouldNotify(DeviceScope old) => old.kind != kind;
}

/// Resolves the device class from the real layout width.
class AdaptiveShell extends StatelessWidget {
  final Widget child;
  const AdaptiveShell({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final kind = LunoBreakpoints.kindOf(constraints.maxWidth);
        return DeviceScope(
          kind: kind,
          child: switch (kind) {
            DeviceKind.desktop => _ConsoleDesk(child: child),
            DeviceKind.tablet => _TabletDesk(child: child),
            DeviceKind.mobile => _MobileDesk(child: child),
            DeviceKind.compactApp => _CompactDesk(child: child),
          },
        );
      },
    );
  }
}

/// Max readable width per device class for single-column pages.
double pageGutter(DeviceKind kind) => switch (kind) {
      DeviceKind.desktop => 32,
      DeviceKind.tablet => 24,
      DeviceKind.mobile => 16,
      DeviceKind.compactApp => 12,
    };

double pageMaxWidth(DeviceKind kind) => switch (kind) {
      DeviceKind.desktop => 880,
      DeviceKind.tablet => 720,
      DeviceKind.mobile => 640,
      DeviceKind.compactApp => double.infinity,
    };

/// Standard single-column page body: gutters + max width per device.
class PageColumn extends StatelessWidget {
  final List<Widget> children;
  final EdgeInsetsGeometry? padding;
  const PageColumn({super.key, required this.children, this.padding});

  @override
  Widget build(BuildContext context) {
    final kind = DeviceScope.of(context);
    final gutter = pageGutter(kind);
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: pageMaxWidth(kind)),
        child: Padding(
          padding: padding ?? EdgeInsets.fromLTRB(gutter, 16, gutter, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: children,
          ),
        ),
      ),
    );
  }
}

/// Harbor page masthead: lamp + title + optional trailing.
/// Sentence-case titles only — no all-caps kickers.
class Masthead extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  const Masthead({super.key, required this.title, this.subtitle, this.trailing});

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const LampBar(height: 26),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: text.displaySmall?.copyWith(fontSize: 22)),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(subtitle!, style: text.bodySmall),
                ],
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

// --- Desktop: dispatch console with a full harbour rail ---------------------

class _ConsoleDesk extends StatelessWidget {
  final Widget child;
  const _ConsoleDesk({required this.child});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final location = GoRouterState.of(context).uri.path;
    final active = LunoNav.parentOf(location);
    return Scaffold(
      body: Row(
        children: [
          Container(
            width: 216,
            color: dark ? HarborDark.surface : HarborLight.surface,
            child: SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 14, 16, 6),
                    child: HarborWordmark(compact: false),
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      children: [
                        for (final d in LunoNav.primary)
                          _RailItem(destination: d, active: active == d.route, unread: d.route == '/chats'),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(12, 14, 12, 6),
                          child: Text('하버 데스크',
                              style: Theme.of(context).textTheme.labelSmall),
                        ),
                        for (final d in LunoNav.secondary)
                          _RailItem(destination: d, active: active == d.route),
                      ],
                    ),
                  ),
                  const _SessionFoot(),
                ],
              ),
            ),
          ),
          VerticalDivider(
              width: 1,
              thickness: 1,
              color: dark ? HarborDark.channel : HarborLight.channel),
          Expanded(
            child: Column(
              children: [
                const StatusStrip(),
                Expanded(child: child),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RailItem extends StatelessWidget {
  final LunoDestination destination;
  final bool active;
  final bool unread;
  const _RailItem({required this.destination, required this.active, this.unread = false});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final session = SessionScope.of(context);
    var badge = 0;
    if (unread) {
      for (final c in session.chats) {
        badge += (c['unread_count'] as num?)?.toInt() ?? 0;
      }
    }
    final wash = dark ? HarborDark.seaGlass : HarborLight.seaGlass;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1),
      child: Material(
        color: active ? wash : Colors.transparent,
        borderRadius: BorderRadius.circular(HarborRadius.control),
        child: InkWell(
          borderRadius: BorderRadius.circular(HarborRadius.control),
          onTap: () => context.go(destination.route),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                if (active) ...[
                  const LampBar(height: 18),
                  const SizedBox(width: 8),
                ] else
                  const SizedBox(width: 11),
                Icon(active ? destination.activeIcon : destination.icon, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(destination.label,
                      style: TextStyle(
                          fontWeight: active ? FontWeight.w800 : FontWeight.w500,
                          fontSize: 14)),
                ),
                if (badge > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(
                      color: dark ? HarborDark.beacon : HarborLight.beacon,
                      borderRadius: BorderRadius.circular(HarborRadius.lamp),
                    ),
                    child: Text('$badge',
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: dark ? HarborDark.onBeacon : HarborLight.onBeacon)),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// --- Tablet: slim icon rail ---------------------------------------------------

class _TabletDesk extends StatelessWidget {
  final Widget child;
  const _TabletDesk({required this.child});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final location = GoRouterState.of(context).uri.path;
    final active = LunoNav.parentOf(location);
    return Scaffold(
      body: Row(
        children: [
          Container(
            width: 68,
            color: dark ? HarborDark.surface : HarborLight.surface,
            child: SafeArea(
              child: Column(
                children: [
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: HarborWordmark(compact: true),
                  ),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      children: [
                        for (final d in LunoNav.all)
                          _IconRailItem(destination: d, active: active == d.route),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: '로그아웃',
                    onPressed: () => SessionScope.of(context, listen: false).logout(),
                    icon: const Icon(Icons.logout, size: 20),
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
          ),
          VerticalDivider(
              width: 1,
              thickness: 1,
              color: dark ? HarborDark.channel : HarborLight.channel),
          Expanded(
            child: Column(
              children: [
                const StatusStrip(),
                Expanded(child: child),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _IconRailItem extends StatelessWidget {
  final LunoDestination destination;
  final bool active;
  const _IconRailItem({required this.destination, required this.active});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final wash = dark ? HarborDark.seaGlass : HarborLight.seaGlass;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Material(
        color: active ? wash : Colors.transparent,
        borderRadius: BorderRadius.circular(HarborRadius.control),
        child: InkWell(
          borderRadius: BorderRadius.circular(HarborRadius.control),
          onTap: () => context.go(destination.route),
          child: Tooltip(
            message: destination.label,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Column(
                children: [
                  Icon(active ? destination.activeIcon : destination.icon, size: 21),
                  const SizedBox(height: 2),
                  Text(destination.label,
                      style: TextStyle(
                          fontSize: 10,
                          fontWeight: active ? FontWeight.w800 : FontWeight.w500)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// --- Mobile: masthead bar + bottom signal deck --------------------------------

class _MobileDesk extends StatelessWidget {
  final Widget child;
  const _MobileDesk({required this.child});

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    final active = LunoNav.parentOf(location);
    var index = LunoNav.primary.indexWhere((d) => d.route == active);
    if (index < 0) index = 0;
    final deep = !LunoNav.all.any((d) => d.route == location);
    return Scaffold(
      appBar: AppBar(
        leading: deep ? const BackButton() : null,
        title: const HarborWordmark(compact: false),
        actions: [
          IconButton(
            tooltip: '더보기',
            onPressed: () => context.go('/more'),
            icon: const Icon(Icons.apps_outlined),
          ),
          IconButton(
            tooltip: '로그아웃',
            onPressed: () => SessionScope.of(context, listen: false).logout(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: Column(
        children: [
          const StatusStrip(),
          Expanded(child: child),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => context.go(LunoNav.primary[i].route),
        destinations: [
          for (final d in LunoNav.primary)
            NavigationDestination(
              icon: Icon(d.icon),
              selectedIcon: Icon(d.activeIcon),
              label: d.label,
            ),
        ],
      ),
    );
  }
}

// --- Compact app: dense single column, thumb-first ----------------------------

class _CompactDesk extends StatelessWidget {
  final Widget child;
  const _CompactDesk({required this.child});

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    final active = LunoNav.parentOf(location);
    var index = LunoNav.primary.indexWhere((d) => d.route == active);
    if (index < 0) index = 0;
    final deep = !LunoNav.all.any((d) => d.route == location);
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 48,
        leading: deep ? const BackButton() : null,
        title: const HarborWordmark(compact: true),
        actions: [
          IconButton(
            tooltip: '더보기',
            onPressed: () => context.go('/more'),
            icon: const Icon(Icons.apps_outlined),
          ),
        ],
      ),
      body: Column(
        children: [
          const StatusStrip(),
          Expanded(child: child),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        height: 60,
        selectedIndex: index,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        onDestinationSelected: (i) => context.go(LunoNav.primary[i].route),
        destinations: [
          for (final d in LunoNav.primary)
            NavigationDestination(
              icon: Icon(d.icon, size: 20),
              selectedIcon: Icon(d.activeIcon, size: 20),
              label: d.label,
            ),
        ],
      ),
    );
  }
}

/// Wordmark without hero styling: lamp chip + name + slogan.
class HarborWordmark extends StatelessWidget {
  final bool compact;
  const HarborWordmark({super.key, required this.compact});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
          decoration: BoxDecoration(
            color: dark ? HarborDark.harbor : HarborLight.harbor,
            borderRadius: BorderRadius.circular(7),
          ),
          child: Text('LUNO',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.6,
                  color: dark ? HarborDark.onHarbor : HarborLight.onHarbor)),
        ),
        if (!compact) ...[
          const SizedBox(width: 8),
          Flexible(
            child: Text('Connect Beyond Borders',
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall),
          ),
        ],
      ],
    );
  }
}

/// Global error/notice/call strip, one line each, dismissible by next action.
class StatusStrip extends StatelessWidget {
  const StatusStrip({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final rows = <Widget>[];
    if (session.error.isNotEmpty) {
      rows.add(Container(
        width: double.infinity,
        color: dark ? const Color(0xFF3A1620) : const Color(0xFFFDE8EA),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Text(session.error,
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: dark ? HarborDark.danger : HarborLight.danger)),
      ));
    }
    if (session.notice.isNotEmpty) {
      rows.add(Container(
        width: double.infinity,
        color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Text(session.notice,
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: dark ? HarborDark.ink : HarborLight.ink)),
      ));
    }
    final call = session.activeCall;
    if (call != null) {
      rows.add(Container(
        color: dark ? HarborDark.chart : HarborLight.chart,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Row(
          children: [
            const LampBar(height: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                "LUNO ${call['kind'] == 'video' ? '영상' : '음성'}통화 연결 중",
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
              ),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: dark ? HarborDark.danger : HarborLight.danger,
                foregroundColor: Colors.white,
                minimumSize: const Size(64, 34),
              ),
              onPressed: session.endCall,
              child: const Text('종료'),
            ),
          ],
        ),
      ));
    }
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(mainAxisSize: MainAxisSize.min, children: rows);
  }
}

class _SessionFoot extends StatelessWidget {
  const _SessionFoot();

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              session.selfName.isEmpty ? 'LUNO' : session.selfName,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
            ),
          ),
          IconButton(
            tooltip: '로그아웃',
            onPressed: () => SessionScope.of(context, listen: false).logout(),
            icon: const Icon(Icons.logout, size: 20),
          ),
        ],
      ),
    );
  }
}
