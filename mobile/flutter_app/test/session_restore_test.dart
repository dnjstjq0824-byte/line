// M1: startup restore keeps stored tokens on network errors (offline banner +
// retry) and clears them only after a 401 that refresh could not fix.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/design/responsive.dart';
import 'package:luno_messenger/design/v3.dart';
import 'package:luno_messenger/state/session.dart';

class FakeHttp extends http.BaseClient {
  Future<http.Response> Function(http.BaseRequest request, String body)? handler;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
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

// In-memory flutter_secure_storage mock.
final Map<String, String> vault = {};

void mockSecureStorage() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel =
      MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, (call) async {
    final args =
        (call.arguments as Map?)?.cast<String, dynamic>() ?? <String, dynamic>{};
    switch (call.method) {
      case 'read':
        return vault[args['key'] as String];
      case 'write':
        vault[args['key'] as String] = args['value'] as String;
        return null;
      case 'delete':
        vault.remove(args['key'] as String);
        return null;
      case 'readAll':
        return Map<String, String>.from(vault);
      case 'deleteAll':
        vault.clear();
        return null;
      case 'containsKey':
        return vault.containsKey(args['key'] as String);
    }
    return null;
  });
}

void main() {
  mockSecureStorage();
  setUp(vault.clear);

  SessionController makeSession(FakeHttp fake) {
    final s = SessionController(httpClient: fake);
    addTearDown(s.disposeAll);
    return s;
  }

  group('startup restore', () {
    test('airplane mode keeps tokens and raises offline', () async {
      vault['access_token'] = 'SAVED';
      vault['refresh_token'] = 'SAVED-REFRESH';
      vault['device_id'] = 'DEV';
      final fake = FakeHttp();
      fake.handler = (req, body) async =>
          throw const SocketException('airplane mode');
      final s = makeSession(fake);

      await s.restore();

      expect(vault['access_token'], 'SAVED');
      expect(vault['refresh_token'], 'SAVED-REFRESH');
      expect(vault['device_id'], 'DEV');
      expect(s.api.token, 'SAVED');
      expect(s.offline, isTrue);
    });

    test('401 after failed refresh clears tokens', () async {
      vault['access_token'] = 'OLD';
      vault['refresh_token'] = 'DEAD';
      final fake = FakeHttp();
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/auth/refresh') {
          return jsonRes({'error': 'invalid grant'}, 401);
        }
        return jsonRes({'error': 'unauthorized'}, 401);
      };
      final s = makeSession(fake);

      await s.restore();

      expect(vault.containsKey('access_token'), isFalse);
      expect(vault.containsKey('refresh_token'), isFalse);
      expect(s.api.token, isNull);
      expect(s.offline, isFalse);
    });

    test('successful restore clears offline and loads profile', () async {
      vault['access_token'] = 'GOOD';
      final fake = FakeHttp();
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/me') {
          return jsonRes({'id': 'u1', 'display_name': 'Me'}, 200);
        }
        if (req.url.path == '/api/v1/ws-ticket') {
          return jsonRes({'ticket': 'T'}, 200);
        }
        return jsonRes({}, 200);
      };
      final s = makeSession(fake);
      s.offline = true;

      await s.restore();

      expect(s.offline, isFalse);
      expect(s.selfId, 'u1');
      expect(s.selfName, 'Me');
      expect(vault['access_token'], 'GOOD');
    });

    testWidgets('offline banner offers retry', (tester) async {
      vault['access_token'] = 'SAVED';
      final fake = FakeHttp();
      var online = false;
      fake.handler = (req, body) async {
        if (!online) throw const SocketException('airplane mode');
        if (req.url.path == '/api/v1/me') {
          return jsonRes({'id': 'u1'}, 200);
        }
        if (req.url.path == '/api/v1/ws-ticket') {
          return jsonRes({'ticket': 'T'}, 200);
        }
        return jsonRes({}, 200);
      };
      final s = makeSession(fake);
      await s.restore();
      expect(s.offline, isTrue);

      await tester.pumpWidget(SessionScope(
        notifier: s,
        child: MaterialApp(
          theme: LunoHarbor.theme(Brightness.light),
          home: const Scaffold(body: StatusStrip()),
        ),
      ));
      expect(find.text('재시도'), findsOneWidget);

      online = true;
      await tester.tap(find.text('재시도'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(s.offline, isFalse);
      expect(find.text('재시도'), findsNothing);
    });
  });
}
