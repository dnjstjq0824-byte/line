// LUNO200 image stickers: id rules, disk cache, catalog load, send path.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/sticker_image.dart';
import 'package:luno_messenger/util/stickers.dart';

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

// 1x1 transparent PNG.
const px = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
];

void main() {
  group('image sticker ids', () {
    test('accept catalog ids, reject traversal and junk', () {
      expect(isImageStickerId('luno-joy-003'), isTrue);
      for (final bad in [
        '',
        'lumi_hello',
        'LUNO-joy-003',
        'luno-../x',
        'luno-a/b',
        'luno- joy',
        ' xluno-joy-003',
      ]) {
        expect(isImageStickerId(bad), isFalse, reason: bad);
      }
      expect(stickerImageUrl('https://h.test', 'luno-joy-003'),
          'https://h.test/stickers/luno-joy-003.png');
      expect(stickerCatalogUrl('https://h.test'),
          'https://h.test/stickers/catalog.json');
    });
  });

  group('sticker disk cache', () {
    test('miss fetches and writes, hit reads without fetching', () async {
      final dir = await Directory.systemTemp.createTemp('sticker-cache-');
      var fetches = 0;
      Future<http.Response> get(Uri url) async {
        fetches++;
        expect(url.toString(), 'https://h.test/stickers/luno-joy-003.png');
        return http.Response.bytes(px, 200);
      }
      final first = await stickerImageFile(
          dirPath: dir.path, id: 'luno-joy-003', url: 'https://h.test/stickers/luno-joy-003.png', get: get);
      expect(await first.exists(), isTrue);
      expect(fetches, 1);
      final second = await stickerImageFile(
          dirPath: dir.path, id: 'luno-joy-003', url: 'https://h.test/stickers/luno-joy-003.png', get: get);
      expect(second.path, first.path);
      expect(fetches, 1, reason: 'cache hit fetches nothing');
      await dir.delete(recursive: true);
    });

    test('non-200 throws and writes nothing', () async {
      final dir = await Directory.systemTemp.createTemp('sticker-cache-');
      await expectLater(
          stickerImageFile(
              dirPath: dir.path,
              id: 'luno-joy-003',
              url: 'https://h.test/stickers/luno-joy-003.png',
              get: (_) async => http.Response('no', 404)),
          throwsException);
      expect(await File('${dir.path}/luno-joy-003.png').exists(), isFalse);
      await dir.delete(recursive: true);
    });
  });

  group('sticker send carries metadata', () {
    test('online send posts the sticker id', () async {
      final fake = FakeHttp();
      Map<String, dynamic>? posted;
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path.endsWith('/messages')) {
          posted = jsonDecode(body) as Map<String, dynamic>;
          return jsonRes({'message': {'id': 'm1'}}, 201);
        }
        return jsonRes({}, 200);
      };
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      s.selectedId = 'c1';
      await s.send(
          kind: 'sticker',
          customBody: 'luno-joy-003',
          metadata: {'sticker_id': 'luno-joy-003'});
      expect(posted?['kind'], 'sticker');
      expect(posted?['body'], 'luno-joy-003');
      expect(posted?['metadata'], {'sticker_id': 'luno-joy-003'});
    });

    test('flushed outbox forwards stored metadata', () async {
      final fake = FakeHttp();
      Map<String, dynamic>? posted;
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path.endsWith('/messages')) {
          posted = jsonDecode(body) as Map<String, dynamic>;
          return jsonRes({'message': {'id': 'm2'}}, 201);
        }
        return jsonRes({'conversations': []}, 200);
      };
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      s.selfId = 'u1';
      s.selectedId = 'c1';
      s.outbox.add({
        'owner_id': 'u1',
        'conversation_id': 'c1',
        'client_id': 'c9',
        'kind': 'sticker',
        'body': 'luno-joy-003',
        'reply_to': '',
        'metadata': {'sticker_id': 'luno-joy-003'},
      });
      await s.flushOutbox();
      expect(posted?['metadata'], {'sticker_id': 'luno-joy-003'});
      expect(s.outbox, isEmpty);
    });
  });

  group('sticker catalog', () {
    test('loads once and titles fall back across locales', () async {
      final fake = FakeHttp();
      fake.handler = (req, body) async => jsonRes({
            'version': 1,
            'pack': 'luno200',
            'count': 2,
            'categories': [
              {
                'id': 'greet',
                'ko': '인사',
                'en': 'Greetings',
                'items': [
                  {'id': 'luno-greet-001', 'char': 'lumi', 'label': '안녕!'}
                ]
              }
            ]
          }, 200);
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      await s.loadStickerCatalog();
      await s.loadStickerCatalog();
      expect(fake.calls, 1);
      expect(s.stickerCategories.length, 1);
      expect(s.stickerCategories[0]['items'].length, 1);
      s.locale = 'ko';
      expect(s.stickerCategoryTitle(s.stickerCategories[0]), '인사');
      s.locale = 'en';
      expect(s.stickerCategoryTitle(s.stickerCategories[0]), 'Greetings');
      s.locale = 'th';
      expect(s.stickerCategoryTitle(s.stickerCategories[0]), 'Greetings');
    });

    test('a dead catalog leaves stickers empty without throwing', () async {
      final fake = FakeHttp();
      fake.handler = (req, body) async => jsonRes({}, 404);
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      await s.loadStickerCatalog();
      expect(s.stickerCategories, isEmpty);
    });
  });

  group('StickerImage widget', () {
    testWidgets('renders the cached file', (tester) async {
      final dir = await Directory.systemTemp.createTemp('sticker-widget-');
      addTearDown(() => dir.delete(recursive: true));
      // runAsync: the cache does real file IO, which never finishes under
      // pumpAndSettle's fake clock while the spinner animates.
      await tester.runAsync(() async {
        await tester.pumpWidget(MaterialApp(
            home: StickerImage(
                stickerId: 'luno-joy-003',
                baseUrl: 'https://h.test',
                size: 64,
                dirForTest: dir.path,
                fetchForTest: (_) async => http.Response.bytes(px, 200))));
        await tester.pumpAndSettle();
      });
      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('shows the fallback glyph on failure', (tester) async {
      final dir = await Directory.systemTemp.createTemp('sticker-widget-');
      addTearDown(() => dir.delete(recursive: true));
      await tester.runAsync(() async {
        await tester.pumpWidget(MaterialApp(
            home: StickerImage(
                stickerId: 'luno-joy-003',
                baseUrl: 'https://h.test',
                size: 64,
                fallbackGlyph: 'FB',
                dirForTest: dir.path,
                fetchForTest: (_) async => http.Response('no', 404))));
        await tester.pumpAndSettle();
      });
      expect(find.text('FB'), findsOneWidget);
    });
  });
}
