// E5: app E2EE session store. Mirrors apps/user-web/src/e2ee/store.ts —
// same fanout format, rotation rules, and refusal codes.
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'codec.dart';
import 'envelope.dart';
import 'keys.dart';
import 'ratchet.dart' as dr;
import 'x3dh.dart';

export 'backup.dart' show BackupBlob;

abstract class KeyValue {
  Future<String?> get(String k);
  Future<void> set(String k, String v);
  Future<void> del(String k);
}

class MemoryKV implements KeyValue {
  final Map<String, String> m = {};
  @override
  Future<String?> get(String k) async => m[k];
  @override
  Future<void> set(String k, String v) async {
    m[k] = v;
  }
  @override
  Future<void> del(String k) async {
    m.remove(k);
  }
}

class SecureKV implements KeyValue {
  final FlutterSecureStorage _s;
  SecureKV([FlutterSecureStorage? s]) : _s = s ?? const FlutterSecureStorage();
  @override
  Future<String?> get(String k) => _s.read(key: k);
  @override
  Future<void> set(String k, String v) => _s.write(key: k, value: v);
  @override
  Future<void> del(String k) => _s.delete(key: k);
  Future<void> clearUser(String userId, String deviceId) async {
    final all = await _s.readAll();
    final prefix = 'e2ee:$userId:$deviceId:';
    for (final k in all.keys) {
      if (k.startsWith(prefix)) await _s.delete(key: k);
    }
  }
}

typedef ApiFn = Future<dynamic> Function(String path, [String? method, Object? body]);

class RoomRef {
  final String id;
  final String kind;
  final List<String> memberIds;
  final bool e2ee;
  const RoomRef({required this.id, required this.kind, required this.memberIds, required this.e2ee});
}

class InnerMessage {
  final String kind;
  final String body;
  final Map<String, dynamic>? meta;
  const InnerMessage({required this.kind, required this.body, this.meta});
}

class _SessionRecord {
  final String ratchet;
  final String peerIdentity;
  final String peerDevice;
  final String? eph;
  final String? opkPub;
  const _SessionRecord({required this.ratchet, required this.peerIdentity, required this.peerDevice, required this.eph, required this.opkPub});
  Map<String, dynamic> toJson() => {'ratchet': ratchet, 'peerIdentity': peerIdentity, 'peerDevice': peerDevice, 'eph': eph, 'opkPub': opkPub};
  factory _SessionRecord.fromJson(Map<String, dynamic> j) => _SessionRecord(
      ratchet: j['ratchet'] as String, peerIdentity: j['peerIdentity'] as String, peerDevice: j['peerDevice'] as String, eph: j['eph'] as String?, opkPub: j['opkPub'] as String?);
}

class _SpkEntry {
  final int id;
  final String priv;
  final String pub;
  final String sig;
  final int ts;
  const _SpkEntry({required this.id, required this.priv, required this.pub, required this.sig, required this.ts});
  Map<String, dynamic> toJson() => {'id': id, 'priv': priv, 'pub': pub, 'sig': sig, 'ts': ts};
  factory _SpkEntry.fromJson(Map<String, dynamic> j) => _SpkEntry(
      id: j['id'] as int, priv: j['priv'] as String, pub: j['pub'] as String, sig: j['sig'] as String, ts: j['ts'] as int);
}

const _opkBatch = 20;
const _opkTopupAfter = 10;
const _spkRotateMs = 7 * 86400 * 1000;
const _spkKeep = 5;

class E2eeStore {
  final KeyValue kv;
  final ApiFn api;
  final String userId;
  final String deviceId;
  bool _ready = false;
  IdentityKeys? _identity;
  List<_SpkEntry> _spks = [];
  Map<String, String> _opkPrivs = {};
  int _opkUsedSincePut = 0;

  E2eeStore({required this.kv, required this.api, required this.userId, required this.deviceId});

