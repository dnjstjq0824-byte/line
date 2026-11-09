// Inline video player for kind=video bubbles.
//
// The controller is created lazily on first tap (with the Authorization
// header the attachment endpoint requires), so merely rendering a bubble
// never touches platform channels. Duration appears once loaded.
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import 'attachments.dart';

class VideoBubble extends StatefulWidget {
  final String url;
  final String token;
  const VideoBubble({super.key, required this.url, required this.token});

  @override
  State<VideoBubble> createState() => _VideoBubbleState();
}

class _VideoBubbleState extends State<VideoBubble> {
  VideoPlayerController? _ctrl;
  bool _loading = false;
  bool _playing = false;
  String? _error;

  Future<void> _toggle() async {
    final ctrl = _ctrl;
    if (ctrl != null && ctrl.value.isInitialized) {
      if (_playing) {
        await ctrl.pause();
      } else {
        await ctrl.play();
      }
      if (mounted) setState(() => _playing = !_playing);
      return;
    }
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final next = VideoPlayerController.networkUrl(
      Uri.parse(widget.url),
      httpHeaders: {'Authorization': 'Bearer ${widget.token}'},
    );
    try {
      await next.initialize();
      _ctrl = next;
      await next.play();
      if (mounted) {
        setState(() {
          _loading = false;
          _playing = true;
        });
      }
    } catch (_) {
      // Bounded teardown: dispose() can hang when initialize() failed
      // mid-flight, which would pin the spinner forever.
      try {
        await next.dispose().timeout(const Duration(seconds: 2),
            onTimeout: () {});
      } catch (_) {
        // Already torn down; just report the failure.
      }
      if (mounted) {
        setState(() {
          _loading = false;
          _error = '재생 실패';
        });
      }
    }
  }

  @override
  void dispose() {
    _ctrl?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = _ctrl;
    final ready = ctrl != null && ctrl.value.isInitialized;
    return GestureDetector(
      onTap: _toggle,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 240),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (ready)
              AspectRatio(
                aspectRatio: ctrl.value.aspectRatio,
                child: VideoPlayer(ctrl),
              )
            else if (_loading)
              const SizedBox(
                height: 120,
                child: Center(child: CircularProgressIndicator()),
              )
            else
              Container(
                height: 120,
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Center(
                  child: _error != null
                      ? Text(_error!,
                          style: const TextStyle(
                              color: Colors.white, fontSize: 13))
                      : const Icon(Icons.play_circle,
                          color: Colors.white, size: 44),
                ),
              ),
            const SizedBox(height: 4),
            Text(
              ready
                  ? voiceDurationLabel(ctrl.value.duration.inSeconds)
                  : '동영상',
              style: const TextStyle(fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}
