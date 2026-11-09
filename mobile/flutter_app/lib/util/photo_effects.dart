// Photo effects for the chat send flow (LINE in-app camera parity, stills).
//
// Effect ids are shared with the web client: none (original), gray, sepia.
// Mobile applies them with the pure-Dart image package before upload; unknown
// ids pass the original bytes through so a newer client stays readable.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;

const photoEffectIds = ['none', 'gray', 'sepia'];

String photoEffectLabel(String id) {
  switch (id) {
    case 'gray':
      return '흑백';
    case 'sepia':
      return '세피아';
    default:
      return '원본';
  }
}

/// Applies the effect, re-encoding as JPEG q85 (the picker quality). Returns
/// the identical bytes for 'none'/unknown ids and for undecodable input.
Uint8List applyPhotoEffect(Uint8List bytes, String effect) {
  if (effect != 'gray' && effect != 'sepia') return bytes;
  final frame = img.decodeImage(bytes);
  if (frame == null) return bytes;
  final out = effect == 'gray' ? img.grayscale(frame) : img.sepia(frame);
  return img.encodeJpg(out, quality: 85);
}

/// File name for an effected upload: JPEG bytes need a .jpg name.
String photoEffectName(String original, String effect) {
  if (effect != 'gray' && effect != 'sepia') return original;
  final dot = original.lastIndexOf('.');
  final base = dot > 0 ? original.substring(0, dot) : original;
  return '$base.jpg';
}

/// A picked-but-unsent image handed from the session to the effect sheet.
class PickedImage {
  final Uint8List bytes;
  final String name;
  final String mime;
  const PickedImage({required this.bytes, required this.name, required this.mime});
}

/// Bottom-sheet picker: live preview, three effects, send/cancel.
/// Pops the chosen effect id, or null when dismissed.
class PhotoEffectSheet extends StatefulWidget {
  final Uint8List bytes;
  const PhotoEffectSheet({super.key, required this.bytes});

  @override
  State<PhotoEffectSheet> createState() => _PhotoEffectSheetState();
}

class _PhotoEffectSheetState extends State<PhotoEffectSheet> {
  String _effect = 'none';
  final _cache = <String, Uint8List>{};

  Uint8List _preview(String id) =>
      _cache.putIfAbsent(id, () => applyPhotoEffect(widget.bytes, id));

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.memory(_preview(_effect),
                  height: 220, fit: BoxFit.contain),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                for (final id in photoEffectIds)
                  ChoiceChip(
                    label: Text(photoEffectLabel(id)),
                    selected: _effect == id,
                    onSelected: (_) => setState(() => _effect = id),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('취소'),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: () => Navigator.of(context).pop(_effect),
                  child: const Text('전송'),
                ),
              ],
            ),
          ],
        ),
        ),
      ),
    );
  }
}
