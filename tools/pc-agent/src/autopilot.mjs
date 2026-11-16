// Autopilot: works through a work-order file card after card while nobody is
// watching. Every card is an ordinary runner task (worktree branch, Muse,
// commit, tests, report), chained on ONE branch so each card builds on the
// last. main still changes only when the owner approves a proposal; push and
// deploy stay off. State lives in <agent dir>/AUTOPILOT.json.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite } from './queue.mjs';

export const AUTOPILOT_FILE = 'AUTOPILOT.json';
export const DONE_MARK = 'AUTOPILOT_DONE';
const MAX_FAILURES = 2;

export function autopilotPrompt({ workOrder, previousFailed, instructions }) {
  return [
    `작업지시서 ${workOrder} 를 처음부터 읽어라. 체크박스가 비어 있는("- [ ]") 카드 중 맨 위 카드 하나만 끝까지 구현하라.`,
    '카드에 적힌 완료 기준과 테스트를 지켜라. 서버·웹 변경이면 node --test "scripts/*.test.mjs", 앱 변경이면 mobile/flutter_app 에서 flutter analyze 와 flutter test 를 실행해 모두 통과시켜라.',
    '카드를 끝내면 작업지시서에서 그 카드를 "- [x]" 로 바꾸고 같은 줄 끝에 한 줄 결과를 덧붙여라. 다음 카드는 시작하지 마라(러너가 다음 차례에 맡긴다).',
    ...(previousFailed ? ['직전 카드에서 테스트가 실패했다. 새 카드보다 먼저 그 실패를 고쳐 테스트를 통과시켜라. 고쳤다면 그것만으로 이번 차례를 끝내도 된다.'] : []),
    `남은 "- [ ]" 카드가 하나도 없으면 아무 파일도 바꾸지 말고, 마지막 답의 첫 줄에 ${DONE_MARK} 라고만 적어라.`,
    ...(instructions ? ['', '[추가 지시]', instructions] : []),
  ].join('\n');
}

export class Autopilot {
  constructor(dir) {
    this.dir = dir;
    this.path = join(dir, AUTOPILOT_FILE);
  }

  read() {
    if (!existsSync(this.path)) return null;
    try { return JSON.parse(readFileSync(this.path, 'utf8')); } catch { return null; }
  }

  write(state) { atomicWrite(this.path, JSON.stringify(state, null, 2)); }

  active() {
    const s = this.read();
    return s && s.active ? s : null;
  }

  start({ projectId, roomId, workOrder, maxCards = 20, instructions = '' }) {
    const state = {
      active: true, projectId, roomId, workOrder, maxCards, instructions,
      cards: 0, failures: 0, previousFailed: false, lastTaskId: '', startedAt: new Date().toISOString(),
    };
    this.write(state);
    return state;
  }

  stop(reason) {
    const s = this.read();
    if (!s || !s.active) return null;
    s.active = false;
    s.stoppedReason = reason;
    s.stoppedAt = new Date().toISOString();
    this.write(s);
    return s;
  }

  // Called once a card's task has finished. Returns { stop: reason|'' , state }.
  record(task) {
    const s = this.read();
    if (!s || !s.active) return { stop: '', state: s };
    s.cards += 1;
    s.lastTaskId = task.id;
    const summary = String(task.summary || '');
    const ok = task.state === 'reported' && task.testsOk === true;
    let stop = '';
    if (summary.split('\n')[0].includes(DONE_MARK) || (task.state === 'done' && summary.includes(DONE_MARK))) {
      stop = '작업지시서의 카드를 모두 끝냈습니다';
    } else if (task.state === 'stopped') {
      stop = '/stop 으로 중단했습니다';
    } else if (/사용량/.test(String(task.error || ''))) {
      stop = String(task.error);
    } else {
      if (ok) { s.failures = 0; s.previousFailed = false; }
      else { s.failures += 1; s.previousFailed = task.state === 'reported'; }
      if (s.failures >= MAX_FAILURES) stop = `연속 ${MAX_FAILURES}번 실패해서 멈췄습니다 (마지막 #${task.id})`;
      else if (s.cards >= s.maxCards) stop = `카드 ${s.maxCards}개 한도에 도달했습니다`;
    }
    if (stop) {
      s.active = false;
      s.stoppedReason = stop;
      s.stoppedAt = new Date().toISOString();
    }
    this.write(s);
    return { stop, state: s };
  }
}
