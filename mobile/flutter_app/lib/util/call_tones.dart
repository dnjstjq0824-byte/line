// Call sounds for the 1:1 call screen. Build 13 rang in silence: the caller
// heard nothing while waiting and the callee only saw the screen. Tones are
// synthesized as small WAV clips (no bundled audio, no new dependency) and
// looped through audioplayers; the callee also gets a vibration pulse.
import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/services.dart';

enum CallToneMode { none, ringback, ringtone }

/// Which sound a call in [call] should make right now: the caller hears the
/// ringback while the other side rings, the callee hears the ringtone, and
/// everything stops once the call connects or ends.
CallToneMode callToneMode(Map<String, dynamic>? call) {
  if (call == null) return CallToneMode.none;
  final state = '${call['state'] ?? 'ringing'}';
  if (state != 'ringing') return CallToneMode.none;
  return '${call['direction'] ?? ''}' == 'incoming'
      ? CallToneMode.ringtone
      : CallToneMode.ringback;
}

const _rate = 16000;

/// One loop of the tone as a 16-bit mono PCM WAV.
/// - ringback: Korean-style 440+480 Hz, 1 s on / 2 s off.
/// - ringtone: two soft chimes (E6 then C6) and a pause, 2 s per loop.
Uint8List callToneWav(CallToneMode mode) {
  final samples = <double>[];
  void tone(double seconds, List<double> freqs, {double gain = 0.35}) {
    final n = (seconds * _rate).round();
    for (var i = 0; i < n; i++) {
      final t = i / _rate;
      // 10 ms fade in/out avoids clicks at the edges.
      final edge = math.min(1.0, math.min(i, n - 1 - i) / (_rate * 0.01));
      var v = 0.0;
      for (final f in freqs) {
        v += math.sin(2 * math.pi * f * t);
      }
      samples.add(gain * edge * v / freqs.length);
    }
  }

  void silence(double seconds) {
    samples.addAll(List.filled((seconds * _rate).round(), 0.0));
  }

  switch (mode) {
    case CallToneMode.ringback:
      tone(1.0, [440, 480]);
      silence(2.0);
    case CallToneMode.ringtone:
      tone(0.25, [1318.5], gain: 0.5);
      silence(0.05);
      tone(0.35, [1046.5], gain: 0.5);
      silence(1.35);
    case CallToneMode.none:
      silence(0.1);
  }

  final data = ByteData(44 + samples.length * 2);
  void ascii(int at, String s) {
    for (var i = 0; i < s.length; i++) {
      data.setUint8(at + i, s.codeUnitAt(i));
    }
  }

  ascii(0, 'RIFF');
  data.setUint32(4, 36 + samples.length * 2, Endian.little);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  data.setUint32(16, 16, Endian.little);
  data.setUint16(20, 1, Endian.little); // PCM
  data.setUint16(22, 1, Endian.little); // mono
  data.setUint32(24, _rate, Endian.little);
  data.setUint32(28, _rate * 2, Endian.little);
  data.setUint16(32, 2, Endian.little);
  data.setUint16(34, 16, Endian.little);
  ascii(36, 'data');
  data.setUint32(40, samples.length * 2, Endian.little);
  for (var i = 0; i < samples.length; i++) {
    final v = (samples[i].clamp(-1.0, 1.0) * 32767).round();
    data.setInt16(44 + i * 2, v, Endian.little);
  }
  return data.buffer.asUint8List();
}

/// Plays one [CallToneMode] at a time. Tests swap [CallTonePlayer.instance]
/// for a fake so no platform channel is touched.
class CallTonePlayer {
  static CallTonePlayer instance = CallTonePlayer();

  AudioPlayer? _player;
  Timer? _buzz;
  CallToneMode current = CallToneMode.none;

  Future<void> play(CallToneMode mode) async {
    if (mode == current) return;
    await stop();
    current = mode;
    if (mode == CallToneMode.none) return;
    try {
      final player = _player ??= AudioPlayer();
      await player.setReleaseMode(ReleaseMode.loop);
      await player.play(BytesSource(callToneWav(mode), mimeType: 'audio/wav'));
    } catch (_) {
      // Sound is best effort; the call screen works without it.
    }
    if (mode == CallToneMode.ringtone) {
      HapticFeedback.vibrate();
      _buzz = Timer.periodic(const Duration(seconds: 2), (_) {
        HapticFeedback.vibrate();
      });
    }
  }

  Future<void> stop() async {
    current = CallToneMode.none;
    _buzz?.cancel();
    _buzz = null;
    try {
      await _player?.stop();
    } catch (_) {}
  }
}
