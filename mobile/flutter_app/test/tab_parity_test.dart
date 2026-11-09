import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/nav.dart';
import 'package:luno_messenger/pages/apps.dart';
import 'package:luno_messenger/pages/shop.dart';
import 'package:luno_messenger/router.dart';
import 'package:luno_messenger/state/session.dart';

// P2 LINE tab parity: bottom bar follows the LINE five-tab order
// (홈/토크/쇼핑/뉴스/앱). 쇼핑 honestly reports "preparing" until a
// commerce backend exists; 앱 is a directory over real destinations.
void main() {
  test('bottom bar follows the LINE five-tab order', () {
    expect(LunoNav.primary.map((d) => d.route),
        ['/home', '/chats', '/shop', '/news', '/apps']);
    expect(LunoNav.primary.map((d) => d.label),
        ['홈', '토크', '쇼핑', '뉴스', '앱']);
    expect(LunoNav.parentOf('/shop'), '/shop');
    expect(LunoNav.parentOf('/apps'), '/apps');
  });

  testWidgets('shop tab honestly reports preparing',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LunoHarbor.theme(Brightness.light),
        home: const ShopPage(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('쇼핑 준비 중'), findsOneWidget);
  });

  testWidgets('apps tab lists every secondary destination',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: LunoHarbor.theme(Brightness.light),
        home: const AppsPage(),
      ),
    );
    await tester.pumpAndSettle();
    for (final d in LunoNav.secondary) {
      expect(find.text(d.label), findsOneWidget);
    }
  });

  testWidgets('new tabs render through the real router',
      (WidgetTester tester) async {
    final session = SessionController()
      ..selfId = 'u-test'
      ..selfName = 'Tab Tester';
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
    router.go('/shop');
    await tester.pumpAndSettle();
    expect(find.text('쇼핑 준비 중'), findsOneWidget);
    router.go('/apps');
    await tester.pumpAndSettle();
    expect(find.text('LUNO 서비스 전체 목록'), findsOneWidget);
  });
}
