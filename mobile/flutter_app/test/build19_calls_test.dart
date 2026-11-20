// Build 19: phone-to-phone calls carried no audio and Accept did nothing.
// - the caller's first ICE candidates appear while the offer is created,
//   before the server has given the call an id; they were dropped. Now they
//   are held and posted right after the offer (offer always first)
// - accepting asks for the call permissions itself (the lock-screen Accept
//   skipped the call screen's gate)
import 'package:flutter_test/flutter_test.dart';

import 'session_call_test.dart' show FakeHttp, FakeCallMedia, jsonRes, makeSession;

class EarlyIceMedia extends FakeCallMedia {
  @override
  Future<String> createOffer() async {
    // Gathering starts as soon as the local offer is set.
    iceSink?.call({'candidate': 'host-1', 'sdpMid': '0', 'sdpMLineIndex': 0});
    iceSink?.call({'candidate': 'host-2', 'sdpMid': '0', 'sdpMLineIndex': 0});
    return offerSdp;
  }
}

void main() {
  test('early candidates are kept and posted after the offer', () async {
    final fake = FakeHttp();
    fake.handler = (req, body) async {
      if (req.method == 'POST' && req.url.path == '/api/v1/calls') {
        return jsonRes({'id': 'call-1', 'state': 'ringing'}, 201);
      }
      return jsonRes({}, 200);
    };
    final media = EarlyIceMedia();
    final s = makeSession(fake, media);
    await s.startCallIn('c1', 'voice');
    final signals = fake.calls.where((c) => c.contains('/api/v1/calls/call-1/signal ')).toList();
    expect(signals.length, 3);
    expect(signals[0], contains('"signal_type":"offer"'));
    expect(signals[1], contains('host-1'));
    expect(signals[2], contains('host-2'));
    // Later candidates go straight out.
    media.iceSink!({'candidate': 'srflx-1', 'sdpMid': '0', 'sdpMLineIndex': 0});
    await Future<void>.delayed(Duration.zero);
    expect(fake.calls.last, contains('srflx-1'));
  });

  test('accepting asks for mic and camera on a video call', () async {
    final fake = FakeHttp();
    fake.handler = (req, body) async => jsonRes({}, 200);
    final s = makeSession(fake, FakeCallMedia());
    final asked = <bool>[];
    s.ensureCallPermissions = (video) async {
      asked.add(video);
      return true;
    };
    s.debugIncomingRing({
      'type': 'call.ringing',
      'call_id': 'call-9',
      'conversation_id': 'c1',
      'initiated_by': 'peer',
      'kind': 'video',
    });
    await s.acceptCall();
    expect(asked, [true]);
    expect(s.activeCall?['state'], 'connected');
  });
}