  String _k(List<String> parts) => ['e2ee', userId, deviceId, ...parts].join(':');

  Future<void> ready() async {
    if (_ready) return;
    final rawId = await kv.get(_k(['identity']));
    if (rawId != null) {
      final o = jsonDecode(rawId) as Map<String, dynamic>;
      _identity = IdentityKeys(
        xPriv: b64uDecode(o['xPriv'] as String), xPub: b64uDecode(o['xPub'] as String),
        edPriv: b64uDecode(o['edPriv'] as String), edPub: b64uDecode(o['edPub'] as String));
      _spks = ((jsonDecode(await kv.get(_k(['spks'])) ?? '[]') as List)
          .map((e) => _SpkEntry.fromJson(e as Map<String, dynamic>))).toList();
      _opkPrivs = Map<String, String>.from(jsonDecode(await kv.get(_k(['opks'])) ?? '{}') as Map);
      _opkUsedSincePut = int.tryParse(await kv.get(_k(['opkUsed'])) ?? '0') ?? 0;
    } else {
      _identity = await generateIdentity();
      _spks = [];
      _opkPrivs = {};
      await _persistKeys();
    }
    final newest = _spks.isNotEmpty ? _spks.last : null;
    if (newest == null ||
        DateTime.now().millisecondsSinceEpoch - newest.ts > _spkRotateMs ||
        _opkPrivs.isEmpty ||
        _opkUsedSincePut >= _opkTopupAfter) {
      await publishBundle();
    }
    _ready = true;
  }

  Future<void> _persistKeys() async {
    final id = _identity!;
    await kv.set(_k(['identity']), jsonEncode({
      'xPriv': b64uEncode(id.xPriv), 'xPub': b64uEncode(id.xPub),
      'edPriv': b64uEncode(id.edPriv), 'edPub': b64uEncode(id.edPub),
    }));
    await kv.set(_k(['spks']), jsonEncode(_spks.map((s) => s.toJson()).toList()));
    await kv.set(_k(['opks']), jsonEncode(_opkPrivs));
    await kv.set(_k(['opkUsed']), '$_opkUsedSincePut');
  }

  Future<void> publishBundle() async {
    final id = _identity!;
    var spk = _spks.isNotEmpty ? _spks.last : null;
    if (spk == null || DateTime.now().millisecondsSinceEpoch - spk.ts > _spkRotateMs) {
      final nextId = spk != null ? spk.id + 1 : 1;
      final gen = await generateSignedPrekey(id, nextId);
      spk = _SpkEntry(
          id: nextId, priv: b64uEncode(gen.priv), pub: b64uEncode(gen.pub), sig: b64uEncode(gen.sig), ts: DateTime.now().millisecondsSinceEpoch);
      _spks.add(spk);
      while (_spks.length > _spkKeep) {
        _spks.removeAt(0);
      }
    }
    final freshOpks = <String>[];
    for (var i = 0; i < _opkBatch; i++) {
      final priv = randomBytes(32);
      final pubB = b64uEncode(await x25519Public(priv));
      _opkPrivs[pubB] = b64uEncode(priv);
      freshOpks.add(pubB);
    }
    final privKeys = _opkPrivs.keys.toList();
    while (privKeys.length > 500) {
      _opkPrivs.remove(privKeys.removeAt(0));
    }
    _opkUsedSincePut = 0;
    await _persistKeys();
    await api('devices/$deviceId/keys', 'PUT', {
      'identity_key': encodeIdentity(id),
      'signed_prekey': spk.pub,
      'prekey_sig': spk.sig,
      'one_time_prekeys': freshOpks,
    });
  }

