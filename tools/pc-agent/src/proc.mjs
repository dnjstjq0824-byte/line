// Child processes: always spawn(file, args) with shell:false, bounded output,
// a hard timeout and a whole-tree kill (Windows launchers fork children).
import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, isAbsolute, extname } from 'node:path';

export function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {});
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  }
}

// Runs to completion. Never rejects: resolves { code, stdout, stderr, timedOut, error }.
export function run(file, args, { cwd, timeoutMs = 120000, env, maxBytes = 2_000_000, onStdoutLine, onSpawn } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(file, args, { cwd, env: env || process.env, shell: false, windowsHide: true, detached: process.platform !== 'win32' });
    } catch (error) {
      resolve({ code: -1, stdout: '', stderr: String((error && error.message) || error), timedOut: false, error });
      return;
    }
    if (onSpawn) onSpawn(child);
    let stdout = '';
    let stderr = '';
    let pending = '';
    let timedOut = false;
    let done = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (stdout.length < maxBytes) stdout += chunk;
      if (!onStdoutLine) return;
      pending += chunk;
      let at;
      while ((at = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, at).replace(/\r$/, '');
        pending = pending.slice(at + 1);
        try { onStdoutLine(line); } catch { /* a bad line never kills the run */ }
      }
    });
    child.stderr.on('data', (chunk) => { if (stderr.length < maxBytes) stderr += chunk; });
    const finish = (code, error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (onStdoutLine && pending) { try { onStdoutLine(pending); } catch { /* ignore */ } }
      resolve({ code: code ?? -1, stdout, stderr, timedOut, error });
    };
    child.on('error', (error) => finish(-1, error));
    child.on('close', (code) => finish(code));
  });
}

// shell:false cannot start .cmd/.bat shims on Windows, so a bare command is
// resolved through PATH + PATHEXT and shims go through cmd.exe /c.
export function resolveCommand(cmd) {
  const hasSep = cmd.includes('/') || cmd.includes('\\');
  if (process.platform !== 'win32' || isAbsolute(cmd) || hasSep) return { file: cmd, prefix: [] };
  const exts = extname(cmd) ? [''] : (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';');
  for (const dir of (process.env.PATH || '').split(';').filter(Boolean)) {
    for (const ext of exts) {
      const candidates = [join(dir, cmd + ext.toLowerCase()), join(dir, cmd + ext)];
      const hit = candidates.find((c) => existsSync(c));
      if (!hit) continue;
      if (/\.(cmd|bat)$/i.test(hit)) return { file: process.env.ComSpec || 'cmd.exe', prefix: ['/d', '/s', '/c', hit] };
      return { file: hit, prefix: [] };
    }
  }
  return { file: cmd, prefix: [] };
}

// Project-configured command (an argv array from config, never chat text).
export function runCommand(argv, opts) {
  const [cmd, ...rest] = argv;
  const { file, prefix } = resolveCommand(cmd);
  // A test command must print its normal report even when the runner itself
  // is under `node --test` (that variable switches children to a wire format).
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return run(file, [...prefix, ...rest], { env, ...opts });
}
