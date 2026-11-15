// Vendor-free error telemetry (shared by all Vue consoles).
// F22: reports stay local AND ship to the first-party /api/v1/telemetry
// endpoint (D1-backed, masked at both ends, admin dashboard reads it).
// No third-party vendor is involved at any step.
import { maskEnvelopeText, maskTelemetryContext } from './mask_telemetry'

export type ErrorReport = {
  message: string
  stack?: string
  context?: Record<string, unknown>
  at: string
}

export type PerfSample = {
  op: string
  ms: number
  at: string
}

const MAX_BUFFER = 50
const MAX_PERF = 50
const buffer: ErrorReport[] = []
const perfBuffer: PerfSample[] = []
// Upload queues are separate from the local views: flushing must never
// empty what the on-device diagnostics view shows.
const pendingErrors: ErrorReport[] = []
const pendingPerf: PerfSample[] = []
let forwarder: ((r: ErrorReport) => void) | null = null
let sender: ((payload: { errors: ErrorReport[]; perf: PerfSample[] }) => Promise<void>) | null = null
let flushTimer: ReturnType<typeof setInterval> | null = null

export function setErrorForwarder(fn: ((r: ErrorReport) => void) | null): void {
  forwarder = fn
}

export function recentErrors(): readonly ErrorReport[] {
  return buffer
}

export function recentPerf(): readonly PerfSample[] {
  return perfBuffer
}

// F22: client-measured operation timings (API paths). Flushed with the
// next error report or the periodic flush, whichever comes first.
export function recordPerf(op: string, ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return
  const sample: PerfSample = { op: op.slice(0, 120), ms: Math.round(ms), at: new Date().toISOString() }
  perfBuffer.push(sample)
  if (perfBuffer.length > MAX_PERF) perfBuffer.shift()
  pendingPerf.push(sample)
  if (pendingPerf.length > MAX_PERF) pendingPerf.shift()
}

// The app shell installs the uploader once (POST /api/v1/telemetry).
export function setTelemetrySender(
  fn: ((payload: { errors: ErrorReport[]; perf: PerfSample[] }) => Promise<void>) | null,
): void {
  sender = fn
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  if (sender && typeof setInterval !== 'undefined') {
    flushTimer = setInterval(() => { void flushTelemetry() }, 60000)
  }
}

export async function flushTelemetry(): Promise<void> {
  if (!sender) return
  if (pendingErrors.length === 0 && pendingPerf.length === 0) return
  const payload = {
    errors: pendingErrors.splice(0, pendingErrors.length),
    perf: pendingPerf.splice(0, pendingPerf.length),
  }
  try {
    await sender(payload)
  } catch {
    // Telemetry must never break the app; dropped samples stay dropped.
  }
}

export function reportError(err: unknown, context?: Record<string, unknown>): ErrorReport {
  const report: ErrorReport = {
    message: maskEnvelopeText(err instanceof Error ? err.message : String(err)),
    stack: err instanceof Error && err.stack ? maskEnvelopeText(err.stack) : undefined,
    context: maskTelemetryContext(context),
    at: new Date().toISOString()
  }
  buffer.push(report)
  if (buffer.length > MAX_BUFFER) buffer.shift()
  pendingErrors.push(report)
  if (pendingErrors.length > MAX_BUFFER) pendingErrors.shift()
  if (forwarder) {
    try { forwarder(report) } catch { /* a broken forwarder must never break the app */ }
  } else if (typeof console !== 'undefined') {
    console.error('[luno]', report.message, report.context ?? '')
  }
  // Errors flush immediately (perf piggybacks); failures stay silent.
  if (sender) void flushTelemetry()
  return report
}
