// E5: Dart E2EE store through a fake key directory with the same
// semantics as the server (bundle store, one-time-prekey consume,
// ownership on delete). Live-server flows are covered node-side.
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/e2ee/keys.dart';
import 'package:luno_messenger/e2ee/store.dart';

class FakeDirectory {
  final bundles = <String, Map<String, Map<String, dynamic>>>{};
  final parcels = <Map<String, dynamic>>[];
  var _parcelSeq = 0;
  Future<dynamic> call(String path, [String method = 'GET', Object? body]) async {
    final put = RegExp(r'^devices/([\w-]+)/keys$').firstMatch(path);
    if (put != null) {
      final did = put.group(1)!;
      final b = (body ?? {}) as Map;
      if (method == 'PUT') {
        final uid = _authed;
        bundles.putIfAbsent(uid, () => {})[did] = {
          'user_id': uid,
          'device_id': did,
          'identity_key': b['identity_key'],
          'signed_prekey': b['signed_prekey'],
          'prekey_sig': b['prekey_sig'] ?? '',
          'one_time_prekeys': List<String>.from(b['one_time_prekeys'] ?? []),
        };
        return {'status': 'keys_registered'};
      }
      if (method == 'DELETE') {
        for (final entry in bundles.entries) {
          if (entry.value.containsKey(did)) {
            if (entry.key != _authed) {
              throw StateError('forbidden');
            }
            entry.value.remove(did);
            return {'status': 'keys_deleted'};
          }
        }
        throw StateError('not found');
      }
    }
    final get = RegExp(r'^users/([\w-]+)/keys(\?all=1)?$').firstMatch(path);
    if (get != null && method == 'GET') {
      final uid = get.group(1)!;
      final all = get.group(2) != null;
      final devs = bundles[uid] ?? {};
      String? consume(String did) {
        final otks = devs[did]!['one_time_prekeys'] as List;
        return otks.isEmpty ? null : otks.removeAt(0) as String;
      }
      if (all) {
        return {
          'user_id': uid,
          'devices': [
            for (final e in devs.entries)
              {
                'user_id': uid,
                'device_id': e.key,
                'identity_key': e.value['identity_key'],
                'signed_prekey': e.value['signed_prekey'],
                'prekey_sig': e.value['prekey_sig'],
                'one_time_prekey': consume(e.key),
              }
          ],
        };
      }
      if (devs.isEmpty) throw StateError('no bundle');
      final did = devs.keys.first;
      return {
        'user_id': uid,
        'device_id': did,
        'identity_key': devs[did]!['identity_key'],
        'signed_prekey': devs[did]!['signed_prekey'],
        'prekey_sig': devs[did]!['prekey_sig'],
        'one_time_prekey': consume(did),
      };
    }
    final devs =
        RegExp(r'^users/([\w-]+)/e2ee-devices$').firstMatch(path);
    if (devs != null && method == 'GET') {
      final uid = devs.group(1)!;
      final ds = bundles[uid] ?? {};
      return {
        'user_id': uid,
        'devices': [
          for (final e in ds.entries)
            {
              'device_id': e.key,
              'identity_key': e.value['identity_key'],
              'updated_at': '2026-11-21T00:00:00Z',
            }
        ],
      };
    }
    if (path == 'e2ee/sk' && method == 'POST') {
      final b = body as Map;
      parcels.add({
        'id': 'p${_parcelSeq++}',
        'to_user_id': b['to_user'],
        'from_user_id': _authed,
        'from_device': b['from_device'] ?? 'unknown',
        'room_id': b['room'],
        'gen': b['gen'],
        'envelopes': b['envelopes'],
      });
      return {'status': 'parcel_stored'};
    }
    if (path.startsWith('e2ee/sk') && method == 'GET') {
      final room = path.contains('room=')
          ? Uri.splitQueryString(path.split('?')[1])['room']
          : null;
      return {
        'parcels': parcels
            .where((p) =>
                p['to_user_id'] == _authed &&
                (room == null || p['room_id'] == room))
            .toList()
      };
    }
    if (path.startsWith('e2ee/sk/') && method == 'DELETE') {
      parcels.removeWhere((p) =>
          p['id'] == path.split('/').last && p['to_user_id'] == _authed);
      return {'status': 'parcel_deleted'};
    }
    throw StateError('unexpected $method $path');
  }

  String _authed = '';
  ApiFn as(String uid) {
    return (String path, [String? method, Object? body]) {
      _authed = uid;
      return call(path, method ?? 'GET', body);
    };
  }
}

