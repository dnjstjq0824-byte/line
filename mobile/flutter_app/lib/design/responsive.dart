// Four-device adaptive layer. LayoutBuilder decides the device class,
// MediaQuery supplies scale/motion/platform — each class gets its own
// redesigned chrome, never a scaled copy of another.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../nav.dart';
import '../util/app_l10n.dart';
import '../state/session.dart';
import 'v3.dart';

enum DeviceKind { compactApp, mobile, tablet, desktop }

abstract final class LunoBreakpoints {
  static const double compactMax = 400;
  static const double mobileMax = 700;
  static const double tabletMax = 1100;

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

/// Page header: bold title (one line) + optional actions on the right.
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
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: text.displaySmall?.copyWith(
                        fontSize: HarborType.display, fontWeight: FontWeight.w800)),
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
                        for (final d in LunoNav.railPrimary)
                          _RailItem(destination: d, active: active == d.route, unread: d.route == '/chats'),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(12, 14, 12, 6),
                          child: Text(context.l10n.harborDesk,
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
                  child: Text(destination.labelIn(context.l10n),
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
                            fontSize: HarborType.micro,
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
            key: const Key('tablet-rail'),
            width: HarborLayout.railWidth,
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
                        for (final d in LunoNav.rail)
                          _IconRailItem(destination: d, active: active == d.route),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: context.l10n.mvLogout,
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
            message: destination.labelIn(context.l10n),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Column(
                children: [
                  Icon(active ? destination.activeIcon : destination.icon, size: 21),
                  const SizedBox(height: 2),
                  Text(destination.labelIn(context.l10n),
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

// --- Phone (mobile + compact): one header per screen, bottom tabs -------------
//
// Top-level tabs draw their own title row (Masthead), so the shell adds no
// bar above them. Sub-pages get a plain back bar and no tab bar; a chat room
// draws its own header, so it gets neither.

class _MobileDesk extends StatelessWidget {
  final Widget child;
  const _MobileDesk({required this.child});

  @override
  Widget build(BuildContext context) => _PhoneDesk(compact: false, child: child);
}

class _CompactDesk extends StatelessWidget {
  final Widget child;
  const _CompactDesk({required this.child});

  @override
  Widget build(BuildContext context) => _PhoneDesk(compact: true, child: child);
}

/// A route that renders its own header row (back button included).
bool _drawsOwnHeader(String location) =>
    RegExp(r'^/chats/[^/]+$').hasMatch(location);

class _PhoneDesk extends StatelessWidget {
  final Widget child;
  final bool compact;
  const _PhoneDesk({required this.child, required this.compact});

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    final active = LunoNav.parentOf(location);
    final topLevel = LunoNav.all.any((d) => d.route == location);
    var index = LunoNav.primary.indexWhere((d) => d.route == active);
    // Secondary destinations (wallet, shop, ...) live under More.
    if (index < 0) index = LunoNav.primary.length - 1;
    final ownHeader = _drawsOwnHeader(location);
    return Scaffold(
      appBar: topLevel || ownHeader
          ? null
          : AppBar(
              toolbarHeight: compact ? 48 : 52,
              leading: BackButton(
                onPressed: () => context.canPop()
                    ? context.pop()
                    : context.go(LunoNav.parentOf(location) == location
                        ? '/home'
                        : LunoNav.parentOf(location)),
              ),
            ),
      body: SafeArea(
        top: topLevel,
        bottom: false,
        child: Column(
          children: [
            const StatusStrip(),
            Expanded(child: child),
          ],
        ),
      ),
      bottomNavigationBar: topLevel ? _TabBar(index: index, compact: compact) : null,
    );
  }
}

class _TabBar extends StatelessWidget {
  final int index;
  final bool compact;
  const _TabBar({required this.index, required this.compact});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final session = SessionScope.of(context);
    var unread = 0;
    for (final c in session.chats) {
      if (c is Map) unread += (c['unread_count'] as num?)?.toInt() ?? 0;
    }
    final accent = dark ? HarborDark.harbor : HarborLight.harbor;
    final idle = dark ? HarborDark.drift : HarborLight.drift;
    return Container(
      decoration: BoxDecoration(
        color: dark ? HarborDark.surface : Colors.white,
        border: Border(
            top: BorderSide(color: dark ? HarborDark.channel : HarborLight.channel)),
      ),
      child: SafeArea(
        top: false,
        // F25: minimum height only, so 200% tab labels grow the bar
        // instead of overflowing it by a few pixels.
        child: ConstrainedBox(
          constraints:
              BoxConstraints(minHeight: compact ? 56 : 60),
          child: Row(
            children: [
              for (var i = 0; i < LunoNav.primary.length; i++)
                Expanded(
                  child: _TabItem(
                    destination: LunoNav.primary[i],
                    selected: i == index,
                    color: i == index ? accent : idle,
                    badge: LunoNav.primary[i].route == '/chats' ? unread : 0,
                    compact: compact,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TabItem extends StatelessWidget {
  final LunoDestination destination;
  final bool selected;
  final Color color;
  final int badge;
  final bool compact;
  const _TabItem({
    required this.destination,
    required this.selected,
    required this.color,
    required this.badge,
    required this.compact,
  });

  @override
  Widget build(BuildContext context) {
    final label = destination.labelIn(context.l10n);
    final icon = Icon(selected ? destination.activeIcon : destination.icon,
        size: 24, color: color);
    // F25: shrink-wrap the column (no Center: it expands to the Scaffold's
    // loose max height and squeezes the page body to zero). Fixed vertical
    // padding restores the ~56/60 touch height at 1x and still grows at 200%.
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: InkResponse(
        onTap: () => context.go(destination.route),
        containedInkWell: true,
        highlightShape: BoxShape.rectangle,
        child: Padding(
          padding: EdgeInsets.symmetric(vertical: compact ? 8 : 9),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              badge > 0
                  ? Badge(
                      label: Text(badge > 99 ? '99+' : '$badge'),
                      backgroundColor:
                          Theme.of(context).brightness == Brightness.dark
                              ? HarborDark.beacon
                              : HarborLight.beacon,
                      child: icon,
                    )
                  : icon,
              const SizedBox(height: 3),
              Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: HarborType.micro,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w500,
                      color: color)),
            ],
          ),
        ),
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
            color: dark ? HarborDark.harbor : LunoBrand.primary,
            borderRadius: BorderRadius.circular(7),
          ),
          child: Text('LUNO',
              style: TextStyle(
                  fontSize: HarborType.small,
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
                fontSize: HarborType.small,
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
                fontSize: HarborType.small,
                fontWeight: FontWeight.w600,
                color: dark ? HarborDark.ink : HarborLight.ink)),
      ));
    }
    if (session.offline) {
      rows.add(Container(
        width: double.infinity,
        color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: Text(context.l10n.offlineRetryNotice,
                  style: TextStyle(
                      fontSize: HarborType.small,
                      fontWeight: FontWeight.w600,
                      color: dark ? HarborDark.ink : HarborLight.ink)),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                minimumSize: const Size(64, 34),
              ),
              onPressed: session.restore,
              child: Text(context.l10n.retryWord),
            ),
          ],
        ),
      ));
    }
    // F10: queued outbound messages with a manual resend entry.
    if (session.outbox.isNotEmpty) {
      rows.add(Container(
        width: double.infinity,
        color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: Text(context.l10n.stripOutboxPending(session.outbox.length),
                  style: TextStyle(
                      fontSize: HarborType.small,
                      fontWeight: FontWeight.w600,
                      color: dark ? HarborDark.ink : HarborLight.ink)),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                minimumSize: const Size(64, 34),
              ),
              onPressed: session.busy ? null : session.flushOutbox,
              child: Text(context.l10n.resendWord),
            ),
          ],
        ),
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
                context.l10n.appCallConnecting(call['kind'] == 'video' ? context.l10n.callVideo : context.l10n.callVoice),
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
              child: Text(context.l10n.closeWord),
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
            tooltip: context.l10n.mvLogout,
            onPressed: () => SessionScope.of(context, listen: false).logout(),
            icon: const Icon(Icons.logout, size: 20),
          ),
        ],
      ),
    );
  }
}
