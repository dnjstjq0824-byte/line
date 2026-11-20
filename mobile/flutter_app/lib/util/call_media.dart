// N2-L: 1:1 call media over flutter_webrtc.
//
// CallMedia is the seam SessionController drives: open local media, trade
// offer/answer/ICE through the existing signal endpoint, toggle mute/video,
// switch cameras, and route audio to the speaker. WebrtcCallMedia is the
// production implementation; tests inject a fake through
// SessionController.mediaFactory so no platform channel is touched.
// Policy mirrors apps/shared/call_policy.ts (web) exactly.
import 'package:flutter_webrtc/flutter_webrtc.dart';

/// Unanswered calls end after 30s (CALL_NO_ANSWER_MS on the web).
const callNoAnswerTimeout = Duration(seconds: 30);

abstract class CallMedia {
  RTCVideoRenderer? get localRenderer;
  RTCVideoRenderer? get remoteRenderer;

  // F15: mesh uplink. The group call opens one full media (local tile +
  // mute/video/switch) and one peer media per remote seat; each peer PC
  // carries the shared local stream so every seat receives our tracks.
  MediaStream? get localStream;
  Future<void> openPeer({required List<Map<String, dynamic>> iceServers});
  Future<void> setLocalStream(MediaStream stream);
  // F15: true once a remote track arrived (tiles show video, else avatar).
  bool get hasRemoteStream;

  Future<void> open(
      {required bool video, required List<Map<String, dynamic>> iceServers});
  Future<String> createOffer();
  Future<String> answerTo(String offerSdp);
  Future<void> applyAnswer(String answerSdp);
  Future<void> addIceCandidate(Map<String, dynamic> candidate);
  void onIceCandidate(void Function(Map<String, dynamic>) emit);
  void onRemoteStream(void Function() changed);
  Future<void> setMuted(bool muted);
  Future<void> setVideoOff(bool off);
  Future<void> switchCamera();
  Future<void> setSpeaker(bool on);
  Future<void> dispose();
}

class WebrtcCallMedia implements CallMedia {
  RTCPeerConnection? _pc;
  MediaStream? _stream;
  // Build 19: a candidate that arrives before the offer/answer it belongs to
  // cannot be added yet (addCandidate fails without a remote description).
  // Android dropped them, so phone-to-phone calls lost the direct (same
  // Wi-Fi) route on both sides and never carried audio. Held here instead.
  bool _remoteSet = false;
  final List<RTCIceCandidate> _pendingCandidates = [];

  Future<void> _remoteReady() async {
    _remoteSet = true;
    final held = List<RTCIceCandidate>.of(_pendingCandidates);
    _pendingCandidates.clear();
    for (final c in held) {
      try {
        await _pc!.addCandidate(c);
      } catch (_) {}
    }
  }
  RTCVideoRenderer? _local;
  RTCVideoRenderer? _remote;

  @override
  RTCVideoRenderer? get localRenderer => _local;

  @override
  RTCVideoRenderer? get remoteRenderer => _remote;

  @override
  MediaStream? get localStream => _stream;

  @override
  bool get hasRemoteStream => _remote?.srcObject != null;

  Future<void> _openPeerConnection(
      List<Map<String, dynamic>> iceServers) async {
    _local = RTCVideoRenderer();
    _remote = RTCVideoRenderer();
    await _local!.initialize();
    await _remote!.initialize();
    _pc = await createPeerConnection({'iceServers': iceServers});
    _pc!.onTrack = (event) {
      if (event.streams.isNotEmpty) _remote!.srcObject = event.streams[0];
    };
  }

  @override
  Future<void> openPeer(
      {required List<Map<String, dynamic>> iceServers}) async {
    await _openPeerConnection(iceServers);
  }

  @override
  Future<void> setLocalStream(MediaStream stream) async {
    for (final track in stream.getTracks()) {
      await _pc!.addTrack(track, stream);
    }
  }

  @override
  Future<void> open(
      {required bool video,
      required List<Map<String, dynamic>> iceServers}) async {
    await _openPeerConnection(iceServers);
    _stream = await navigator.mediaDevices
        .getUserMedia({'audio': true, 'video': video});
    for (final track in _stream!.getTracks()) {
      await _pc!.addTrack(track, _stream!);
    }
    _local!.srcObject = _stream;
  }

  @override
  Future<String> createOffer() async {
    final offer = await _pc!.createOffer();
    await _pc!.setLocalDescription(offer);
    return offer.sdp ?? '';
  }

  @override
  Future<String> answerTo(String offerSdp) async {
    await _pc!.setRemoteDescription(
        RTCSessionDescription(offerSdp, 'offer'));
    await _remoteReady();
    final answer = await _pc!.createAnswer();
    await _pc!.setLocalDescription(answer);
    return answer.sdp ?? '';
  }

  @override
  Future<void> applyAnswer(String answerSdp) async {
    await _pc!.setRemoteDescription(
        RTCSessionDescription(answerSdp, 'answer'));
    await _remoteReady();
  }

  @override
  Future<void> addIceCandidate(Map<String, dynamic> candidate) async {
    final c = RTCIceCandidate(candidate['candidate'] as String?,
        candidate['sdpMid'] as String?, (candidate['sdpMLineIndex'] as num?)?.toInt());
    if (!_remoteSet) {
      _pendingCandidates.add(c);
      return;
    }
    await _pc!.addCandidate(c);
  }

  @override
  void onIceCandidate(void Function(Map<String, dynamic>) emit) {
    _pc!.onIceCandidate = (candidate) {
      emit({
        'candidate': candidate.candidate,
        'sdpMid': candidate.sdpMid,
        'sdpMLineIndex': candidate.sdpMLineIndex,
      });
    };
  }

  @override
  void onRemoteStream(void Function() changed) {
    final prev = _pc!.onTrack;
    _pc!.onTrack = (event) {
      prev?.call(event);
      changed();
    };
  }

  @override
  Future<void> setMuted(bool muted) async {
    for (final track in _stream?.getAudioTracks() ?? <MediaStreamTrack>[]) {
      track.enabled = !muted;
    }
  }

  @override
  Future<void> setVideoOff(bool off) async {
    for (final track in _stream?.getVideoTracks() ?? <MediaStreamTrack>[]) {
      track.enabled = !off;
    }
  }

  @override
  Future<void> switchCamera() async {
    final video = _stream?.getVideoTracks();
    if (video == null || video.isEmpty) return;
    await Helper.switchCamera(video.first);
  }

  @override
  Future<void> setSpeaker(bool on) => Helper.setSpeakerphoneOn(on);

  @override
  Future<void> dispose() async {
    try {
      await _stream?.dispose();
    } catch (_) {}
    try {
      await _pc?.close();
    } catch (_) {}
    try {
      await _local?.dispose();
    } catch (_) {}
    try {
      await _remote?.dispose();
    } catch (_) {}
    _pc = null;
    _stream = null;
    _remoteSet = false;
    _pendingCandidates.clear();
    _local = null;
    _remote = null;
  }
}
