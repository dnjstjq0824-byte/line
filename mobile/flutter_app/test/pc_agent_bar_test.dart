// PC agent bar: presence of the home-PC runner and one-tap command chips in
// rooms that have a bot; heartbeat and resume keep the socket alive.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/chat_room.dart';
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/widgets/pc_agent_bar.dart';

class FakeHttp extends http.BaseClient {
  Future<http.Response> Function(http.BaseRequest request, String body)? handler;
  final List<String> paths = [];
  final List<String> bodies = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final body = await request.finalize().transform(utf8.decoder).join();
    paths.add('${request.method} ${request.url.path}');
    bodies.add(body);
    final res = await handler!(request, body);
    return http.StreamedResponse(
      Stream.value(utf8.encode(res.body)),
      res.statusCode,
      headers: {'content-type': 'application/json'},
    );
  }
}

http.Response jsonRes(Object body, int status) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

Map<String, dynamic> bot(String state,
        {String detail = '', int queue = 0, String? lastSeen}) =>
    {
      'id': 'u-bot',
      'display_name': 'PC 작업봇',
      'handle': 'luno_pc',
      'state': state,
      'detail': detail,
      'queue': queue,
      'version': '1.0.0',
      'last_seen_at': lastSeen,
    };

Future<SessionController> pumpRoom(WidgetTester tester, FakeHttp fake) async {
  final s = SessionController(httpClient: fake)
    ..selfId = 'u1'
    ..selectedId = 'c1'
    ..selectedTitle = 'PC 작업실'
    ..chats = [
      {'id': 'c1', 'kind': 'group', 'owner_id': 'u1', 'title': 'PC 작업실'}
    ]
    ..messages = [];
  addTearDown(s.disposeAll);
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
  return s;
}

