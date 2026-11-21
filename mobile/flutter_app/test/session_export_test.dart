// E8: "export this device's chats" writes the decrypted on-device cache
// (sealed-but-unreadable rows become markers, never envelope bytes), and
// message reports carry sealed quotes only with explicit consent.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/state/session.dart';

class FakeHttp extends http.BaseClient {
  Future<http.Response> Function(http.BaseRequest request, String body)? handler;
  final List<String> bodies = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final body = await request.finalize().transform(utf8.decoder).join();
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
  group('device export', () {
    test('decrypted rows export, sealed-unreadable rows become markers',
        () async {
      final fake = FakeHttp();
      fake.handler = (req, body) async => jsonRes({}, 200);
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      s.selfId = 'me';
      s.chats = [
        {'id': 'c1', 'title': 'Sealed Room', 'kind': 'direct'}
      ];
      s.messages = [
        {
          'id': 'm1',
          'sender_id': 'peer',
          'created_at': '2026-11-21T00:00:00Z',
          'kind': 'text',
          'body': 'decrypted hello',
          '_e2ee': true,
        },
        {
          'id': 'm2',
          'sender_id': 'peer',
          'created_at': '2026-11-21T00:01:00Z',
          'kind': 'ciphertext',
          'body': '{"v":1,"secret_bytes":"must-not-show"}',
        },
        {
          'id': 'm3',
          'sender_id': 'me',
          'created_at': '2026-11-21T00:02:00Z',
          'kind': 'text',
          'body': 'plain reply',
        },
      ];
      final dir =
          await Directory.systemTemp.createTemp('luno-export-test');
      addTearDown(() => dir.delete(recursive: true));
      final path = await s.exportDeviceChat('c1', dir: dir);
      expect(path, isNotEmpty);
      final doc =
          jsonDecode(await File(path).readAsString()) as Map<String, dynamic>;
      expect(doc['export_version'], 'device-1');
      expect((doc['room'] as Map)['title'], 'Sealed Room');
      final rows = (doc['messages'] as List).cast<Map<String, dynamic>>();
      expect(rows, hasLength(3));
      expect(rows[0]['body'], 'decrypted hello');
      expect(rows[0]['sealed'], isTrue);
      expect(rows[1]['unreadable'], isTrue);
      expect(rows[1]['body'], isEmpty);
      expect(rows[2]['sealed'], isFalse);
      expect(jsonEncode(doc), isNot(contains('secret_bytes')));
      expect(s.notice, s.strings.roomExportDone);
    });

    test('empty room exports nothing', () async {
      final fake = FakeHttp();
      fake.handler = (req, body) async => jsonRes({}, 200);
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      s.messages = [];
      final dir =
          await Directory.systemTemp.createTemp('luno-export-test');
      addTearDown(() => dir.delete(recursive: true));
      expect(await s.exportDeviceChat('c1', dir: dir), isEmpty);
      expect(s.notice, s.strings.roomExportEmpty);
    });
  });

  group('message reports', () {
    test('sealed quote rides only with consent', () async {
      final fake = FakeHttp();
      fake.handler = (req, body) async => jsonRes({'reports': []}, 200);
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      await s.reportUser('peer', 'spam', 'details',
          messageId: 'm1',
          e2eeText: 'decrypted quote',
          plaintextConsent: true);
      final posted = jsonDecode(fake.bodies.first) as Map<String, dynamic>;
      expect(posted['message_id'], 'm1');
      expect(posted['e2ee_text'], 'decrypted quote');
      expect(posted['plaintext_consent'], isTrue);
    });

    test('sealed quote without consent is dropped', () async {
      final fake = FakeHttp();
      fake.handler = (req, body) async => jsonRes({'reports': []}, 200);
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      await s.reportUser('peer', 'spam', 'details');
      final posted = jsonDecode(fake.bodies.first) as Map<String, dynamic>;
      expect(posted.containsKey('message_id'), isFalse);
      expect(posted.containsKey('e2ee_text'), isFalse);
      expect(posted.containsKey('plaintext_consent'), isFalse);
    });
  });
}
