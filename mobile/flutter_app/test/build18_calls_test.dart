// Build 18: calls that behave like phone calls.
// - a callee whose app was closed picks the ring up from the server and
//   replays the offer / ICE it missed; Accept on the ring connects at once
// - a live call keeps a foreground service and the lock-screen window, and
//   releases both when it ends
// - the push rules (ring / clear / ignore) and the ring payload round trip
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/call_push.dart';

import 'session_call_test.dart' show FakeHttp, FakeCallMedia, jsonRes, makeSession;

class FakeCallSystem implements CallSystem {
  final List<String> log = [];
  String? launch;

  @override
  Future<void> startOngoing({required bool video, required String title}) async =>
      log.add('start:${video ? 'video' : 'voice'}:$title');
  @override
  Future<void> stopOngoing() async => log.add('stop');
  @override
  Future<void> setLockScreen(bool on) async => log.add('lock:$on');
  @override
  Future<void> setProximity(bool on) async => log.add('prox:$on');
  @override
  Future<void> clearRing() async => log.add('clear');
  @override
  Future<String?> takeLaunchResponse() async {
    final l = launch;
    launch = null;
    return l;
  }

  @override
  Future<void> ensureRingPermission() async => log.add('perm');
}

Map<String, dynamic> ring() => {
      'type': 'call.ringing',
      'call_id': 'call-7',
      'conversation_id': 'c1',
      'initiated_by': 'peer',
      'caller_name': 'Alice',
      'kind': 'video',
      'ring_token': 'tok',
    };

FakeHttp coldStartServer({Map<String, dynamic>? call}) {
  final fake = FakeHttp();
  fake.handler = (req, body) async {
    if (req.url.path == '/api/v1/calls/incoming') {
      return jsonRes({'call': call}, 200);
    }
    if (req.url.path == '/api/v1/calls/call-7/signals') {
      return jsonRes({
        'signals': [
          {'id': 1, 'call_id': 'call-7', 'signal_type': 'offer', 'sdp': 'missed-offer', 'from_user_id': 'peer'},
          {'id': 2, 'call_id': 'call-7', 'signal_type': 'ice-candidate', 'candidate': '{"candidate":"c1","sdpMid":"0","sdpMLineIndex":0}', 'from_user_id': 'peer'},
        ]
      }, 200);
    }
    return jsonRes({}, 200);
  };
  return fake;
}