void main() {
  test('quick actions map to the commands the runner parses', () {
    expect(PcQuickAction.values.map(pcQuickCommand).toList(),
        ['/status', '/git', '/check', '/continue']);
  });

  test('unknown states read as offline; the clock is local HH:mm', () {
    expect(pcAgentState({'state': 'ready'}), 'ready');
    expect(pcAgentState({'state': 'busy'}), 'busy');
    expect(pcAgentState({'state': 'weird'}), 'offline');
    expect(pcAgentState({}), 'offline');
    expect(pcAgentClock(null), '');
    expect(pcAgentClock('not a date'), '');
    expect(pcAgentClock('2026-11-15T05:07:00Z'), matches(RegExp(r'^\d\d:07$')));
  });

  testWidgets('a room without bots shows no bar', (tester) async {
    final fake = FakeHttp()
      ..handler = (req, body) async => req.url.path.endsWith('/bots')
          ? jsonRes({'bots': [], 'commands_allowed': false}, 200)
          : jsonRes({}, 200);
    await pumpRoom(tester, fake);
    expect(fake.paths, contains('GET /api/v1/conversations/c1/bots'));
    expect(find.byKey(const ValueKey('pc-agent-bar')), findsNothing);
  });

  testWidgets('ready runner: status line, four chips, a tap sends the command',
      (tester) async {
    final fake = FakeHttp();
    fake.handler = (req, body) async {
      if (req.url.path.endsWith('/bots')) {
        return jsonRes({
          'bots': [bot('ready')],
          'commands_allowed': true
        }, 200);
      }
      if (req.method == 'POST' && req.url.path.endsWith('/messages')) {
        // Same shape as the server: the message, plus itself under 'message'.
        final message = {
          'id': 'm1',
          'kind': 'text',
          'body': jsonDecode(body)['body'],
          'sender_id': 'u1',
          'sequence': 1,
          'created_at': '2026-11-15T00:00:00Z'
        };
        return jsonRes({...message, 'message': message}, 201);
      }
      return jsonRes({}, 200);
    };
    await pumpRoom(tester, fake);
    expect(find.byKey(const ValueKey('pc-agent-bar')), findsOneWidget);
    expect(find.byKey(const ValueKey('pc-agent-dot-ready')), findsOneWidget);
    expect(find.textContaining('준비됨', findRichText: true), findsOneWidget);
    expect(find.text('현재 작업 상태 보고'), findsOneWidget);
    expect(find.text('git status·브랜치 확인'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('pc-quick-status')));
    await tester.pumpAndSettle();
    final sent = [
      for (var i = 0; i < fake.paths.length; i++)
        if (fake.paths[i] == 'POST /api/v1/conversations/c1/messages')
          jsonDecode(fake.bodies[i])['body']
    ];
    expect(sent, ['/status']);
    // Every chip keeps a 44 px touch target.
    for (final action in PcQuickAction.values) {
      final chip = find.byKey(ValueKey('pc-quick-${action.name}'));
      await tester.scrollUntilVisible(chip, 80,
          scrollable: find
              .descendant(
                  of: find.byKey(const ValueKey('pc-agent-bar')),
                  matching: find.byType(Scrollable))
              .first);
      expect(tester.getSize(chip).height, greaterThanOrEqualTo(44));
    }
  });

  testWidgets('busy and offline are shown; a presence push updates the line',
      (tester) async {
    final fake = FakeHttp()
      ..handler = (req, body) async => req.url.path.endsWith('/bots')
          ? jsonRes({
              'bots': [bot('busy', detail: 'T-0007 /dev', queue: 2)],
              'commands_allowed': true
            }, 200)
          : jsonRes({}, 200);
    final s = await pumpRoom(tester, fake);
    expect(find.byKey(const ValueKey('pc-agent-dot-busy')), findsOneWidget);
    expect(find.textContaining('T-0007 /dev', findRichText: true),
        findsOneWidget);
    expect(find.textContaining('대기 2건', findRichText: true), findsOneWidget);

    s.applyBotPresence({
      'type': 'bot.presence',
      'conversation_id': 'c1',
      'bot': bot('offline', lastSeen: '2026-11-15T05:07:00Z'),
    });
    await tester.pump();
    expect(find.byKey(const ValueKey('pc-agent-dot-offline')), findsOneWidget);
    expect(find.textContaining('오프라인', findRichText: true), findsOneWidget);
    expect(find.textContaining('마지막 접속', findRichText: true), findsOneWidget);

    // A push for another room is ignored.
    s.applyBotPresence({
      'type': 'bot.presence',
      'conversation_id': 'other',
      'bot': bot('ready'),
    });
    await tester.pump();
    expect(find.byKey(const ValueKey('pc-agent-dot-offline')), findsOneWidget);
  });

  testWidgets('members who may not command see status but no chips',
      (tester) async {
    final fake = FakeHttp()
      ..handler = (req, body) async => req.url.path.endsWith('/bots')
          ? jsonRes({
              'bots': [bot('ready')],
              'commands_allowed': false
            }, 200)
          : jsonRes({}, 200);
    await pumpRoom(tester, fake);
    expect(find.byKey(const ValueKey('pc-agent-bar')), findsOneWidget);
    expect(find.byKey(const ValueKey('pc-quick-status')), findsNothing);
  });

  test('heartbeat: a silent socket schedules a reconnect, a live one does not',
      () async {
    final fake = FakeHttp()..handler = (req, body) async => jsonRes({}, 500);
    final s = SessionController(httpClient: fake)..selfId = 'u1';
    addTearDown(s.disposeAll);
    s.api.token = 't';
    final now = DateTime.now();
    s.heartbeatTick(now);
    expect(s.reconnectTimer, isNull, reason: 'fresh socket: ping only');
    s.heartbeatTick(now.add(SessionController.socketSilenceLimit +
        const Duration(seconds: 1)));
    expect(s.reconnectTimer, isNotNull, reason: 'silence => reconnect');
    expect(s.reconnectAttempt, 1);
    // While a reconnect is pending the heartbeat does not pile on more.
    s.heartbeatTick(now.add(const Duration(minutes: 5)));
    expect(s.reconnectAttempt, 1);
  });

  test('logged out: the heartbeat does nothing', () {
    final s = SessionController();
    addTearDown(s.disposeAll);
    s.heartbeatTick(DateTime.now().add(const Duration(hours: 1)));
    expect(s.reconnectTimer, isNull);
  });
}
