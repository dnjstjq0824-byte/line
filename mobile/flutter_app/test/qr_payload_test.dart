import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/qr_payload.dart';

void main() {
  group('parseQrPayload', () {
    test('parses login challenges', () {
      final p = parseQrPayload('LUNO-LOGIN:cid-1:qr-tok-2');
      expect(p.kind, QrPayloadKind.login);
      expect(p.challengeId, 'cid-1');
      expect(p.qrToken, 'qr-tok-2');
    });

    test('trims login parts and matches case-insensitively', () {
      final p = parseQrPayload('  luno-login:cid-1:qr-tok-2  ');
      expect(p.kind, QrPayloadKind.login);
      expect(p.challengeId, 'cid-1');
      expect(p.qrToken, 'qr-tok-2');
    });

    test('rejects malformed login payloads', () {
      expect(parseQrPayload('LUNO-LOGIN:cid-1').kind, QrPayloadKind.unknown);
      expect(parseQrPayload('LUNO-LOGIN:cid-1:').kind, QrPayloadKind.unknown);
      expect(parseQrPayload('LUNO-LOGIN::tok').kind, QrPayloadKind.unknown);
      expect(parseQrPayload('LUNO-LOGIN:a:b:c').kind, QrPayloadKind.unknown);
      expect(parseQrPayload('LUNO-LOGIN: : ').kind, QrPayloadKind.unknown);
    });

    test('parses friend codes including legacy prefix', () {
      final p = parseQrPayload('LUNO-FRIEND:alice_kim');
      expect(p.kind, QrPayloadKind.friend);
      expect(p.handle, 'alice_kim');
      final legacy = parseQrPayload('LINE-FRIEND:bob');
      expect(legacy.kind, QrPayloadKind.friend);
      expect(legacy.handle, 'bob');
    });

    test('trims friend handles and strips a leading at-sign', () {
      expect(parseQrPayload('  LUNO-FRIEND:@dodo  ').handle, 'dodo');
      expect(parseQrPayload('LUNO-FRIEND:').kind, QrPayloadKind.unknown);
      expect(parseQrPayload('LUNO-FRIEND:   ').kind, QrPayloadKind.unknown);
    });

    test('stays silent on foreign payloads', () {
      expect(parseQrPayload('').kind, QrPayloadKind.unknown);
      expect(parseQrPayload('https://example.com').kind, QrPayloadKind.unknown);
      expect(parseQrPayload('WIFI:S:home;;').kind, QrPayloadKind.unknown);
      expect(parseQrPayload('LUNO-LOGIN').kind, QrPayloadKind.unknown);
    });
  });
}
