import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/pages/chat_room.dart';
import 'package:luno_messenger/state/session.dart';

// L-05: proposal bubbles carry approve/reject buttons for privileged
// members; tapping one calls the decide endpoint and refreshes state.
class FakeHttp extends http.BaseClient {
  Future<http.Response> Function(http.BaseRequest request, String body)? handler;
  final List<String> paths = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final body = await request.finalize().transform(utf8.decoder).join();
    paths.add('${request.method} ${request.url.path}');
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

Map<String, dynamic> _proposal(String id, String body) => {
      'id': id,
      'sender_id': 'u-bot',
      'sender_kind': 'bot',
      'kind': 'proposal',
      'body': body,
      'created_at': '2026-11-14T00:00:00Z',
    };

void main() {
  group('canDecideIn', () {
    test('owner, admin and direct members decide; plain members do not', () {
      final s = SessionController()..selfId = 'u1';
      addTearDown(s.disposeAll);
      expect(s.canDecideIn({'id': 'c', 'kind': 'group', 'owner_id': 'u1'}), isTrue);
      expect(s.canDecideIn({'id': 'c', 'kind': 'group', 'owner_id': 'u9'}), isFalse);
      expect(s.canDecideIn({'id': 'c', 'kind': 'direct', 'owner_id': null}), isTrue);
      expect(s.canDecideIn(null), isFalse);
      s.selfRole = 'admin';
      expect(s.canDecideIn({'id': 'c', 'kind': 'group', 'owner_id': 'u9'}), isTrue);
    });
  });

  group('proposal bubbles', () {
    testWidgets('owner sees buttons and approval hits decide',
        (WidgetTester tester) async {
      final fake = FakeHttp();
      final decides = <String>[];
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path.endsWith('/decide')) {
          decides.add(body);
          return jsonRes({'id': 'd1', 'message_id': 'm9', 'state': 'approved'}, 201);
        }
        if (req.url.path.endsWith('/proposals')) {
          return jsonRes({'proposals': []}, 200);
        }
        return jsonRes({}, 200);
      };
      final s = SessionController(httpClient: fake)
        ..selfId = 'u1'
        ..selectedId = 'c1'
        ..selectedTitle = 'Room'
        ..chats = [
          {'id': 'c1', 'kind': 'group', 'owner_id': 'u1', 'title': 'Room'}
        ]
        ..messages = [_proposal('m1', 'Ship it?')];
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
      expect(find.text('승인'), findsOneWidget);
      expect(find.text('거절'), findsOneWidget);
      await tester.tap(find.text('승인'));
      await tester.pumpAndSettle();
      expect(decides.length, 1);
      expect(decides.single, contains('approved'));
      expect(fake.paths.any((p) => p.contains('/messages/m1/decide')), isTrue);
    });

    testWidgets('plain members see no buttons',
        (WidgetTester tester) async {
      final s = SessionController()
        ..selfId = 'u2'
        ..selectedId = 'c1'
        ..selectedTitle = 'Room'
        ..chats = [
          {'id': 'c1', 'kind': 'group', 'owner_id': 'u1', 'title': 'Room'}
        ]
        ..messages = [_proposal('m1', 'Ship it?')];
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
      expect(find.text('승인'), findsNothing);
      expect(find.text('거절'), findsNothing);
      expect(find.text('Ship it?'), findsOneWidget);
    });
  });
}
