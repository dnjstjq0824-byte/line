import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/responsive.dart';
import 'package:luno_messenger/main.dart' show MessengerApp;
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/nav.dart';
import 'package:luno_messenger/router.dart';
import 'package:luno_messenger/state/session.dart';

void main() {
  test('breakpoints split compact app / mobile / tablet / desktop', () {
    expect(LunoBreakpoints.kindOf(360), DeviceKind.compactApp);
    expect(LunoBreakpoints.kindOf(399), DeviceKind.compactApp);
    expect(LunoBreakpoints.kindOf(400), DeviceKind.mobile);
    expect(LunoBreakpoints.kindOf(719), DeviceKind.mobile);
    expect(LunoBreakpoints.kindOf(720), DeviceKind.tablet);
    expect(LunoBreakpoints.kindOf(1119), DeviceKind.tablet);
    expect(LunoBreakpoints.kindOf(1120), DeviceKind.desktop);
    expect(LunoBreakpoints.kindOf(1920), DeviceKind.desktop);
  });

  test('deep routes highlight their parent destination', () {
    expect(LunoNav.parentOf('/chats/abc'), '/chats');
    expect(LunoNav.parentOf('/chats/abc/pins'), '/chats');
    expect(LunoNav.parentOf('/news/hero'), '/news');
    expect(LunoNav.parentOf('/console/users'), '/console');
    expect(LunoNav.parentOf('/stories'), '/home');
    expect(LunoNav.parentOf('/channels'), '/home');
    expect(LunoNav.parentOf('/home'), '/home');
  });

  test('route map keeps one address per page without merges', () {
    const routes = [
      '/login', '/home', '/stories', '/channels', '/chats', '/feed',
      '/lounge', '/news', '/calls', '/wallet', '/settings', '/keep',
      '/more', '/console', '/console/users', '/console/reports',
      '/console/flags', '/console/audit',
    ];
    expect(routes.toSet().length, routes.length);
    expect(LunoNav.primary.length, 5);
    expect(LunoNav.secondary.length, 5);
  });

  test('harbor themes build for both brightnesses', () {
    final light = LunoHarbor.theme(Brightness.light);
    final dark = LunoHarbor.theme(Brightness.dark);
    expect(light.scaffoldBackgroundColor, HarborLight.fog);
    expect(dark.scaffoldBackgroundColor, HarborDark.fog);
    expect(light.colorScheme.primary, HarborLight.harbor);
    expect(dark.colorScheme.primary, HarborDark.harbor);
  });

  test('session helpers match legacy formatting', () {
    final session = SessionController();
    expect(session.money(1234567), '1,234,567');
    expect(session.money(-42), '-42');
    expect(session.formatDuration(61), '1:01');
    expect(session.formatDuration(3661), '1:01:01');
    expect(session.uuid().length, 32);
    expect(session.colorFromHex('#0B4F45', Colors.black),
        const Color(0xFF0B4F45));
    expect(
        session.colorFromHex('nope', Colors.black), Colors.black);
    expect(session.relTime('not-a-date'), 'not-a-date');
    expect(session.authed, isFalse);
    session.disposeAll();
  });

  testWidgets('login cards fit inside every viewport width', (tester) async {
    for (final size in const [
      Size(360, 740),
      Size(390, 844),
      Size(500, 900),
      Size(768, 1024),
      Size(780, 1200),
      Size(800, 1200),
      Size(1280, 800),
    ]) {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      await tester.pumpWidget(const MessengerApp());
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: 'overflow at $size');
      for (final e in find.byType(Card).evaluate()) {
        final box = e.renderObject! as RenderBox;
        final right = box.localToGlobal(Offset.zero).dx + box.size.width;
        expect(right, lessThanOrEqualTo(size.width + 0.5),
            reason: 'card overflows at $size');
      }
    }
    tester.view.resetPhysicalSize();
  });

  testWidgets('adaptive shell renders home on all four device classes',
      (WidgetTester tester) async {
    const sizes = <Size>[
      Size(360, 740), // compact app
      Size(500, 900), // mobile
      Size(800, 1000), // tablet
      Size(1280, 800), // desktop
    ];
    for (final size in sizes) {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      final session = SessionController()
        ..selfId = 'u-test'
        ..selfName = 'Harbor Tester';
      addTearDown(session.disposeAll);
      final router = buildRouter(session);
      addTearDown(router.dispose);
      await tester.pumpWidget(
        SessionScope(
          notifier: session,
          child: MaterialApp.router(
            theme: LunoHarbor.theme(Brightness.light),
            routerConfig: router,
          ),
        ),
      );
      await tester.pumpAndSettle();
      // Redirected /login -> /home; masthead title visible on every shell.
      expect(find.text('홈'), findsWidgets);
      expect(find.text('친구 (0)'), findsOneWidget);
    }
  });
}
