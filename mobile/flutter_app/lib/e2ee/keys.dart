// E4: identity + prekey management. Mirrors apps/shared/e2ee/keys.ts —
// same algorithms, info strings, and identity format.
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

import 'codec.dart';

const infoX3dh = 'LUNO-X3DH-v1';
const infoRoot = 'LUNO-Ratchet-Root-v1';
const infoChain = 'LUNO-Ratchet-Chain-v1';
const infoMsg = 'LUNO-Ratchet-Msg-v1';
const infoSkMsg = 'LUNO-SK-Msg-v1';
const infoSkChain = 'LUNO-SK-Chain-v1';

final _random = Random.secure();

Uint8List randomBytes(int n) {
  final out = Uint8List(n);
  for (var i = 0; i < n; i++) {
    out[i] = _random.nextInt(256);
  }
  return out;
}

Future<Uint8List> sha256Hash(Uint8List data) async {
  return Uint8List.fromList((await Sha256().hash(data)).bytes);
}

// E9: safety number — both Ed25519 identity pubs sorted, SHA-256, the
// first 30 bytes as 60 decimal digits, rendered 20 per line.
Future<String> safetyNumberDigits(Uint8List edA, Uint8List edB) async {
  var cmp = 0;
  final n = edA.length < edB.length ? edA.length : edB.length;
  for (var i = 0; i < n; i++) {
    if (edA[i] != edB[i]) {
      cmp = edA[i] < edB[i] ? -1 : 1;
      break;
    }
  }
  if (cmp == 0) cmp = edA.length <= edB.length ? -1 : 1;
  final cat = Uint8List(edA.length + edB.length);
  final first = cmp <= 0 ? edA : edB;
  final second = cmp <= 0 ? edB : edA;
  cat.setAll(0, first);
  cat.setAll(first.length, second);
  final h = await sha256Hash(cat);
  final out = StringBuffer();
  for (var i = 0; i < 30; i++) {
    out.write((h[i] % 100).toString().padLeft(2, '0'));
  }
  return out.toString();
}

List<String> formatSafetyNumber(String digits) {
  final lines = <String>[];
  for (var i = 0; i < 3; i++) {
    final seg = digits.length >= (i + 1) * 20
        ? digits.substring(i * 20, (i + 1) * 20)
        : digits.substring(i * 20);
    final groups = <String>[];
    for (var o = 0; o < seg.length; o += 4) {
      groups.add(seg.substring(o, o + 4 <= seg.length ? o + 4 : seg.length));
    }
    lines.add(groups.join(' '));
  }
  return lines;
}

Future<Uint8List> hkdfSha256(
    Uint8List ikm, Uint8List salt, Object info, int length) async {
  final infoBytes =
      info is String ? utf8Encode(info) : (info as Uint8List);
  final out = await Hkdf(hmac: Hmac.sha256(), outputLength: length).deriveKey(
    secretKey: SecretKeyData(ikm),
    info: infoBytes,
    nonce: salt,
  );
  return Uint8List.fromList(await out.extractBytes());
}

Future<Uint8List> aesGcmEncrypt(
    Uint8List key, Uint8List iv, Uint8List plaintext,
    {Uint8List? aad}) async {
  final box = await AesGcm.with256bits().encrypt(
    plaintext,
    secretKey: SecretKeyData(key),
    nonce: iv,
    aad: aad ?? const <int>[],
  );
  return concatBytes([Uint8List.fromList(box.cipherText), Uint8List.fromList(box.mac.bytes)]);
}

Future<Uint8List> aesGcmDecrypt(
    Uint8List key, Uint8List iv, Uint8List ciphertext,
    {Uint8List? aad}) async {
  if (ciphertext.length < 16) throw StateError('ciphertext too short');
  final box = SecretBox(
    ciphertext.sublist(0, ciphertext.length - 16),
    nonce: iv,
    mac: Mac(ciphertext.sublist(ciphertext.length - 16)),
  );
  return Uint8List.fromList(await AesGcm.with256bits().decrypt(
    box,
    secretKey: SecretKeyData(key),
    aad: aad ?? const <int>[],
  ));
}

