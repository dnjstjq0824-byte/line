// Disk-cached network sticker images (LUNO200). The first paint fetches the
// PNG from the server into the app cache; later paints read the file.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

typedef StickerHttpGet = Future<http.Response> Function(Uri url);

Future<Directory> stickerCacheDir() async {
  final base = await getApplicationCacheDirectory();
  final dir = Directory('${base.path}${Platform.pathSeparator}stickers');
  await dir.create(recursive: true);
  return dir;
}

/// Returns the cached file for [id], downloading [url] on a miss.
/// Throws on transport errors and non-200 responses.
Future<File> stickerImageFile({
  required String dirPath,
  required String id,
  required String url,
  StickerHttpGet? get,
}) async {
  final file = File('$dirPath${Platform.pathSeparator}$id.png');
  if (await file.exists()) return file;
  final res = await (get != null ? get(Uri.parse(url)) : http.get(Uri.parse(url)));
  if (res.statusCode != 200) throw Exception('sticker $id: HTTP ${res.statusCode}');
  await file.parent.create(recursive: true);
  await file.writeAsBytes(res.bodyBytes, flush: true);
  return file;
}

class StickerImage extends StatefulWidget {
  final String stickerId;
  final String baseUrl;
  final double size;
  final String fallbackGlyph;
  // Test seams: when set, no plugin or network is touched.
  final String? dirForTest;
  final StickerHttpGet? fetchForTest;
  const StickerImage({
    super.key,
    required this.stickerId,
    required this.baseUrl,
    this.size = 160,
    this.fallbackGlyph = '🎁',
    this.dirForTest,
    this.fetchForTest,
  });

  @override
  State<StickerImage> createState() => _StickerImageState();
}

class _StickerImageState extends State<StickerImage> {
  late Future<File> _file;

  @override
  void initState() {
    super.initState();
    _file = _load();
  }

  Future<File> _load() async {
    final dir = widget.dirForTest ?? (await stickerCacheDir()).path;
    return stickerImageFile(
      dirPath: dir,
      id: widget.stickerId,
      url: '${widget.baseUrl}/stickers/${widget.stickerId}.png',
      get: widget.fetchForTest,
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<File>(
      future: _file,
      builder: (context, snap) {
        if (snap.hasData) {
          return Image.file(
            snap.data!,
            width: widget.size,
            height: widget.size,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => Text(widget.fallbackGlyph,
                style: TextStyle(fontSize: widget.size * 0.6)),
          );
        }
        if (snap.hasError) {
          return Text(widget.fallbackGlyph,
              style: TextStyle(fontSize: widget.size * 0.6));
        }
        return SizedBox(
            width: widget.size,
            height: widget.size,
            child: const Center(
                child: SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2))));
      },
    );
  }
}
