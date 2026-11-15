// F15: group call mesh with fake media + fake HTTP: join posts
// calls/group/join and offers every existing participant (joiner-offers),
// user_joined only adds the tile (no counter-offer, no glare), signals
// route per peer (offer->answer, answer applied, ICE added), user_left
// disposes that peer only, leave posts calls/group/leave and disposes
// everything, and the 1:1 busy rules hold both ways. Every peer PC
// carries the shared local uplink (setLocalStream observed per peer).
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/call_media.dart';

class FakeGroupHttp extends http.BaseClient {
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

http.Response groupJsonRes(Object body, int status) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

class FakeMediaStream implements MediaStream {
  @override
  Function(MediaStreamTrack track)? onAddTrack;
  @override
  Function(MediaStreamTrack track)? onRemoveTrack;
  @override
  String get id => 'fake-stream';
  @override
  String get ownerTag => 'fake-owner';
  @override
  bool? get active => true;
  @override
  Future<void> getMediaTracks() async {}
  @override
  Future<void> addTrack(MediaStreamTrack track, {bool addToNative = true}) async {}
  @override
  Future<void> removeTrack(MediaStreamTrack track, {bool removeFromNative = true}) async {}
  @override
  List<MediaStreamTrack> getTracks() => [];
  @override
  List<MediaStreamTrack> getAudioTracks() => [];
  @override
  List<MediaStreamTrack> getVideoTracks() => [];
  @override
  MediaStreamTrack? getTrackById(String trackId) => null;
  @override
  Future<MediaStream> clone() async => this;
  @override
  Future<void> dispose() async {}
}

class FakeGroupMedia implements CallMedia {
  bool failOpen = false;
  bool disposed = false;
  int opens = 0;
  int peerOpens = 0;
  int offers = 0;
  MediaStream? uplink;
  final List<String> appliedAnswers = [];
  final List<Map<String, dynamic>> addedCandidates = [];
  final List<String> answeredOffers = [];
  bool remoteStreamLive = false;
  void Function(Map<String, dynamic>)? iceSink;

  @override
  RTCVideoRenderer? get localRenderer => null;
  @override
  RTCVideoRenderer? get remoteRenderer => null;
  @override
  MediaStream? get localStream => uplink ?? FakeMediaStream();
  @override
  bool get hasRemoteStream => remoteStreamLive;

  @override
  Future<void> open(
      {required bool video,
      required List<Map<String, dynamic>> iceServers}) async {
    opens++;
    if (failOpen) throw Exception('no mic');
    uplink = FakeMediaStream();
  }

  @override
  Future<void> openPeer(
      {required List<Map<String, dynamic>> iceServers}) async {
    peerOpens++;
  }

  @override
  Future<void> setLocalStream(MediaStream stream) async {
    uplink = stream;
  }

  @override
  Future<String> createOffer() async {
    offers++;
    return 'fake-group-offer-$offers';
  }

