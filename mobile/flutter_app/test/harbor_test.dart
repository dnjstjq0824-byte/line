import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/responsive.dart';
import 'package:luno_messenger/main.dart'
    show MessengerApp, lunoBg, lunoDeepBlue, lunoPrimary;
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/nav.dart';
import 'package:luno_messenger/pages/chats.dart';
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
      '/more', '/profile', '/splash', '/console', '/console/users', '/console/reports',
      '/console/flags', '/console/audit',
    ];
    expect(routes.toSet().length, routes.length);
    // reference-parity redesign (user-requested): bottom bar is 홈/대화/뉴스/통화.
    // 피드/라운지 move to 더보기; every route keeps its own address.
    expect(LunoNav.primary.length, 4);
    expect(LunoNav.primary.map((d) => d.route),
        ['/home', '/chats', '/news', '/calls']);
    expect(LunoNav.secondary.length, 6);
    expect(LunoNav.secondary.map((d) => d.route),
        ['/feed', '/lounge', '/wallet', '/keep', '/settings', '/console']);
  });

  test('LUNO brand surfaces reuse frozen PO tokens', () {
    expect(LunoBrand.primary, lunoPrimary);
    expect(LunoBrand.deep, lunoDeepBlue);
    expect(HarborLight.harbor, lunoDeepBlue);
    expect(HarborLight.mine, lunoPrimary);
    expect(HarborLight.fog, lunoBg);
  });

  test('harbor themes build for both brightnesses', () {
    final light = LunoHarbor.theme(Brightness.light);
    final dark = LunoHarbor.theme(Brightness.dark);
    expect(light.scaffoldBackgroundColor, HarborLight.fog);
    expect(dark.scaffoldBackgroundColor, HarborDark.fog);
    expect(light.colorScheme.primary, HarborLight.harbor);
    expect(dark.colorScheme.primary, HarborDark.harbor);
  });

  testWidgets('splash shows LUNO brand moment then forwards to login',
      (WidgetTester tester) async {
    final session = SessionController();
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
    await tester.pump();
    expect(find.byKey(const Key('luno-splash')), findsOneWidget);
    for (final name in ['Lumi', 'Nori', 'Poko', 'Luno', 'Comet', 'Astro']) {
      expect(find.text(name), findsOneWidget);
    }
    expect(find.text('Connect Beyond Borders'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.text('로그인'), findsWidgets);
  });

  testWidgets('empty chats shows Luno mascot', (WidgetTester tester) async {
    final session = SessionController();
    addTearDown(session.disposeAll);
    await tester.pumpWidget(
      SessionScope(
        notifier: session,
        child: MaterialApp(
          theme: LunoHarbor.theme(Brightness.light),
          home: const ChatsPage(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
        find.text('대화방이 없습니다.\n홈에서 친구를 찾아 대화를 시작해보세요.'),
        findsOneWidget);
    expect(find.text('Luno'), findsOneWidget);
  });

  testWidgets('home renders reference sections', (WidgetTester tester) async {
    final session = SessionController()
      ..selfId = 'u-test'
      ..selfName = 'Luno Tester';
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
    expect(find.text('서비스'), findsOneWidget);
    expect(find.text('공식 계정'), findsOneWidget);
    expect(find.text('친구 (0)'), findsOneWidget);
    expect(find.text('Luno Tester'), findsWidgets);
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
