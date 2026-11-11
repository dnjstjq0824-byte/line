import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/router.dart';
import 'package:luno_messenger/state/session.dart';

// Item 19-2: home capsule shortcuts (Keep + settings only — nothing else
// on this phone has a backend) and a search entry into /search.
SessionController _fixture() {
  final s = SessionController()
    ..selfId = 'u-me'
    ..selfName = '나';
  addTearDown(s.disposeAll);
  return s;
}

Future<GoRouter> _pumpHome(WidgetTester tester, SessionController s) async {
  final router = buildRouter(s);
  addTearDown(router.dispose);
  await tester.pumpWidget(
    SessionScope(
      notifier: s,
      child: MaterialApp.router(
        theme: LunoHarbor.theme(Brightness.light),
        routerConfig: router,
      ),
    ),
  );
  await tester.pumpAndSettle();
  router.go('/home');
  await tester.pumpAndSettle();
  return router;
}

void main() {
  testWidgets('capsule opens Keep', (WidgetTester tester) async {
    await _pumpHome(tester, _fixture());
    await tester.tap(find.byTooltip('Keep'));
    await tester.pumpAndSettle();
    expect(find.text('Keep'), findsWidgets);
    expect(find.text('보관한 항목이 없습니다'), findsOneWidget);
  });

  testWidgets('capsule opens settings', (WidgetTester tester) async {
    await _pumpHome(tester, _fixture());
    await tester.tap(find.byTooltip('설정'));
    await tester.pumpAndSettle();
    expect(find.text('설정'), findsOneWidget);
  });

  testWidgets('search entry opens the search route',
      (WidgetTester tester) async {
    await _pumpHome(tester, _fixture());
    await tester.tap(find.text('검색'));
    await tester.pumpAndSettle();
    expect(find.text('최근 검색어'), findsOneWidget);
  });
}
