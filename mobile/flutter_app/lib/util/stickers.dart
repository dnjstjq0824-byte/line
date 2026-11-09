// Effect-sticker resolution and bubble for chat rooms.
//
// Sticker art lives per client: web renders inline SVG, mobile renders large
// emoji. This table keeps both readable cross-client: the 12 web sticker ids
// resolve to matching emoji so a web-sent sticker never shows as a raw id,
// and mobile's own "emoji [Character]" bodies resolve to their emoji part.
// The bubble plays a one-shot pop-in (the "effect") and replays on tap.
import 'package:flutter/material.dart';

/// Web client sticker ids (apps/user-web/src/luno-stickers.ts) mapped to the
/// emoji the mobile bubble shows for them.
const webStickerEmoji = {
  'lumi_hello': '👋',
  'lumi_heart': '❤️',
  'lumi_thumbsup': '👍',
  'lumi_cry': '😢',
  'nori_happy': '😄',
  'nori_cheer': '🎉',
  'nori_thanks': '🙏',
  'nori_translate': '🌐',
  'poko_wink': '😉',
  'poko_yay': '🥳',
  'poko_question': '❓',
  'poko_ok': '👌',
};

/// Resolves the glyph a sticker bubble shows for a message body plus the
/// optional web `metadata.sticker_id`. Unknown shapes fall back to the raw
/// body so a new sticker id degrades to text instead of a blank bubble.
String stickerGlyph({required String body, String? stickerId}) {
  if (stickerId != null && webStickerEmoji.containsKey(stickerId)) {
    return webStickerEmoji[stickerId]!;
  }
  if (webStickerEmoji.containsKey(body)) return webStickerEmoji[body]!;
  final cut = body.indexOf(' [');
  if (cut > 0) return body.substring(0, cut);
  return body;
}

/// Large sticker art with a pop-in effect on first appearance; tap replays.
class StickerBubble extends StatefulWidget {
  final String glyph;
  const StickerBubble({super.key, required this.glyph});

  @override
  State<StickerBubble> createState() => _StickerBubbleState();
}

class _StickerBubbleState extends State<StickerBubble>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 450));
    _scale = Tween<double>(begin: 0.3, end: 1.0)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.elasticOut));
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _replay() => _ctrl.forward(from: 0.0);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _replay,
      child: ScaleTransition(
        scale: _scale,
        child: Text(widget.glyph, style: const TextStyle(fontSize: 72)),
      ),
    );
  }
}
