import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/router.dart';
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/call_groups.dart';

// Item 15: per-peer call detail — name + avatar, three working actions
// (chat, voice, video), and the peer's history grouped under day headers.
Map<String, dynamic> _call({
  required String title,
  required String cid,
  bool outgoing = true,
  String result = 'completed',
  String kind = 'voice',
  int duration = 0,
  required String startedAt,
}) =>
    {
      'title': title,
      'conversation_id': cid,
      'outgoing': outgoing,
      'result': result,
      'kind': kind,
      'duration': duration,
      'started_at': startedAt,
    };

SessionController _fixture(List<dynamic> calls) {
  final s = SessionController()
    ..selfId = 'u-test'
    ..selfName = 'Detail Tester'
    ..callHistory = calls;
  addTearDown(s.disposeAll);
  return s;
}

Future<GoRouter> _pumpRouter(WidgetTester tester, SessionController s) async {
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
  return router;
}

void main() {
  group('call detail helpers', () {
    test('callDetailDay renders Y. M. D.', () {
      expect(callDetailDay('2026-07-21T08:35:00'), '2026. 7. 21.');
      expect(callDetailDay('bogus'), '');
      expect(callDetailDay(null), '');
    });

    test('callOutcome labels non-completed results', () {
      expect(callOutcome('completed'), '');
      expect(callOutcome('missed'), '부재중 전화');
      expect(callOutcome('declined'), '거절된 통화');
      expect(callOutcome('canceled'), '취소');
      expect(callOutcome('cancelled'), '취소');
      expect(callOutcome(''), '');
    });

    test('groupCallDays groups under day headers in order', () {
      final days = groupCallDays([
        _call(title: 'K', cid: 'c1', startedAt: '2026-07-21T09:00:00'),
        _call(title: 'K', cid: 'c1', startedAt: '2026-07-21T08:35:00'),
        _call(title: 'K', cid: 'c1', startedAt: '2026-07-20T22:23:00'),
        _call(title: 'K', cid: 'c1', startedAt: 'bogus'),
      ]);
      expect(days.map((d) => d.label), ['2026. 7. 21.', '2026. 7. 20.']);
      expect(days[0].items, hasLength(2));
      expect(days[1].items, hasLength(1));
    });
  });

  group('CallDetailPage', () {
    List<dynamic> calls() => [
          _call(
              title: 'K',
              cid: 'c1',
              kind: 'video',
              duration: 782,
              startedAt: '2026-07-21T08:35:00'),
          _call(
              title: 'K',
              cid: 'c1',
              outgoing: false,
              result: 'missed',
              startedAt: '2026-07-21T09:00:00'),
          _call(
              title: 'K',
              cid: 'c1',
              duration: 29,
              startedAt: '2026-07-20T22:23:00'),
          _call(
              title: 'Woralak',
              cid: 'c2',
              outgoing: false,
              result: 'missed',
              kind: 'video',
              startedAt: '2026-07-23T10:00:00'),
        ];

    testWidgets('detail shows actions and day-grouped history',
        (WidgetTester tester) async {
      final s = _fixture(calls());
      final router = await _pumpRouter(tester, s);
      router.go('/calls/c1');
      await tester.pumpAndSettle();
      expect(find.text('K'), findsWidgets);
      expect(find.text('대화'), findsOneWidget);
      expect(find.text('음성통화'), findsNWidgets(3));
      expect(find.text('영상통화'), findsNWidgets(2));
      expect(find.text('2026. 7. 21.'), findsOneWidget);
      expect(find.text('2026. 7. 20.'), findsOneWidget);
      expect(find.text('오전 8:35'), findsOneWidget);
      expect(find.text('13:02'), findsOneWidget);
      expect(find.text('부재중 전화'), findsOneWidget);
      expect(find.text('Woralak'), findsNothing);
    });

    testWidgets('ledger row taps through to the peer detail',
        (WidgetTester tester) async {
      final s = _fixture(calls());
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
      router.go('/calls');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Woralak').first);
      await tester.pumpAndSettle();
      expect(find.text('2026. 7. 23.'), findsOneWidget);
      expect(find.text('대화'), findsOneWidget);
    });

    testWidgets('unknown peer shows the honest empty state',
        (WidgetTester tester) async {
      final s = _fixture(calls());
      final router = await _pumpRouter(tester, s);
      router.go('/calls/nobody');
      await tester.pumpAndSettle();
      expect(find.text('통화 기록이 없습니다'), findsOneWidget);
    });
  });
}
