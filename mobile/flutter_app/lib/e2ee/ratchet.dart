// E4: Double Ratchet. Mirrors apps/shared/e2ee/ratchet.ts step for step.
import 'dart:convert';
import 'dart:typed_data';

import 'codec.dart';
import 'keys.dart';

const ratchetJumpCap = 200;
const ratchetSkippedCap = 200;

final _zeroSalt = Uint8List(32);

Future<({Uint8List root, Uint8List chain})> _kdfRoot(
    Uint8List rk, Uint8List dhOut) async {
  final out = await hkdfSha256(concatBytes([rk, dhOut]), _zeroSalt, infoRoot, 64);
  return (root: out.sublist(0, 32), chain: out.sublist(32, 64));
}

Future<({Uint8List chain, Uint8List msgKey})> _kdfChain(Uint8List ck) async {
  return (
    chain: await hkdfSha256(ck, _zeroSalt, infoChain, 32),
    msgKey: await hkdfSha256(ck, _zeroSalt, infoMsg, 32),
  );
}

class RatchetHeader {
  final Uint8List dh;
  final int n;
  final int pn;
  const RatchetHeader({required this.dh, required this.n, required this.pn});
}

class RatchetMessage {
  final RatchetHeader header;
  final Uint8List iv;
  final Uint8List ct;
  const RatchetMessage({required this.header, required this.iv, required this.ct});
}

class SkippedKey {
  final String dhHex;
  final int n;
  final String mk;
  const SkippedKey({required this.dhHex, required this.n, required this.mk});
}

class RatchetState {
  Uint8List root;
  Uint8List? sendChain;
  Uint8List? recvChain;
  Uint8List sendRatchetPriv;
  Uint8List sendRatchetPub;
  Uint8List? recvRatchetPub;
  int sendN;
  int recvN;
  int prevSendLen;
  final List<SkippedKey> skipped;
  RatchetState({
    required this.root,
    required this.sendChain,
    required this.recvChain,
    required this.sendRatchetPriv,
    required this.sendRatchetPub,
    required this.recvRatchetPub,
    required this.sendN,
    required this.recvN,
    required this.prevSendLen,
    List<SkippedKey>? skipped,
  }) : skipped = skipped ?? [];
}

String _hex(Uint8List b) =>
    b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();

Uint8List Function(int)? _testRandom;

void setTestRandom(Uint8List Function(int)? f) {
  _testRandom = f;
}

Uint8List _rnd(int n) => _testRandom != null ? _testRandom!(n) : randomBytes(n);

Future<RatchetState> ratchetInitInitiator(
    Uint8List sharedSecret, Uint8List theirSpk,
    [Uint8List? ratchetSeed]) async {
  final priv = ratchetSeed ?? randomBytes(32);
  final pub = await x25519Public(priv);
  final r = await _kdfRoot(sharedSecret, await x25519Shared(priv, theirSpk));
  return RatchetState(
    root: r.root, sendChain: r.chain, recvChain: null,
    sendRatchetPriv: priv, sendRatchetPub: pub, recvRatchetPub: null,
    sendN: 0, recvN: 0, prevSendLen: 0,
  );
}

Future<RatchetState> ratchetInitResponder(
    Uint8List sharedSecret, Uint8List ownSpkPriv) async {
  final priv = _rnd(32);
  return RatchetState(
    root: sharedSecret, sendChain: null, recvChain: null,
    sendRatchetPriv: priv, sendRatchetPub: await x25519Public(priv),
    recvRatchetPub: null, sendN: 0, recvN: 0, prevSendLen: 0,
  );
}

Future<void> _skipRecv(RatchetState st, int untilN) async {
  final recv = st.recvChain;
  if (recv == null) throw StateError('no receiving chain');
  var chain = recv;
  while (st.recvN < untilN) {
    final r = await _kdfChain(chain);
    chain = r.chain;
    if (st.recvRatchetPub != null) {
      st.skipped.add(SkippedKey(
          dhHex: _hex(st.recvRatchetPub!), n: st.recvN, mk: b64uEncode(r.msgKey)));
      while (st.skipped.length > ratchetSkippedCap) {
        st.skipped.removeAt(0);
      }
    }
    st.recvN += 1;
  }
  st.recvChain = chain;
}

Future<void> _dhRatchetRecv(RatchetState st, Uint8List theirDh) async {
  st.prevSendLen = st.sendN;
  st.sendN = 0;
  st.recvN = 0;
  st.recvRatchetPub = theirDh;
  final r1 = await _kdfRoot(st.root, await x25519Shared(st.sendRatchetPriv, theirDh));
  st.root = r1.root;
  st.recvChain = r1.chain;
  st.sendRatchetPriv = _rnd(32);
  st.sendRatchetPub = await x25519Public(st.sendRatchetPriv);
  final r2 = await _kdfRoot(st.root, await x25519Shared(st.sendRatchetPriv, theirDh));
  st.root = r2.root;
  st.sendChain = r2.chain;
}

