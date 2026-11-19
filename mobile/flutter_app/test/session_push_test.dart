// Closed-app push (FCM) wiring with a fake registrar + fake HTTP: the token is
// registered device-scoped, refreshes re-register, a tapped push opens the
// room, and logout unregisters only this device before the session clears.
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/push_registrar.dart';

class FakeHttp extends http.BaseClient {
  final List<Map<String, dynamic>> pushCalls = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final body = await request.finalize().transform(utf8.decoder).join();
    if (request.url.path == '/api/v1/push-tokens') {
      pushCalls.add({
        'method': request.method,
        'query': request.url.queryParameters,
        'body': body.isEmpty ? null : jsonDecode(body),
      });
    }
    return http.StreamedResponse(
      Stream.value(utf8.encode('{}')),
      200,
      headers: {'content-type': 'application/json'},
    );
  }
}

class FakePush implements PushRegistrar {
  FakePush(this.token);
  final String? token;
  void Function(String token)? refresh;
  void Function(String conversationId)? open;
  int stops = 0;

  @override
  Future<String?> start({
    required void Function(String token) onRefresh,
    required void Function(String conversationId) onOpen,
  }) async {
    refresh = onRefresh;
    open = onOpen;
    return token;
  }

  @override
  Future<void> stop() async {
    stops++;
  }
}

SessionController makeSession(FakeHttp fake, FakePush push) {
  final s = SessionController(httpClient: fake);
  s.push = push;
  s.api.token = 'access';
  s.deviceId = 'dev-1';
  addTearDown(s.disposeAll);
  return s;
}

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('registers the token for this device and re-registers on refresh',
      () async {
    final fake = FakeHttp();
    final push = FakePush('fcm-token-1');
    final s = makeSession(fake, push);
    await s.registerPush();
    expect(fake.pushCalls, hasLength(1));
    expect(fake.pushCalls.single['method'], 'POST');
    expect(fake.pushCalls.single['body'],
        {'token': 'fcm-token-1', 'platform': 'android', 'device_id': 'dev-1'});
    expect(s.pushToken, 'fcm-token-1');

    push.refresh!('fcm-token-2');
    await Future<void>.delayed(Duration.zero);
    expect(fake.pushCalls.last['body']['token'], 'fcm-token-2');
    expect(s.pushToken, 'fcm-token-2');
  });

  test('no token (unsupported platform or denied) sends nothing', () async {
    final fake = FakeHttp();
    final s = makeSession(fake, FakePush(null));
    await s.registerPush();
    expect(fake.pushCalls, isEmpty);
    expect(s.pushToken, isEmpty);
  });

  test('a tapped push opens its room', () async {
    final routes = <String>[];
    final push = FakePush('t');
    final s = makeSession(FakeHttp(), push);
    s.notifyTap = (route) async => routes.add(route);
    await s.registerPush();
    push.open!('c42');
    await Future<void>.delayed(Duration.zero);
    expect(routes, ['/chats/c42']);
  });

  test('logout unregisters only this device, then stops the registrar',
      () async {
    final fake = FakeHttp();
    final push = FakePush('fcm-token-1');
    final s = makeSession(fake, push);
    await s.registerPush();
    await s.logout();
    expect(fake.pushCalls.last['method'], 'DELETE');
    expect(fake.pushCalls.last['query'], {'device_id': 'dev-1'});
    expect(push.stops, 1);
    expect(s.pushToken, isEmpty);
  });
}
