// E4: Sender Keys. Mirrors apps/shared/e2ee/sender.ts step for step.
import 'dart:convert';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

import 'codec.dart';
import 'keys.dart';

const senderJumpCap = 200;

final _zeroSalt = Uint8List(32);

class SenderKey {
  Uint8List chain;
  final Uint8List? signPriv;
  final Uint8List signPub;
  final int gen;
  int n;
  final List<SkippedSenderKey> skipped;
  SenderKey({required this.chain, required this.signPriv, required this.signPub, required this.gen, required this.n, List<SkippedSenderKey>? skipped})
      : skipped = skipped ?? [];
}

class SkippedSenderKey {
  final int n;
  final String mk;
  const SkippedSenderKey({required this.n, required this.mk});
}

Future<SenderKey> createSenderKey(int gen, [Uint8List? seed64]) async {
  final chain = seed64 != null
      ? Uint8List.fromList(seed64.sublist(0, 32))
      : randomBytes(32);
  final signPriv = seed64 != null
      ? Uint8List.fromList(seed64.sublist(32, 64))
      : randomBytes(32);
  final pair = await Ed25519().newKeyPairFromSeed(signPriv);
  final pub = Uint8List.fromList((await pair.extractPublicKey()).bytes);
  return SenderKey(
      chain: chain, signPriv: signPriv, signPub: pub, gen: gen, n: 0);
}

SenderKey importSenderKey(Uint8List chain, Uint8List signPub, int gen) {
  return SenderKey(
      chain: Uint8List.fromList(chain),
      signPriv: null,
      signPub: Uint8List.fromList(signPub),
      gen: gen,
      n: 0);
}

Future<({Uint8List chain, Uint8List msgKey})> _stepChain(Uint8List chain) async {
  return (
    chain: await hkdfSha256(chain, _zeroSalt, infoSkChain, 32),
    msgKey: await hkdfSha256(chain, _zeroSalt, infoSkMsg, 32),
  );
}

class SenderMessage {
  final int gen;
  final int n;
  final Uint8List iv;
  final Uint8List ct;
  final Uint8List sig;
  const SenderMessage({required this.gen, required this.n, required this.iv, required this.ct, required this.sig});
}

Uint8List _senderAad(String senderId, int gen, int n) =>
    concatBytes([utf8Encode(senderId), utf8Encode('|$gen|$n|')]);

Future<SenderMessage> senderEncrypt(
    SenderKey sk, String senderId, Uint8List plaintext,
    {Uint8List? ivOverride}) async {
  if (sk.signPriv == null) throw StateError('cannot send with an imported key');
  final r = await _stepChain(sk.chain);
  sk.chain = r.chain;
  final n = sk.n;
  final iv = ivOverride ?? randomBytes(12);
  final aad = _senderAad(senderId, sk.gen, n);
  final ct = await aesGcmEncrypt(r.msgKey, iv, plaintext, aad: aad);
  final pair = SimpleKeyPairData(
    sk.signPriv!,
    publicKey: SimplePublicKey(sk.signPub, type: KeyPairType.ed25519),
    type: KeyPairType.ed25519,
  );
  final sig = await Ed25519().sign(concatBytes([aad, iv, ct]), keyPair: pair);
  sk.n += 1;
  return SenderMessage(gen: sk.gen, n: n, iv: iv, ct: ct, sig: Uint8List.fromList(sig.bytes));
}

Future<Uint8List> senderDecrypt(
    SenderKey sk, String senderId, SenderMessage msg) async {
  if (msg.gen != sk.gen) throw StateError('sender key generation mismatch');
  final aad = _senderAad(senderId, msg.gen, msg.n);
  final ok = await Ed25519().verify(concatBytes([aad, msg.iv, msg.ct]),
      signature: Signature(msg.sig,
          publicKey: SimplePublicKey(sk.signPub, type: KeyPairType.ed25519)));
  if (!ok) throw StateError('bad sender signature');
  final held = sk.skipped.indexWhere((s) => s.n == msg.n);
  if (held >= 0) {
    final found = sk.skipped.removeAt(held);
    return aesGcmDecrypt(b64uDecode(found.mk), msg.iv, msg.ct, aad: aad);
  }
  if (msg.n < sk.n) throw StateError('replayed sender message');
  if (msg.n - sk.n > senderJumpCap) throw StateError('sender jump too far');
  while (sk.n < msg.n) {
    final r = await _stepChain(sk.chain);
    sk.chain = r.chain;
    sk.skipped.add(SkippedSenderKey(n: sk.n, mk: b64uEncode(r.msgKey)));
    while (sk.skipped.length > 50) {
      sk.skipped.removeAt(0);
    }
    sk.n += 1;
  }
  final r = await _stepChain(sk.chain);
  sk.chain = r.chain;
  sk.n += 1;
  return aesGcmDecrypt(r.msgKey, msg.iv, msg.ct, aad: aad);
}

String encodeSenderMessage(SenderMessage m) => jsonEncode({
      'v': 1,
      'type': 'group',
      'gen': m.gen,
      'n': m.n,
      'iv': b64uEncode(m.iv),
      'ct': b64uEncode(m.ct),
      'sig': b64uEncode(m.sig),
    });

SenderMessage decodeSenderMessage(String s) {
  final o = jsonDecode(s) as Map<String, dynamic>;
  if (o['v'] != 1 || o['type'] != 'group') throw StateError('bad sender envelope');
  return SenderMessage(
    gen: o['gen'] as int,
    n: o['n'] as int,
    iv: b64uDecode(o['iv'] as String),
    ct: b64uDecode(o['ct'] as String),
    sig: b64uDecode(o['sig'] as String),
  );
}