class IdentityKeys {
  final Uint8List xPriv;
  final Uint8List xPub;
  final Uint8List edPriv;
  final Uint8List edPub;
  const IdentityKeys({required this.xPriv, required this.xPub, required this.edPriv, required this.edPub});
}

Future<IdentityKeys> generateIdentity([Uint8List? seed64]) async {
  final Uint8List xPriv;
  if (seed64 != null) {
    xPriv = Uint8List.fromList(seed64.sublist(0, 32));
  } else {
    final pair = await X25519().newKeyPair();
    xPriv = Uint8List.fromList(await pair.extractPrivateKeyBytes());
  }
  final edSeed = seed64 != null
      ? Uint8List.fromList(seed64.sublist(32, 64))
      : null;
  final xPair = await X25519().newKeyPairFromSeed(xPriv);
  final xPub = Uint8List.fromList((await xPair.extractPublicKey()).bytes);
  final edPair = edSeed != null
      ? await Ed25519().newKeyPairFromSeed(edSeed)
      : await Ed25519().newKeyPair();
  final edPub = Uint8List.fromList((await edPair.extractPublicKey()).bytes);
  final edPrivOut = edSeed ??
      Uint8List.fromList(await edPair.extractPrivateKeyBytes());
  return IdentityKeys(xPriv: xPriv, xPub: xPub, edPriv: edPrivOut, edPub: edPub);
}

String encodeIdentity(IdentityKeys id) =>
    '${b64uEncode(id.xPub)}.${b64uEncode(id.edPub)}';

class IdentityParts {
  final Uint8List x;
  final Uint8List ed;
  const IdentityParts(this.x, this.ed);
}

IdentityParts? parseIdentity(String s) {
  final parts = s.split('.');
  if (parts.length != 2) return null;
  try {
    final x = b64uDecode(parts[0]);
    final ed = b64uDecode(parts[1]);
    if (x.length != 32 || ed.length != 32) return null;
    return IdentityParts(x, ed);
  } catch (_) {
    return null;
  }
}

class SignedPrekey {
  final int id;
  final Uint8List priv;
  final Uint8List pub;
  final Uint8List sig;
  const SignedPrekey({required this.id, required this.priv, required this.pub, required this.sig});
}

Future<SignedPrekey> generateSignedPrekey(IdentityKeys id, int spkId,
    [Uint8List? seed]) async {
  final priv = seed ?? randomBytes(32);
  final pub = await x25519Public(priv);
  final pair = SimpleKeyPairData(
    id.edPriv,
    publicKey: SimplePublicKey(id.edPub, type: KeyPairType.ed25519),
    type: KeyPairType.ed25519,
  );
  final sig = await Ed25519().sign(pub, keyPair: pair);
  return SignedPrekey(id: spkId, priv: priv, pub: pub, sig: Uint8List.fromList(sig.bytes));
}

Future<bool> verifyPrekeySig(
    String identity, Uint8List spkPub, Uint8List sig) async {
  final id = parseIdentity(identity);
  if (id == null) return false;
  try {
    return await Ed25519().verify(spkPub,
        signature: Signature(sig,
            publicKey: SimplePublicKey(id.ed, type: KeyPairType.ed25519)));
  } catch (_) {
    return false;
  }
}

Future<Uint8List> x25519Public(Uint8List priv) async {
  final pair = await X25519().newKeyPairFromSeed(priv);
  return Uint8List.fromList((await pair.extractPublicKey()).bytes);
}

Future<Uint8List> ed25519Public(Uint8List seed) async {
  final pair = await Ed25519().newKeyPairFromSeed(seed);
  return Uint8List.fromList((await pair.extractPublicKey()).bytes);
}

Future<Uint8List> x25519Shared(Uint8List priv, Uint8List pub) async {
  final pair = SimpleKeyPairData(
    priv,
    publicKey: SimplePublicKey(Uint8List(32), type: KeyPairType.x25519),
    type: KeyPairType.x25519,
  );
  final out = await X25519().sharedSecretKey(
    keyPair: pair,
    remotePublicKey: SimplePublicKey(pub, type: KeyPairType.x25519),
  );
  return Uint8List.fromList(await out.extractBytes());
}
