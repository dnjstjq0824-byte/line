import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/state/session.dart';

// F8: previews fetch once per URL and cache on the device; the account
// toggle gates every fetch.
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
  test('loadLinkPreview fetches once then serves the cache', () async {
    final httpClient = FakeHttp();
    final s = SessionController(httpClient: httpClient)
      ..myPrefs = {'link_previews': true};
    addTearDown(s.disposeAll);
    httpClient.handler = (req, body) async => jsonRes({
          'url': 'https://example.test/a',
          'title': 'T',
          'description': 'D',
          'image_url': '',
        }, 200);
    final first = await s.loadLinkPreview('https://example.test/a');
    expect(first?['title'], 'T');
    final second = await s.loadLinkPreview('https://example.test/a');
    expect(second?['title'], 'T');
    expect(
        httpClient.paths
            .where((p) => p == 'GET /api/v1/link-preview')
            .length,
        1);
  });

  test('toggle off skips the fetch, toggle persists the pref', () async {
    final httpClient = FakeHttp();
    final s = SessionController(httpClient: httpClient)
      ..myPrefs = {'link_previews': false}
      ..prefsLoaded = true;
    addTearDown(s.disposeAll);
    httpClient.handler = (req, body) async {
      if (req.method == 'PUT') return jsonRes({'link_previews': true}, 200);
      return jsonRes({}, 200);
    };
    expect(await s.loadLinkPreview('https://example.test/a'), isNull);
    expect(httpClient.paths, isEmpty);
    await s.setLinkPreviews(true);
    expect(s.myPrefs['link_previews'], isTrue);
    expect(httpClient.paths, contains('PUT /api/v1/me/settings'));
  });
}
