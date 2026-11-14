import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/state/session.dart';

// F13: money UI follows /version — off shows "preparing" and never calls
// the money routes; on restores the charge flow.
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
  test('flag off blocks chat send without touching the route', () async {
    final httpClient = FakeHttp();
    final s = SessionController(httpClient: httpClient)
      ..selfId = 'u1'
      ..selectedId = 'c1'
      ..chats = [
        {'id': 'c1', 'kind': 'direct', 'members': ['u1', 'u2']}
      ];
    addTearDown(s.disposeAll);
    httpClient.handler = (req, body) async {
      if (req.url.path == '/api/v1/version') {
        return jsonRes({'payments_enabled': false}, 200);
      }
      return jsonRes({}, 200);
    };
    await s.loadPaymentsFlag();
    expect(s.paymentsEnabled, isFalse);
    await s.sendPayInChat();
    expect(s.notice, '결제 기능은 준비 중입니다.');
    expect(
        httpClient.paths
            .where((p) => p.contains('/api/v1/wallet/send'))
            .length,
        0);
  });

  test('flag on restores the charge call', () async {
    final httpClient = FakeHttp();
    final s = SessionController(httpClient: httpClient)..selfId = 'u1';
    addTearDown(s.disposeAll);
    httpClient.handler = (req, body) async {
      if (req.url.path == '/api/v1/version') {
        return jsonRes({'payments_enabled': true}, 200);
      }
      return jsonRes({'conversations': []}, 200);
    };
    await s.loadPaymentsFlag();
    expect(s.paymentsEnabled, isTrue);
    await s.chargeWallet(5000);
    expect(httpClient.paths, contains('POST /api/v1/wallet/charge'));
  });
}
