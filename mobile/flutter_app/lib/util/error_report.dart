// F22: first-party error telemetry for the Flutter app.
// Mirrors apps/shared/monitor.ts: local ring buffers stay on-device AND ship
// to D1-backed POST /api/v1/telemetry (masked at both ends). No third-party
// vendor is involved at any step.
import 'dart:async';

import 'package:flutter/foundation.dart';

import 'telemetry_mask.dart';

typedef ErrorForwarder = void Function(AppErrorReport report);
typedef TelemetrySender = Future<void> Function(
    {required List<AppErrorReport> errors, required List<AppPerfSample> perf});

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

  Map<String, Object?> toJson() => {
        'message': message,
        if (stack != null) 'stack': stack,
        if (context != null) 'context': context,
        'at': at.toIso8601String(),
      };
}

class AppPerfSample {
  final String op;
  final int ms;
  final DateTime at;

  const AppPerfSample({required this.op, required this.ms, required this.at});

  Map<String, Object?> toJson() => {
        'op': op,
        'ms': ms,
        'at': at.toIso8601String(),
      };
}

const _maxBuffer = 50;
const _maxPerf = 50;
final List<AppErrorReport> _buffer = [];
final List<AppPerfSample> _perfBuffer = [];
// Upload queues are separate from the local views: flushing must never
// empty what the on-device diagnostics view shows.
final List<AppErrorReport> _pendingErrors = [];
final List<AppPerfSample> _pendingPerf = [];
ErrorForwarder? _forwarder;
TelemetrySender? _sender;
Timer? _flushTimer;

void setErrorForwarder(ErrorForwarder? fn) => _forwarder = fn;

List<AppErrorReport> recentErrors() => List.unmodifiable(_buffer);

List<AppPerfSample> recentPerf() => List.unmodifiable(_perfBuffer);

/// Client-measured operation timings. Flushed with the next error report
/// or the periodic flush, whichever comes first.
void recordPerf(String op, int ms) {
  if (ms < 0) return;
  final sample = AppPerfSample(
      op: op.length > 120 ? op.substring(0, 120) : op,
      ms: ms,
      at: DateTime.now().toUtc());
  _perfBuffer.add(sample);
  if (_perfBuffer.length > _maxPerf) _perfBuffer.removeAt(0);
  _pendingPerf.add(sample);
  if (_pendingPerf.length > _maxPerf) _pendingPerf.removeAt(0);
}

/// The app shell installs the uploader once (POST /api/v1/telemetry).
void setTelemetrySender(TelemetrySender? fn) {
  _sender = fn;
  _flushTimer?.cancel();
  _flushTimer = null;
  if (fn != null) {
    _flushTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      unawaited(flushTelemetry());
    });
  }
}

Future<void> flushTelemetry() async {
  final sender = _sender;
  if (sender == null) return;
  if (_pendingErrors.isEmpty && _pendingPerf.isEmpty) return;
  final payload = (
    errors: List<AppErrorReport>.of(_pendingErrors),
    perf: List<AppPerfSample>.of(_pendingPerf),
  );
  _pendingErrors.clear();
  _pendingPerf.clear();
  try {
    await sender(errors: payload.errors, perf: payload.perf);
  } catch (_) {
    // Telemetry must never break the app; dropped samples stay dropped.
  }
}

@visibleForTesting
void resetTelemetryForTest() {
  _buffer.clear();
  _perfBuffer.clear();
  _pendingErrors.clear();
  _pendingPerf.clear();
  _forwarder = null;
  setTelemetrySender(null);
}

AppErrorReport reportError(Object err, [Map<String, Object?>? context]) {
  final report = AppErrorReport(
    message: maskEnvelopeText(err.toString()),
    stack: err is Error ? maskEnvelopeText('${err.stackTrace}') : null,
    context: maskTelemetryContext(context),
    at: DateTime.now().toUtc(),
  );
  _buffer.add(report);
  if (_buffer.length > _maxBuffer) _buffer.removeAt(0);
  _pendingErrors.add(report);
  if (_pendingErrors.length > _maxBuffer) _pendingErrors.removeAt(0);
  if (_forwarder != null) {
    try {
      _forwarder!(report);
    } catch (_) {
      // A broken forwarder must never break the app.
    }
  } else {
    debugPrint('[luno] ${report.message} ${report.context ?? ''}');
  }
  // Errors flush immediately (perf piggybacks); failures stay silent.
  if (_sender != null) unawaited(flushTelemetry());
  return report;
}
