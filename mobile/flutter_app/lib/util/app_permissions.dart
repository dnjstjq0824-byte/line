// C4: runtime-permission flows with rationale dialogs and a settings escape.
// Every dangerous permission the app actually uses goes through here:
// camera (capture/calls), microphone (voice/calls).
// Gallery/file pickers and QR manual-entry need no permission (see report).
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

enum PermissionFlow { granted, denied, permanentlyDenied }

/// Thin seam over permission_handler so widget tests can script answers.
class PermissionGateway {
  const PermissionGateway();

  /// Test-only override consulted when a call site passes no gateway.
  /// Always reset in tearDown; production code never sets this.
  static PermissionGateway? debugOverride;

  Future<bool> isGranted(Permission p) => p.isGranted;
  Future<bool> shouldShowRationale(Permission p) => p.shouldShowRequestRationale;
  Future<PermissionStatus> request(Permission p) => p.request();
  Future<bool> openSettings() => openAppSettings();
}

PermissionGateway _resolveGateway(PermissionGateway? gateway) =>
    gateway ?? PermissionGateway.debugOverride ?? const PermissionGateway();

/// Ensures [permission], showing [showRationale] first when Android says the
/// user previously denied it. Never throws: failures resolve to denied.
Future<PermissionFlow> ensureAppPermission(
  Permission permission, {
  Future<void> Function()? showRationale,
  PermissionGateway? gateway,
}) async {
  final resolved = _resolveGateway(gateway);
  try {
    if (await resolved.isGranted(permission)) return PermissionFlow.granted;
    if (await resolved.shouldShowRationale(permission)) {
      await showRationale?.call();
    }
    final status = await resolved.request(permission);
    if (status.isGranted) return PermissionFlow.granted;
    if (status.isPermanentlyDenied) return PermissionFlow.permanentlyDenied;
    return PermissionFlow.denied;
  } catch (_) {
    return PermissionFlow.denied;
  }
}

/// Runs [action] only after every listed permission is granted, showing a
/// rationale dialog per permission and a snackbar (with a settings link when
/// permanently denied) on failure. Returns true when the gate passed.
/// [action] is optional so call sites with following async work can `await`
/// the gate and continue inline instead of nesting everything in a closure.
Future<bool> withPermissions(
  BuildContext context, {
  required List<(Permission, String, String)> permissions,
  Future<void> Function()? action,
  PermissionGateway? gateway,
}) async {
  final resolved = _resolveGateway(gateway);
  for (final (permission, title, body) in permissions) {
    final flow = await ensureAppPermission(
      permission,
      showRationale: () => showPermissionRationale(context, title, body),
      gateway: resolved,
    );
    if (flow != PermissionFlow.granted) {
      if (context.mounted) {
        showPermissionDenied(
          context,
          flow == PermissionFlow.permanentlyDenied,
          gateway: resolved,
        );
      }
      return false;
    }
  }
  if (!context.mounted) return false;
  await action?.call();
  return true;
}

Future<void> showPermissionRationale(
    BuildContext context, String title, String body) {
  return showDialog<void>(
    context: context,
    builder: (dialog) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(dialog).pop(),
          child: const Text('취소'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(dialog).pop(),
          child: const Text('계속'),
        ),
      ],
    ),
  );
}

void showPermissionDenied(
  BuildContext context,
  bool permanentlyDenied, {
  PermissionGateway? gateway,
}) {
  final resolved = _resolveGateway(gateway);
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(permanentlyDenied
          ? '권한이 영구적으로 거부되었습니다. 설정에서 직접 허용해주세요.'
          : '권한이 거부되었습니다.'),
      action: permanentlyDenied
          ? SnackBarAction(
              label: '설정으로 이동',
              onPressed: resolved.openSettings,
            )
          : null,
    ),
  );
}
