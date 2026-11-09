// In-app photo camera sheet (LINE camera parity, stills).
//
// Unlike image_picker (which shells out to the system camera), this sheet
// previews and captures inside the app, then hands JPEG bytes to the photo
// effect flow. Video/GIF/avatar modes stay open.
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

/// Full-screen camera dialog. Pops the captured JPEG bytes, or null.
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
    final ctrl = CameraController(_cams[_index], ResolutionPreset.medium,
        enableAudio: false);
    try {
      await ctrl.initialize();
    } catch (_) {
      if (mounted) setState(() => _error = '카메라를 시작할 수 없습니다.');
      return;
    }
    if (mounted) setState(() => _ctrl = ctrl);
  }

  Future<void> _flip() async {
    if (_cams.length < 2 || _busy) return;
    setState(() {
      _busy = true;
      _ctrl = null;
    });
    _index = (_index + 1) % _cams.length;
    await _attach();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _capture() async {
    final ctrl = _ctrl;
    if (ctrl == null || !ctrl.value.isInitialized || _busy) return;
    setState(() => _busy = true);
    try {
      final shot = await ctrl.takePicture();
      final bytes = await shot.readAsBytes();
      if (!mounted) return;
      Navigator.of(context).pop(bytes);
    } catch (_) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = '촬영에 실패했습니다.';
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
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('사진 촬영'),
        actions: [
          if (_cams.length > 1)
            IconButton(
              tooltip: '전환',
              icon: const Icon(Icons.flip_camera_ios_outlined),
              onPressed: _busy ? null : _flip,
            ),
        ],
      ),
      body: Center(
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
      bottomNavigationBar: Container(
        color: Colors.black,
        padding: const EdgeInsets.symmetric(vertical: 24),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            GestureDetector(
              onTap: ready && !_busy ? _capture : null,
              child: Container(
                width: 68,
                height: 68,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 4),
                  color: ready && !_busy
                      ? Colors.white.withValues(alpha: 0.25)
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
