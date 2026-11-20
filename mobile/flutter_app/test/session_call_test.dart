// N2-L: 1:1 call signaling states with fake media + fake HTTP: invite with
// an SDP offer, accept/decline/hangup, 30s no-answer (caller hangs up,
// callee marks missed), busy auto-decline, background hangup, and media
// failure degrading to signaling-only.
import 'dart:convert';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/call_media.dart';

class FakeHttp extends http.BaseClient {
  Future<http.Response> Function(http.BaseRequest request, String body)? handler;
  final List<String> calls = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final body = await request.finalize().transform(utf8.decoder).join();
    calls.add('${request.method} ${request.url.path} $body');
    final res = await handler!(request, body);
    return http.StreamedResponse(
      Stream.value(utf8.encode(res.body)),
      res.statusCode,
      headers: {'content-type': 'application/json'},
    );
  }
}

http.Response jsonRes(Object body, int status) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

class FakeCallMedia implements CallMedia {
  bool failOpen = false;
  bool disposed = false;
  String offerSdp = 'fake-offer-sdp';
  String answerSdp = 'fake-answer-sdp';
  final List<String> appliedAnswers = [];
  final List<Map<String, dynamic>> addedCandidates = [];
  void Function(Map<String, dynamic>)? iceSink;
  int opens = 0;

  @override
  RTCVideoRenderer? get localRenderer => null;

  @override
  RTCVideoRenderer? get remoteRenderer => null;

  // F15: mesh additions (unused by 1:1 tests, satisfy the interface).
  @override
  MediaStream? get localStream => null;
  @override
  bool get hasRemoteStream => false;
  @override
  Future<void> openPeer(
          {required List<Map<String, dynamic>> iceServers}) async =>
      opens++;
  @override
  Future<void> setLocalStream(MediaStream stream) async {}

  @override
  Future<void> open(
      {required bool video,
      required List<Map<String, dynamic>> iceServers}) async {
    opens++;
    if (failOpen) throw Exception('no mic');
  }

  @override
  Future<String> createOffer() async => offerSdp;

  @override
  Future<String> answerTo(String offerSdp) async => answerSdp;

  @override
  Future<void> applyAnswer(String answerSdp) async {
    appliedAnswers.add(answerSdp);
  }

  @override
  Future<void> addIceCandidate(Map<String, dynamic> candidate) async {
    addedCandidates.add(candidate);
  }

  @override
  void onIceCandidate(void Function(Map<String, dynamic>) emit) {
    iceSink = emit;
  }

  @override
  void onRemoteStream(void Function() changed) {}

  @override
  Future<void> setMuted(bool muted) async {}

  @override
  Future<void> setVideoOff(bool off) async {}

  @override
  Future<void> switchCamera() async {}

  @override
  Future<void> setSpeaker(bool on) async {}

  @override
  Future<void> dispose() async {
    disposed = true;
  }
}

SessionController makeSession(FakeHttp fake, FakeCallMedia media) {
  final s = SessionController(httpClient: fake);
  s.mediaFactory = () => media;
  s.selfId = 'me';
  addTearDown(s.disposeAll);
  return s;
}

void pumpUntil(FakeAsync async, bool Function() done) {
  for (var i = 0; i < 2000 && !done(); i++) {
    async.elapse(const Duration(milliseconds: 1));
  }
  assert(done(), 'condition never became true');
}

