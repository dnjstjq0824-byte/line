// F22: telemetry masking for the Flutter app. Mirrors
// apps/shared/mask_telemetry.ts and maskTelemetryValue in
// scripts/cf_worker.js; all three are pinned by the same cases.
//
// Same boundary as the shared spec: `context` subtrees get full key-based
// masking, envelope text (message/stack) gets value-pattern scans only.
const _secretContains = [
  'password',
  'passwd',
  'secret',
  'token',
  'credential',
  'otp',
  'captcha',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
  'cookie',
  'authorization',
  'authtoken',
  'sdp',
];
const _secretExact = ['code', 'pin'];
const _bodyExact = [
  'body',
  'text',
  'message',
  'content',
  'caption',
  'bio',
  'status_message',
  'statusmessage',
];
const _emailExact = ['email', 'emails', 'email_address'];

bool _isSecretKey(String lower) {
  if (_secretExact.contains(lower)) return true;
  for (final part in _secretContains) {
    if (lower.contains(part)) return true;
  }
  return false;
}

String scrubTelemetryText(String value) {
  return value
      .replaceAll(
          RegExp(r'Bearer [A-Za-z0-9\-._~+/]+=*'), 'Bearer [redacted]')
      .replaceAll(
          RegExp(r'cf-(?:token|refresh)-[0-9a-fA-F-]+'), '[token]')
      .replaceAll(
          RegExp(r'eyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]*){0,2}'), '[jwt]')
      .replaceAll(
          RegExp(r'-----BEGIN [^-]+-----[^-]*-----END [^-]+-----'),
          '[private-key]');
}

/// Masks a telemetry value: secret keys dropped, message bodies reduced to
/// `[text len=N]`, emails dropped, other strings pattern-scrubbed.
Object? maskTelemetryValue(Object? value,
    [Set<Object>? seen, int depth = 0]) {
  if (value == null) return value;
  if (value is String) return scrubTelemetryText(value);
  if (value is! Map && value is! List) return value;
  if (depth > 10) return '[depth]';
  seen ??= <Object>{};
  if (seen.contains(value)) return '[circular]';
  seen.add(value);
  Object? out;
  if (value is List) {
    out = [for (final v in value) maskTelemetryValue(v, seen, depth + 1)];
  } else {
    final map = value as Map;
    final masked = <String, Object?>{};
    for (final key in map.keys) {
      final lower = key.toString().toLowerCase();
      final v = map[key];
      if (_isSecretKey(lower)) {
        masked[key.toString()] = v is String ? '[redacted]' : v;
      } else if (_bodyExact.contains(lower)) {
        masked[key.toString()] = v is String
            ? '[text len=${v.length}]'
            : maskTelemetryValue(v, seen, depth + 1);
      } else if (_emailExact.contains(lower)) {
        masked[key.toString()] = v is String ? '[email]' : v;
      } else {
        masked[key.toString()] = maskTelemetryValue(v, seen, depth + 1);
      }
    }
    out = masked;
  }
  seen.remove(value);
  return out;
}

Map<String, Object?>? maskTelemetryContext(Map<String, Object?>? context) {
  if (context == null) return null;
  return (maskTelemetryValue(context) as Map).cast<String, Object?>();
}

String maskEnvelopeText(String value) => scrubTelemetryText(value);
