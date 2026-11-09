import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/attachments.dart';
import 'package:luno_messenger/util/voice_recorder.dart';

void main() {
  test('voice metadata links the attachment and carries duration', () {
    expect(
      voiceMessageMetadata(id: 'a1', mime: 'audio/mp4', size: 99, durationSec: 42),
      equals({
        'attachment_id': 'a1',
        'mime_type': 'audio/mp4',
        'size_bytes': 99,
        'duration': 42,
      }),
    );
  });

  test('voice metadata pre-clamps duration to the server window', () {
    expect(
      voiceMessageMetadata(id: 'a', mime: 'audio/mp4', size: 1, durationSec: 999)['duration'],
      equals(300),
    );
    expect(
      voiceMessageMetadata(id: 'a', mime: 'audio/mp4', size: 1, durationSec: -5)['duration'],
      equals(0),
    );
  });

  test('voice duration parses every JSON round-trip shape', () {
    expect(voiceDurationOf({'metadata': {'duration': 42}}), equals(42));
    expect(voiceDurationOf({'metadata': {'duration': 42.0}}), equals(42));
    expect(voiceDurationOf({'metadata': {'duration': '42'}}), equals(42));
    expect(voiceDurationOf({'metadata': {}}), isNull);
    expect(voiceDurationOf({'metadata': {'duration': 'x'}}), isNull);
    expect(voiceDurationOf({'body': 'hi'}), isNull);
    expect(voiceDurationOf(null), isNull);
  });

  test('voice duration label formats M:SS', () {
    expect(voiceDurationLabel(0), equals('0:00'));
    expect(voiceDurationLabel(7), equals('0:07'));
    expect(voiceDurationLabel(65), equals('1:05'));
    expect(voiceDurationLabel(600), equals('10:00'));
  });

  test('voice recording holds bytes and seconds', () {
    final rec = VoiceRecording(Uint8List(0), 9);
    expect(rec.seconds, equals(9));
    expect(rec.bytes, isEmpty);
  });

  testWidgets('voice bubble renders play control and duration without network', (WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: VoiceBubble(
          url: 'https://voice.test/api/v1/attachments/a1/content',
          token: 't',
          durationSec: 7,
          foreground: Colors.white,
        ),
      ),
    ));
    expect(find.text('0:07'), findsOneWidget);
    expect(find.byIcon(Icons.play_circle), findsOneWidget);
  });
}
