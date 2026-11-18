// Message formats for a phone screen. Everything that leaves the PC is masked.
import { mask } from './guards.mjs';

export const MAX_BODY = 12000; // server limit is 20,000; shorter parts read better on a phone
const RULE = '━━━━━━━━━━';

export function minutes(ms) { return Math.max(0, Math.round(ms / 60000)); }
function clip(text, max) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Turns absolute paths under the given roots into repo-relative ones, so a
// report never carries the PC's folder layout (or the Windows user name).
export function stripPaths(text, roots) {
  let out = String(text ?? '');
  const sorted = roots.filter(Boolean).sort((a, b) => b.length - a.length);
  for (const root of sorted) {
    const fwd = root.replace(/\\/g, '/').replace(/\/$/, '');
    for (const form of [`/${fwd}`, fwd, fwd.replace(/\//g, '\\')]) {
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`${escaped}[\\\\/]?`, 'gi'), '');
    }
  }
  return out;
}

// Splits on line boundaries; a single oversized line is cut hard.
export function splitBody(body, max = MAX_BODY) {
  const parts = [];
  let current = '';
  for (const line of String(body).split('\n')) {
    let rest = line;
    while (rest.length > max) {
      if (current) { parts.push(current); current = ''; }
      parts.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    if (current && current.length + 1 + rest.length > max) { parts.push(current); current = rest; }
    else current = current ? `${current}\n${rest}` : rest;
  }
  if (current) parts.push(current);
  return parts.length ? parts : [''];
}

export const fmt = {
  online: ({ version, projects, recovered }) =>
    `🟢 PC 작업봇 온라인 (v${version}) · 프로젝트 ${projects}${recovered ? ` · 재시작으로 중단된 작업 ${recovered}건` : ''}\n/help 로 명령 목록을 볼 수 있습니다.`,
  recovered: (queued) => `🟢 복구됨, 대기 중 지시 ${queued}건 처리 시작`,
  accepted: (task, waiting) => `📥 #${task.id} 접수 · /${task.cmd}${task.urgent ? '!' : ''} · 대기 ${waiting}건`,
  started: (task, branch) => `▶️ #${task.id} 시작${branch ? ` · 브랜치 ${branch}` : ''}`,
  progress: (task, ms, steps) => `⏳ #${task.id} ${minutes(ms)}분 경과 · 단계 ${steps}`,
  stale: (mins) => `⌛ ${mins}분 넘게 지난 명령이라 실행하지 않았습니다. 필요하면 다시 보내 주세요.`,
  unknown: (name) => `알 수 없는 명령 /${name} — /help 를 확인하세요.`,
  held: (reason) => `⏸ 지금은 새 작업을 시작할 수 없습니다: ${reason}`,
  proposal: (task, d) => `#${task.id} 결과를 main에 병합할까요? (커밋 ${d.commits}개, +${d.added}/−${d.deleted}, 파일 ${d.files.length}개)`,
  merged: (task, sha) => `✅ #${task.id} main 병합 완료 (${sha})`,
  mergeHeld: (task, reason) => `⚠️ #${task.id} 병합 보류: ${reason}\n브랜치 ${task.branch} 는 그대로 있습니다.`,
  rejected: (task) => `🗑 #${task.id} 병합하지 않음 · 브랜치 ${task.branch} 보관 (/retry ${task.id} 로 이어서 가능)`,
};

export const REVERT_OPS_NOTE = '운영에는 아직 남아 있음, 배포 필요';
export const URGENT_DAILY_NOTE = '오늘 긴급 지시 5회를 다 써서 일반 대기로 접수합니다.';

export function reportBody({ task, title, ok, ms, summary, tests, diff, large, usage, note }) {
  const lines = [`#${task.id} /${task.cmd} ${clip(title || task.text, 60)} ${ok ? '✅ 성공' : '❌ 실패'} (${minutes(ms)}분)`, RULE];
  if (note) lines.push(note);
  if (summary) lines.push('요약', clip(summary, 6000));
  if (tests && tests.length) {
    lines.push('테스트');
    for (const t of tests) lines.push(` ${t.ok ? '통과' : '실패'} · ${t.label}${t.detail ? ` · ${t.detail}` : ''}`);
  }
  if (diff && diff.files.length) {
    lines.push(`변경 파일 (${diff.files.length})${large ? ' · 대형 변경: 집에서 검토 권장' : ''}`);
    for (const f of diff.files.slice(0, 30)) lines.push(` ${f.path}  +${f.added} −${f.deleted}`);
    if (diff.files.length > 30) lines.push(` … 외 ${diff.files.length - 30}개`);
    if (task.branch) lines.push(`브랜치: ${task.branch} (커밋 ${diff.commits})`);
    lines.push(RULE, `diff 일부${diff.truncated ? ' (앞부분만)' : ''}`, diff.excerpt);
  }
  if (usage && usage.weekly !== null && usage.weekly !== undefined) lines.push(RULE, `Muse 사용량: 주간 ${usage.weekly}%`);
  return mask(lines.join('\n'));
}

export function failureBody({ task, ms, reason }) {
  return mask(`#${task.id} /${task.cmd} ❌ 실패 (${minutes(ms)}분)\n${RULE}\n사유: ${clip(reason, 1500)}\n로그: /log ${task.id}`);
}

// Pulls "N pass / M fail" out of node --test or flutter output for the report line.
// The lines a person (or the next Muse turn) needs to fix a red run: failing
// test names and the assertion / overflow messages under them. Capped.
export function failureExcerpt(output, max = 3000) {
  // The last alternative keeps Flutter's "error-causing widget" line
  // (e.g. "Row Row:file:///…/home.dart:132:11"), which names the culprit.
  const keep = /^\s*(✖ |not ok |FAIL\b|AssertionError|Error:|error -|  error|Expected:|Actual:|Which:|.*overflowed by|.*\[E\]$|C:[\\/].*_test\.dart: |\w+ \w+:file:\/\/\/.*\.dart:\d+)/;
  const lines = String(output || '').split(/\r?\n/).filter((l) => keep.test(l) && !/failing tests:$/.test(l));
  const unique = [...new Set(lines.map((l) => l.trimEnd()))];
  const text = unique.join('\n');
  return text.length > max ? `${text.slice(0, max)}\n…` : text;
}

export function testDetail(output) {
  const text = String(output || '');
  // node --test prints "ℹ pass N" on a terminal and "# pass N" (TAP) when piped.
  const pass = /^(?:ℹ|#) pass (\d+)/m.exec(text);
  const fail = /^(?:ℹ|#) fail (\d+)/m.exec(text);
  if (pass || fail) return `${pass ? pass[1] : '?'} 통과 / ${fail ? fail[1] : '?'} 실패`;
  if (/No issues found/.test(text)) return '문제 없음';
  const issues = /(\d+) issues? found/.exec(text);
  if (issues) return `${issues[1]}건 발견`;
  if (/All tests passed/.test(text)) return '전체 통과';
  return '';
}