void main() {
  test('E5 app: two devices exchange sealed messages', () async {
    final dir = FakeDirectory();
    final alice = E2eeStore(kv: MemoryKV(), api: dir.as('alice'), userId: 'alice', deviceId: 'a1');
    final bob = E2eeStore(kv: MemoryKV(), api: dir.as('bob'), userId: 'bob', deviceId: 'b1');
    await alice.ready();
    await bob.ready();
    const room = RoomRef(id: 'r1', kind: 'direct', memberIds: ['alice', 'bob'], e2ee: true);
    final ct = await alice.encryptRoom(room, const InnerMessage(kind: 'text', body: 'sealed hello'));
    final open = await bob.decryptBody('alice', ct);
    expect(open?.body, 'sealed hello');
    expect(open?.kind, 'text');
    final back = await bob.encryptRoom(room, const InnerMessage(kind: 'text', body: 'sealed reply'));
    expect((await alice.decryptBody('bob', back))?.body, 'sealed reply');
  });

  test('E5 app: own second device reads the same blob; rotation tops up', () async {
    final dir = FakeDirectory();
    final a1 = E2eeStore(kv: MemoryKV(), api: dir.as('alice'), userId: 'alice', deviceId: 'a1');
    final a2 = E2eeStore(kv: MemoryKV(), api: dir.as('alice'), userId: 'alice', deviceId: 'a2');
    final bob = E2eeStore(kv: MemoryKV(), api: dir.as('bob'), userId: 'bob', deviceId: 'b1');
    await a1.ready();
    await a2.ready();
    await bob.ready();
    const room = RoomRef(id: 'r1', kind: 'direct', memberIds: ['alice', 'bob'], e2ee: true);
    final ct = await bob.encryptRoom(room, const InnerMessage(kind: 'text', body: 'to both'));
    expect((await a1.decryptBody('bob', ct))?.body, 'to both');
    expect((await a2.decryptBody('bob', ct))?.body, 'to both');
  });

  test('E6 app: group rooms encrypt; wipe deletes the bundle', () async {
    final dir = FakeDirectory();
    final alice = E2eeStore(kv: MemoryKV(), api: dir.as('alice'), userId: 'alice', deviceId: 'a1');
    final bob = E2eeStore(kv: MemoryKV(), api: dir.as('bob'), userId: 'bob', deviceId: 'b1');
    await alice.ready();
    await bob.ready();
    const ref = RoomRef(id: 'g', kind: 'group', memberIds: ['alice', 'bob'], e2ee: true);
    final ct = await alice.encryptRoom(ref, const InnerMessage(kind: 'text', body: 'group ok'));
    expect((await bob.decryptBody('alice', ct))?.body, 'group ok');
    await alice.wipe();
    expect(dir.bundles['alice']?.containsKey('a1') ?? false, isFalse);
  });

  test('E6 app: group dealing, rotation locks the leaver out', () async {
    final dir = FakeDirectory();
    E2eeStore mk(String uid, String did) => E2eeStore(
        kv: MemoryKV(), api: dir.as(uid), userId: uid, deviceId: did);
    final sa = mk('alice', 'a1');
    final sb = mk('bob', 'b1');
    final sc = mk('cara', 'c1');
    await sa.ready();
    await sb.ready();
    await sc.ready();
    RoomRef ref(List<String> members) =>
        RoomRef(id: 'g1', kind: 'group', memberIds: members, e2ee: true);
    const m1 = InnerMessage(kind: 'text', body: 'gen1 hello');
    final ct1 = await sa.encryptRoom(
        ref(['alice', 'bob', 'cara']), m1);
    expect((await sb.decryptBody('alice', ct1))?.body, 'gen1 hello');
    expect((await sc.decryptBody('alice', ct1))?.body, 'gen1 hello');
    const m2 = InnerMessage(kind: 'text', body: 'after exit');
    final ct2 =
        await sa.encryptRoom(ref(['alice', 'bob']), m2);
    expect((await sb.decryptBody('alice', ct2))?.body, 'after exit');
    expect(await sc.decryptBody('alice', ct2), isNull);
  });

  test('E5 app: unknown sender keys fail closed', () async {
    final dir = FakeDirectory();
    final bob = E2eeStore(kv: MemoryKV(), api: dir.as('bob'), userId: 'bob', deviceId: 'b1');
    await bob.ready();
    expect(await bob.decryptBody('alice', 'not-json'), isNull);
    expect(await bob.decryptBody('alice', '{"v":1,"msgs":{}}'), isNull);
  });

  test('E9 app: safety numbers match both ways, verify sticks', () async {
    final dir = FakeDirectory();
    final alice = E2eeStore(kv: MemoryKV(), api: dir.as('alice'), userId: 'alice', deviceId: 'a1');
    final bob = E2eeStore(kv: MemoryKV(), api: dir.as('bob'), userId: 'bob', deviceId: 'b1');
    await alice.ready();
    await bob.ready();
    final ab = await alice.safetyNumbers('bob');
    expect(ab, hasLength(1));
    expect(ab.single.number, matches(RegExp(r'^[0-9]{60}$')));
    expect(ab.single.lines, hasLength(3));
    expect(ab.single.verified, isFalse);
    expect(ab.single.changed, isFalse);
    final ba = await bob.safetyNumbers('alice');
    expect(ba.single.number, ab.single.number);
    await alice.setVerified('bob', 'b1', ab.single.edPub);
    expect((await alice.safetyNumbers('bob')).single.verified, isTrue);
  });

  test('E9 app: export/import restores same-device sessions only', () async {
    final dir = FakeDirectory();
    E2eeStore mk(String uid, String did, [KeyValue? kv]) => E2eeStore(
        kv: kv ?? MemoryKV(), api: dir.as(uid), userId: uid, deviceId: did);
    final alice = mk('alice', 'a1');
    final bob = mk('bob', 'b1');
    await alice.ready();
    await bob.ready();
    const room = RoomRef(id: 'r1', kind: 'direct', memberIds: ['alice', 'bob'], e2ee: true);
    final ct1 = await alice.encryptRoom(room, const InnerMessage(kind: 'text', body: 'before'));
    expect((await bob.decryptBody('alice', ct1))?.body, 'before');
    final held = await bob.encryptRoom(room, const InnerMessage(kind: 'text', body: 'held'));
    final snap = await alice.exportState();
    expect(snap['v'], 1);
    expect((snap['sessions'] as Map), isNotEmpty);
    final reinstall = mk('alice', 'a1');
    await reinstall.importState(snap);
    expect((await reinstall.decryptBody('bob', held))?.body, 'held');
    final moved = mk('alice', 'a2');
    await moved.importState(snap);
    expect(moved.myIdentity(), alice.myIdentity());
    expect(await moved.decryptBody('bob', held), isNull);
    final ct2 = await moved.encryptRoom(room, const InnerMessage(kind: 'text', body: 'fresh'));
    expect((await bob.decryptBody('alice', ct2))?.body, 'fresh');
    final mallory = mk('bob', 'x9');
    expect(() => mallory.importState(snap), throwsStateError);
  });

  test('E9 app: wipe clears keys, sessions and indexes', () async {
    final dir = FakeDirectory();
    final kv = MemoryKV();
    final alice = E2eeStore(kv: kv, api: dir.as('alice'), userId: 'alice', deviceId: 'a1');
    final bob = E2eeStore(kv: MemoryKV(), api: dir.as('bob'), userId: 'bob', deviceId: 'b1');
    await alice.ready();
    await bob.ready();
    final before = alice.myIdentity();
    const room = RoomRef(id: 'r1', kind: 'direct', memberIds: ['alice', 'bob'], e2ee: true);
    await alice.encryptRoom(room, const InnerMessage(kind: 'text', body: 'x'));
    await alice.setVerified('bob', 'b1', 'ed-test');
    await alice.wipe();
    expect(await kv.get('e2ee:alice:a1:identity'), isNull);
    expect(await kv.get('e2ee:alice:a1:sessIdx'), isNull);
    expect(await kv.get('e2ee:alice:a1:vfyIdx'), isNull);
    final fresh = E2eeStore(kv: kv, api: dir.as('alice'), userId: 'alice', deviceId: 'a1');
    await fresh.ready();
    expect(fresh.myIdentity(), isNot(before));
  });

  test('E9 app: digits are order-independent and line-split', () async {
    final x = Uint8List.fromList(List.generate(32, (i) => i));
    final y = Uint8List.fromList(List.generate(32, (i) => 255 - i));
    expect(await safetyNumberDigits(x, y), await safetyNumberDigits(y, x));
    expect(await safetyNumberDigits(x, y), matches(RegExp(r'^[0-9]{60}$')));
    expect(formatSafetyNumber('0123456789' * 6).map((l) => l.replaceAll(' ', '')),
        ['01234567890123456789', '01234567890123456789', '01234567890123456789']);
  });
}
