import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/stickers.dart';

void main() {
  test('web sticker table covers all 12 web sticker ids', () {
    expect(webStickerEmoji.length, equals(12));
    for (final id in [
      'lumi_hello', 'lumi_heart', 'lumi_thumbsup', 'lumi_cry',
      'nori_happy', 'nori_cheer', 'nori_thanks', 'nori_translate',
      'poko_wink', 'poko_yay', 'poko_question', 'poko_ok',
    ]) {
      expect(webStickerEmoji[id], isNotNull, reason: id);
      expect(webStickerEmoji[id]!.isNotEmpty, isTrue, reason: id);
    }
  });

  test('sticker glyph resolves web ids from metadata or body', () {
    expect(stickerGlyph(body: 'lumi_hello', stickerId: 'lumi_heart'), equals('❤️'));
    expect(stickerGlyph(body: 'poko_ok'), equals('👌'));
    expect(stickerGlyph(body: 'nori_translate', stickerId: 'bogus'), equals('🌐'));
  });

  test('sticker glyph strips the mobile character tag', () {
    expect(stickerGlyph(body: '🛸👋 [Lumi]'), equals('🛸👋'));
    expect(stickerGlyph(body: '👨‍🚀🙇 [Astro]'), equals('👨‍🚀🙇'));
  });

  test('sticker glyph falls back to the raw body for unknown ids', () {
    expect(stickerGlyph(body: 'future_id'), equals('future_id'));
    expect(stickerGlyph(body: 'future_id', stickerId: 'future_id'), equals('future_id'));
  });

  testWidgets('sticker bubble renders large art and replays on tap', (WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: StickerBubble(glyph: '👋')),
    ));
    expect(find.text('👋'), findsOneWidget);
    final text = tester.widget<Text>(find.text('👋'));
    expect(text.style?.fontSize, equals(72));
    await tester.tap(find.text('👋'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('👋'), findsOneWidget);
  });
}
