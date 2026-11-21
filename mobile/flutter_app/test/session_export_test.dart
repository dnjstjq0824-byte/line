// E8: "export this device's chats" writes the decrypted on-device cache
// (sealed-but-unreadable rows become markers, never envelope bytes), and
// message reports carry sealed quotes only with explicit consent.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/e2ee/store.dart';
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

  group('passphrase backup', () {
    SessionController makeE2ee(FakeHttp fake) {
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);
      s.selfId = 'me';
      s.deviceId = 't1';
      s.e2eeKvForTests = MemoryKV();
      return s;
    }

    test('backup stores an opaque blob, restore reinstalls identity',
        () async {
      final fake = FakeHttp();
      Map<String, dynamic>? stored;
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/e2ee/backup') {
          if (req.method == 'PUT') {
            stored = jsonDecode(body) as Map<String, dynamic>;
            return jsonRes({'status': 'backup_stored'}, 200);
          }
          return jsonRes(
              {'backup': stored?['blob'], 'byte_len': 10, 'updated_at': 'x'},
              200);
        }
        return jsonRes({}, 200);
      };
      final s = makeE2ee(fake);
      await s.backupE2eeNow('correct horse 999');
      expect(s.notice, s.strings.e2eeBkDone);
      final blob = stored?['blob'] as Map<String, dynamic>?;
      expect(blob?['v'], 1);
      expect(jsonEncode(blob), isNot(contains('xPriv')));
      final before = s.mySafetyIdentity();
      expect(before, isNotNull);
      await s.restoreE2eeNow('correct horse 999');
      expect(s.notice, s.strings.e2eeBkRestored);
      expect(s.mySafetyIdentity(), before);
    });

    test('wrong passphrase fails closed with one message', () async {
      final fake = FakeHttp();
      Map<String, dynamic>? stored;
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/e2ee/backup') {
          if (req.method == 'PUT') {
            stored = jsonDecode(body) as Map<String, dynamic>;
            return jsonRes({'status': 'backup_stored'}, 200);
          }
          return jsonRes(
              {'backup': stored?['blob'], 'byte_len': 10, 'updated_at': 'x'},
              200);
        }
        return jsonRes({}, 200);
      };
      final s = makeE2ee(fake);
      await s.backupE2eeNow('correct horse 999');
      await s.restoreE2eeNow('totally wrong passphrase!!');
      expect(s.notice, s.strings.e2eeBkRestoreFail);
    });

    test('devices load and revoke by id', () async {
      final fake = FakeHttp();
      final paths = <String>[];
      fake.handler = (req, body) async {
        paths.add('${req.method} ${req.url.path}');
        if (req.url.path == '/api/v1/me/e2ee-devices') {
          return jsonRes({
            'devices': [
              {'device_id': 't1', 'identity_key': 'x.y', 'updated_at': 't'}
            ]
          }, 200);
        }
        return jsonRes({}, 200);
      };
      final s = makeE2ee(fake);
      await s.loadE2eeDevices();
      expect(s.e2eeDevices, hasLength(1));
      await s.revokeE2eeDevice('t9');
      expect(
          paths.any((p) => p == 'DELETE /api/v1/devices/t9/keys'), isTrue);
      expect(s.notice, s.strings.e2eeDevRevoked);
    });
  });
}
