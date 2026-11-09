import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:luno_messenger/util/photo_effects.dart';

Uint8List fixturePng() {
  final frame = img.Image(width: 2, height: 1);
  frame.setPixelRgb(0, 0, 255, 0, 0);
  frame.setPixelRgb(1, 0, 0, 255, 0);
  return img.encodePng(frame);
}

void main() {
  test('effect catalog holds the three shipped ids', () {
    expect(photoEffectIds, equals(['none', 'gray', 'sepia']));
    expect(photoEffectLabel('none'), equals('원본'));
    expect(photoEffectLabel('gray'), equals('흑백'));
    expect(photoEffectLabel('sepia'), equals('세피아'));
  });

  test('none effect returns the original bytes untouched', () {
    final raw = fixturePng();
    expect(applyPhotoEffect(raw, 'none'), same(raw));
  });

  test('unknown effect id passes the original bytes through', () {
    final raw = fixturePng();
    expect(applyPhotoEffect(raw, 'bogus'), same(raw));
  });

  test('gray effect produces real grayscale pixels', () {
    final out = applyPhotoEffect(fixturePng(), 'gray');
    final frame = img.decodeImage(out)!;
    expect(frame.width, equals(2));
    expect(frame.height, equals(1));
    for (var x = 0; x < 2; x++) {
      final p = frame.getPixel(x, 0);
      // JPEG re-encode is lossy: channels stay near-equal, not bit-equal.
      expect((p.r - p.g).abs() <= 8, isTrue, reason: 'x=$x');
      expect((p.g - p.b).abs() <= 8, isTrue, reason: 'x=$x');
    }
  });

  test('sepia effect re-encodes with shifted tones', () {
    final raw = fixturePng();
    final out = applyPhotoEffect(raw, 'sepia');
    expect(out.length, isNot(equals(raw.length)));
    final frame = img.decodeImage(out)!;
    expect(frame.width, equals(2));
    final p = frame.getPixel(0, 0);
    expect(p.r >= p.b, isTrue);
  });

  testWidgets('effect sheet previews options and returns the choice', (WidgetTester tester) async {
    final bytes = fixturePng();
    String? result;
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (ctx) => ElevatedButton(
          onPressed: () async {
            result = await showModalBottomSheet<String>(
              context: ctx,
              builder: (_) => PhotoEffectSheet(bytes: bytes),
            );
          },
          child: const Text('open'),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    expect(find.text('원본'), findsOneWidget);
    expect(find.text('흑백'), findsOneWidget);
    expect(find.text('세피아'), findsOneWidget);
    await tester.tap(find.text('세피아'));
    await tester.pump();
    await tester.tap(find.text('전송'));
    await tester.pumpAndSettle();
    expect(result, equals('sepia'));
  });
}