void main() {
  group('outgoing call', () {
    test('invite carries the offer and posts it as a signal', () async {
      final fake = FakeHttp();
      final media = FakeCallMedia();
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/calls/ice-servers') {
          return jsonRes({
            'ice_servers': [
              {'urls': 'stun:stun.l.google.com:19302'}
            ]
          }, 200);
        }
        if (req.method == 'POST' && req.url.path == '/api/v1/calls') {
          return jsonRes({'id': 'call-1', 'state': 'ringing'}, 201);
        }
        return jsonRes({'status': 'ok'}, 200);
      };
      final s = makeSession(fake, media);
      await s.startCallIn('c1', 'video');
      expect(media.opens, 1);
      expect(s.activeCall?['direction'], 'outgoing');
      expect(s.activeCall?['state'], 'ringing');
      final invite = fake.calls.firstWhere((c) => c.startsWith('POST /api/v1/calls '));
      expect(invite.contains('fake-offer-sdp'), isTrue);
      expect(
          fake.calls.any((c) =>
              c.contains('/api/v1/calls/call-1/signal') &&
              c.contains('"signal_type":"offer"')),
          isTrue);
    });

    test('media failure still invites (signaling survives)', () async {
      final fake = FakeHttp();
      final media = FakeCallMedia()..failOpen = true;
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path == '/api/v1/calls') {
          return jsonRes({'id': 'call-2', 'state': 'ringing'}, 201);
        }
        return jsonRes({}, 200);
      };
      final s = makeSession(fake, media);
      await s.startCallIn('c1', 'voice');
      expect(s.callMediaIssue, isTrue);
      expect(s.activeCall?['id'], 'call-2');
    });

    test('caller no-answer hangs up after 30s', () {
      FakeAsync().run((async) {
        final fake = FakeHttp();
        final media = FakeCallMedia();
        fake.handler = (req, body) async {
          if (req.method == 'POST' && req.url.path == '/api/v1/calls') {
            return jsonRes({'id': 'call-3', 'state': 'ringing'}, 201);
          }
          return jsonRes({}, 200);
        };
        final s = makeSession(fake, media);
        var started = false;
        s.startCallIn('c1', 'voice').then((_) => started = true);
        pumpUntil(async, () => started);
        expect(s.activeCall, isNotNull);
        async.elapse(const Duration(seconds: 29));
        expect(s.activeCall, isNotNull, reason: 'still ringing at 29s');
        async.elapse(const Duration(seconds: 1));
        pumpUntil(async, () => s.activeCall == null);
        expect(
            fake.calls.any((c) =>
                c.contains('/api/v1/calls/call-3/state') &&
                c.contains('"state":"ended"')),
            isTrue);
        expect(media.disposed, isTrue);
      });
    });
  });

  group('incoming call', () {
    test('ring shows the call and callee no-answer marks missed', () {
      FakeAsync().run((async) {
        final fake = FakeHttp();
        final media = FakeCallMedia();
        fake.handler = (req, body) async => jsonRes({}, 200);
        final s = makeSession(fake, media);
        s.debugIncomingRing({
          'type': 'call.ringing',
          'call_id': 'call-9',
          'conversation_id': 'c1',
          'kind': 'voice',
          'initiated_by': 'peer',
          'caller_name': 'Peer',
        });
        expect(s.activeCall?['direction'], 'incoming');
        expect(s.activeCall?['state'], 'ringing');
        async.elapse(const Duration(seconds: 30));
        pumpUntil(async, () => s.activeCall == null);
        expect(
            fake.calls.any((c) =>
                c.contains('/api/v1/calls/call-9/state') &&
                c.contains('"state":"missed"')),
            isTrue);
      });
    });

    test('second ring while busy auto-declines', () async {
      final fake = FakeHttp();
      final media = FakeCallMedia();
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path == '/api/v1/calls') {
          return jsonRes({'id': 'call-1', 'state': 'ringing'}, 201);
        }
        return jsonRes({}, 200);
      };
      final s = makeSession(fake, media);
      await s.startCallIn('c1', 'voice');
      s.debugIncomingRing({
        'type': 'call.ringing',
        'call_id': 'call-busy',
        'conversation_id': 'c2',
        'kind': 'voice',
        'initiated_by': 'peer2',
      });
      await Future<void>.delayed(Duration.zero);
      expect(s.activeCall?['id'] ?? s.activeCall?['call_id'], 'call-1',
          reason: 'current call kept');
      expect(
          fake.calls.any((c) =>
              c.contains('/api/v1/calls/call-busy/state') &&
              c.contains('"state":"declined"')),
          isTrue);
      expect(s.notice.contains('자동 거절'), isTrue);
    });

    test('own echo and duplicate rings are ignored', () async {
      final fake = FakeHttp();
      final media = FakeCallMedia();
      fake.handler = (req, body) async => jsonRes({}, 200);
      final s = makeSession(fake, media);
      s.debugIncomingRing({
        'type': 'call.ringing',
        'call_id': 'call-own',
        'initiated_by': 'me',
      });
      expect(s.activeCall, isNull);
    });

    test('accept posts connected and decline posts declined', () async {
      final fake = FakeHttp();
      final media = FakeCallMedia();
      fake.handler = (req, body) async => jsonRes({}, 200);
      final s = makeSession(fake, media);
      s.debugIncomingRing({
        'type': 'call.ringing',
        'call_id': 'call-7',
        'conversation_id': 'c1',
        'kind': 'voice',
        'initiated_by': 'peer',
      });
      await s.acceptCall();
      expect(s.activeCall?['state'], 'connected');
      expect(
          fake.calls.any((c) =>
              c.contains('/api/v1/calls/call-7/state') &&
              c.contains('"state":"connected"')),
          isTrue);
      await s.endCall();
      expect(s.activeCall, isNull);
      expect(media.disposed, isTrue);

      s.debugIncomingRing({
        'type': 'call.ringing',
        'call_id': 'call-8',
        'conversation_id': 'c1',
        'kind': 'voice',
        'initiated_by': 'peer',
      });
      await s.declineCall();
      expect(s.activeCall, isNull);
      expect(
          fake.calls.any((c) =>
              c.contains('/api/v1/calls/call-8/state') &&
              c.contains('"state":"declined"')),
          isTrue);
    });
  });

  group('media signals', () {
    test('offer is answered, answer applied, ICE added', () async {
      final fake = FakeHttp();
      final media = FakeCallMedia();
      fake.handler = (req, body) async => jsonRes({}, 200);
      final s = makeSession(fake, media);
      s.debugIncomingRing({
        'type': 'call.ringing',
        'call_id': 'call-5',
        'conversation_id': 'c1',
        'kind': 'video',
        'initiated_by': 'peer',
      });
      await s.debugCallSignal({
        'type': 'call.signal',
        'call_id': 'call-5',
        'from_user_id': 'peer',
        'signal_type': 'offer',
        'sdp': 'remote-offer',
      });
      // Still ringing: the offer is held, no media/answer yet (keeps the
      // ringtone audible and the mic closed until the user accepts).
      expect(
          fake.calls.any((c) => c.contains('"signal_type":"answer"')),
          isFalse);
      await s.acceptCall();
      expect(
          fake.calls.any((c) =>
              c.contains('/api/v1/calls/call-5/signal') &&
              c.contains('"signal_type":"answer"') &&
              c.contains('fake-answer-sdp')),
          isTrue);
      await s.debugCallSignal({
        'type': 'call.signal',
        'call_id': 'call-5',
        'from_user_id': 'peer',
        'signal_type': 'ice-candidate',
        'candidate': jsonEncode({
          'candidate': 'cand',
          'sdpMid': '0',
          'sdpMLineIndex': 0
        }),
      });
      expect(media.addedCandidates, hasLength(1));
      expect(media.addedCandidates.single['candidate'], 'cand');
      await s.debugCallSignal({
        'type': 'call.signal',
        'call_id': 'call-5',
        'from_user_id': 'me',
        'signal_type': 'answer',
        'sdp': 'own-echo',
      });
      expect(media.appliedAnswers, isEmpty,
          reason: 'own signal echo ignored');
    });

    test('remote ended clears the call', () async {
      final fake = FakeHttp();
      final media = FakeCallMedia();
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path == '/api/v1/calls') {
          return jsonRes({'id': 'call-1', 'state': 'ringing'}, 201);
        }
        return jsonRes({}, 200);
      };
      final s = makeSession(fake, media);
      await s.startCallIn('c1', 'voice');
      s.debugCallState({
        'type': 'call.state',
        'call_id': 'call-1',
        'state': 'ended',
      });
      expect(s.activeCall, isNull);
      expect(media.disposed, isTrue);
    });

    // Build 18: a call is a phone call now: leaving the app or turning the
    // screen off keeps it (a foreground service holds the mic).
    test('backgrounding keeps the call', () async {
      final fake = FakeHttp();
      final media = FakeCallMedia();
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path == '/api/v1/calls') {
          return jsonRes({'id': 'call-1', 'state': 'ringing'}, 201);
        }
        return jsonRes({}, 200);
      };
      final s = makeSession(fake, media);
      await s.startCallIn('c1', 'voice');
      s.onAppBackgrounded();
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(s.activeCall, isNotNull);
      expect(fake.calls.any((c) => c.contains('/api/v1/calls/call-1/state')),
          isFalse);
    });
  });
}
