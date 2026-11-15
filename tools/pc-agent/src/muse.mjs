// Muse Code CLI in headless mode (`muse exec`). Subscription login, no API
// key. The prompt only ever travels in a file (--prompt-file): chat text is
// never placed on a command line.
import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { run } from './proc.mjs';
import { assertMuseArgs } from './guards.mjs';

const POWERSHELL = process.env.SystemRoot
  ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  : 'powershell.exe';

// cfg.museCommand ([file, ...args]) replaces the launcher in tests.
function launcher(cfg) {
  if (Array.isArray(cfg.museCommand) && cfg.museCommand.length) return { file: cfg.museCommand[0], prefix: cfg.museCommand.slice(1) };
  return { file: POWERSHELL, prefix: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', cfg.museLauncher] };
}

export function buildExecArgs({ cfg, mode, promptFile, workspace, sessionId }) {
  const args = [
    'exec', '--json', '--prompt-file', promptFile,
    '--model', cfg.model,
    '--reasoning-effort', mode === 'dev' ? 'high' : 'medium',
    '--workspace', workspace,
    '--approval-mode', 'never',
    '--approval-judge', 'on',
    '--sandbox-network', 'proxy-only',
    '--disable-request-user-input',
    '--max-model-steps', String(cfg.maxModelSteps || 150),
    '--session-id', sessionId,
  ];
  if (mode === 'ask') args.push('--disable-write', '--disable-shell');
  return assertMuseArgs(args);
}

// Tolerant JSONL reader: counts what it knows, ignores the rest.
export function createEventReader() {
  const state = { steps: 0, text: '', terminal: '', finalText: '', reason: '', lines: 0 };
  return {
    state,
    push(line) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) return;
      let ev;
      try { ev = JSON.parse(trimmed); } catch { return; }
      state.lines++;
      const type = String(ev.payload_type || '');
      const p = ev.payload || {};
      if (type === 'task.lifecycle.started') state.steps++;
      else if (type === 'run.output.delta' && typeof p.text === 'string') state.text += p.text;
      else if (type.startsWith('run.terminal.')) {
        state.terminal = String(p.terminal || type.slice('run.terminal.'.length));
        if (typeof p.text === 'string' && p.text) state.finalText = p.text;
        state.reason = p.reason ? String(typeof p.reason === 'string' ? p.reason : JSON.stringify(p.reason)) : '';
      }
    },
  };
}

// Runs one prompt. Resolves { ok, text, steps, terminal, reason, timedOut, stopped, sessionId }.
export async function museExec({ cfg, mode, promptFile, workspace, timeoutMs, logFile, onProgress, control }) {
  const sessionId = randomUUID();
  const { file, prefix } = launcher(cfg);
  const args = [...prefix, ...buildExecArgs({ cfg, mode, promptFile, workspace, sessionId })];
  const reader = createEventReader();
  const result = await run(file, args, {
    cwd: workspace,
    timeoutMs,
    maxBytes: 200_000,
    onSpawn: (child) => { if (control) control.pid = child.pid; },
    onStdoutLine: (line) => {
      if (logFile) { try { appendFileSync(logFile, line + '\n'); } catch { /* log is best-effort */ } }
      reader.push(line);
      if (onProgress) onProgress(reader.state);
    },
  });
  if (control) control.pid = 0;
  const s = reader.state;
  const stopped = !!(control && control.stopped);
  const text = (s.finalText || s.text || '').trim();
  const ok = !result.timedOut && !stopped && result.code === 0 && (s.terminal === 'completed' || (!s.terminal && !!text));
  let reason = s.reason;
  if (!ok && !reason) {
    reason = result.timedOut ? '시간 초과' : stopped ? '사용자가 중단' : (result.stderr || '').trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 400) || `exit ${result.code}`;
  }
  return { ok, text, steps: s.steps, terminal: s.terminal, reason, timedOut: result.timedOut, stopped, sessionId };
}

// `muse usage` -> { window, weekly } percentages, or null when unreadable.
export function parseUsage(text) {
  const weekly = /Weekly:\s*(\d+)%\s*used/i.exec(text || '');
  const window = /Window:\s*(\d+)%\s*used/i.exec(text || '');
  if (!weekly && !window) return null;
  return { weekly: weekly ? Number(weekly[1]) : null, window: window ? Number(window[1]) : null };
}
export async function museUsage(cfg) {
  const { file, prefix } = launcher(cfg);
  const res = await run(file, [...prefix, 'usage'], { timeoutMs: 60000 });
  return { usage: parseUsage(res.stdout), raw: (res.stdout || res.stderr || '').trim().slice(0, 600) };
}