Future<RatchetMessage> ratchetEncrypt(RatchetState st, Uint8List plaintext,
    {Uint8List? aad, Uint8List? ivOverride}) async {
  if (st.sendChain == null) {
    if (st.recvRatchetPub == null) throw StateError('no sending chain yet');
    final priv = _rnd(32);
    final r = await _kdfRoot(st.root, await x25519Shared(priv, st.recvRatchetPub!));
    st.root = r.root;
    st.sendChain = r.chain;
    st.sendRatchetPriv = priv;
    st.sendRatchetPub = await x25519Public(priv);
    st.prevSendLen = 0;
    st.sendN = 0;
  }
  final r = await _kdfChain(st.sendChain!);
  st.sendChain = r.chain;
  final header = RatchetHeader(dh: st.sendRatchetPub, n: st.sendN, pn: st.prevSendLen);
  final iv = ivOverride ?? randomBytes(12);
  final ct = await aesGcmEncrypt(r.msgKey, iv, plaintext, aad: aad);
  st.sendN += 1;
  return RatchetMessage(header: header, iv: iv, ct: ct);
}

Future<Uint8List?> _trySkipped(
    RatchetState st, RatchetHeader header, Uint8List iv, Uint8List ct, Uint8List? aad) async {
  final h = _hex(header.dh);
  final at = st.skipped.indexWhere((s) => s.dhHex == h && s.n == header.n);
  if (at < 0) return null;
  final found = st.skipped.removeAt(at);
  try {
    return await aesGcmDecrypt(b64uDecode(found.mk), iv, ct, aad: aad);
  } catch (_) {
    return null;
  }
}

Future<Uint8List> ratchetDecrypt(RatchetState st, RatchetMessage msg,
    Uint8List? ownSpkPriv, {Uint8List? aad}) async {
  final skipped = await _trySkipped(st, msg.header, msg.iv, msg.ct, aad);
  if (skipped != null) return skipped;
  final sameChain =
      st.recvRatchetPub != null && u8eq(st.recvRatchetPub!, msg.header.dh);
  if (!sameChain) {
    if (msg.header.n > ratchetJumpCap || msg.header.pn > ratchetJumpCap) {
      throw StateError('ratchet jump too far');
    }
    if (st.recvChain == null && st.sendChain == null && ownSpkPriv != null && st.recvRatchetPub == null) {
      final r = await _kdfRoot(st.root, await x25519Shared(ownSpkPriv, msg.header.dh));
      st.root = r.root;
      st.recvChain = r.chain;
      st.recvRatchetPub = msg.header.dh;
    } else {
      await _dhRatchetRecv(st, msg.header.dh);
    }
  }
  await _skipRecv(st, msg.header.n);
  final recv = st.recvChain;
  if (recv == null) throw StateError('no receiving chain');
  final r = await _kdfChain(recv);
  st.recvChain = r.chain;
  st.recvN += 1;
  return aesGcmDecrypt(r.msgKey, msg.iv, msg.ct, aad: aad);
}

String encodeRatchetHeader(RatchetHeader h) =>
    b64uEncode(concatBytes([h.dh, u32be(h.pn), u32be(h.n)]));

RatchetHeader decodeRatchetHeader(String s) {
  final raw = b64uDecode(s);
  if (raw.length != 40) throw StateError('bad header');
  return RatchetHeader(
      dh: raw.sublist(0, 32), pn: u32beRead(raw, 32), n: u32beRead(raw, 36));
}

String serializeRatchet(RatchetState st) => jsonEncode({
      'root': b64uEncode(st.root),
      'sendChain': st.sendChain == null ? null : b64uEncode(st.sendChain!),
      'recvChain': st.recvChain == null ? null : b64uEncode(st.recvChain!),
      'sendRatchetPriv': b64uEncode(st.sendRatchetPriv),
      'sendRatchetPub': b64uEncode(st.sendRatchetPub),
      'recvRatchetPub':
          st.recvRatchetPub == null ? null : b64uEncode(st.recvRatchetPub!),
      'sendN': st.sendN,
      'recvN': st.recvN,
      'prevSendLen': st.prevSendLen,
      'skipped': st.skipped
          .map((s) => {'dhHex': s.dhHex, 'n': s.n, 'mk': s.mk})
          .toList(),
    });

RatchetState deserializeRatchet(String s) {
  final o = jsonDecode(s) as Map<String, dynamic>;
  Uint8List? opt(String? v) => v == null ? null : b64uDecode(v);
  return RatchetState(
    root: b64uDecode(o['root'] as String),
    sendChain: opt(o['sendChain'] as String?),
    recvChain: opt(o['recvChain'] as String?),
    sendRatchetPriv: b64uDecode(o['sendRatchetPriv'] as String),
    sendRatchetPub: b64uDecode(o['sendRatchetPub'] as String),
    recvRatchetPub: opt(o['recvRatchetPub'] as String?),
    sendN: o['sendN'] as int,
    recvN: o['recvN'] as int,
    prevSendLen: o['prevSendLen'] as int,
    skipped: ((o['skipped'] ?? []) as List).map((e) {
      final m = e as Map<String, dynamic>;
      return SkippedKey(dhHex: m['dhHex'] as String, n: m['n'] as int, mk: m['mk'] as String);
    }).toList(),
  );
}
