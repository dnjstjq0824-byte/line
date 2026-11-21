// Voice-note recording dialog and in-bubble player for chat rooms.
//
// Recording is AAC-LC mono in an .m4a container (audio/mp4), matching the
// shape the backend voice tests pin. Playback fetches bytes over the
// authenticated attachment endpoint and plays from memory, because
// audioplayers UrlSource cannot carry the Authorization header.
import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import 'attachments.dart';
import './app_l10n.dart';

/// Two-minute cap: at 32kbps mono this stays near the 512KiB attachment
/// ceiling (120s x 4KB/s), and sendVoice still enforces the cap server-side.
const maxVoiceSeconds = 120;

/// A finished recording handed from the dialog to the chat composer.
class VoiceRecording {
  final Uint8List bytes;
  final int seconds;
  const VoiceRecording(this.bytes, this.seconds);
}

/// Tap-to-start / tap-to-stop recording dialog with preview and resend.
class VoiceRecordDialog extends StatefulWidget {
  const VoiceRecordDialog({super.key});

  @override
  State<VoiceRecordDialog> createState() => _VoiceRecordDialogState();
}

class _VoiceRecordDialogState extends State<VoiceRecordDialog> {
  final AudioRecorder _rec = AudioRecorder();
  final AudioPlayer _player = AudioPlayer();
  bool _recording = false;
  bool _playing = false;
  bool _busy = false;
  int _seconds = 0;
  Timer? _timer;
  String? _path;
  Uint8List? _bytes;
  String? _error;

  Future<void> _start() async {
    setState(() {
      _error = null;
      _bytes = null;
      _busy = true;
    });
    bool allowed = false;
    try {
      allowed = await _rec.hasPermission();
    } catch (_) {
      allowed = false;
    }
    if (!allowed) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = context.l10n.recMicNeed;
        });
      }
      return;
    }
    final dir = await getTemporaryDirectory();
    _path =
        '${dir.path}/luno_voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
    try {
      await _rec.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          bitRate: 32000,
          sampleRate: 22050,
          numChannels: 1,
        ),
        path: _path!,
      );
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = context.l10n.recStartFail;
        });
      }
      return;
    }
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _seconds++);
      if (_seconds >= maxVoiceSeconds) _stop();
    });
    if (mounted) {
      setState(() {
        _busy = false;
        _recording = true;
        _seconds = 0;
      });
    }
  }

  Future<void> _stop() async {
    _timer?.cancel();
    _timer = null;
    setState(() => _busy = true);
    try {
      await _rec.stop();
    } catch (_) {
      // Fall through to the byte check below.
    }
    Uint8List? data;
    try {
      if (_path != null) data = await File(_path!).readAsBytes();
    } catch (_) {
      data = null;
    }
    if (!mounted) return;
    if (data == null || data.isEmpty) {
      setState(() {
        _busy = false;
        _recording = false;
        _error = context.l10n.recEmpty;
      });
      return;
    }
    if (data.length > maxAttachmentBytes) {
      setState(() {
        _busy = false;
        _recording = false;
        _bytes = null;
        _error = context.l10n.recTooLong;
      });
      return;
    }
    setState(() {
      _busy = false;
      _recording = false;
      _bytes = data;
    });
  }

  Future<void> _togglePreview() async {
    final data = _bytes;
    if (data == null) return;
    if (_playing) {
      try {
        await _player.stop();
      } catch (_) {
        // Already stopped; just reset the label.
      }
      if (mounted) setState(() => _playing = false);
      return;
    }
    setState(() => _playing = true);
    _player.onPlayerComplete.first.then((_) {
      if (mounted) setState(() => _playing = false);
    });
    try {
      await _player.play(BytesSource(data));
    } catch (_) {
      if (mounted) {
        setState(() {
          _playing = false;
          _error = context.l10n.recPreviewFail;
        });
      }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _rec.dispose();
    _player.dispose();
    final path = _path;
    if (path != null) {
      try {
        File(path).deleteSync();
      } catch (_) {
        // Best-effort temp cleanup.
      }
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final done = _bytes != null;
    return AlertDialog(
      title: Text(context.l10n.recTitle),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            voiceDurationLabel(_seconds),
            style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          if (_error != null)
            Text(_error!, style: const TextStyle(color: Colors.red))
          else if (_recording)
            Text(context.l10n.recWhile)
          else if (done)
            Text(context.l10n.recPreviewHint)
          else
            Text(context.l10n.recMaxHint),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(),
          child: Text(context.l10n.mvCancel),
        ),
        if (_recording)
          ElevatedButton(
            onPressed: _busy ? null : _stop,
            child: Text(context.l10n.recStop),
          )
        else if (done) ...[
          TextButton(
            onPressed: _busy ? null : _start,
            child: Text(context.l10n.recRedo),
          ),
          TextButton(
            onPressed: _togglePreview,
            child: Text(_playing ? context.l10n.recPreviewStop : context.l10n.recPreview),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(
              VoiceRecording(_bytes!, _seconds < 1 ? 1 : _seconds),
            ),
            child: Text(context.l10n.sendBtn),
          ),
        ] else
          ElevatedButton(
            onPressed: _busy ? null : _start,
            child: Text(context.l10n.recStart),
          ),
      ],
    );
  }
}

