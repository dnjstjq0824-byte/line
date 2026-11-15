// F22: telemetry masking, shared by web clients and node tests
// (importable under node type-stripping: no enums, no namespaces).
// The worker (maskTelemetryValue in scripts/cf_worker.js) and the app
// (lib/util/telemetry_mask.dart) mirror these rules; all three are pinned
// by the same cases.
//
// Boundary, stated honestly:
// - `context` subtrees get full key-based masking (secret keys dropped,
//   message bodies reduced to [text len=N], emails dropped).
// - Envelope text (error message/stack, log lines) gets value-pattern
//   scans only (bearer tokens, cf tokens, JWTs, PEM blocks). A raw
//   password typed into an error message cannot be caught reliably;
//   clients must never put secrets there, and none do (exception texts
//   plus API paths only).

const SECRET_CONTAINS = [
  'password', 'passwd', 'secret', 'token', 'credential', 'otp',
  'captcha', 'apikey', 'api_key', 'privatekey', 'private_key',
  'cookie', 'authorization', 'authtoken', 'sdp',
];
const SECRET_EXACT = ['code', 'pin'];

const BODY_EXACT = [
  'body', 'text', 'message', 'content', 'caption', 'bio',
  'status_message', 'statusmessage',
];

const EMAIL_EXACT = ['email', 'emails', 'email_address'];

function isSecretKey(lower: string): boolean {
  for (const k of SECRET_EXACT) {
    if (lower === k) return true;
  }
  for (const part of SECRET_CONTAINS) {
    if (lower.includes(part)) return true;
  }
  return false;
}

function scrubText(value: string): string {
  return value
    .replace(/Bearer [A-Za-z0-9\-._~+/]+=*/g, 'Bearer [redacted]')
    .replace(/cf-(?:token|refresh)-[0-9a-fA-F-]+/g, '[token]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]*){0,2}/g, '[jwt]')
    .replace(/-----BEGIN [^-]+-----[^-]*-----END [^-]+-----/g, '[private-key]');
}

function shapeText(value: string): string {
  return `[text len=${value.length}]`;
}

export function maskTelemetryValue(
  value: unknown,
  seen: Set<object> = new Set(),
  depth = 0,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrubText(value);
  if (typeof value !== 'object') return value;
  if (depth > 10) return '[depth]';
  const obj = value as Record<string, unknown>;
  if (seen.has(obj)) return '[circular]';
  seen.add(obj);
  if (Array.isArray(value)) {
    return (value as unknown[]).map((v) => maskTelemetryValue(v, seen, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase();
    const v = obj[key];
    if (isSecretKey(lower)) {
      out[key] = typeof v === 'string' ? '[redacted]' : v;
    } else if ((BODY_EXACT as string[]).includes(lower)) {
      out[key] = typeof v === 'string' ? shapeText(v) : maskTelemetryValue(v, seen, depth + 1);
    } else if ((EMAIL_EXACT as string[]).includes(lower)) {
      out[key] = typeof v === 'string' ? '[email]' : v;
    } else {
      out[key] = maskTelemetryValue(v, seen, depth + 1);
    }
  }
  seen.delete(obj);
  return out;
}

export function maskTelemetryContext(
  context: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!context) return context;
  return maskTelemetryValue(context) as Record<string, unknown>;
}

export function maskEnvelopeText(value: string): string {
  return scrubText(value);
}
