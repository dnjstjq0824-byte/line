// App token auto-refresh: an expired access token (401) spends the stored
// refresh token once (singleflight across concurrent 401s), persists the
// rotated pair, and retries the request. A failed refresh clears state so
// the user re-logs in. Auth routes never trigger a refresh.
// Mirrors user-web store/session.ts (body token instead of cookie).
import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/api/client.dart';

class FakeHttp extends http.BaseClient {
  Future<http.Response> Function(http.BaseRequest request, String body)? handler;
  int refreshCalls = 0;

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

void main() {
  group('token auto-refresh', () {
    test('401 refreshes with rotation, persists, and retries once', () async {
      final fake = FakeHttp();
      final api = Api(httpClient: fake)..baseUrl = 'https://x';
      api.token = 'OLD';
      api.refreshToken = 'REF-OLD';
      String? savedAccess;
      String? savedRefresh;
      api.onTokensRefreshed = (a, r) async {
        savedAccess = a;
        savedRefresh = r;
      };
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/auth/refresh') {
          fake.refreshCalls++;
          expect(jsonDecode(body)['refresh_token'], 'REF-OLD');
          return jsonRes({'access_token': 'NEW', 'refresh_token': 'REF-NEW'}, 200);
        }
        if (req.headers['authorization'] == 'Bearer NEW') {
          return jsonRes({'id': 'u1'}, 200);
        }
        return jsonRes({'error': 'unauthorized'}, 401);
      };

      final res = await api.call('/api/v1/me');
      expect(res['id'], 'u1');
      expect(api.token, 'NEW');
      expect(api.refreshToken, 'REF-NEW');
      expect(savedAccess, 'NEW');
      expect(savedRefresh, 'REF-NEW');
      expect(fake.refreshCalls, 1);
    });

    test('concurrent 401s share one refresh', () async {
      final fake = FakeHttp();
      final api = Api(httpClient: fake)..baseUrl = 'https://x';
      api.token = 'OLD';
      api.refreshToken = 'REF-OLD';
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/auth/refresh') {
          fake.refreshCalls++;
          await Future.delayed(const Duration(milliseconds: 50));
          return jsonRes({'access_token': 'NEW', 'refresh_token': 'REF-NEW'}, 200);
        }
        if (req.headers['authorization'] == 'Bearer NEW') {
          return jsonRes({'id': 'u1'}, 200);
        }
        return jsonRes({'error': 'unauthorized'}, 401);
      };

      final results = await Future.wait([
        api.call('/api/v1/me'),
        api.call('/api/v1/friends'),
        api.call('/api/v1/conversations'),
      ]);
      expect(results.every((r) => r['id'] == 'u1'), isTrue);
      expect(fake.refreshCalls, 1);
      expect(api.refreshToken, 'REF-NEW');
    });

    test('failed refresh rethrows the original error and clears state', () async {
      final fake = FakeHttp();
      final api = Api(httpClient: fake)..baseUrl = 'https://x';
      api.token = 'OLD';
      api.refreshToken = 'REF-DEAD';
      var failedCalls = 0;
      api.onRefreshFailed = () async {
        failedCalls++;
      };
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/auth/refresh') {
          fake.refreshCalls++;
          return jsonRes({'error': 'invalid credentials'}, 401);
        }
        return jsonRes({'error': 'unauthorized'}, 401);
      };

      Object? caught;
      try {
        await api.call('/api/v1/me');
      } catch (e) {
        caught = e;
      }
      expect(caught, isA<ApiException>());
      expect((caught as ApiException).statusCode, 401);
      expect(caught.message, 'unauthorized');
      expect(api.token, isNull);
      expect(api.refreshToken, isNull);
      expect(failedCalls, 1);
      expect(fake.refreshCalls, 1);
    });

    test('auth-route 401 never triggers a refresh', () async {
      final fake = FakeHttp();
      final api = Api(httpClient: fake)..baseUrl = 'https://x';
      api.refreshToken = 'REF-OLD';
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/auth/refresh') {
          fake.refreshCalls++;
          return jsonRes({'access_token': 'NEW'}, 200);
        }
        return jsonRes({'error': 'invalid credentials'}, 401);
      };

      Object? caught;
      try {
        await api.call('/api/v1/auth/login', method: 'POST', data: {'email': 'a', 'password': 'b'});
      } catch (e) {
        caught = e;
      }
      expect(caught, isA<ApiException>());
      expect((caught as ApiException).message, 'invalid credentials');
      expect(fake.refreshCalls, 0);
    });

    test('missing refresh token skips refresh', () async {
      final fake = FakeHttp();
      final api = Api(httpClient: fake)..baseUrl = 'https://x';
      api.token = 'OLD';
      api.refreshToken = null;
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/auth/refresh') {
          fake.refreshCalls++;
          return jsonRes({'access_token': 'NEW'}, 200);
        }
        return jsonRes({'error': 'unauthorized'}, 401);
      };

      Object? caught;
      try {
        await api.call('/api/v1/me');
      } catch (e) {
        caught = e;
      }
      expect(caught, isA<ApiException>());
      expect((caught as ApiException).message, 'unauthorized');
      expect(fake.refreshCalls, 0);
      // Without a refresh attempt there is no failure to report.
      expect(api.token, 'OLD');
    });
  });
}
