import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/state/session.dart';

// F10: a network failure queues the message (composer may clear) instead
// of losing it; the flush reuses the same client_id so the server dedups.
// Server rejections never queue.
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

void main() {
  test('network failure queues, flush reuses the client_id', () async {
    final httpClient = FakeHttp();
    final s = SessionController(httpClient: httpClient)
      ..selfId = 'u1'
      ..selectedId = 'c1';
    addTearDown(s.disposeAll);
    var online = false;
    httpClient.handler = (req, body) async {
      if (req.method == 'POST' && !online) throw http.ClientException('down');
      if (req.method == 'POST') {
        return jsonRes({
          'message': {'id': 'm1', 'client_id': jsonDecode(body)['client_id']}
        }, 201);
      }
      return jsonRes({'conversations': []}, 200);
    };
    expect(await s.send(text: 'hello'), isTrue, reason: 'queued counts as kept');
    expect(s.outbox.length, 1);
    final queuedId = s.outbox.single['client_id'] as String;
    expect(queuedId.isNotEmpty, isTrue);
    await s.flushOutbox();
    expect(s.outbox.length, 1, reason: 'still offline, still queued');
    online = true;
    await s.flushOutbox();
    expect(s.outbox, isEmpty);
    expect(s.messages.single['id'], 'm1');
    final posts = [
      for (var i = 0; i < httpClient.paths.length; i++)
        if (httpClient.paths[i].startsWith('POST')) httpClient.bodies[i]
    ];
    expect(posts.length, 3, reason: 'send + offline flush + online flush');
    for (final p in posts) {
      expect(jsonDecode(p)['client_id'], queuedId,
          reason: 'every retry reuses the id, server dedups');
    }
  });

  test('server rejection surfaces and never queues', () async {
    final httpClient = FakeHttp();
    final s = SessionController(httpClient: httpClient)
      ..selfId = 'u1'
      ..selectedId = 'c1';
    addTearDown(s.disposeAll);
    httpClient.handler = (req, body) async {
      if (req.method == 'POST') return jsonRes({'error': 'nope'}, 400);
      return jsonRes({'conversations': []}, 200);
    };
    expect(await s.send(text: 'hello'), isFalse);
    expect(s.outbox, isEmpty);
    expect(s.error.isNotEmpty, isTrue);
  });
}
