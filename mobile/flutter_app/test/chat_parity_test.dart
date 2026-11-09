import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/chat_room.dart';
import 'package:luno_messenger/pages/chats.dart';
import 'package:luno_messenger/pages/home.dart';
import 'package:luno_messenger/state/session.dart';

// LINE parity wiring: conversation rows carry member count + time,
// rooms carry date dividers + per-message time. Timestamps derive from
// the run date so the expectations stay deterministic.
String _iso(DateTime day, int hour, int minute) =>
    DateTime(day.year, day.month, day.day, hour, minute).toIso8601String();

void main() {
  testWidgets('chat rows show group member count and time',
      (WidgetTester tester) async {
    final now = DateTime.now();
    final session = SessionController();
    addTearDown(session.disposeAll);
    session.chats = [
      {
        'id': 'c1',
        'title': '스터디',
        'kind': 'group',
        'member_count': 5,
        'unread_count': 0,
        'updated_at': _iso(now, 9, 41),
        'last_message': {'kind': 'text', 'body': 'hello'},
      },
    ];
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
    expect(find.text('스터디 (5)'), findsOneWidget);
    expect(find.text('오전 9:41'), findsOneWidget);
  });

  testWidgets('chat room shows date dividers and message time',
      (WidgetTester tester) async {
    final now = DateTime.now();
    final yesterday = now.subtract(const Duration(days: 1));
    final session = SessionController()
      ..selfId = 'u-me'
      ..selectedId = 'c1'
      ..selectedTitle = '스터디';
    addTearDown(session.disposeAll);
    session.messages = [
      {
        'id': 'm1',
        'sender_id': 'u-you',
        'kind': 'text',
        'body': '어제 메시지',
        'created_at': _iso(yesterday, 10, 0),
      },
      {
        'id': 'm2',
        'sender_id': 'u-me',
        'kind': 'text',
        'body': '오늘 메시지',
        'created_at': _iso(now, 9, 41),
      },
    ];
    await tester.pumpWidget(
      SessionScope(
        notifier: session,
        child: MaterialApp(
          theme: LunoHarbor.theme(Brightness.light),
          home: const Scaffold(body: ChatRoomPage(conversationId: 'c1')),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('어제'), findsOneWidget);
    expect(find.text('오늘'), findsOneWidget);
    expect(find.text('오전 9:41'), findsOneWidget);
    expect(find.text('오전 10:00'), findsOneWidget);
  });

  testWidgets('home shows birthday card for birthday friends',
      (WidgetTester tester) async {
    final session = SessionController();
    addTearDown(session.disposeAll);
    session.friends = [
      {'id': 'u1', 'display_name': '생일친구', 'birthday_today': true},
      {'id': 'u2', 'display_name': '일반친구'},
    ];
    await tester.pumpWidget(
      SessionScope(
        notifier: session,
        child: MaterialApp(
          theme: LunoHarbor.theme(Brightness.light),
          home: const Scaffold(body: HomePage()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('오늘 생일인 친구'), findsOneWidget);
    expect(find.text('생일친구'), findsNWidgets(2));
    expect(find.text('일반친구'), findsOneWidget);
  });
}
