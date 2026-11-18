// Chat text -> command. Only text that reached the runner through the
// server's allowlist is ever parsed here.
export const QUEUED = new Set(['dev', 'mkt', 'ask', 'check', 'continue', 'retry', 'revert']);
export const INSTANT = new Set(['status', 'stop', 'cancel', 'log', 'diff', 'usage', 'help', 'git', 'merge', 'auto', 'every']);
const ALIASES = {
  상태: 'status', 중지: 'stop', 멈춰: 'stop', 취소: 'cancel', 로그: 'log', 사용량: 'usage', 도움말: 'help',
  개발: 'dev', 마케팅: 'mkt', 질문: 'ask', 점검: 'check', 이어서: 'continue', 계속: 'continue', 재시도: 'retry', 되돌리기: 'revert', 깃: 'git', 자동: 'auto',
};
const TASK_ID = /^[A-Z][A-Z0-9]{0,7}-\d{4}$/;

// Returns { cmd, urgent, taskId, text }, { cmd:'unknown', name }, or null when
// the text is not a command at all.
export function parseCommand(body) {
  const text = String(body || '').trim();
  if (!text.startsWith('/')) return null;
  const m = text.match(/^\/([^\s!]+)(!?)(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  const cmd = ALIASES[m[1]] || m[1].toLowerCase();
  let rest = (m[3] || '').trim();
  if (!QUEUED.has(cmd) && !INSTANT.has(cmd)) return { cmd: 'unknown', name: m[1] };
  let taskId = '';
  if (['cancel', 'log', 'diff', 'retry', 'merge', 'revert'].includes(cmd)) {
    const first = rest.split(/\s+/)[0] || '';
    if (TASK_ID.test(first.toUpperCase())) {
      taskId = first.toUpperCase();
      rest = rest.slice(first.length).trim();
    }
  }
  return { cmd, urgent: m[2] === '!' && (cmd === 'dev' || cmd === 'mkt'), taskId, text: rest };
}

export const HELP = [
  '사용할 수 있는 명령',
  '/status — 실행 중 작업·대기열·Muse 사용량',
  '/git — git status·브랜치·최근 커밋',
  '/check — 정적 분석·테스트 점검',
  '/continue [지시] — 작업지시서의 다음 카드를 이어서 진행',
  '/auto [작업지시서] — 카드를 끝까지 하나씩 자동으로 진행 (/auto off 로 멈춤)',
  '/every 07:00 <명령> — 매일 실행 (최대 5개, /every list, /every off <번호>)',
  '/dev <지시> — 개발 작업 (브랜치에서 작업 → 보고 → 승인하면 병합)',
  '/mkt <지시> — 마케팅 문구·랜딩 작업',
  '/ask <질문> — 코드를 읽고 답만 (수정 없음)',
  '/retry <작업번호> <추가 지시> — 같은 브랜치에서 이어서',
  '/revert <작업번호> — 병합된 작업을 되돌리는 브랜치·테스트·제안',
  '/stop — 실행 중 작업 중단 · /cancel <작업번호> — 대기 작업 취소',
  '/merge <작업번호> — 승인했지만 보류된 병합 다시 시도',
  '/log <작업번호> · /diff <작업번호> · /usage · /help',
  '보고 메시지에 답장하면 그 작업을 이어서 진행합니다.',
].join('\n');
