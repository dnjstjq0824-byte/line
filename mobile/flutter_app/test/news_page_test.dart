import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/news.dart';
import 'package:luno_messenger/router.dart';
import 'package:luno_messenger/state/session.dart';

// Item 16: LINE-style news — swipeable hero carousel with a segment
// indicator, ranked popular rows with thumbnails, every card opening the
// real article route. Gear and ad rows are omitted (no backend for them).
Map<String, dynamic> _article({
  required String id,
  required String title,
  int? rank,
  String press = 'LUNO 에디토리얼(샘플)',
  String image = 'https://example.test/hero.png',
  String content = '본문입니다.',
}) =>
    {
      'id': id,
      'title': title,
      if (rank != null) 'rank': rank,
      'press': press,
      'published_at': '2026-10-31T08:50:00.000Z',
      'image_url': image,
      'summary': '요약입니다.',
      'content': content,
      'sample': true,
    };

SessionController _fixture() {
  final s = SessionController()
    ..newsHero = [
      _article(id: 'h0', title: '첫 번째 헤드라인', content: '첫 번째 본문'),
      _article(id: 'h1', title: '두 번째 헤드라인', content: '두 번째 본문'),
    ]
    ..newsPopular = [
      _article(id: 'p0', title: '인기 기사 일번', rank: 1, content: '인기 본문 1'),
      _article(id: 'p1', title: '인기 기사 이번', rank: 2, content: '인기 본문 2'),
    ]
    ..newsIsSample = true;
  addTearDown(s.disposeAll);
  return s;
}

Widget _wrap(SessionController session) {
  return SessionScope(
    notifier: session,
    child: MaterialApp(
      theme: LunoHarbor.theme(Brightness.light),
      home: const Scaffold(body: NewsPage()),
    ),
  );
}

Future<void> _pumpRouter(WidgetTester tester, SessionController session,
    {required String route}) async {
  session.selfId = 'u-test';
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
}

void main() {
  test('hero articles get per-page addresses with legacy fallback', () {
    final s = _fixture();
    final hero0 = s.newsHero[0] as Map<String, dynamic>;
    final hero1 = s.newsHero[1] as Map<String, dynamic>;
    expect(newsAddress(s, hero0), 'hero-0');
    expect(newsAddress(s, hero1), 'hero-1');
    expect(resolveArticle(s, 'hero-1'), same(hero1));
    expect(resolveArticle(s, 'hero'), same(hero0));
    expect(resolveArticle(s, 'hero-9'), isNull);
  });

  testWidgets('hero carousel swipes between server heroes',
      (WidgetTester tester) async {
    await tester.pumpWidget(_wrap(_fixture()));
    await tester.pumpAndSettle();
    expect(find.byType(PageView), findsOneWidget);
    expect(find.byKey(const ValueKey('hero-segments')), findsOneWidget);
    expect(find.text('첫 번째 헤드라인'), findsOneWidget);
    expect(find.text('두 번째 헤드라인'), findsNothing);
    await tester.fling(find.byType(PageView), const Offset(-400, 0), 1000);
    await tester.pumpAndSettle();
    expect(find.text('첫 번째 헤드라인'), findsNothing);
    expect(find.text('두 번째 헤드라인'), findsOneWidget);
  });

  testWidgets('hero tap opens that article route',
      (WidgetTester tester) async {
    await _pumpRouter(tester, _fixture(), route: '/news');
    await tester.tap(find.text('첫 번째 헤드라인'));
    await tester.pumpAndSettle();
    expect(find.text('첫 번째 본문'), findsOneWidget);
  });

  testWidgets('popular rows show rank and open their articles',
      (WidgetTester tester) async {
    await tester.pumpWidget(_wrap(_fixture()));
    await tester.pumpAndSettle();
    expect(find.text('오늘의 인기 기사'), findsOneWidget);
    expect(find.text('인기 기사 일번'), findsOneWidget);
    expect(find.text('인기 기사 이번'), findsOneWidget);
    expect(find.text('1'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
  });

  testWidgets('popular tap opens that article route',
      (WidgetTester tester) async {
    await _pumpRouter(tester, _fixture(), route: '/news');
    await tester.ensureVisible(find.text('인기 기사 이번'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('인기 기사 이번'));
    await tester.pumpAndSettle();
    expect(find.text('인기 본문 2'), findsOneWidget);
  });

  testWidgets('empty news shows the honest empty state',
      (WidgetTester tester) async {
    final s = SessionController();
    addTearDown(s.disposeAll);
    await tester.pumpWidget(_wrap(s));
    await tester.pumpAndSettle();
    expect(find.text('표시할 뉴스가 없습니다'), findsOneWidget);
  });

  testWidgets('sample banner stays visible over sample content',
      (WidgetTester tester) async {
    await tester.pumpWidget(_wrap(_fixture()));
    await tester.pumpAndSettle();
    expect(find.text('LUNO 에디토리얼 샘플 콘텐츠입니다. 실제 언론 기사가 아닙니다.'),
        findsOneWidget);
  });
}
