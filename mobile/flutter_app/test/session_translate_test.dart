// T1: the app reads the server's translation language list; while the
// engine is unconfigured, translating degrades to the "preparing" notice
// instead of failing.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/state/session.dart';

class FakeHttp extends http.BaseClient {
  Future<http.Response> Function(http.BaseRequest request, String body)? handler;
  final List<String> paths = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    paths.add('${request.method} ${request.url.path}');
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
  group('translation engine state', () {
    test('unconfigured engine shows the preparing notice without posting',
        () async {
      final fake = FakeHttp();
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/translate/languages') {
          return jsonRes({'configured': false, 'languages': []}, 200);
        }
        return jsonRes({'error': 'unexpected call'}, 500);
      };
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      await s.translateMessage('m1', 'hello');
      expect(s.translateConfigured, isFalse);
      expect(s.translations['m1']?['error'], '번역 준비 중');
      expect(fake.paths.any((p) => p.startsWith('POST /api/v1/translate')),
          isFalse);
    });

    test('configured engine loads the list and clamps the target', () async {
      final fake = FakeHttp();
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/translate/languages') {
          return jsonRes({
            'configured': true,
            'engine': 'fake',
            'languages': ['ko', 'en', 'ja', 'th']
          }, 200);
        }
        return jsonRes({}, 200);
      };
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      s.targetTranslateLang = 'es';
      await s.ensureTranslateLanguages();
      expect(s.translateConfigured, isTrue);
      expect(s.translateLanguages, ['ko', 'en', 'ja', 'th']);
      expect(s.targetTranslateLang, 'ko');
      final calls = fake.paths.length;
      await s.ensureTranslateLanguages();
      expect(fake.paths.length, calls, reason: 'list loads once');
    });

    test('successful translate stores the server contract', () async {
      final fake = FakeHttp();
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/translate/languages') {
          return jsonRes({
            'configured': true,
            'languages': ['ko', 'en']
          }, 200);
        }
        if (req.method == 'POST' && req.url.path == '/api/v1/translate') {
          return jsonRes({
            'translated': '[ko] hi',
            'source_lang': 'en',
            'target_lang': 'ko',
            'engine': 'fake'
          }, 200);
        }
        return jsonRes({}, 200);
      };
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      await s.translateMessage('m2', 'hi');
      expect(s.translations['m2'], {
        'loading': false,
        'translated': '[ko] hi',
        'target_lang': 'ko',
        'engine': 'fake',
      });
    });

    test('translate distinguishes preparing from failure', () async {
      var status = 503;
      final fake = FakeHttp();
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/translate/languages') {
          return jsonRes({
            'configured': true,
            'languages': ['ko']
          }, 200);
        }
        return jsonRes({'error': 'x'}, status);
      };
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      await s.translateMessage('m3', 'hi');
      expect(s.translations['m3']?['error'], '번역 준비 중');
      status = 500;
      await s.translateMessage('m4', 'hi');
      expect(s.translations['m4']?['error'], '번역 실패');
    });

    test('language list failure degrades silently', () async {
      final fake = FakeHttp();
      fake.handler = (req, body) async =>
          jsonRes({'error': 'down'}, 500);
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      await s.ensureTranslateLanguages();
      expect(s.translateConfigured, isFalse);
      expect(s.translateLanguages, isEmpty);
      await s.translateMessage('m5', 'hi');
      expect(s.translations['m5']?['error'], '번역 준비 중');
    });
  });
}
