// Vendor-free error telemetry for the Flutter app.
// Mirrors apps/shared/monitor.ts: local ring buffer + debug print, with an
// optional forwarder a vendor SDK attaches later (report §10). Nothing phones
// home until a monitoring contract exists.
import 'package:flutter/foundation.dart';

typedef ErrorForwarder = void Function(AppErrorReport report);

class AppErrorReport {
  final String message;
  final String? stack;
  final Map<String, Object?>? context;
  final DateTime at;

  const AppErrorReport({
    required this.message,
    this.stack,
    this.context,
    required this.at,
  });
}

final List<AppErrorReport> _buffer = [];
ErrorForwarder? _forwarder;

void setErrorForwarder(ErrorForwarder? fn) => _forwarder = fn;

List<AppErrorReport> recentErrors() => List.unmodifiable(_buffer);

AppErrorReport reportError(Object err, [Map<String, Object?>? context]) {
  final report = AppErrorReport(
    message: err.toString(),
    stack: err is Error ? err.stackTrace?.toString() : null,
    context: context,
    at: DateTime.now().toUtc(),
  );
  _buffer.add(report);
  if (_buffer.length > 50) _buffer.removeAt(0);
  if (_forwarder != null) {
    try {
      _forwarder!(report);
    } catch (_) {
      // A broken forwarder must never break the app.
    }
  } else {
    debugPrint('[luno] ${report.message} ${context ?? ''}');
  }
  return report;
}
