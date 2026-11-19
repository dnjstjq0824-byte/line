// Calls used to ring in silence. The caller now hears a ringback, the callee
// a ringtone, and both stop once the call connects or the overlay goes away.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/pages/call_overlay.dart';
import 'package:luno_messenger/util/call_tones.dart';

class _FakeTones extends CallTonePlayer {
  final played = <CallToneMode>[];
  int stops = 0;
  @override
  Future<void> play(CallToneMode mode) async {
    if (mode == current) return;
    current = mode;
    played.add(mode);
  }

  @override
  Future<void> stop() async {
    current = CallToneMode.none;
    stops++;
  }
}

void main() {
  test('tone follows direction and state', () {
    expect(callToneMode(null), CallToneMode.none);
    expect(callToneMode({'direction': 'outgoing', 'state': 'ringing'}),
        CallToneMode.ringback);
    expect(callToneMode({'direction': 'outgoing'}), CallToneMode.ringback);
    expect(callToneMode({'direction': 'incoming', 'state': 'ringing'}),
        CallToneMode.ringtone);
    expect(callToneMode({'direction': 'incoming', 'state': 'connected'}),
        CallToneMode.none);
    expect(callToneMode({'direction': 'outgoing', 'state': 'connected'}),
        CallToneMode.none);
  });

  test('generated tones are valid 16 kHz mono WAV loops', () {
    for (final entry in {
      CallToneMode.ringback: 3.0,
      CallToneMode.ringtone: 2.0,
    }.entries) {
      final wav = callToneWav(entry.key);
      final b = ByteData.sublistView(wav);
      expect(String.fromCharCodes(wav.sublist(0, 4)), 'RIFF');
      expect(String.fromCharCodes(wav.sublist(8, 12)), 'WAVE');
      expect(b.getUint16(22, Endian.little), 1);
      expect(b.getUint32(24, Endian.little), 16000);
      final seconds = b.getUint32(40, Endian.little) / 2 / 16000;
      expect(seconds, closeTo(entry.value, 0.01));
      expect(wav.length, 44 + b.getUint32(40, Endian.little));
    }
  });

  testWidgets('driver switches ringback off on connect and stops on unmount',
      (tester) async {
    final fake = _FakeTones();
    CallTonePlayer.instance = fake;
    await tester.pumpWidget(const CallToneDriver(mode: CallToneMode.ringback));
    expect(fake.played, [CallToneMode.ringback]);
    await tester.pumpWidget(const CallToneDriver(mode: CallToneMode.none));
    expect(fake.played.last, CallToneMode.none);
    await tester.pumpWidget(const SizedBox.shrink());
    expect(fake.stops, 1);
  });
}
