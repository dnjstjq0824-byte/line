import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/chat_room.dart';
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/call_groups.dart';

// Item 17: call_status messages render as LINE-style call bubbles (phone
// icon + kind + duration, no action row), and a jump-latest button appears
// once the reader scrolls up.
Map<String, dynamic> _msg({
  required String id,
  required String sender,
  String kind = 'text',
  String body = '안녕',
  String createdAt = '2026-10-27T13:55:30Z',
  Map<String, dynamic>? metadata,
}) =>
    {
      'id': id,
      'sender_id': sender,
      'kind': kind,
      'body': body,
      'created_at': createdAt,
      if (metadata != null) 'metadata': metadata,
    };

Map<String, dynamic> _callMsg({
  required String id,
  required String sender,
  required String body,
  String status = 'completed',
  String type = 'voice',
  dynamic duration,
  String createdAt = '2026-10-27T13:55:30Z',
}) =>
    _msg(
      id: id,
      sender: sender,
      kind: 'call_status',
      body: body,
      createdAt: createdAt,
      metadata: {
        'call_status': status,
        'call_type': type,
        if (duration != null) 'duration': duration,
      },
    );

SessionController _fixture(List<dynamic> messages) {
  final s = SessionController()
    ..selfId = 'u1'
    ..selectedId = 'c1'
    ..selectedTitle = 'K'
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
  group('call bubble helpers', () {
    test('callBubbleTitle prefers the server body', () {
      expect(
          callBubbleTitle(_callMsg(id: 'a', sender: 'u2', body: '음성통화')),
          '음성통화');
      expect(
          callBubbleTitle(_callMsg(id: 'a', sender: 'u2', body: '부재중 전화')),
          '부재중 전화');
      expect(callBubbleTitle(_callMsg(id: 'a', sender: 'u2', body: '')),
          '음성통화');
      expect(
          callBubbleTitle(_callMsg(
              id: 'a', sender: 'u2', body: '', type: 'video')),
          '영상통화');
    });

    test('callBubbleDuration normalizes server shapes', () {
      expect(
          callBubbleDuration(
              _callMsg(id: 'a', sender: 'u2', body: '음성통화', duration: 95)),
          '1:35');
      expect(
          callBubbleDuration(_callMsg(
              id: 'a', sender: 'u2', body: '음성통화', duration: '00:29')),
          '0:29');
      expect(
          callBubbleDuration(
              _callMsg(id: 'a', sender: 'u2', body: '취소', status: 'cancelled')),
          '');
      expect(callBubbleDuration(_msg(id: 'a', sender: 'u2')), '');
    });
  });

  group('ChatRoomPage', () {
    testWidgets('call bubbles show icon, kind, and duration without actions',
        (WidgetTester tester) async {
      final s = _fixture([
        _callMsg(
            id: 'm1',
            sender: 'u1',
            body: '음성통화',
            duration: 95,
            createdAt: '2026-10-27T13:50:00Z'),
        _callMsg(
            id: 'm2',
            sender: 'u2',
            body: '부재중 전화',
            status: 'missed',
            createdAt: '2026-10-27T13:55:00Z'),
      ]);
      await tester.pumpWidget(_wrap(s));
      await tester.pumpAndSettle();
      expect(find.text('음성통화'), findsOneWidget);
      expect(find.text('1:35'), findsOneWidget);
      expect(find.text('부재중 전화'), findsOneWidget);
      // Two bubble handsets plus the header voice button.
      expect(find.byIcon(Icons.phone), findsNWidgets(3));
      expect(find.byIcon(Icons.translate), findsNothing);
      expect(find.byIcon(Icons.push_pin), findsNothing);
      expect(find.byIcon(Icons.bookmark_border), findsNothing);
    });

    testWidgets('text bubbles keep their action row',
        (WidgetTester tester) async {
      final s = _fixture([
        _msg(id: 'm1', sender: 'u2', body: '바쁘십니까'),
      ]);
      await tester.pumpWidget(_wrap(s));
      await tester.pumpAndSettle();
      expect(find.text('바쁘십니까'), findsOneWidget);
      expect(find.byIcon(Icons.translate), findsOneWidget);
    });

    testWidgets('jump-latest button appears off-bottom and returns',
        (WidgetTester tester) async {
      final s = _fixture([
        for (var i = 0; i < 40; i++)
          _msg(id: 'm$i', sender: i.isEven ? 'u1' : 'u2', body: '메시지 $i'),
      ]);
      await tester.pumpWidget(_wrap(s));
      await tester.pumpAndSettle();
      expect(
          find.byKey(const ValueKey('jump-latest')), findsNothing);
      await tester.drag(find.byType(ListView).first, const Offset(0, -800));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('jump-latest')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('jump-latest')));
      await tester.pumpAndSettle();
      expect(
          find.byKey(const ValueKey('jump-latest')), findsNothing);
    });
  });
}
