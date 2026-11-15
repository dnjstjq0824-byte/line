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
import '../util/app_l10n.dart';

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
      setState(() => _error = context.l10n.qrNotLunoRescan);
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
        Masthead(title: context.l10n.qrScanTitle, subtitle: context.l10n.qrScanSubtitle),
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
                    errorBuilder: (_, __) => Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          context.l10n.qrNoCamera,
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
                    fontSize: HarborType.small, color: Theme.of(context).colorScheme.error)),
          ),
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(
            children: [
              const Spacer(),
              TextButton(
                onPressed: () => setState(() => _manual = !_manual),
                child: Text(_manual ? context.l10n.qrManualClose : context.l10n.qrManualOpen),
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
                    child: Text(context.l10n.mvApprove),
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
      QrPayloadKind.login => context.l10n.homeQrLoginTitle,
      QrPayloadKind.friend => context.l10n.qrAddFriend,
      QrPayloadKind.unknown => context.l10n.qrVerifyTitle,
    };
    final confirmLabel = switch (kind) {
      QrPayloadKind.login => context.l10n.qrApprove,
      QrPayloadKind.friend => context.l10n.qrAddNow,
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
                  const TextStyle(fontSize: HarborType.title, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          if (kind == QrPayloadKind.login)
            Text(context.l10n.qrApproveDesc(payload.challengeId)),
          if (kind == QrPayloadKind.friend)
            Text(context.l10n.qrAddFriendDesc(payload.handle)),
          if (kind == QrPayloadKind.unknown)
            Text(context.l10n.qrNotLuno),
          const SizedBox(height: 16),
          Row(
            children: [
              const Spacer(),
              TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(kind == QrPayloadKind.unknown ? context.l10n.mvRecoverCancel : context.l10n.mvCancel)),
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
