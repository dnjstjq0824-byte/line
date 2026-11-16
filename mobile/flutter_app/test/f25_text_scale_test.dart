// F25 app accessibility: at 200% text (textScaler 2.0) on a 360px phone,
// home / chats / chat room / calls / news / more / settings render without
// overflow, and every icon button carries a tooltip (screen-reader label).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/router.dart';
import 'package:luno_messenger/state/session.dart';

Map<String, dynamic> _article(String id, String title, {int? rank}) => {
      'id': id,
      'title': title,
      if (rank != null) 'rank': rank,
      'press': 'LUNO',
      'published_at': '2026-11-15T08:50:00.000Z',
      'image_url': '',
      'summary': '요약',
      'content': '본문',
      'sample': true,
    };

SessionController _fixture() {
  final s = SessionController()
    ..selfId = 'u-test'
    ..selfName = '아주아주 긴 표시 이름을 가진 테스트 사용자'
    ..friends = [
      {
        'id': 'u-long',
        'display_name': '아주아주 긴 이름을 가진 친구 2026 하반기 출시 준비 모임',
        'handle': 'longfriend',
        'status_message': '상태 메시지도 길게 적어 본다 200% 글자에서 잘림 없이',
      },
      {
        'id': 'u-bot',
        'display_name': '알림봇',
        'handle': 'notibot',
        'kind': 'bot',
        'status_message': '@notibot',
      },
    ]
    ..chats = [
      {
        'id': 'c-long',
        'title': '아주아주 긴 이름의 프로젝트 협업 단체 대화방 2026 하반기 출시 준비',
        'kind': 'group',
        'member_count': 12,
        'unread_count': 128,
        'updated_at': '2026-11-16T00:41:00',
        'last_message': {'kind': 'text', 'body': '긴 미리보기 ' * 12},
      },
      {
        'id': 'c-direct',
        'title': '도천재',
        'kind': 'direct',
        'unread_count': 3,
        'updated_at': '2026-11-15T09:41:00',
        'last_message': {'kind': 'text', 'body': 'yo'},
      },
    ]
    ..selectedId = 'c-long'
    ..selectedTitle = '아주아주 긴 이름의 프로젝트 협업 단체 대화방 2026 하반기 출시 준비'
    ..replyToId = 'm1'
    ..messages = [
      {
        'id': 'm1',
        'sender_id': 'u-other',
        'kind': 'text',
        'body': '긴 메시지 ' * 30,
        'created_at': '2026-11-16T00:00:00Z'
      }
    ]
    ..callHistory = [
      {
        'title': '아주아주 긴 이름을 가진 통화 상대방',
        'conversation_id': 'c-direct',
        'outgoing': true,
        'result': 'completed',
        'kind': 'voice',
        'duration': 95,
        'started_at': '2026-11-16T08:00:00.000Z',
      },
    ]
    ..newsHero = [
      _article('h0', '짧은 헤드라인'),
      _article('h1', '두 번째 헤드라인'),
    ]
    ..newsPopular = [
      _article('p0', '인기 기사 일번', rank: 1),
      _article('p1', '인기 기사 이번', rank: 2),
    ]
    ..newsIsSample = true;
  addTearDown(s.disposeAll);
  return s;
}

Future<void> _pumpAt200(
    WidgetTester tester, SessionController session, String route) async {
  tester.view.physicalSize = const Size(360, 740);
  tester.view.devicePixelRatio = 1.0;
  tester.platformDispatcher.textScaleFactorTestValue = 2.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
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
  const routes = <String>[
    '/home',
    '/chats',
    '/chats/c-long',
    '/calls',
    '/news',
    '/more',
    '/settings',
  ];
  for (final route in routes) {
    testWidgets('$route renders without overflow at 200% text on 360px',
        (WidgetTester tester) async {
      await _pumpAt200(tester, _fixture(), route);
      expect(tester.takeException(), isNull);
    });

    testWidgets('$route has a tooltip on every icon button',
        (WidgetTester tester) async {
      await _pumpAt200(tester, _fixture(), route);
      expect(tester.takeException(), isNull);
      final buttons =
          tester.widgetList<IconButton>(find.byType(IconButton)).toList();
      // /home, /chats, /chats/c-long, /calls always show icon buttons;
      // /news, /more, /settings currently have none, so the loop below
      // only audits what exists there.
      if (route != '/news' && route != '/more' && route != '/settings') {
        expect(buttons, isNotEmpty, reason: '$route shows no icon buttons');
      }
      for (final b in buttons) {
        expect(b.tooltip, isNotNull,
            reason: '$route has an icon button without a tooltip: $b');
      }
    });
  }
}
