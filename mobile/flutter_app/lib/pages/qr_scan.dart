// Route: /qr/scan — camera scan for LUNO login codes
// (LUNO-LOGIN:<challenge_id>:<qr_token>, see apps/shared/login_qr.ts) and
// friend codes (LUNO-FRIEND:<handle>). Unknown codes stay on the finder
// with an honest hint; a manual-entry form covers camera-less devices.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/qr_payload.dart';

class QrScanPage extends StatefulWidget {
  final Widget? scannerOverride;
  const QrScanPage({super.key, this.scannerOverride});

  @override
  State<QrScanPage> createState() => _QrScanPageState();
}

class _QrScanPageState extends State<QrScanPage> {
  MobileScannerController? _controller;
  bool _handling = false;
  bool _manual = false;
  String _error = '';
  final _challenge = TextEditingController();
  final _token = TextEditingController();

  @override
  void initState() {
    super.initState();
    if (widget.scannerOverride == null) {
      _controller =
          MobileScannerController(formats: const [BarcodeFormat.qrCode]);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    _challenge.dispose();
    _token.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture cap) {
    if (_handling || cap.barcodes.isEmpty) return;
    final raw = cap.barcodes.first.rawValue ?? '';
    if (raw.isEmpty) return;
    final payload = parseQrPayload(raw);
    if (payload.kind == QrPayloadKind.unknown) {
      setState(() => _error = 'LUNO QR 코드가 아닙니다. 다시 비춰주세요.');
      return;
    }
    _handling = true;
    _controller?.stop();
    showModalBottomSheet<void>(
      context: context,
      builder: (_) => QrPayloadSheet(
        payload: payload,
        raw: raw,
        onConfirm: () => _confirm(payload, raw),
      ),
    ).then((_) {
      if (!mounted) return;
      setState(() => _handling = false);
      _controller?.start();
    });
  }

  Future<void> _confirm(QrPayload payload, String raw) async {
    final session = SessionScope.of(context, listen: false);
    Navigator.of(context).pop();
    if (payload.kind == QrPayloadKind.login) {
      await session.approveDesktopQR(payload.challengeId, payload.qrToken);
    } else {
      await session.addFriendByQr(raw);
    }
    if (!mounted) return;
    context.pop();
  }

  Future<void> _manualApprove() async {
    final session = SessionScope.of(context, listen: false);
    final cid = _challenge.text;
    final token = _token.text;
    await session.approveDesktopQR(cid, token);
    if (!mounted) return;
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return PageColumn(
      children: [
        const Masthead(title: 'QR 스캔', subtitle: 'PC 로그인 · 친구 추가'),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(HarborRadius.card),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (widget.scannerOverride != null)
                  widget.scannerOverride!
                else
                  MobileScanner(
                    controller: _controller,
                    onDetect: _onDetect,
                    placeholderBuilder: (_) =>
                        const Center(child: CircularProgressIndicator()),
                    errorBuilder: (_, __) => const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          '카메라를 사용할 수 없습니다. 아래에서 직접 입력해 주세요.',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                  ),
                if (widget.scannerOverride == null)
                  IgnorePointer(
                    child: Center(
                      child: Container(
                        width: 220,
                        height: 220,
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: dark ? HarborDark.harbor : Colors.white,
                            width: 2,
                          ),
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (_error.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(_error,
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 12, color: Theme.of(context).colorScheme.error)),
          ),
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(
            children: [
              const Spacer(),
              TextButton(
                onPressed: () => setState(() => _manual = !_manual),
                child: Text(_manual ? '직접 입력 닫기' : '직접 입력하기'),
              ),
            ],
          ),
        ),
        if (_manual)
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                  controller: _challenge,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                      labelText: 'QR Challenge ID', isDense: true)),
              const SizedBox(height: 6),
              TextField(
                  controller: _token,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                      labelText: 'QR Token', isDense: true)),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Spacer(),
                  FilledButton(
                    onPressed: _challenge.text.trim().isEmpty ||
                            _token.text.trim().isEmpty
                        ? null
                        : _manualApprove,
                    child: const Text('승인'),
                  ),
                ],
              ),
            ],
          ),
      ],
    );
  }
}

class QrPayloadSheet extends StatelessWidget {
  final QrPayload payload;
  final String raw;
  final Future<void> Function() onConfirm;
  const QrPayloadSheet(
      {super.key,
      required this.payload,
      required this.raw,
      required this.onConfirm});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final kind = payload.kind;
    final title = switch (kind) {
      QrPayloadKind.login => 'PC/웹 로그인 승인',
      QrPayloadKind.friend => '친구 추가',
      QrPayloadKind.unknown => 'QR 확인',
    };
    final confirmLabel = switch (kind) {
      QrPayloadKind.login => '승인하기',
      QrPayloadKind.friend => '추가하기',
      QrPayloadKind.unknown => '',
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style:
                  const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (kind == QrPayloadKind.login)
            Text('이 기기에서 PC/웹 로그인을 승인합니다.\n요청 ID: ${payload.challengeId}'),
          if (kind == QrPayloadKind.friend)
            Text('@${payload.handle}님을 친구로 추가합니다.'),
          if (kind == QrPayloadKind.unknown)
            const Text('LUNO QR 코드가 아닙니다.'),
          const SizedBox(height: 16),
          Row(
            children: [
              const Spacer(),
              TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(kind == QrPayloadKind.unknown ? '닫기' : '취소')),
              if (confirmLabel.isNotEmpty) const SizedBox(width: 8),
              if (confirmLabel.isNotEmpty)
                FilledButton(
                  onPressed: session.busy ? null : () => onConfirm(),
                  child: Text(confirmLabel),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
