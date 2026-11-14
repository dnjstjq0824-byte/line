import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/chat_room.dart';
import 'package:luno_messenger/state/session.dart';

// L-03: bot proposal/decision/report messages render a kind tag above the
// standard bubble body.
Map<String, dynamic> _msg({
  required String id,
  required String kind,
  String body = '본문',
  String sender = 'u-bot',
}) =>
    {
      'id': id,
      'sender_id': sender,
      'sender_kind': 'bot',
      'kind': kind,
      'body': body,
      'created_at': '2026-11-14T00:00:00Z',
    };

SessionController _fixture(List<dynamic> messages) {
  final s = SessionController()
    ..selfId = 'u1'
    ..selectedId = 'c1'
    ..selectedTitle = 'K'
    ..messages = messages;
  addTearDown(s.disposeAll);
  return s;
}

void main() {
  testWidgets('proposal, decision and report show kind tags',
      (WidgetTester tester) async {
    final s = _fixture([
      _msg(id: 'm1', kind: 'proposal', body: '제안 본문'),
      _msg(id: 'm2', kind: 'decision', body: '결정 본문'),
      _msg(id: 'm3', kind: 'report', body: '보고 본문'),
      _msg(id: 'm4', kind: 'text', body: '일반 본문'),
    ]);
    await tester.pumpWidget(
      SessionScope(
        notifier: s,
        child: MaterialApp(
          theme: LunoHarbor.theme(Brightness.light),
          home: const Scaffold(body: ChatRoomPage(conversationId: 'c1')),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('제안'), findsOneWidget);
    expect(find.text('결정'), findsOneWidget);
    expect(find.text('보고'), findsOneWidget);
    expect(find.text('제안 본문'), findsOneWidget);
    expect(find.text('일반 본문'), findsOneWidget);
  });
}