/// Inline player for kind=voice bubbles: play/stop toggle plus M:SS length.
/// Network and audio objects are created lazily on first tap so merely
/// rendering a bubble never touches platform channels.
class VoiceBubble extends StatefulWidget {
  final String url;
  final String token;
  final int durationSec;
  final Color foreground;
  final Future<Uint8List> Function(Uint8List)? openSealed;
  const VoiceBubble({
    super.key,
    required this.url,
    required this.token,
    required this.durationSec,
    required this.foreground,
    this.openSealed,
  });

  @override
  State<VoiceBubble> createState() => _VoiceBubbleState();
}

class _VoiceBubbleState extends State<VoiceBubble> {
  Uint8List? _bytes;
  bool _loading = false;
  bool _playing = false;
  String? _error;
  AudioPlayer? _player;
  StreamSubscription<void>? _doneSub;

  Future<void> _toggle() async {
    if (_playing) {
      try {
        await _player?.stop();
      } catch (_) {
        // Already stopped; just reset the icon.
      }
      if (mounted) setState(() => _playing = false);
      return;
    }
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final cached = _bytes;
      if (cached == null) {
        final res = await http.get(Uri.parse(widget.url),
                headers: {'Authorization': 'Bearer ${widget.token}'})
            .timeout(const Duration(seconds: 15));
        if (res.statusCode != 200) throw Exception('voice ${res.statusCode}');
        var bytes = res.bodyBytes;
        if (widget.openSealed != null) bytes = await widget.openSealed!(bytes);
        _bytes = bytes;
      }
      final player = _player ??= AudioPlayer();
      _doneSub ??= player.onPlayerComplete.listen((_) {
        if (mounted) setState(() => _playing = false);
      });
      await player.play(BytesSource(_bytes!));
      if (mounted) {
        setState(() {
          _loading = false;
          _playing = true;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = context.l10n.mediaPlayFail;
        });
      }
    }
  }

  @override
  void dispose() {
    _doneSub?.cancel();
    _player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_loading)
          SizedBox(
            width: 32,
            height: 32,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: widget.foreground,
            ),
          )
        else
          IconButton(
            tooltip: _playing ? context.l10n.recStop : context.l10n.recPlay,
            icon: Icon(_playing ? Icons.stop_circle : Icons.play_circle,
                color: widget.foreground),
            onPressed: _toggle,
          ),
        Text(
          _error ?? voiceDurationLabel(widget.durationSec),
          style: TextStyle(color: widget.foreground, fontSize: 14),
        ),
      ],
    );
  }
}
