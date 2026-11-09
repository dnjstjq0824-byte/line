// In-app camera sheet (LINE camera parity: photo + short video stills).
//
// Unlike image_picker (which shells out to the system camera), this sheet
// previews and captures inside the app. Photos flow into the photo effect
// sheet; videos (low preset, 8s cap for the 512KiB attachment ceiling) send
// directly. GIF/avatar modes stay open.
import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import 'photo_effects.dart';

/// Recording cap: low-preset clips past this rarely fit 512KiB.
const maxVideoSeconds = 8;

/// Full-screen camera dialog. Pops the captured PickedImage, or null.
class InAppCameraSheet extends StatefulWidget {
  const InAppCameraSheet({super.key});

  @override
  State<InAppCameraSheet> createState() => _InAppCameraSheetState();
}

class _InAppCameraSheetState extends State<InAppCameraSheet> {
  CameraController? _ctrl;
  List<CameraDescription> _cams = [];
  int _index = 0;
  bool _busy = false;
  bool _video = false;
  bool _recording = false;
  int _elapsed = 0;
  Timer? _timer;
  String? _error;

  @override
  void initState() {
    super.initState();
    _open();
  }

  Future<void> _open() async {
    List<CameraDescription> cams;
    try {
      cams = await availableCameras();
    } catch (_) {
      if (mounted) setState(() => _error = '카메라를 사용할 수 없습니다.');
      return;
    }
    if (cams.isEmpty) {
      if (mounted) setState(() => _error = '사용 가능한 카메라가 없습니다.');
      return;
    }
    _cams = cams;
    _index =
        cams.indexWhere((c) => c.lensDirection == CameraLensDirection.back);
    if (_index < 0) _index = 0;
    await _attach();
  }

  Future<void> _attach() async {
    await _ctrl?.dispose();
    _ctrl = null;
    final ctrl = CameraController(
      _cams[_index],
      _video ? ResolutionPreset.low : ResolutionPreset.medium,
      enableAudio: false,
    );
    try {
      await ctrl.initialize();
    } catch (_) {
      if (mounted) setState(() => _error = '카메라를 시작할 수 없습니다.');
      return;
    }
    if (mounted) setState(() => _ctrl = ctrl);
  }

  Future<void> _setMode(bool video) async {
    if (_video == video || _busy || _recording) return;
    setState(() {
      _busy = true;
      _video = video;
      _ctrl = null;
      _error = null;
    });
    await _attach();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _flip() async {
    if (_cams.length < 2 || _busy || _recording) return;
    setState(() {
      _busy = true;
      _ctrl = null;
    });
    _index = (_index + 1) % _cams.length;
    await _attach();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _capturePhoto() async {
    final ctrl = _ctrl;
    if (ctrl == null || !ctrl.value.isInitialized || _busy) return;
    setState(() => _busy = true);
    try {
      final shot = await ctrl.takePicture();
      final bytes = await shot.readAsBytes();
      if (!mounted) return;
      Navigator.of(context).pop(PickedImage(
        bytes: bytes,
        name: 'camera-${DateTime.now().millisecondsSinceEpoch}.jpg',
        mime: 'image/jpeg',
      ));
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = '촬영에 실패했습니다.';
        });
      }
    }
  }

  Future<void> _toggleRecording() async {
    final ctrl = _ctrl;
    if (ctrl == null || !ctrl.value.isInitialized || _busy) return;
    if (_recording) {
      await _stopRecording();
      return;
    }
    try {
      await ctrl.startVideoRecording();
    } catch (_) {
      if (mounted) setState(() => _error = '녹화를 시작할 수 없습니다.');
      return;
    }
    _elapsed = 0;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _elapsed++);
      if (_elapsed >= maxVideoSeconds) _stopRecording();
    });
    if (mounted) setState(() => _recording = true);
  }

  Future<void> _stopRecording() async {
    final ctrl = _ctrl;
    if (!_recording || ctrl == null) return;
    _timer?.cancel();
    _timer = null;
    setState(() {
      _recording = false;
      _busy = true;
    });
    try {
      final clip = await ctrl.stopVideoRecording();
      final bytes = await clip.readAsBytes();
      final mime = clip.mimeType ?? 'video/mp4';
      final ext = mime == 'video/quicktime' ? 'mov' : 'mp4';
      if (!mounted) return;
      Navigator.of(context).pop(PickedImage(
        bytes: bytes,
        name: 'video-${DateTime.now().millisecondsSinceEpoch}.$ext',
        mime: mime,
      ));
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = '녹화에 실패했습니다.';
        });
      }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ctrl?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = _ctrl;
    final ready = ctrl != null && ctrl.value.isInitialized;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('카메라'),
        actions: [
          if (_cams.length > 1)
            IconButton(
              tooltip: '전환',
              icon: const Icon(Icons.flip_camera_ios_outlined),
              onPressed: (_busy || _recording) ? null : _flip,
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                TextButton(
                  onPressed: (_busy || _recording) ? null : () => _setMode(false),
                  child: Text('사진',
                      style: TextStyle(
                          color: !_video ? Colors.white : Colors.grey,
                          fontWeight:
                              !_video ? FontWeight.w700 : FontWeight.w400)),
                ),
                TextButton(
                  onPressed: (_busy || _recording) ? null : () => _setMode(true),
                  child: Text('동영상',
                      style: TextStyle(
                          color: _video ? Colors.white : Colors.grey,
                          fontWeight:
                              _video ? FontWeight.w700 : FontWeight.w400)),
                ),
              ],
            ),
          ),
          Expanded(
            child: Center(
              child: _error != null
                  ? Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(_error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white)),
                    )
                  : ready
                      ? CameraPreview(ctrl)
                      : const CircularProgressIndicator(color: Colors.white),
            ),
          ),
          if (_recording)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text('🔴 $_elapsed초 / 최대 $maxVideoSeconds초',
                  style: const TextStyle(color: Colors.red, fontSize: 13)),
            ),
        ],
      ),
      bottomNavigationBar: Container(
        color: Colors.black,
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            GestureDetector(
              onTap: ready && !_busy
                  ? (_video ? _toggleRecording : _capturePhoto)
                  : null,
              child: Container(
                width: 68,
                height: 68,
                decoration: BoxDecoration(
                  shape: _video && _recording
                      ? BoxShape.rectangle
                      : BoxShape.circle,
                  borderRadius: _video && _recording
                      ? BorderRadius.circular(12)
                      : null,
                  border: Border.all(
                      color: _video ? Colors.red : Colors.white, width: 4),
                  color: ready && !_busy
                      ? (_video
                          ? Colors.red.withValues(alpha: 0.5)
                          : Colors.white.withValues(alpha: 0.25))
                      : Colors.grey,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
