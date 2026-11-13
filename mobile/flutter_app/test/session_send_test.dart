// M2: one text send costs two API calls (POST message + conversation-list
// refresh), and offline sync asks for only what is newer than the last
// known sequence (since_sequence, the name the server reads).
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/state/session.dart';

class FakeHttp extends http.BaseClient {
  Future<http.Response> Function(http.BaseRequest request, String body)? handler;
  int calls = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    calls++;
    final body = await request.finalize().transform(utf8.decoder).join();
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

void main() {
  group('send call budget', () {
    test('text send costs two API calls and updates the room entry', () async {
      final fake = FakeHttp();
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path.endsWith('/messages')) {
          return jsonRes({
            'message': {'id': 'm9', 'sequence': 9, 'body': 'hi'}
          }, 201);
        }
        if (req.url.path == '/api/v1/conversations') {
          return jsonRes({
            'conversations': [
              {'id': 'c1', 'last_message': {'id': 'm9'}}
            ]
          }, 200);
        }
        return jsonRes({}, 200);
      };
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      s.selectedId = 'c1';

      await s.send(text: 'hi');

      expect(fake.calls, 2);
      expect(s.messages.any((m) => m['id'] == 'm9'), isTrue);
      expect(s.chats.length, 1);
      expect(s.chats[0]['last_message']['id'], 'm9');
    });

    test('offline sync asks since the last known sequence only', () async {
      final fake = FakeHttp();
      String? syncQuery;
      fake.handler = (req, body) async {
        if (req.url.path.endsWith('/sync')) {
          syncQuery = req.url.query;
          return jsonRes({
            'delta_messages': [
              {'id': 'm11', 'sequence': 11, 'body': 'new'}
            ],
            'latest_sequence': 11,
          }, 200);
        }
        return jsonRes({}, 200);
      };
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      s.selectedId = 'c1';
      s.messages = [
        {'id': 'm10', 'sequence': 10, 'body': 'old'}
      ];

      await s.syncOffline();

      expect(syncQuery, contains('since_sequence=10'));
      expect(syncQuery, isNot(contains('after_sequence')));
      expect(s.messages.any((m) => m['id'] == 'm11'), isTrue);
      expect(s.messages.length, 2);
    });
  });
}
