import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/settings.dart';
import 'package:luno_messenger/state/session.dart';

// Item 13: settings is a LINE-style grouped list over real LUNO actions only.
// Every row either navigates to a working page, edits a real (server or local)
// setting, or opens a working dialog. Rows without a backend are omitted.
Widget _wrap(SessionController session) {
  return SessionScope(
    notifier: session,
    child: MaterialApp(
      theme: LunoHarbor.theme(Brightness.light),
      home: const Scaffold(body: SettingsPage()),
    ),
  );
}

SessionController _fixture() {
  final s = SessionController()
    ..selfName = '도도'
    ..selfHandle = 'dodo_genius'
    ..selfStatusMessage = '최고의 개발자'
    ..myPrefs = {'searchable_by_id': true}
    ..prefsLoaded = true;
  addTearDown(s.disposeAll);
  return s;
}

void main() {
  testWidgets('settings renders sections from session data',
      (WidgetTester tester) async {
    await tester.pumpWidget(_wrap(_fixture()));
    await tester.pumpAndSettle();
    expect(find.text('설정'), findsOneWidget);
    expect(find.text('도도'), findsOneWidget);
    expect(find.text('최고의 개발자'), findsOneWidget);
    expect(find.text('개인 정보'), findsOneWidget);
    expect(find.text('ID로 친구 추가 허용'), findsOneWidget);
    expect(find.text('데이터 내보내기'), findsOneWidget);
    expect(find.text('개인 정보 보호'), findsOneWidget);
    expect(find.text('대화'), findsOneWidget);
    expect(find.text('새 메시지 자동 번역'), findsOneWidget);
    expect(find.text('번역 대상 언어'), findsOneWidget);
    expect(find.text('종단간 암호화 (E2EE)'), findsOneWidget);
    expect(find.text('기기'), findsOneWidget);
    expect(find.text('데스크톱 QR 로그인 승인'), findsOneWidget);
    expect(find.text('계정'), findsOneWidget);
    expect(find.text('로그아웃'), findsOneWidget);
    expect(find.text('계정 탈퇴'), findsOneWidget);
    final idToggle = tester.widget<Switch>(
        find.byKey(const ValueKey('id-search-toggle')));
    expect(idToggle.value, isTrue);
    expect(idToggle.onChanged, isNotNull);
  });

  testWidgets('ID toggle stays disabled until prefs load',
      (WidgetTester tester) async {
    final s = SessionController()
      ..selfName = '도도'
      ..prefsLoaded = false;
    addTearDown(s.disposeAll);
    await tester.pumpWidget(_wrap(s));
    await tester.pumpAndSettle();
    final idToggle = tester.widget<Switch>(
        find.byKey(const ValueKey('id-search-toggle')));
    expect(idToggle.onChanged, isNull);
  });

  testWidgets('auto-translate toggle flips the session value',
      (WidgetTester tester) async {
    final s = _fixture();
    await tester.pumpWidget(_wrap(s));
    await tester.pumpAndSettle();
    expect(s.autoTranslate, isFalse);
    await tester.tap(find.byKey(const ValueKey('auto-translate-toggle')));
    await tester.pumpAndSettle();
    expect(s.autoTranslate, isTrue);
  });

  testWidgets('QR approval submits fail-closed without server',
      (WidgetTester tester) async {
    final s = _fixture();
    await tester.pumpWidget(_wrap(s));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('데스크톱 QR 로그인 승인'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('데스크톱 QR 로그인 승인'));
    await tester.pumpAndSettle();
    expect(find.text('QR Challenge ID'), findsOneWidget);
    expect(find.text('QR Token'), findsOneWidget);
    await tester.enterText(
        find.widgetWithText(TextField, 'QR Challenge ID'), 'ch-1');
    await tester.enterText(
        find.widgetWithText(TextField, 'QR Token'), 'tok-1');
    await tester.tap(find.text('데스크톱 승인 완료'));
    await tester.pumpAndSettle();
    expect(s.error, isNotEmpty);
  });

  testWidgets('delete confirm submits fail-closed without server',
      (WidgetTester tester) async {
    final s = _fixture();
    await tester.pumpWidget(_wrap(s));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('계정 탈퇴'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('계정 탈퇴'));
    await tester.pumpAndSettle();
    expect(find.text('계정을 영구 삭제할까요?'), findsOneWidget);
    await tester.enterText(
        find.widgetWithText(TextField, '비밀번호 확인'), 'pw-1234');
    await tester.tap(find.text('영구 삭제'));
    await tester.pumpAndSettle();
    expect(s.error, isNotEmpty);
  });
}
