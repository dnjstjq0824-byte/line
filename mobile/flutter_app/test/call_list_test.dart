import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/calls.dart';
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/call_groups.dart';

// Item 14: the call ledger groups consecutive same-peer calls (LINE-style
// "name (n)" rows), shows red missed names, a day-aware date, and working
// voice/video redial buttons. Durations live in the detail view (item 15).
const _weekdays = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];

String _iso(DateTime at) => at.toIso8601String();

Map<String, dynamic> _call({
  required String title,
  required String cid,
  bool outgoing = true,
  String result = 'completed',
  String kind = 'voice',
  required String startedAt,
}) =>
    {
      'title': title,
      'conversation_id': cid,
      'outgoing': outgoing,
      'result': result,
      'kind': kind,
      'duration': 95,
      'started_at': startedAt,
    };

Widget _wrap(SessionController session) {
  return SessionScope(
    notifier: session,
    child: MaterialApp(
      theme: LunoHarbor.theme(Brightness.light),
      home: const Scaffold(body: CallsPage()),
    ),
  );
}

SessionController _fixture(List<dynamic> calls) {
  final s = SessionController()..callHistory = calls;
  addTearDown(s.disposeAll);
  return s;
}

void main() {
  group('groupCalls', () {
    test('groups consecutive same-peer same-kind same-direction calls', () {
      final groups = groupCalls([
        _call(title: 'K', cid: 'c1', startedAt: _iso(DateTime(2026, 7, 24, 9))),
        _call(title: 'K', cid: 'c1', startedAt: _iso(DateTime(2026, 7, 24, 8))),
        _call(title: 'K', cid: 'c1', startedAt: _iso(DateTime(2026, 7, 24, 7))),
      ]);
      expect(groups, hasLength(1));
      expect(groups.single.count, 3);
      expect(groups.single.latest['started_at'],
          _iso(DateTime(2026, 7, 24, 9)));
      expect(groups.single.missed, isFalse);
    });

    test('splits on peer, kind, direction, or missed change', () {
      final groups = groupCalls([
        _call(title: 'K', cid: 'c1', startedAt: _iso(DateTime(2026, 7, 24, 9))),
        _call(
            title: 'K',
            cid: 'c1',
            kind: 'video',
            startedAt: _iso(DateTime(2026, 7, 24, 8))),
        _call(
            title: 'K',
            cid: 'c1',
            outgoing: false,
            result: 'missed',
            startedAt: _iso(DateTime(2026, 7, 24, 7))),
        _call(
            title: 'W',
            cid: 'c2',
            outgoing: false,
            result: 'missed',
            startedAt: _iso(DateTime(2026, 7, 24, 6))),
      ]);
      expect(groups.map((g) => g.count), [1, 1, 1, 1]);
      expect(groups[2].missed, isTrue);
      expect(groups[3].missed, isTrue);
    });

    test('skips non-map entries and empties', () {
      expect(groupCalls([]), isEmpty);
      expect(groupCalls([null, 'x', 42]), isEmpty);
      final groups = groupCalls([
        null,
        _call(title: 'K', cid: 'c1', startedAt: _iso(DateTime(2026, 7, 24, 9))),
      ]);
      expect(groups, hasLength(1));
    });
  });

  group('callRowDate', () {
    test('today clock, weekday in-week, M. D. afterwards', () {
      final now = DateTime(2026, 11, 11, 16, 0); // Wednesday
      expect(callRowDate('2026-11-11T09:30:00', now: now), '오전 9:30');
      expect(callRowDate('2026-11-10T20:00:00', now: now), '화요일');
      expect(callRowDate('2026-11-08T20:00:00', now: now), '일요일');
      expect(callRowDate('2026-11-05T20:00:00', now: now), '목요일');
      expect(callRowDate('2026-11-04T20:00:00', now: now), '11. 4.');
      expect(callRowDate('2026-07-24T20:00:00', now: now), '7. 24.');
      expect(callRowDate('2025-12-31T20:00:00', now: now), '2025. 12. 31.');
      expect(callRowDate('bogus', now: now), '');
      expect(callRowDate(null, now: now), '');
    });
  });

  group('CallsPage', () {
    testWidgets('renders grouped rows with red missed and date',
        (WidgetTester tester) async {
      final now = DateTime.now();
      DateTime todayAt(int h) => DateTime(now.year, now.month, now.day, h);
      final twoDaysAgo = now.subtract(const Duration(days: 2));
      final s = _fixture([
        _call(title: 'K', cid: 'c1', startedAt: _iso(todayAt(12))),
        _call(title: 'K', cid: 'c1', startedAt: _iso(todayAt(11))),
        _call(
            title: 'K',
            cid: 'c1',
            outgoing: false,
            result: 'missed',
            startedAt: _iso(twoDaysAgo)),
        _call(
            title: 'Woralak',
            cid: 'c2',
            outgoing: false,
            result: 'missed',
            kind: 'video',
            startedAt: _iso(twoDaysAgo)),
      ]);
      await tester.pumpWidget(_wrap(s));
      await tester.pumpAndSettle();
      expect(find.text('통화'), findsOneWidget);
      expect(find.text('K (2)'), findsOneWidget);
      expect(find.text('Woralak'), findsOneWidget);
      final kTexts = tester.widgetList<Text>(find.text('K'));
      expect(
          kTexts
              .where((t) => t.style?.color == HarborLight.danger)
              .length,
          1);
      final grouped = tester.widget<Text>(find.text('K (2)'));
      expect(grouped.style?.color, isNot(HarborLight.danger));
      expect(find.text(_weekdays[twoDaysAgo.weekday - 1]), findsNWidgets(2));
      expect(
          find.widgetWithIcon(IconButton, Icons.phone), findsNWidgets(2));
      expect(
          find.widgetWithIcon(IconButton, Icons.videocam), findsOneWidget);
    });

    testWidgets('trailing button redials and fail-closes without server',
        (WidgetTester tester) async {
      final s = _fixture([
        _call(
            title: 'K',
            cid: 'c1',
            startedAt: _iso(DateTime.now().subtract(const Duration(hours: 1)))),
      ]);
      await tester.pumpWidget(_wrap(s));
      await tester.pumpAndSettle();
      await tester
          .tap(find.widgetWithIcon(IconButton, Icons.phone).first);
      await tester.pumpAndSettle();
      expect(s.error, isNotEmpty);
    });

    testWidgets('empty ledger shows the honest empty state',
        (WidgetTester tester) async {
      await tester.pumpWidget(_wrap(_fixture([])));
      await tester.pumpAndSettle();
      expect(find.text('통화 기록이 없습니다'), findsOneWidget);
    });
  });
}
