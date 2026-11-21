// E5: app E2EE session store. Mirrors apps/user-web/src/e2ee/store.ts —
// same fanout format, rotation rules, and refusal codes.
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'codec.dart';
import 'envelope.dart';
import 'keys.dart';
import 'ratchet.dart' as dr;
import 'sender.dart';
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
    await _addIdx('sessIdx', jsonEncode([peerUser, peerDevice]));
  }

  // E9: explicit indexes (the KV has no listing) drive backup export
  // and complete logout wipes.
  Future<List<String>> _loadIdx(String name) async {
    try {
      final v = jsonDecode(await kv.get(_k([name])) ?? '[]') as List;
      return v.whereType<String>().toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _addIdx(String name, String entry) async {
    final cur = await _loadIdx(name);
    if (!cur.contains(entry)) {
      cur.add(entry);
      await kv.set(_k([name]), jsonEncode(cur));
    }
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
    // E6: groups use sender keys; 1:1/Keep rooms use pairwise fanout.
    if (room.kind == 'group') {
      return encryptGroup(room, inner);
    }
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
    Map<String, dynamic> parsed;
    try {
      parsed = jsonDecode(body) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
    // E6: group sender-key message.
    if (parsed['type'] == 'groupmsg') {
      return decryptGroup(senderId, parsed);
    }
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

  Future<Map<String, dynamic>?> _loadOwnSenderKey(String roomId) async {
    final raw = await kv.get(_k(['skown', roomId]));
    return raw == null ? null : jsonDecode(raw) as Map<String, dynamic>;
  }

  Future<void> _saveOwnSenderKey(
      String roomId, Map<String, dynamic> rec) async {
    await kv.set(_k(['skown', roomId]), jsonEncode(rec));
    await _addIdx('skownIdx', roomId);
  }

  Future<Map<String, dynamic>?> _loadPeerSenderKey(
      String roomId, String senderId, int gen) async {
    final raw = await kv.get(_k(['skin', roomId, senderId, '$gen']));
    return raw == null ? null : jsonDecode(raw) as Map<String, dynamic>;
  }

  Future<void> _savePeerSenderKey(String roomId, String senderId, int gen,
      Map<String, dynamic> rec) async {
    await kv.set(_k(['skin', roomId, senderId, '$gen']),
        jsonEncode({...rec, 'gen': gen}));
    await _addIdx('skinIdx', jsonEncode([roomId, senderId, gen]));
  }

  Future<Map<String, dynamic>> _ensureSenderKey(RoomRef room) async {
    var rec = await _loadOwnSenderKey(room.id);
    final members = room.memberIds.toSet().toList()..sort();
    final cached =
        ((rec?['members'] ?? []) as List).map((e) => '$e').toList();
    final left = cached.where((m) => !members.contains(m)).toList();
    if (rec == null ||
        (rec['chain'] as String? ?? '').isEmpty ||
        left.isNotEmpty) {
      final sk = await createSenderKey((rec?['gen'] as int? ?? 0) + 1);
      rec = {
        'gen': (rec?['gen'] as int? ?? 0) + 1,
        'chain': b64uEncode(sk.chain),
        'signPriv': b64uEncode(sk.signPriv!),
        'signPub': b64uEncode(sk.signPub),
        'n': 0,
        'dealt': <String, dynamic>{},
        'members': members,
      };
    }
    final dealt = Map<String, dynamic>.from(rec['dealt'] as Map? ?? {});
    for (final uid in members) {
      if (uid == userId) continue;
      if (dealt[uid] == rec['gen']) continue;
      await _dealSenderKey(room.id, uid, rec);
      dealt[uid] = rec['gen'];
    }
    rec['dealt'] = dealt;
    rec['members'] = members;
    await _saveOwnSenderKey(room.id, rec);
    return rec;
  }

  Future<void> _dealSenderKey(
      String roomId, String toUser, Map<String, dynamic> rec) async {
    final res = await api('users/$toUser/keys?all=1') as Map<String, dynamic>;
    final bundles = ((res['devices'] ?? []) as List).cast<Map<String, dynamic>>();
    final envelopes = <String, dynamic>{};
    for (final b in bundles) {
      final s = await _sessionFor(b);
      final saved = (await _loadSession(
          toUser, b['device_id'] as String))!;
      final ct = await dr.ratchetEncrypt(
          s.st,
          utf8Encode(jsonEncode({
            'kind': 'sk',
            'body': '',
            'meta': {
              'room': roomId,
              'gen': rec['gen'],
              'chain': rec['chain'],
              'signPub': rec['signPub']
            },
          })));
      await _saveSession(
          toUser,
          b['device_id'] as String,
          _SessionRecord(
              ratchet: dr.serializeRatchet(s.st),
              peerIdentity: saved.peerIdentity,
              peerDevice: saved.peerDevice,
              eph: saved.eph,
              opkPub: saved.opkPub));
      envelopes[b['device_id'] as String] = s.fresh
          ? {
              'v': 1,
              'type': 'prekey',
              'ik': encodeIdentity(_identity!),
              'ek': s.eph,
              'spkId': null,
              'opkId': saved.opkPub,
              'spk': b['signed_prekey'],
              'header': dr.encodeRatchetHeader(ct.header),
              'iv': b64uEncode(ct.iv),
              'ct': b64uEncode(ct.ct),
            }
          : {
              'v': 1,
              'type': 'msg',
              'header': dr.encodeRatchetHeader(ct.header),
              'iv': b64uEncode(ct.iv),
              'ct': b64uEncode(ct.ct),
            };
    }
    if (envelopes.isEmpty) return;
    await api('e2ee/sk', 'POST', {
      'to_user': toUser,
      'room': roomId,
      'gen': rec['gen'],
      'from_device': deviceId,
      'envelopes': envelopes,
    });
  }

  Future<void> fetchSenderKeys([String? roomId]) async {
    await ready();
    final res = await api(roomId != null
        ? 'e2ee/sk?room=${Uri.encodeComponent(roomId)}'
        : 'e2ee/sk') as Map<String, dynamic>;
    for (final p
        in ((res['parcels'] ?? []) as List).cast<Map<String, dynamic>>()) {
      final envs = (p['envelopes'] ?? {}) as Map<String, dynamic>;
      final env = envs[deviceId];
      if (env == null) continue;
      final inner = await decryptBody(
          p['from_user_id'] as String,
          jsonEncode({
            'v': 1,
            'from': {
              'user': p['from_user_id'],
              'device': p['from_device'] ?? 'unknown'
            },
            'msgs': {
              userId: {deviceId: env}
            },
          }));
      if (inner != null && inner.kind == 'sk' && inner.meta != null) {
        final meta = inner.meta!;
        if (meta['chain'] is String &&
            meta['signPub'] is String &&
            meta['gen'] is int) {
          await _savePeerSenderKey(p['room_id'] as String,
              p['from_user_id'] as String, meta['gen'] as int, {
            'chain': meta['chain'] as String,
            'signPub': meta['signPub'] as String,
            'n': 0,
            'skipped': <dynamic>[],
          });
          try {
            await api("e2ee/sk/${p['id']}", 'DELETE');
          } catch (_) { /* redelivery is harmless */ }
        }
      }
    }
  }

  Future<String> encryptGroup(RoomRef room, InnerMessage inner) async {
    final rec = await _ensureSenderKey(room);
    final sk = importSenderKey(b64uDecode(rec['chain'] as String),
        b64uDecode(rec['signPub'] as String), rec['gen'] as int);
    final sending = SenderKey(
        chain: sk.chain,
        signPriv: b64uDecode(rec['signPriv'] as String),
        signPub: sk.signPub,
        gen: sk.gen,
        n: rec['n'] as int);
    final msg = await senderEncrypt(
        sending,
        userId,
        utf8Encode(jsonEncode({
          'kind': inner.kind,
          'body': inner.body,
          if (inner.meta != null) 'meta': inner.meta,
        })));
    rec['n'] = sending.n;
    rec['chain'] = b64uEncode(sending.chain);
    await _saveOwnSenderKey(room.id, rec);
    return jsonEncode({
      'v': 1,
      'type': 'groupmsg',
      'from': {'user': userId, 'device': deviceId},
      'room': room.id,
      'sender': userId,
      'gen': msg.gen,
      'n': msg.n,
      'iv': b64uEncode(msg.iv),
      'ct': b64uEncode(msg.ct),
      'sig': b64uEncode(msg.sig),
    });
  }

  Future<InnerMessage?> decryptGroup(
      String senderId, Map<String, dynamic> o) async {
    final roomId = '${o['room'] ?? ''}';
    final gen = (o['gen'] as num?)?.toInt() ?? -1;
    var rec = await _loadPeerSenderKey(roomId, senderId, gen);
    if (rec == null) {
      await fetchSenderKeys(roomId);
      rec = await _loadPeerSenderKey(roomId, senderId, gen);
      if (rec == null) return null;
    }
    final sk = importSenderKey(b64uDecode(rec['chain'] as String),
        b64uDecode(rec['signPub'] as String), rec['gen'] as int);
    sk.n = rec['n'] as int;
    for (final e in ((rec['skipped'] ?? []) as List).cast<Map>()) {
      sk.skipped.add(
          SkippedSenderKey(n: e['n'] as int, mk: e['mk'] as String));
    }
    try {
      final pt = await senderDecrypt(
          sk,
          senderId,
          SenderMessage(
              gen: gen,
              n: (o['n'] as num).toInt(),
              iv: b64uDecode(o['iv'] as String),
              ct: b64uDecode(o['ct'] as String),
              sig: b64uDecode(o['sig'] as String)));
      await _savePeerSenderKey(roomId, senderId, gen, {
        'chain': b64uEncode(sk.chain),
        'signPub': rec['signPub'] as String,
        'n': sk.n,
        'skipped': sk.skipped.map((s) => {'n': s.n, 'mk': s.mk}).toList(),
      });
      final inner = jsonDecode(utf8Decode(pt)) as Map<String, dynamic>;
      return InnerMessage(
          kind: inner['kind'] as String,
          body: inner['body'] as String,
          meta: inner['meta'] as Map<String, dynamic>?);
    } catch (_) {
      return null;
    }
  }

  Future<void> wipe() async {
    try {
      await api('devices/$deviceId/keys', 'DELETE');
    } catch (_) { /* already gone */ }
    // E9: sessions, sender keys and verified marks go too.
    for (final e in await _loadIdx('sessIdx')) {
      try {
        final pair = jsonDecode(e) as List;
        await kv.del(
            _k(['sess', pair[0] as String, pair[1] as String]));
      } catch (_) { /* ignore */ }
    }
    for (final room in await _loadIdx('skownIdx')) {
      await kv.del(_k(['skown', room]));
    }
    for (final e in await _loadIdx('skinIdx')) {
      try {
        final t = jsonDecode(e) as List;
        await kv.del(_k([
          'skin',
          t[0] as String,
          t[1] as String,
          '${t[2]}'
        ]));
      } catch (_) { /* ignore */ }
    }
    for (final e in await _loadIdx('vfyIdx')) {
      try {
        final pair = jsonDecode(e) as List;
        await kv.del(_k(['vfy', pair[0] as String, pair[1] as String]));
      } catch (_) { /* ignore */ }
    }
    for (final k in [
      'identity',
      'spks',
      'opks',
      'opkUsed',
      'sessIdx',
      'skownIdx',
      'skinIdx',
      'vfyIdx'
    ]) {
      await kv.del(_k([k]));
    }
    _ready = false;
    _identity = null;
    _spks = [];
    _opkPrivs = {};
    _opkUsedSincePut = 0;
  }

  /// E9: dotted own identity (x.ed b64u) for the safety screen.
  String? myIdentity() =>
      _identity == null ? null : encodeIdentity(_identity!);

  /// E9: safety numbers for every device of a user.
  Future<List<SafetyNumber>> safetyNumbers(String uid) async {
    await ready();
    final id = _identity;
    if (id == null) return [];
    final res =
        await api('users/$uid/e2ee-devices') as Map<String, dynamic>;
    final out = <SafetyNumber>[];
    for (final d
        in ((res['devices'] ?? []) as List).cast<Map<String, dynamic>>()) {
      final parsed = parseIdentity(d['identity_key'] as String? ?? '');
      if (parsed == null) continue;
      final peerEd = b64uEncode(parsed.ed);
      final digits = await safetyNumberDigits(id.edPub, parsed.ed);
      final vfy = await kv.get(_k(['vfy', uid, d['device_id'] as String]));
      out.add(SafetyNumber(
        device: d['device_id'] as String,
        edPub: peerEd,
        number: digits,
        lines: formatSafetyNumber(digits),
        verified: vfy == peerEd,
        changed: vfy != null && vfy != peerEd,
      ));
    }
    return out;
  }

  /// E9: mark a peer device identity as compared-and-correct.
  Future<void> setVerified(
      String uid, String device, String edPub) async {
    await kv.set(_k(['vfy', uid, device]), edPub);
    await _addIdx('vfyIdx', jsonEncode([uid, device]));
  }

  /// E9: export keys + sessions + sender keys for backup.
  Future<Map<String, dynamic>> exportState() async {
    await ready();
    final sessions = <String, dynamic>{};
    for (final e in await _loadIdx('sessIdx')) {
      try {
        final pair = jsonDecode(e) as List;
        final raw = await kv.get(
            _k(['sess', pair[0] as String, pair[1] as String]));
        if (raw != null) {
          sessions['${pair[0]}\n${pair[1]}'] = jsonDecode(raw);
        }
      } catch (_) { /* ignore */ }
    }
    final skown = <String, dynamic>{};
    for (final room in await _loadIdx('skownIdx')) {
      final raw = await kv.get(_k(['skown', room]));
      if (raw != null) skown[room] = jsonDecode(raw);
    }
    final skin = <String, dynamic>{};
    for (final e in await _loadIdx('skinIdx')) {
      try {
        final t = jsonDecode(e) as List;
        final raw = await kv.get(_k(
            ['skin', t[0] as String, t[1] as String, '${t[2]}']));
        if (raw != null) skin['${t[0]}\n${t[1]}\n${t[2]}'] = jsonDecode(raw);
      } catch (_) { /* ignore */ }
    }
    return {
      'v': 1,
      'userId': userId,
      'fromDevice': deviceId,
      'exportedAt': DateTime.now().toUtc().toIso8601String(),
      'identity': jsonDecode(await kv.get(_k(['identity'])) ?? 'null'),
      'spks': jsonDecode(await kv.get(_k(['spks'])) ?? '[]'),
      'opks': jsonDecode(await kv.get(_k(['opks'])) ?? '{}'),
      'sessions': sessions,
      'skown': skown,
      'skin': skin,
    };
  }

  /// E9: install an exported state (same user; any device).
  Future<void> importState(Map<String, dynamic> payload) async {
    if (payload['v'] != 1 || payload['userId'] != userId) {
      throw StateError('backup is not for this user');
    }
    if (payload['identity'] is! Map) {
      throw StateError('backup has no identity');
    }
    await kv.set(_k(['identity']), jsonEncode(payload['identity']));
    await kv.set(_k(['spks']), jsonEncode(payload['spks'] ?? []));
    await kv.set(_k(['opks']), jsonEncode(payload['opks'] ?? {}));
    await kv.set(_k(['opkUsed']), '0');
    // Sessions and sender keys are bound to the exporting device: a new
    // device re-handshakes and re-deals instead of forking live chains.
    // Same-device reinstalls keep them for uninterrupted decryption.
    if (payload['fromDevice'] != deviceId) {
      _ready = false;
      _identity = null;
      await ready();
      // A new device id has no server bundle yet: register it now.
      await publishBundle();
      return;
    }
    final sessions = (payload['sessions'] ?? {}) as Map;
    for (final entry in sessions.entries) {
      final parts = '${entry.key}'.split('\n');
      if (parts.length != 2) continue;
      await kv.set(
          _k(['sess', parts[0], parts[1]]), jsonEncode(entry.value));
      await _addIdx('sessIdx', jsonEncode(parts));
    }
    final skown = (payload['skown'] ?? {}) as Map;
    for (final entry in skown.entries) {
      await kv.set(_k(['skown', '${entry.key}']), jsonEncode(entry.value));
      await _addIdx('skownIdx', '${entry.key}');
    }
    final skin = (payload['skin'] ?? {}) as Map;
    for (final entry in skin.entries) {
      final parts = '${entry.key}'.split('\n');
      if (parts.length != 3) continue;
      await kv.set(
          _k(['skin', parts[0], parts[1], parts[2]]),
          jsonEncode(entry.value));
      await _addIdx(
          'skinIdx', jsonEncode([parts[0], parts[1], int.tryParse(parts[2]) ?? 0]));
    }
    // Re-register the restored identity under this device id.
    _ready = false;
    _identity = null;
    await ready();
  }
}

/// E9: one peer device safety number.
class SafetyNumber {
  final String device;
  final String edPub;
  final String number;
  final List<String> lines;
  final bool verified;
  final bool changed;
  const SafetyNumber(
      {required this.device,
      required this.edPub,
      required this.number,
      required this.lines,
      required this.verified,
      required this.changed});
}
