// Guardrails the runner enforces itself (never left to the model).
const FORBIDDEN_MUSE_FLAGS = ['--yolo', '--disable-sandbox', '--disable-approval', '--allow-workspace-switch', '--trust-workspace'];

export function assertMuseArgs(args) {
  for (const a of args) {
    if (FORBIDDEN_MUSE_FLAGS.includes(a)) throw new Error(`forbidden muse flag: ${a}`);
  }
  return args;
}

// Glob: ** spans directories, * stays inside one segment. Paths use '/'.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else re += '[^/]*';
    } else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
export function matchesAny(path, globs) {
  const p = String(path).replace(/\\/g, '/');
  return (globs || []).some((g) => globToRegExp(g).test(p));
}

// Secrets never leave the PC inside a report (port of agent/main.go L-10).
const MASKS = [
  [/(password|passwd|pwd|비밀번호|비번)\s*[:=]\s*\S+/gi, '$1=***'],
  [/(api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token|bearer[_-]?token|client[_-]?secret)\s*[:=]\s*[\w\-.~+/=]+/gi, '$1=***'],
  [/bearer\s+[\w\-.~+/=]+/gi, 'Bearer ***'],
  [/\b(cf-bot-[A-Za-z0-9-]+|cf-token-[A-Za-z0-9-.]+|cf-refresh-[A-Za-z0-9-]+|sk-[A-Za-z0-9]{8,}|rk-[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]+)\b/g, '***'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '***PRIVATE KEY***'],
];
export function mask(text) {
  let out = String(text ?? '');
  for (const [re, to] of MASKS) out = out.replace(re, to);
  return out;
}
const SECRET_HINT = /\b(cf-bot-[A-Za-z0-9-]{8,}|cf-token-[A-Za-z0-9-.]{8,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/;

export const DIFF_LIMITS = { maxAddedLines: 3000, maxFiles: 50 };

// files: [{path, added, deleted, binary}]; addedText: the '+' lines of the diff.
// Any violation fails the task; `large` only changes the wording of the report.
export function checkDiff({ files, addedText = '', forbiddenPaths = [], allowedPaths = null }) {
  const violations = [];
  for (const f of files) {
    if (matchesAny(f.path, forbiddenPaths)) violations.push(`금지 경로 변경: ${f.path}`);
    if (allowedPaths && !matchesAny(f.path, allowedPaths)) violations.push(`허용 경로 밖 변경: ${f.path}`);
    if (f.binary && !/\.(png|jpg|jpeg|webp|gif|svg|ico)$/i.test(f.path)) violations.push(`바이너리 파일: ${f.path}`);
  }
  if (SECRET_HINT.test(addedText)) violations.push('diff에 비밀값 패턴이 있음');
  const added = files.reduce((n, f) => n + (f.added || 0), 0);
  const deleted = files.reduce((n, f) => n + (f.deleted || 0), 0);
  const large = added > DIFF_LIMITS.maxAddedLines || files.length > DIFF_LIMITS.maxFiles;
  return { violations, large, added, deleted };
}
