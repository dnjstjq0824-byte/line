import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/state/session.dart';

// F9: location + contact shares post the right kind/metadata and append
// the echoed message locally.
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
  test('sendLocation posts coords with a label', () async {
    final httpClient = FakeHttp();
    final s = SessionController(httpClient: httpClient)..selectedId = 'c1';
    addTearDown(s.disposeAll);
    Map<String, dynamic>? seen;
    httpClient.handler = (req, body) async {
      if (req.method == 'POST') {
        seen = jsonDecode(body) as Map<String, dynamic>;
        return jsonRes({
          'message': {'id': 'm1', 'kind': 'location'}
        }, 201);
      }
      return jsonRes({'conversations': []}, 200);
    };
    await s.sendLocation(lat: 37.5, lng: 127.0, label: 'here');
    expect(seen?['kind'], 'location');
    expect(seen?['metadata']['lat'], 37.5);
    expect(seen?['metadata']['label'], 'here');
    expect(s.messages.single['id'], 'm1');
  });

  test('sendContact posts the friend identity', () async {
    final httpClient = FakeHttp();
    final s = SessionController(httpClient: httpClient)..selectedId = 'c1';
    addTearDown(s.disposeAll);
    Map<String, dynamic>? seen;
    httpClient.handler = (req, body) async {
      if (req.method == 'POST') {
        seen = jsonDecode(body) as Map<String, dynamic>;
        return jsonRes({
          'message': {'id': 'm2', 'kind': 'contact'}
        }, 201);
      }
      return jsonRes({'conversations': []}, 200);
    };
    await s.sendContact(
        {'id': 'u9', 'handle': 'nina', 'display_name': 'Nina'});
    expect(seen?['kind'], 'contact');
    expect(seen?['metadata']['user_id'], 'u9');
    expect(seen?['metadata']['handle'], 'nina');
    expect(s.messages.single['id'], 'm2');
  });
}
