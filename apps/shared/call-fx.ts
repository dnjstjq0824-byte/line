// Call effects + recording helpers. Annotation-free on purpose so the node
// suite can import this file verbatim (see scripts/call_fx.test.mjs); the
// inferred types still satisfy the Vue typecheck at the call sites.
export const CALL_VIDEO_FILTERS = {
  none: 'none',
  warm: 'sepia(0.35) saturate(1.2)',
  cool: 'hue-rotate(15deg) saturate(1.1)',
  mono: 'grayscale(1)',
};

export function callRecordingName(callId = '') {
  const safe =
    String(callId || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64) || 'call';
  return `luno-call-${safe}.webm`;
}
