// E5: generate scripts/fixtures/e2ee_app_vectors.json — ciphertexts minted
// by the DART stack for the TS stack to decrypt (app -> web interop).
// Usage: cd mobile/flutter_app && dart run tool/gen_app_vectors.dart
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:luno_messenger/e2ee/codec.dart';
import 'package:luno_messenger/e2ee/envelope.dart';
import 'package:luno_messenger/e2ee/ratchet.dart';
import 'package:luno_messenger/e2ee/x3dh.dart';

Uint8List seed(int from, int n) {
  final out = Uint8List(n);
  for (var i = 0; i < n; i++) {
    out[i] = (from + i) & 0xff;
  }
  return out;
}

Future<void> main() async {
  final v = jsonDecode(File('../../scripts/fixtures/e2ee_vectors.json').readAsStringSync())
      as Map<String, dynamic>;
  final p = v['_priv'] as Map<String, dynamic>;
  final ids = v['identities'] as Map<String, dynamic>;
  final aliceX = b64uDecode(p['alice_x'] as String);
  final aliceIdentity = ids['alice'] as String;
  final bobX = b64uDecode((ids['bob'] as String).split('.')[0]);
  final bobSpkPub = b64uDecode(ids['bob_spk_pub'] as String);
  final bobOpkPub = b64uDecode(ids['bob_opk_pub'] as String);
  // Fresh fixed ephemeral (different from the TS generator's) + fixed IVs.
  final init = await x3dhInitiate(
      aliceX,
      TheirBundle(identityX: bobX, signedPrekey: bobSpkPub, oneTimePrekey: bobOpkPub),
      seed(900, 32));
  var st = await ratchetInitInitiator(init.sharedSecret, bobSpkPub, seed(932, 32));
  final pt1 = utf8Encode('dart says hello (cross-1)');
  final pt2 = utf8Encode('dart second statement (cross-2)');
  final m1 = await ratchetEncrypt(st, pt1, ivOverride: seed(964, 12));
  final m2 = await ratchetEncrypt(st, pt2, ivOverride: seed(976, 12));
  String wire(RatchetMessage m) =>
      '${encodeRatchetHeader(m.header)}.${b64uEncode(m.iv)}.${b64uEncode(m.ct)}';
  final out = {
    'v': 1,
    'note': 'Minted by the Dart stack; the TS stack must decrypt every payload (E5 app -> web).',
    'alice_identity': aliceIdentity,
    'eph': b64uEncode(init.ephemeralPub),
    'spk': ids['bob_spk_pub'],
    'opk': b64uEncode(bobOpkPub),
    'm1': wire(m1).split('.'),
    'm2': wire(m2).split('.'),
    'pt1': 'dart says hello (cross-1)',
    'pt2': 'dart second statement (cross-2)',
    'prekey': {
      'v': 1,
      'type': 'prekey',
      'ik': aliceIdentity,
      'ek': b64uEncode(init.ephemeralPub),
      'spkId': null,
      'opkId': b64uEncode(bobOpkPub),
      'spk': ids['bob_spk_pub'],
      'header': encodeRatchetHeader(m1.header),
      'iv': b64uEncode(m1.iv),
      'ct': b64uEncode(m1.ct),
    },
    'msg': {
      'v': 1,
      'type': 'msg',
      'header': encodeRatchetHeader(m2.header),
      'iv': b64uEncode(m2.iv),
      'ct': b64uEncode(m2.ct),
    },
  };
  // Sanity: our own envelopes must parse.
  decodeEnvelope(jsonEncode(out['prekey']));
  decodeEnvelope(jsonEncode(out['msg']));
  File('../../scripts/fixtures/e2ee_app_vectors.json')
      .writeAsStringSync('${jsonEncode(out)}\n');
  // ignore: avoid_print
  print('wrote scripts/fixtures/e2ee_app_vectors.json');
}