  @override
  Future<String> answerTo(String offerSdp) async {
    answeredOffers.add(offerSdp);
    return 'fake-group-answer';
  }

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

SessionController makeGroupSession(
    FakeGroupHttp fake, List<FakeGroupMedia> created) {
  final s = SessionController(httpClient: fake);
  s.mediaFactory = () {
    final m = FakeGroupMedia();
    created.add(m);
    return m;
  };
  s.selfId = 'me';
  s.chats = [
    {'id': 'room-1', 'title': 'Study', 'kind': 'group'},
  ];
  addTearDown(s.disposeAll);
  return s;
}

Map<String, dynamic> peer(String id, String name) => {
      'id': id,
      'display_name': name,
      'avatar_color': '#315BCD',
    };

void main() {
  group('group join', () {
    test('join posts join and offers every existing participant', () async {
      final fake = FakeGroupHttp();
      final created = <FakeGroupMedia>[];
      fake.handler = (req, body) async {
        if (req.url.path == '/api/v1/calls/ice-servers') {
          return groupJsonRes({
            'ice_servers': [
              {'urls': 'stun:stun.l.google.com:19302'}
            ]
          }, 200);
        }
        if (req.method == 'POST' && req.url.path == '/api/v1/calls/group/join') {
          return groupJsonRes({
            'status': 'joined',
            'room_id': 'room-1',
            'participants': [peer('me', 'Me'), peer('a', 'A'), peer('b', 'B')],
          }, 201);
        }
        return groupJsonRes({'status': 'relayed'}, 200);
      };
      final s = makeGroupSession(fake, created);
      await s.joinGroupCall('room-1', 'video');
      expect(s.groupCall?['room_id'], 'room-1');
      expect(s.groupCall?['title'], 'Study');
      final parts = List.from(s.groupCall?['participants'] ?? []);
      expect(parts.map((p) => p['id']).toList(), ['a', 'b']);
      // One local uplink + one peer PC per remote seat, each carrying it.
      expect(created.length, 3);
      expect(created[0].opens, 1);
      expect(created[1].peerOpens, 1);
      expect(created[2].peerOpens, 1);
      expect(created[1].uplink, isNotNull);
      expect(created[2].uplink, isNotNull);
      expect(created[1].offers, 1);
      expect(created[2].offers, 1);
      final offers = fake.calls
          .where((c) => c.contains('/api/v1/calls/group/signal'))
          .toList();
      expect(offers.length, 2);
      expect(
          offers.any((c) =>
              c.contains('"target_user_id":"a"') &&
              c.contains('"type":"offer"')),
          isTrue);
      expect(
          offers.any((c) =>
              c.contains('"target_user_id":"b"') &&
              c.contains('"type":"offer"')),
          isTrue);
    });

    test('join dedups self and survives media failure', () async {
      final fake = FakeGroupHttp();
      final created = <FakeGroupMedia>[];
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path == '/api/v1/calls/group/join') {
          return groupJsonRes({
            'status': 'joined',
            'room_id': 'room-1',
            'participants': [peer('me', 'Me')],
          }, 201);
        }
        return groupJsonRes({}, 200);
      };
      final s = makeGroupSession(fake, created);
      // Fail the local uplink: signaling still joins.
      s.mediaFactory = () {
        final m = FakeGroupMedia()..failOpen = true;
        created.add(m);
        return m;
      };
      await s.joinGroupCall('room-1', 'voice');
      expect(s.groupMediaIssue, isTrue);
      expect(s.groupCall?['room_id'], 'room-1');
      expect(List.from(s.groupCall?['participants'] ?? []), isEmpty);
    });

    test('ninth seat surfaces the full notice', () async {
      final fake = FakeGroupHttp();
      final created = <FakeGroupMedia>[];
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path == '/api/v1/calls/group/join') {
          return groupJsonRes({'error': 'group call is full'}, 409);
        }
        return groupJsonRes({}, 200);
      };
      final s = makeGroupSession(fake, created);
      await s.joinGroupCall('room-1', 'voice');
      expect(s.groupCall, isNull);
      expect(s.notice.contains('8명'), isTrue);
    });
  });

  group('group mesh events', () {
    Future<SessionController> joined(FakeGroupHttp fake,
        List<FakeGroupMedia> created, List<Map<String, dynamic>> parts) async {
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path == '/api/v1/calls/group/join') {
          return groupJsonRes(
              {'status': 'joined', 'room_id': 'room-1', 'participants': parts},
              201);
        }
        return groupJsonRes({'status': 'relayed'}, 200);
      };
      final s = makeGroupSession(fake, created);
      await s.joinGroupCall('room-1', 'voice');
      return s;
    }

    test('user_joined adds the tile without a counter-offer', () async {
      final fake = FakeGroupHttp();
      final created = <FakeGroupMedia>[];
      final s = await joined(fake, created, [peer('me', 'Me')]);
      final signalsBefore =
          fake.calls.where((c) => c.contains('/group/signal')).length;
      s.debugGroupJoined({
        'type': 'call.group.user_joined',
        'room_id': 'room-1',
        'user_id': 'c',
        'user_name': 'C',
      });
      final parts = List.from(s.groupCall?['participants'] ?? []);
      expect(parts.map((p) => p['id']).toList(), contains('c'));
      // No counter-offer: the joiner offers to us (glare-free).
      expect(fake.calls.where((c) => c.contains('/group/signal')).length,
          signalsBefore);
      // Duplicate joins collapse to one tile.
      s.debugGroupJoined({
        'type': 'call.group.user_joined',
        'room_id': 'room-1',
        'user_id': 'c',
        'user_name': 'C',
      });
      expect(
          List.from(s.groupCall?['participants'] ?? [])
              .where((p) => p['id'] == 'c')
              .length,
          1);
      // Other rooms and self echoes are ignored.
      s.debugGroupJoined({
        'type': 'call.group.user_joined',
        'room_id': 'room-9',
        'user_id': 'x',
        'user_name': 'X',
      });
      s.debugGroupJoined({
        'type': 'call.group.user_joined',
        'room_id': 'room-1',
        'user_id': 'me',
        'user_name': 'Me',
      });
      expect(List.from(s.groupCall?['participants'] ?? []).length, 1);
    });

    test('signals route per peer: offer answered, answer applied, ICE added',
        () async {
      final fake = FakeGroupHttp();
      final created = <FakeGroupMedia>[];
      final s = await joined(
          fake, created, [peer('me', 'Me'), peer('a', 'A')]);
      final peerMedia = s.groupPeerMedia['a'] as FakeGroupMedia;
      await s.debugGroupSignal({
        'type': 'call.group.signal',
        'room_id': 'room-1',
        'from_user_id': 'a',
        'signal': {'type': 'offer', 'sdp': 'offer-from-a'},
      });
      expect(peerMedia.answeredOffers, ['offer-from-a']);
      expect(
          fake.calls.any((c) =>
              c.contains('"target_user_id":"a"') &&
              c.contains('"type":"answer"')),
          isTrue);
      await s.debugGroupSignal({
        'type': 'call.group.signal',
        'room_id': 'room-1',
        'from_user_id': 'a',
        'signal': {'type': 'answer', 'sdp': 'answer-from-a'},
      });
      expect(peerMedia.appliedAnswers, ['answer-from-a']);
      await s.debugGroupSignal({
        'type': 'call.group.signal',
        'room_id': 'room-1',
        'from_user_id': 'a',
        'signal': {
          'type': 'ice-candidate',
          'candidate': {'candidate': 'cand-1'}
        },
      });
      expect(peerMedia.addedCandidates.length, 1);
      // Unknown seats build the answer-side PC lazily.
      await s.debugGroupSignal({
        'type': 'call.group.signal',
        'room_id': 'room-1',
        'from_user_id': 'z',
        'signal': {'type': 'offer', 'sdp': 'offer-from-z'},
      });
      expect(s.groupPeerMedia.containsKey('z'), isTrue);
      expect(
          fake.calls.any((c) =>
              c.contains('"target_user_id":"z"') &&
              c.contains('"type":"answer"')),
          isTrue);
    });

    test('user_left disposes that peer only', () async {
      final fake = FakeGroupHttp();
      final created = <FakeGroupMedia>[];
      final s = await joined(
          fake, created, [peer('me', 'Me'), peer('a', 'A'), peer('b', 'B')]);
      final mediaA = s.groupPeerMedia['a'] as FakeGroupMedia;
      final mediaB = s.groupPeerMedia['b'] as FakeGroupMedia;
      s.debugGroupLeft({
        'type': 'call.group.user_left',
        'room_id': 'room-1',
        'user_id': 'a',
      });
      expect(mediaA.disposed, isTrue);
      expect(mediaB.disposed, isFalse);
      expect(s.groupPeerMedia.containsKey('a'), isFalse);
      final parts = List.from(s.groupCall?['participants'] ?? []);
      expect(parts.map((p) => p['id']).toList(), ['b']);
    });

    test('leave posts leave and disposes everything', () async {
      final fake = FakeGroupHttp();
      final created = <FakeGroupMedia>[];
      final s = await joined(
          fake, created, [peer('me', 'Me'), peer('a', 'A')]);
      await s.leaveGroupCall();
      expect(s.groupCall, isNull);
      expect(s.groupPeerMedia, isEmpty);
      expect(
          fake.calls.any((c) => c.contains('/api/v1/calls/group/leave')),
          isTrue);
      for (final m in created) {
        expect(m.disposed, isTrue);
      }
    });
  });

  group('group busy rules', () {
    test('joining twice or during 1:1 surfaces busy', () async {
      final fake = FakeGroupHttp();
      final created = <FakeGroupMedia>[];
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path == '/api/v1/calls/group/join') {
          return groupJsonRes({
            'status': 'joined',
            'room_id': 'room-1',
            'participants': [peer('me', 'Me')],
          }, 201);
        }
        return groupJsonRes({}, 200);
      };
      final s = makeGroupSession(fake, created);
      await s.joinGroupCall('room-1', 'voice');
      final joins =
          fake.calls.where((c) => c.contains('/calls/group/join')).length;
      await s.joinGroupCall('room-1', 'voice');
      expect(fake.calls.where((c) => c.contains('/calls/group/join')).length,
          joins);
      expect(s.notice.contains('다른 통화 중'), isTrue);
      s.activeCall = {'id': 'call-1', 'state': 'connected'};
      s.groupCall = null;
      await s.joinGroupCall('room-1', 'voice');
      expect(fake.calls.where((c) => c.contains('/calls/group/join')).length,
          joins);
      expect(s.notice.contains('다른 통화 중'), isTrue);
    });

    test('1:1 ring during a group call auto-declines', () async {
      final fake = FakeGroupHttp();
      final created = <FakeGroupMedia>[];
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path == '/api/v1/calls/group/join') {
          return groupJsonRes({
            'status': 'joined',
            'room_id': 'room-1',
            'participants': [peer('me', 'Me')],
          }, 201);
        }
        return groupJsonRes({}, 200);
      };
      final s = makeGroupSession(fake, created);
      await s.joinGroupCall('room-1', 'voice');
      s.debugIncomingRing({
        'type': 'call.ringing',
        'call_id': 'call-9',
        'conversation_id': 'c9',
        'kind': 'voice',
        'initiated_by': 'peer',
        'caller_name': 'Peer',
      });
      // The decline posts asynchronously; the ring must not take over.
      await Future<void>.delayed(Duration.zero);
      expect(s.activeCall, isNull);
      expect(s.groupCall, isNotNull);
      expect(
          fake.calls.any((c) =>
              c.contains('/api/v1/calls/call-9/state') &&
              c.contains('"state":"declined"')),
          isTrue);
    });

    test('backgrounding leaves the group call', () async {
      final fake = FakeGroupHttp();
      final created = <FakeGroupMedia>[];
      fake.handler = (req, body) async {
        if (req.method == 'POST' && req.url.path == '/api/v1/calls/group/join') {
          return groupJsonRes({
            'status': 'joined',
            'room_id': 'room-1',
            'participants': [peer('me', 'Me')],
          }, 201);
        }
        return groupJsonRes({}, 200);
      };
      final s = makeGroupSession(fake, created);
      await s.joinGroupCall('room-1', 'voice');
      expect(s.groupCall, isNotNull);
      s.onAppBackgrounded();
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(s.groupCall, isNull);
      expect(
          fake.calls.any((c) => c.contains('/api/v1/calls/group/leave')),
          isTrue);
    });
  });
}
