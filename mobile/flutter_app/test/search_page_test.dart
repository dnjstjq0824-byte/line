import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/router.dart';
import 'package:luno_messenger/state/session.dart';

// Item 19-3: dedicated search — recent searches (tapped friends/chats/
// users, removable), live local filtering of friends and chats, and
// server user results with working add-friend.
SessionController _fixture() {
  final s = SessionController()
    ..selfId = 'u-me'
    ..friends = [
      {'id': 'u1', 'display_name': '도천재', 'handle': 'dochun'},
      {'id': 'u2', 'display_name': '이대철', 'handle': 'dae'},
    ]
    ..chats = [
      {'id': 'c1', 'title': '도천재', 'kind': 'direct', 'unread_count': 0},
      {'id': 'c2', 'title': '스터디', 'kind': 'group', 'unread_count': 0},
    ]
    ..results = [
      {'id': 'u9', 'display_name': '새친구', 'handle': 'newbie'},
    ];
  addTearDown(s.disposeAll);
  return s;
}

Future<GoRouter> _pumpSearch(WidgetTester tester, SessionController s) async {
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
  router.go('/search');
  await tester.pumpAndSettle();
  return router;
}

void main() {
  group('recent searches', () {
    test('remember dedups, fronts, and caps at 20', () {
      final s = SessionController();
      addTearDown(s.disposeAll);
      s.rememberSearch('friend', 'u1', '도천재');
      s.rememberSearch('chat', 'c2', '스터디');
      s.rememberSearch('friend', 'u1', '도천재');
      expect(s.recentSearches.map((e) => e['id']), ['u1', 'c2']);
      for (var i = 0; i < 25; i++) {
        s.rememberSearch('user', 'x$i', 'X $i');
      }
      expect(s.recentSearches, hasLength(20));
      expect(s.recentSearches.first['id'], 'x24');
    });

    test('forget removes one entry', () {
      final s = SessionController();
      addTearDown(s.disposeAll);
      s.rememberSearch('friend', 'u1', '도천재');
      s.rememberSearch('chat', 'c2', '스터디');
      s.forgetSearch('friend', 'u1');
      expect(s.recentSearches.map((e) => e['id']), ['c2']);
    });
  });

  group('SearchPage', () {
    testWidgets('empty query shows recents with removal',
        (WidgetTester tester) async {
      final s = _fixture();
      s.rememberSearch('friend', 'u1', '도천재');
      await _pumpSearch(tester, s);
      expect(find.text('최근 검색어'), findsOneWidget);
      expect(find.text('도천재'), findsOneWidget);
      await tester.tap(find.byTooltip('최근 검색 삭제').first);
      await tester.pumpAndSettle();
      expect(find.text('도천재'), findsNothing);
      expect(s.recentSearches, isEmpty);
    });

    testWidgets('empty recents show the honest empty state',
        (WidgetTester tester) async {
      await _pumpSearch(tester, _fixture());
      expect(find.text('최근 검색어'), findsOneWidget);
      expect(find.text('최근 검색어가 없습니다'), findsOneWidget);
    });

    testWidgets('query filters local friends and chats',
        (WidgetTester tester) async {
      await _pumpSearch(tester, _fixture());
      await tester.enterText(find.byType(TextField), '도천');
      await tester.pumpAndSettle();
      expect(find.text('친구'), findsOneWidget);
      expect(find.text('대화'), findsOneWidget);
      expect(find.text('도천재'), findsNWidgets(2));
      expect(find.text('스터디'), findsNothing);
      expect(find.text('이대철'), findsNothing);
    });

    testWidgets('chat tap remembers and opens the room',
        (WidgetTester tester) async {
      final s = _fixture();
      await _pumpSearch(tester, s);
      await tester.enterText(find.byType(TextField), '스터디');
      await tester.pumpAndSettle();
      await tester.tap(find.ancestor(
          of: find.text('스터디'), matching: find.byType(ListTile)));
      await tester.pumpAndSettle();
      expect(s.recentSearches.map((e) => e['id']), contains('c2'));
      expect(find.text('스터디'), findsWidgets);
    });

    testWidgets('friend tap remembers and starts a chat fail-closed',
        (WidgetTester tester) async {
      final s = _fixture();
      await _pumpSearch(tester, s);
      await tester.enterText(find.byType(TextField), '이대철');
      await tester.pumpAndSettle();
      await tester.tap(find.ancestor(
          of: find.text('이대철'), matching: find.byType(ListTile)));
      await tester.pumpAndSettle();
      expect(s.recentSearches.map((e) => e['id']), contains('u2'));
      expect(s.error, isNotEmpty);
    });

    testWidgets('server user rows add friends fail-closed',
        (WidgetTester tester) async {
      final s = _fixture();
      await _pumpSearch(tester, s);
      await tester.enterText(find.byType(TextField), '새친구');
      await tester.pumpAndSettle();
      expect(find.text('사용자'), findsOneWidget);
      // Field query plus the result row.
      expect(find.text('새친구'), findsNWidgets(2));
      await tester.tap(find.text('추가'));
      await tester.pumpAndSettle();
      expect(s.error, isNotEmpty);
    });
  });
}
