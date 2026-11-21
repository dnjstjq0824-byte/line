// E4: the Dart port reproduces scripts/fixtures/e2ee_vectors.json
// byte-for-byte, proving web<->app interop before any UI wiring.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/e2ee/backup.dart';
import 'package:luno_messenger/e2ee/codec.dart';
import 'package:luno_messenger/e2ee/envelope.dart';
import 'package:luno_messenger/e2ee/keys.dart';
import 'package:luno_messenger/e2ee/ratchet.dart';
import 'package:luno_messenger/e2ee/sender.dart';
import 'package:luno_messenger/e2ee/x3dh.dart';

Map<String, dynamic> loadVectors() {
  final f = File('../../scripts/fixtures/e2ee_vectors.json');
  return jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
}

String hex(Uint8List b) =>
    b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();

Uint8List unhex(String s) {
  final out = Uint8List(s.length ~/ 2);
  for (var i = 0; i < out.length; i++) {
    out[i] = int.parse(s.substring(i * 2, i * 2 + 2), radix: 16);
  }
  return out;
}


Uint8List seed(int from, int n) {
  final out = Uint8List(n);
  for (var i = 0; i < n; i++) {
    out[i] = (from + i) & 0xff;
  }
  return out;
}

void main() {
  final v = loadVectors();

  test('E4: X25519 cross-check vector reproduces', () async {
    final c = v['x25519_crosscheck'] as Map<String, dynamic>;
    expect(hex(await x25519Public(unhex(c['priv_hex'] as String))), c['pub_hex']);
  });

  test('E4: Ed25519 cross-check vector reproduces', () async {
    final c = v['ed25519_crosscheck'] as Map<String, dynamic>;
    expect(hex(await ed25519Public(unhex(c['seed_hex'] as String))), c['pub_hex']);
  });

  test('E4: HKDF-SHA256 matches RFC 5869 case 1', () async {
    final c = v['hkdf_sha256_rfc5869_case1'] as Map<String, dynamic>;
    final out = await hkdfSha256(unhex(c['ikm_hex'] as String),
        unhex(c['salt_hex'] as String), unhex(c['info_hex'] as String), c['length'] as int);
    expect(hex(out), c['okm_hex']);
  });

  test('E4: AES-GCM test vector round-trips', () async {
    final key = seed(9, 32);
    final iv = seed(21, 12);
    final pt = utf8Encode('aes-gcm dart probe');
    final ct = await aesGcmEncrypt(key, iv, pt);
    expect(utf8Decode(await aesGcmDecrypt(key, iv, ct)), 'aes-gcm dart probe');
    final bad = Uint8List.fromList(ct)..[0] ^= 1;
    await expectLater(aesGcmDecrypt(key, iv, bad), throwsA(anything));
  });

  test('E4: identities and prekey signature verify', () async {
    final id = v['identities'] as Map<String, dynamic>;
    final parts = parseIdentity(id['bob'] as String)!;
    expect(b64uEncode(parts.ed), (id['bob'] as String).split('.')[1]);
    expect(
        await verifyPrekeySig(id['bob'] as String, b64uDecode(id['bob_spk_pub'] as String),
            b64uDecode(id['bob_spk_sig'] as String)),
        isTrue);
    expect(
        await verifyPrekeySig(id['alice'] as String, b64uDecode(id['bob_spk_pub'] as String),
            b64uDecode(id['bob_spk_sig'] as String)),
        isFalse);
  });

  test('E4: X3DH shared secrets reproduce', () async {
    final p = v['_priv'] as Map<String, dynamic>;
    final bobSpkPub = await x25519Public(b64uDecode(p['bob_spk'] as String));
    final bobOpkPub = await x25519Public(b64uDecode(p['bob_opk'] as String));
    final init = await x3dhInitiate(
        b64uDecode(p['alice_x'] as String),
        TheirBundle(
            identityX: b64uDecode((v['identities'] as Map)['bob'].toString().split('.')[0]),
            signedPrekey: bobSpkPub,
            oneTimePrekey: bobOpkPub),
        b64uDecode(p['eph'] as String));
    expect(b64uEncode(init.sharedSecret), (v['x3dh_with_opk'] as Map)['sk']);
    final resp = await x3dhRespond(
        b64uDecode(p['bob_x'] as String),
        b64uDecode(p['bob_spk'] as String),
        b64uDecode(p['bob_opk'] as String),
        b64uDecode((v['identities'] as Map)['alice'].toString().split('.')[0]),
        init.ephemeralPub);
    expect(b64uEncode(resp), (v['x3dh_with_opk'] as Map)['sk']);
  });

  test('E4: ratchet conversation replays exactly, including out-of-order', () async {
    final p = v['_priv'] as Map<String, dynamic>;
    final r = v['ratchet'] as Map<String, dynamic>;
    setTestRandom(_counterRandom());
    try {
      final sk = b64uDecode((v['x3dh_with_opk'] as Map)['sk'] as String);
      final bobSpkPub = await x25519Public(b64uDecode(p['bob_spk'] as String));
      final aSt = await ratchetInitInitiator(sk, bobSpkPub, b64uDecode(p['a_ratchet'] as String));
      final bSt = await ratchetInitResponder(sk, b64uDecode(p['bob_spk'] as String));
      String wire(RatchetMessage m) =>
          '${encodeRatchetHeader(m.header)}.${b64uEncode(m.iv)}.${b64uEncode(m.ct)}';
      String want(Map<String, dynamic> m) => '${m['header']}.${m['iv']}.${m['ct']}';
      final m1 = await ratchetEncrypt(aSt, utf8Encode('hello bob, this is alice (1)'), ivOverride: seed(11, 12));
      final m2 = await ratchetEncrypt(aSt, utf8Encode('second message, still alice (2)'), ivOverride: seed(22, 12));
      expect(wire(m1), want(r['m1'] as Map<String, dynamic>));
      expect(wire(m2), want(r['m2'] as Map<String, dynamic>));
      final bobSpk = b64uDecode(p['bob_spk'] as String);
      expect(utf8Decode(await ratchetDecrypt(bSt, m2, bobSpk)), r['d2']);
      expect(utf8Decode(await ratchetDecrypt(bSt, m1, bobSpk)), r['d1']);
      final m3 = await ratchetEncrypt(bSt, utf8Encode('hi alice, bob here (3)'), ivOverride: seed(33, 12));
      expect(wire(m3), want(r['m3'] as Map<String, dynamic>));
      expect(utf8Decode(await ratchetDecrypt(aSt, m3, null)), r['d3']);
      final m4 = await ratchetEncrypt(aSt, utf8Encode('alice again after bob (4)'), ivOverride: seed(44, 12));
      expect(wire(m4), want(r['m4'] as Map<String, dynamic>));
      expect(utf8Decode(await ratchetDecrypt(bSt, m4, bobSpk)), r['d4']);
    } finally {
      setTestRandom(null);
    }
  });

  test('E4: sender keys replay exactly, including reorder', () async {
    final p = v['_priv'] as Map<String, dynamic>;
    final s = v['sender'] as Map<String, dynamic>;
    final skA = await createSenderKey(3,
        concatBytes([b64uDecode(p['sk_chain0'] as String), b64uDecode(p['sk_signpriv'] as String)]));
    final skB = importSenderKey(
        b64uDecode(p['sk_chain0'] as String),
        await ed25519Public(b64uDecode(p['sk_signpriv'] as String)),
        3);
    String wire(SenderMessage g) => '${g.gen}.${g.n}.${b64uEncode(g.iv)}.${b64uEncode(g.ct)}.${b64uEncode(g.sig)}';
    String want(Map<String, dynamic> g) => '${g['gen']}.${g['n']}.${g['iv']}.${g['ct']}.${g['sig']}';
    final g1 = await senderEncrypt(skA, 'alice', utf8Encode('group hello (1)'), ivOverride: seed(55, 12));
    final g2 = await senderEncrypt(skA, 'alice', utf8Encode('group hello (2)'), ivOverride: seed(66, 12));
    final g3 = await senderEncrypt(skA, 'alice', utf8Encode('group hello (3)'), ivOverride: seed(77, 12));
    expect(wire(g1), want(s['g1'] as Map<String, dynamic>));
    expect(wire(g2), want(s['g2'] as Map<String, dynamic>));
    expect(wire(g3), want(s['g3'] as Map<String, dynamic>));
    expect(utf8Decode(await senderDecrypt(skB, 'alice', g1)), s['gd1']);
    expect(utf8Decode(await senderDecrypt(skB, 'alice', g3)), s['gd3']);
    expect(utf8Decode(await senderDecrypt(skB, 'alice', g2)), s['gd2']);
    expect(encodeSenderMessage(g1), s['wire_g1']);
  });

  test('E4: backup blob round-trips; wrong passphrase fails', () async {
    final b = v['backup'] as Map<String, dynamic>;
    final blob = BackupBlob.fromJson(b['blob'] as Map<String, dynamic>);
    expect(await decryptBackup('correct horse 99!', blob), b['restored']);
    await expectLater(decryptBackup('wrong passphrase!!', blob), throwsA(anything));
  });

  test('E4: envelopes decode and reject junk', () {
    final e = v['envelopes'] as Map<String, dynamic>;
    expect(decodeEnvelope(e['prekey'] as String).type, 'prekey');
    expect(decodeEnvelope(e['msg'] as String).type, 'msg');
    expect(decodeEnvelope(e['sk'] as String).type, 'sk');
    expect(() => decodeEnvelope('{"v":2,"type":"msg"}'), throwsA(anything));
    expect(() => decodeEnvelope('{"v":1,"type":"nope"}'), throwsA(anything));
  });
}

Uint8List Function(int) _counterRandom() {
  var counter = 1;
  return (n) {
    final out = Uint8List(n);
    for (var i = 0; i < n; i++) {
      out[i] = (counter + i) & 0xff;
    }
    counter += n;
    return out;
  };
}

