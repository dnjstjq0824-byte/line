import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/chats.dart';
import 'package:luno_messenger/router.dart';
import 'package:luno_messenger/state/session.dart';

// Item 19-1: LINE-style talk list — plain rows (no cards), a search entry
// into /search, an unread-first sort toggle, and the group dialog kept on
// its text button.
SessionController _fixture() {
  final s = SessionController()
    ..selfId = 'u-me'
    ..chats = [
      {
        'id': 'c1',
        'title': '스터디',
        'kind': 'group',
        'member_count': 5,
        'unread_count': 0,
        'updated_at': '2026-11-10T09:41:00',
        'last_message': {'kind': 'text', 'body': 'hello'},
      },
      {
        'id': 'c2',
        'title': '도천재',
        'kind': 'direct',
        'unread_count': 3,
        'updated_at': '2026-11-09T09:41:00',
        'last_message': {'kind': 'text', 'body': 'yo'},
      },
    ];
  addTearDown(s.disposeAll);
  return s;
}

Widget _wrap(SessionController session) {
  return SessionScope(
    notifier: session,
    child: MaterialApp(
      theme: LunoHarbor.theme(Brightness.light),
      home: const Scaffold(body: ChatsPage()),
    ),
  );
}

void main() {
  testWidgets('rows render plain with time and unread badge',
      (WidgetTester tester) async {
    await tester.pumpWidget(_wrap(_fixture()));
    await tester.pumpAndSettle();
    expect(find.byType(Card), findsNothing);
    expect(find.text('스터디 (5)'), findsOneWidget);
    expect(find.text('도천재'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    expect(find.text('그룹 만들기'), findsOneWidget);
  });

  testWidgets('sort toggle floats unread rooms first',
      (WidgetTester tester) async {
    await tester.pumpWidget(_wrap(_fixture()));
    await tester.pumpAndSettle();
    Offset topOf(String label) =>
        tester.getTopLeft(find.text(label));
    expect(topOf('스터디 (5)').dy < topOf('도천재').dy, isTrue);
    await tester.tap(find.byTooltip('안 읽은 방 먼저'));
    await tester.pumpAndSettle();
    expect(topOf('도천재').dy < topOf('스터디 (5)').dy, isTrue);
  });

  testWidgets('search entry opens the search route',
      (WidgetTester tester) async {
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
    router.go('/chats');
    await tester.pumpAndSettle();
    await tester.tap(find.text('대화·친구 검색'));
    await tester.pumpAndSettle();
    expect(find.text('최근 검색어'), findsOneWidget);
  });
}
