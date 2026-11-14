import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/state/session.dart';

// F7: edit/hide/forward hit the message action endpoints and update local
// state (edited body, dropped message, refreshed list).
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

void main() {
  test('editMessage patches and stamps the local copy', () async {
    final httpClient = FakeHttp();
    final s = SessionController(httpClient: httpClient)
      ..selectedId = 'c1'
      ..messages = [
        {'id': 'm1', 'body': 'typo'}
      ];
    addTearDown(s.disposeAll);
    httpClient.handler = (req, body) async => jsonRes({}, 200);
    await s.editMessage('m1', 'fixed');
    expect(httpClient.paths,
        contains('PATCH /api/v1/conversations/c1/messages/m1'));
    expect(s.messages.single['body'], 'fixed');
    expect(s.messages.single['edited_at'], isNotEmpty);
  });

  test('hideMessage posts hide and drops the local copy', () async {
    final httpClient = FakeHttp();
    final s = SessionController(httpClient: httpClient)
      ..selectedId = 'c1'
      ..messages = [
        {'id': 'm1', 'body': 'x'},
        {'id': 'm2', 'body': 'y'},
      ];
    addTearDown(s.disposeAll);
    httpClient.handler = (req, body) async => jsonRes({}, 200);
    await s.hideMessage('m1');
    expect(httpClient.paths,
        contains('POST /api/v1/conversations/c1/messages/m1/hide'));
    expect(s.messages.map((m) => m['id']), ['m2']);
  });

  test('forwardMessage posts to the forward endpoint', () async {
    final httpClient = FakeHttp();
    final s = SessionController(httpClient: httpClient)..selectedId = 'c1';
    addTearDown(s.disposeAll);
    String? seenBody;
    httpClient.handler = (req, body) async {
      if (req.url.path.endsWith('/forward')) seenBody = body;
      return jsonRes({'conversations': []}, 200);
    };
    await s.forwardMessage('c2', 'm1');
    expect(httpClient.paths,
        contains('POST /api/v1/conversations/c1/messages/m1/forward'));
    expect(jsonDecode(seenBody!)['to_conversation_id'], 'c2');
  });
}
