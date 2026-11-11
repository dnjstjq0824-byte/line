import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/router.dart';
import 'package:luno_messenger/state/session.dart';

// Item 19-4: privacy — the ID-search toggle, the honest E2EE status, and
// the working signed-in device list. Reference rows without a backend
// (app lock, friends-only messages, QR rotation, third-party grants,
// data sharing) are omitted, never faked.
SessionController _fixture() {
  final s = SessionController()
    ..selfId = 'u-me'
    ..myPrefs = {'searchable_by_id': true}
    ..prefsLoaded = true
    ..devices = [
      {
        'id': 'sess-pc',
        'device_id': 'sess-pc',
        'name': 'WINDOWS PC',
        'platform': 'windows',
        'ip': '49.172.105.64',
        'current': false,
      },
      {
        'id': 'sess-now',
        'device_id': 'sess-now',
        'name': '내 휴대폰',
        'platform': 'android',
        'ip': '1.2.3.4',
        'current': true,
      },
    ];
  addTearDown(s.disposeAll);
  return s;
}

Future<GoRouter> _pumpPrivacy(
    WidgetTester tester, SessionController s) async {
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
  router.go('/privacy');
  await tester.pumpAndSettle();
  return router;
}

void main() {
  testWidgets('privacy renders the toggle, status, and devices',
      (WidgetTester tester) async {
    await _pumpPrivacy(tester, _fixture());
    expect(find.text('개인 정보 보호'), findsOneWidget);
    expect(find.text('ID로 친구 추가 허용'), findsOneWidget);
    expect(find.text('종단간 암호화 (E2EE)'), findsOneWidget);
    expect(find.text('로그인된 기기'), findsOneWidget);
    expect(find.text('WINDOWS PC'), findsOneWidget);
    expect(find.textContaining('49.172.105.64'), findsOneWidget);
    expect(find.text('현재 기기'), findsOneWidget);
    expect(find.text('종료'), findsOneWidget);
  });

  testWidgets('device revoke submits fail-closed without server',
      (WidgetTester tester) async {
    final s = _fixture();
    await _pumpPrivacy(tester, s);
    s.clearStatus();
    await tester.tap(find.text('종료'));
    await tester.pumpAndSettle();
    expect(s.error, isNotEmpty);
  });

  testWidgets('empty devices show the honest empty state',
      (WidgetTester tester) async {
    final s = SessionController()
      ..selfId = 'u-me'
      ..prefsLoaded = true;
    addTearDown(s.disposeAll);
    await _pumpPrivacy(tester, s);
    expect(find.text('표시할 기기가 없습니다'), findsOneWidget);
  });

  testWidgets('settings links to privacy', (WidgetTester tester) async {
    final s = _fixture();
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
    router.go('/settings');
    await tester.pumpAndSettle();
    await tester.tap(find.text('개인 정보 보호'));
    await tester.pumpAndSettle();
    expect(find.text('로그인된 기기'), findsOneWidget);
  });
}
