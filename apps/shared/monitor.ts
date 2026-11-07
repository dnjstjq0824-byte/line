// Vendor-free error telemetry (shared by all Vue consoles).
// Until a monitoring contract exists (report §10: Sentry free tier), every
// report stays local: console + an in-memory ring buffer the consoles can
// surface on a diagnostics view. Nothing ever phones home by default.
// A vendor attaches later via setErrorForwarder without touching call sites.
export type ErrorReport = {
  message: string
  stack?: string
  context?: Record<string, unknown>
  at: string
}

const MAX_BUFFER = 50
const buffer: ErrorReport[] = []
let forwarder: ((r: ErrorReport) => void) | null = null

export function setErrorForwarder(fn: ((r: ErrorReport) => void) | null): void {
  forwarder = fn
}

export function recentErrors(): readonly ErrorReport[] {
  return buffer
}

export function reportError(err: unknown, context?: Record<string, unknown>): ErrorReport {
  const report: ErrorReport = {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    context,
    at: new Date().toISOString()
  }
  buffer.push(report)
  if (buffer.length > MAX_BUFFER) buffer.shift()
  if (forwarder) {
    try { forwarder(report) } catch { /* a broken forwarder must never break the app */ }
  } else if (typeof console !== 'undefined') {
    console.error('[luno]', report.message, context ?? '')
  }
  return report
}
