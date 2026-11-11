import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/chat_room.dart';
import 'package:luno_messenger/state/session.dart';

// Item 18: security_notice messages (minted by the server on real logins)
// render as notice cards with device/IP/location facts, a working remote
// logout (only when the notice carries a session_id), and a working
// password change. Seed fixtures without a session get no logout button.
Map<String, dynamic> _notice({
  required String id,
  String body = '로그인 성공',
  String? sessionId,
  String device = 'WINDOWS PC',
  String ip = '49.172.105.64',
  String location = 'South Korea Seoul Eunpyeong-gu',
  bool sample = false,
}) =>
    {
      'id': id,
      'sender_id': 'oa-notice',
      'kind': 'security_notice',
      'body': body,
      'created_at': '2026-08-01T10:59:00Z',
      'metadata': {
        if (sessionId != null) 'session_id': sessionId,
        'device': device,
        'ip': ip,
        'location': location,
        if (sample) 'sample': true,
      },
    };

SessionController _fixture(List<dynamic> messages) {
  final s = SessionController()
    ..selfId = 'u1'
    ..selectedId = 'c1'
    ..selectedTitle = 'LUNO 보안 알림'
    ..messages = messages;
  addTearDown(s.disposeAll);
  return s;
}

Widget _wrap(SessionController session) {
  return SessionScope(
    notifier: session,
    child: MaterialApp(
      theme: LunoHarbor.theme(Brightness.light),
      home: const Scaffold(body: ChatRoomPage(conversationId: 'c1')),
    ),
  );
}

void main() {
  testWidgets('notice cards show facts with scoped actions',
      (WidgetTester tester) async {
    final s = _fixture([
      _notice(id: 'm1', sessionId: 'sess-live'),
      _notice(id: 'm2', sample: true),
    ]);
    await tester.pumpWidget(_wrap(s));
    await tester.pumpAndSettle();
    expect(find.text('로그인 성공'), findsNWidgets(2));
    expect(find.textContaining('WINDOWS PC'), findsNWidgets(2));
    expect(find.textContaining('49.172.105.64'), findsNWidgets(2));
    expect(find.textContaining('Eunpyeong-gu'), findsNWidgets(2));
    expect(find.text('샘플 데이터'), findsOneWidget);
    expect(find.text('로그아웃'), findsOneWidget);
    expect(find.text('비밀번호 변경'), findsNWidgets(2));
  });

  testWidgets('logout revokes the notice session fail-closed',
      (WidgetTester tester) async {
    final s = _fixture([
      _notice(id: 'm1', sessionId: 'sess-live'),
    ]);
    await tester.pumpWidget(_wrap(s));
    await tester.pumpAndSettle();
    await tester.tap(find.text('로그아웃'));
    await tester.pumpAndSettle();
    expect(s.error, isNotEmpty);
  });

  testWidgets('password change opens a working dialog',
      (WidgetTester tester) async {
    final s = _fixture([
      _notice(id: 'm1', sessionId: 'sess-live'),
    ]);
    await tester.pumpWidget(_wrap(s));
    await tester.pumpAndSettle();
    await tester.tap(find.text('비밀번호 변경'));
    await tester.pumpAndSettle();
    expect(find.text('현재 비밀번호'), findsOneWidget);
    expect(find.text('새 비밀번호 (8자 이상)'), findsOneWidget);
    await tester.enterText(
        find.widgetWithText(TextField, '현재 비밀번호'), 'old-pass-123');
    await tester.enterText(
        find.widgetWithText(TextField, '새 비밀번호 (8자 이상)'), 'new-pass-456');
    await tester.pump();
    await tester.tap(find.text('변경'));
    await tester.pumpAndSettle();
    expect(s.error, isNotEmpty);
  });
}
