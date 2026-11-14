// UX4: one layout spec for app phone/tablet. Bottom tabs match the web
// order (home/chats/news/calls/wallet), the tablet rail is 76, and key
// screens render without overflow at 360/412/768/1024 widths.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/responsive.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/nav.dart';
import 'package:luno_messenger/router.dart';
import 'package:luno_messenger/state/session.dart';

void main() {
  test('bottom tabs match the web order', () {
    expect(LunoNav.primary.map((d) => d.route),
        ['/home', '/chats', '/news', '/calls', '/wallet']);
    expect(LunoNav.primary.map((d) => d.label),
        ['홈', '토크', '뉴스', '통화', '지갑']);
  });

  test('tablet rail and list widths mirror the token file', () {
    expect(HarborLayout.railWidth, 76.0);
    expect(HarborLayout.listWidth, 340.0);
  });

  testWidgets('tablet rail renders 76 wide', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(768, 1024);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    final session = SessionController()
      ..selfId = 'u-test'
      ..selfName = 'Rail Tester';
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
    expect(DeviceScope.of(tester.element(find.byKey(const Key('tablet-rail')))),
        DeviceKind.tablet);
    expect(tester.getSize(find.byKey(const Key('tablet-rail'))).width, 76.0);
    expect(tester.takeException(), isNull);
  });

  const sizes = <String, Size>{
    'compact 360x740': Size(360, 740),
    'mobile 412x915': Size(412, 915),
    'tablet-portrait 768x1024': Size(768, 1024),
    'tablet-landscape 1024x768': Size(1024, 768),
  };
  const routes = <String>[
    '/home',
    '/chats',
    '/news',
    '/calls',
    '/wallet',
    '/settings',
  ];
  for (final sizeEntry in sizes.entries) {
    for (final route in routes) {
      testWidgets('$route renders without overflow on ${sizeEntry.key}',
          (WidgetTester tester) async {
        tester.view.physicalSize = sizeEntry.value;
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.resetPhysicalSize);
        final session = SessionController()
          ..selfId = 'u-test'
          ..selfName = 'Size Tester';
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
        router.go(route);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  }
}