void main() {
  group('cold start pickup', () {
    test('finds the ring, holds the missed offer, connects on Accept', () async {
      final fake = coldStartServer(call: ring());
      final media = FakeCallMedia();
      final s = makeSession(fake, media);
      s.api.token = 't';
      final sys = FakeCallSystem();
      s.callSystem = sys;

      await s.pickUpIncomingCall();
      expect(s.activeCall?['id'], 'call-7');
      expect(s.activeCall?['state'], 'ringing');
      expect(s.activeCall?['kind'], 'video');
      expect(s.activeCall?['ring_token'], 'tok');
      expect(sys.log, contains('lock:true'));
      // Still ringing: nothing answered, media not opened yet.
      expect(fake.calls.where((c) => c.contains('"signal_type":"answer"')), isEmpty);

      await s.pickUpIncomingCall(accept: true, callId: 'call-7');
      expect(s.activeCall?['state'], 'connected');
      expect(fake.calls.any((c) => c.contains('/calls/call-7/state') && c.contains('"connected"')), isTrue);
      // The replayed offer was answered and the replayed ICE applied.
      expect(fake.calls.any((c) => c.contains('/calls/call-7/signal ') && c.contains('fake-answer-sdp')), isTrue);
      expect(media.addedCandidates.single['candidate'], 'c1');
      expect(sys.log, contains('start:video:Alice'));
    });

    test('Accept straight from a closed app (launch details) connects', () async {
      final fake = coldStartServer(call: ring());
      final s = makeSession(fake, FakeCallMedia());
      s.api.token = 't';
      final sys = FakeCallSystem()..launch = 'accept:call:call-7|tok';
      s.callSystem = sys;
      await s.debugPickUpOnLaunch();
      expect(s.activeCall?['state'], 'connected');
      expect(sys.log, contains('perm'));
    });

    test('Accept on a ring that already ended says so', () async {
      final fake = coldStartServer(call: null);
      final s = makeSession(fake, FakeCallMedia());
      s.api.token = 't';
      s.callSystem = FakeCallSystem();
      await s.pickUpIncomingCall(accept: true, callId: 'call-7');
      expect(s.activeCall, isNull);
      expect(s.notice, isNotEmpty);
    });

    test('a ring already on screen is not fetched twice', () async {
      final fake = coldStartServer(call: ring());
      final s = makeSession(fake, FakeCallMedia());
      s.api.token = 't';
      s.callSystem = FakeCallSystem();
      s.debugIncomingRing(ring());
      await s.pickUpIncomingCall();
      expect(fake.calls.where((c) => c.contains('/calls/incoming')), isEmpty);
    });
  });

  group('live call off screen', () {
    test('outgoing call holds the service until hang-up', () async {
      final fake = FakeHttp();
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path == '/api/v1/calls') {
          return jsonRes({'id': 'call-1', 'state': 'ringing'}, 201);
        }
        return jsonRes({}, 200);
      };
      final s = makeSession(fake, FakeCallMedia());
      final sys = FakeCallSystem();
      s.callSystem = sys;
      await s.startCallIn('c1', 'voice');
      expect(sys.log, contains('start:voice:'));
      expect(sys.log, contains('lock:true'));
      s.onAppBackgrounded();
      expect(s.activeCall, isNotNull, reason: 'screen off keeps the call');
      await s.endCall();
      expect(s.activeCall, isNull);
      expect(sys.log, containsAllInOrder(['stop', 'lock:false', 'prox:false']));
    });

    test('earpiece voice call turns the proximity screen-off on', () async {
      final fake = FakeHttp();
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path == '/api/v1/calls') {
          return jsonRes({'id': 'call-1', 'state': 'ringing'}, 201);
        }
        return jsonRes({}, 200);
      };
      final s = makeSession(fake, FakeCallMedia());
      final sys = FakeCallSystem();
      s.callSystem = sys;
      await s.startCallIn('c1', 'voice');
      await s.setCallSpeaker(false);
      expect(sys.log.last, 'prox:true');
      await s.setCallSpeaker(true);
      expect(sys.log.last, 'prox:false');
    });
  });

  group('push rules', () {
    final now = DateTime.fromMillisecondsSinceEpoch(1000000);
    test('ring, clear, stale and unrelated pushes', () {
      expect(callPushAction({'kind': 'call', 'call_id': 'x', 'sent_at': '990000'}, now), CallPushAction.ring);
      expect(callPushAction({'kind': 'call', 'call_id': 'x'}, now), CallPushAction.ring);
      expect(callPushAction({'kind': 'call', 'call_id': 'x', 'sent_at': '900000'}, now), CallPushAction.ignore,
          reason: '100 s old: the caller already gave up');
      expect(callPushAction({'kind': 'call'}, now), CallPushAction.ignore);
      expect(callPushAction({'kind': 'call_end', 'call_id': 'x'}, now), CallPushAction.clear);
      expect(callPushAction({'kind': 'message'}, now), CallPushAction.ignore);
    });

    test('ring payload round trip and Accept encoding', () {
      expect(ringPayload('c-1', 'tok'), 'call:c-1|tok');
      expect(parseRingPayload('call:c-1|tok')?.callId, 'c-1');
      expect(parseRingPayload('call:c-1|tok')?.ringToken, 'tok');
      expect(parseRingPayload('call:c-1')?.ringToken, '');
      expect(parseRingPayload('room:c-1'), isNull);
      expect(encodeResponse('call:c-1|tok', actionAccept), 'accept:call:c-1|tok');
      expect(encodeResponse('call:c-1|tok', null), 'call:c-1|tok');
    });
  });
}