  Future<_SessionRecord?> _loadSession(String peerUser, String peerDevice) async {
    final raw = await kv.get(_k(['sess', peerUser, peerDevice]));
    return raw == null ? null : _SessionRecord.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  Future<void> _saveSession(String peerUser, String peerDevice, _SessionRecord rec) async {
    await kv.set(_k(['sess', peerUser, peerDevice]), jsonEncode(rec.toJson()));
  }

  Future<List<Map<String, dynamic>>> _fetchBundles(String uid) async {
    final res = await api('users/$uid/keys?all=1') as Map<String, dynamic>;
    return ((res['devices'] ?? []) as List).cast<Map<String, dynamic>>();
  }

  Future<({dr.RatchetState st, bool fresh, String? eph})> _sessionFor(Map<String, dynamic> b) async {
    final rec = await _loadSession(b['user_id'] as String, b['device_id'] as String);
    if (rec != null) {
      return (st: dr.deserializeRatchet(rec.ratchet), fresh: false, eph: null);
    }
    final sig = b['prekey_sig'] as String? ?? '';
    if (sig.isNotEmpty &&
        !await verifyPrekeySig(b['identity_key'] as String, b64uDecode(b['signed_prekey'] as String), b64uDecode(sig))) {
      throw StateError('bad bundle signature');
    }
    final their = parseIdentity(b['identity_key'] as String);
    if (their == null) throw StateError('bad bundle identity');
    final id = _identity!;
    final init = await x3dhInitiate(
        id.xPriv,
        TheirBundle(
            identityX: their.x,
            signedPrekey: b64uDecode(b['signed_prekey'] as String),
            oneTimePrekey: b['one_time_prekey'] != null ? b64uDecode(b['one_time_prekey'] as String) : null));
    final st = await dr.ratchetInitInitiator(init.sharedSecret, b64uDecode(b['signed_prekey'] as String));
    final eph = b64uEncode(init.ephemeralPub);
    await _saveSession(b['user_id'] as String, b['device_id'] as String, _SessionRecord(
      ratchet: dr.serializeRatchet(st),
      peerIdentity: b['identity_key'] as String,
      peerDevice: b['device_id'] as String,
      eph: eph,
      opkPub: b['one_time_prekey'] as String?,
    ));
    return (st: st, fresh: true, eph: eph);
  }

  Future<String> encryptRoom(RoomRef room, InnerMessage inner) async {
    await ready();
    if (room.kind == 'group') throw StateError('GROUP_E2EE_PENDING');
    final targets = room.memberIds.where((m) => m != userId).toSet()..add(userId); // own devices too (own history)
    final innerBytes = utf8Encode(jsonEncode({
      'kind': inner.kind, 'body': inner.body, if (inner.meta != null) 'meta': inner.meta,
    }));
    final msgs = <String, Map<String, dynamic>>{};
    for (final uid in targets) {
      final bundles = await _fetchBundles(uid);
      final perDevice = <String, dynamic>{};
      for (final b in bundles) {
        final s = await _sessionFor(b);
        final rec = (await _loadSession(uid, b['device_id'] as String))!;
        final ct = await dr.ratchetEncrypt(s.st, innerBytes);
        await _saveSession(uid, b['device_id'] as String, _SessionRecord(
          ratchet: dr.serializeRatchet(s.st), peerIdentity: rec.peerIdentity, peerDevice: rec.peerDevice, eph: rec.eph, opkPub: rec.opkPub));
        if (s.fresh) {
          perDevice[b['device_id'] as String] = {
            'v': 1, 'type': 'prekey',
            'ik': encodeIdentity(_identity!),
            'ek': s.eph,
            'spkId': null, 'opkId': rec.opkPub,
            'spk': b['signed_prekey'],
            'header': dr.encodeRatchetHeader(ct.header),
            'iv': b64uEncode(ct.iv), 'ct': b64uEncode(ct.ct),
          };
        } else {
          perDevice[b['device_id'] as String] = {
            'v': 1, 'type': 'msg',
            'header': dr.encodeRatchetHeader(ct.header),
            'iv': b64uEncode(ct.iv), 'ct': b64uEncode(ct.ct),
          };
        }
      }
      if (perDevice.isNotEmpty) msgs[uid] = perDevice;
    }
    return jsonEncode({
      'v': 1,
      'from': {'user': userId, 'device': deviceId},
      'msgs': msgs,
    });
  }

  Future<InnerMessage?> decryptBody(String senderId, String body) async {
    await ready();
    Map<String, dynamic> fan;
    try {
      fan = jsonDecode(body) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
    final msgs = fan['msgs'] as Map<String, dynamic>?;
    if (msgs == null) return null;
    final mine = (msgs[userId] as Map<String, dynamic>?)?[deviceId];
    if (mine == null) return null;
    CipherEnvelope env;
    try {
      env = decodeEnvelope(jsonEncode(mine));
    } catch (_) {
      return null;
    }
    final from = fan['from'] as Map<String, dynamic>?;
    final fromDevice = from?['device'] as String? ?? 'unknown';
    if (env is PrekeyEnvelope) {
      final their = parseIdentity(env.ik);
      if (their == null) return null;
      _SpkEntry? spk;
      for (final s in _spks) {
        if (s.pub == env.spk) spk = s;
      }
      spk ??= _spks.isNotEmpty ? _spks.last : null;
      if (spk == null) return null;
      Uint8List? opkPriv;
      if (env.opkId != null) {
        final hex = _opkPrivs[env.opkId];
        if (hex == null) return null;
        opkPriv = b64uDecode(hex);
        _opkUsedSincePut += 1;
        await _persistKeys();
        if (_opkUsedSincePut >= _opkTopupAfter) {
          await publishBundle();
        }
      }
      final sk = await x3dhRespond(_identity!.xPriv, b64uDecode(spk.priv), opkPriv, their.x, b64uDecode(env.ek));
      final st = await dr.ratchetInitResponder(sk, b64uDecode(spk.priv));
      final header = dr.decodeRatchetHeader(env.header);
      Uint8List pt;
      try {
        pt = await dr.ratchetDecrypt(st,
            dr.RatchetMessage(header: header, iv: b64uDecode(env.iv), ct: b64uDecode(env.ct)), b64uDecode(spk.priv));
      } catch (_) {
        return null;
      }
      await _saveSession(senderId, fromDevice, _SessionRecord(
        ratchet: dr.serializeRatchet(st), peerIdentity: env.ik, peerDevice: fromDevice, eph: null, opkPub: null));
      try {
        final inner = jsonDecode(utf8Decode(pt)) as Map<String, dynamic>;
        return InnerMessage(kind: inner['kind'] as String, body: inner['body'] as String, meta: inner['meta'] as Map<String, dynamic>?);
      } catch (_) {
        return null;
      }
    }
    if (env is! MsgEnvelope) return null;
    final existing = await _loadSession(senderId, fromDevice);
    if (existing == null) return null;
    try {
      final st = dr.deserializeRatchet(existing.ratchet);
      final header = dr.decodeRatchetHeader(env.header);
      final pt = await dr.ratchetDecrypt(st,
          dr.RatchetMessage(header: header, iv: b64uDecode(env.iv), ct: b64uDecode(env.ct)), null);
      await _saveSession(senderId, fromDevice, _SessionRecord(
        ratchet: dr.serializeRatchet(st), peerIdentity: existing.peerIdentity, peerDevice: existing.peerDevice, eph: existing.eph, opkPub: existing.opkPub));
      final inner = jsonDecode(utf8Decode(pt)) as Map<String, dynamic>;
      return InnerMessage(kind: inner['kind'] as String, body: inner['body'] as String, meta: inner['meta'] as Map<String, dynamic>?);
    } catch (_) {
      return null;
    }
  }

  Future<void> wipe() async {
    try {
      await api('devices/$deviceId/keys', 'DELETE');
    } catch (_) { /* already gone */ }
    for (final k in ['identity', 'spks', 'opks', 'opkUsed']) {
      await kv.del(_k([k]));
    }
    _ready = false;
    _identity = null;
  }
}
