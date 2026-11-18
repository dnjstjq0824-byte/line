// End-to-end over a real temporary git repository, with a fake LUNO server
// (in-process) and a fake muse binary: accept -> run -> commit -> test ->
// report -> proposal -> decision -> fast-forward merge, plus every refusal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../src/agent.mjs';
import { validateConfig } from '../src/config.mjs';

const FAKE_MUSE = join(dirname(fileURLToPath(import.meta.url)), 'fake-muse.mjs');
const OWNER = 'owner-user-0001';
const ROOM = 'room-pc';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

class FakeLuno {
  constructor() { this.jobs = []; this.posts = []; this.completed = []; this.presence = []; this.n = 0; }
  async claim(presence) { this.presence.push(presence); return this.jobs.shift() || null; }
  async complete(id, status, extra) { this.completed.push({ id, status, ...extra }); }
  async post(roomId, msg) { const id = `msg-${++this.n}`; this.posts.push({ id, roomId, ...msg }); return id; }
  command(body, extra = {}) {
    const id = `in-${++this.n}`;
    this.jobs.push({ id: `job-${this.n}`, room_id: ROOM, kind: 'command', payload: { message_id: id, author_id: OWNER, body, created_at: new Date().toISOString(), ...extra } });
    return id;
  }
  decide(proposalId, decision, by = OWNER) {
    this.jobs.push({ id: `job-${++this.n}`, room_id: ROOM, kind: 'decision', payload: { proposal_message_id: proposalId, decision, decided_by: by } });
  }
  last(kind) { return [...this.posts].reverse().find((p) => !kind || p.kind === kind); }
  text() { return this.posts.map((p) => p.body).join('\n---\n'); }
}

function world(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'pca-flow-'));
  const repo = join(root, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@luno-test.local');
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'README.md'), 'hello\n');
  writeFileSync(join(repo, 'pass.test.mjs'), "import test from 'node:test';\ntest('ok', () => {});\n");
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  const dir = join(root, 'state');
  const cfg = validateConfig({
    baseUrl: 'https://example.test/api/v1', ownerUserId: OWNER, museCommand: [process.execPath, FAKE_MUSE],
    worktreeRoot: join(root, 'wt'), progressEveryMs: 3600000,
    projects: [{
      id: 'line', name: 'LUNO', roomIds: [ROOM], repoPath: repo,
      testCommands: [[process.execPath, '--test', 'pass.test.mjs']],
      checkCommands: [{ label: 'unit', cwd: '.', cmd: [process.execPath, '--test', 'pass.test.mjs'] }],
      continuePrompt: 'continue the plan WRITE:plan/next.txt', mktAllowedPaths: ['marketing/**'],
      timeoutsMin: { dev: 1, mkt: 1, ask: 1, check: 1 }, ...(overrides.project || {}),
    }],
    ...(overrides.cfg || {}),
  }, { tokens: { line: 'cf-bot-test' } });
  const luno = new FakeLuno();
  const agent = new Agent({ cfg, secrets: { tokens: { line: 'cf-bot-test' } }, dir, clientFactory: () => luno });
  const drain = async () => { await agent.pollOnce(); while (agent.execution) { await agent.execution; agent.startNext(); } };
  return { root, repo, dir, luno, agent, drain, cfg };
}

test('/dev: accept, run in a worktree, commit, test, report, propose, approve, fast-forward merge', async () => {
  const w = world();
  const msg = w.luno.command('/dev add a file WRITE:src/new.txt');
  await w.drain();
  assert.equal(w.luno.completed[0].status, 'done', 'server job released at once');
  assert.ok(w.luno.posts[0].body.includes('📥 #T-0001'), 'accepted');
  assert.equal(w.luno.posts[0].replyTo, msg, 'ack replies to the command');
  assert.ok(w.luno.posts.some((p) => p.body.includes('▶️ #T-0001') && p.body.includes('luno-auto/task-')));
  const report = w.luno.last('report');
  assert.ok(report.body.includes('✅ 성공') && report.body.includes('src/new.txt') && report.body.includes('1 통과 / 0 실패'), report.body);
  const proposal = w.luno.last('proposal');
  assert.ok(proposal && proposal.body.includes('#T-0001'));
  assert.ok(!existsSync(join(w.repo, 'src', 'new.txt')), 'main untouched before approval');
  const task = w.agent.queue.get('T-0001');
  assert.equal(task.state, 'reported');
  assert.match(git(w.repo, 'log', '-1', '--format=%B', task.branch), /luno-auto\(T-0001\)[\s\S]*Luno-Task: T-0001/);
  assert.ok(new Set(w.luno.posts.map((p) => p.clientId)).size === w.luno.posts.length, 'every post has a unique client id');

  w.luno.decide(proposal.id, 'approved');
  await w.drain();
  assert.ok(existsSync(join(w.repo, 'src', 'new.txt')), 'merged into main');
  assert.equal(w.agent.queue.get('T-0001').state, 'merged');
  assert.ok(w.luno.last().body.includes('✅ #T-0001 main 병합 완료'));
  assert.ok(!existsSync(task.worktree), 'worktree removed after merge');
  assert.equal(git(w.repo, 'status', '--porcelain'), '');
});

test('commands from anyone else, or from another room, are refused silently', async () => {
  const w = world();
  w.luno.jobs.push({ id: 'j1', room_id: ROOM, kind: 'command', payload: { message_id: 'x1', author_id: 'someone-else', body: '/dev WRITE:evil.txt', created_at: new Date().toISOString() } });
  w.luno.jobs.push({ id: 'j2', room_id: 'other-room', kind: 'command', payload: { message_id: 'x2', author_id: OWNER, body: '/dev WRITE:evil.txt', created_at: new Date().toISOString() } });
  await w.drain();
  await w.drain();
  assert.deepEqual(w.luno.completed.map((c) => c.status), ['failed', 'failed']);
  assert.equal(w.luno.posts.length, 0, 'no reply at all');
  assert.equal(w.agent.queue.all().length, 0);
});

test('a decision by someone else never merges', async () => {
  const w = world();
  w.luno.command('/dev WRITE:a.txt');
  await w.drain();
  const proposal = w.luno.last('proposal');
  w.luno.decide(proposal.id, 'approved', 'someone-else');
  await w.drain();
  assert.equal(w.agent.queue.get('T-0001').state, 'reported');
  assert.ok(!existsSync(join(w.repo, 'a.txt')));
});

test('rejecting keeps main unchanged and the branch for /retry; a reply continues the task', async () => {
  const w = world();
  w.luno.command('/dev WRITE:a.txt');
  await w.drain();
  const first = w.agent.queue.get('T-0001');
  w.luno.decide(w.luno.last('proposal').id, 'rejected');
  await w.drain();
  assert.equal(w.agent.queue.get('T-0001').state, 'rejected');
  assert.ok(!existsSync(join(w.repo, 'a.txt')));
  assert.ok(git(w.repo, 'branch', '--list', first.branch).includes(first.branch), 'branch kept');
  // Replying to the report (no slash) continues on the same branch.
  w.luno.command('also WRITE:b.txt', { reply_to: first.reportMessageId });
  await w.drain();
  const second = w.agent.queue.get('T-0002');
  assert.equal(second.cmd, 'retry');
  assert.equal(second.branch, first.branch);
  assert.equal(second.state, 'reported');
  w.luno.decide(w.luno.last('proposal').id, 'approved');
  await w.drain();
  assert.ok(existsSync(join(w.repo, 'a.txt')) && existsSync(join(w.repo, 'b.txt')), 'both changes land together');
});

test('a dirty main folder holds the merge; /merge retries once it is clean', async () => {
  const w = world();
  w.luno.command('/dev WRITE:a.txt');
  await w.drain();
  writeFileSync(join(w.repo, 'wip.txt'), 'someone is working here\n');
  w.luno.decide(w.luno.last('proposal').id, 'approved');
  await w.drain();
  assert.equal(w.agent.queue.get('T-0001').state, 'approved');
  assert.ok(w.luno.last().body.includes('병합 보류') && w.luno.last().body.includes('커밋 안 된 변경'));
  assert.ok(!existsSync(join(w.repo, 'a.txt')));
  git(w.repo, 'add', '-A');
  git(w.repo, 'commit', '-q', '-m', 'wip done');
  w.luno.command('/merge T-0001');
  await w.drain();
  assert.equal(w.agent.queue.get('T-0001').state, 'merged', 'rebased onto the new main and merged');
  assert.ok(existsSync(join(w.repo, 'a.txt')) && existsSync(join(w.repo, 'wip.txt')));
});

test('forbidden paths, /mkt outside its allowed paths and failing tests never get a merge proposal', async () => {
  const w = world();
  w.luno.command('/dev WRITE:wrangler.jsonc');
  await w.drain();
  assert.equal(w.agent.queue.get('T-0001').state, 'failed');
  assert.ok(w.luno.last('report').body.includes('금지 경로 변경: wrangler.jsonc'));
  w.luno.command('/mkt WRITE:src/app.js');
  await w.drain();
  assert.ok(w.luno.last('report').body.includes('허용 경로 밖 변경: src/app.js'));
  w.luno.command('/mkt WRITE:marketing/drafts/a.md');
  await w.drain();
  assert.equal(w.agent.queue.get('T-0003').state, 'reported');
  assert.ok(w.agent.queue.get('T-0003').branch.startsWith('luno-auto/mkt-'));
  assert.equal(w.luno.posts.filter((p) => p.kind === 'proposal').length, 1, 'only the valid mkt task proposes');

  const bad = world({ project: { testCommands: [[process.execPath, '-e', 'process.exit(3)']] } });
  bad.luno.command('/dev WRITE:a.txt');
  await bad.drain();
  assert.equal(bad.luno.posts.filter((p) => p.kind === 'proposal').length, 0);
  assert.ok(bad.luno.last('report').body.includes('테스트 실패'));
});

test('muse failure and timeout are reported; the queue keeps moving', async () => {
  const w = world({ project: { timeoutsMin: { dev: 0.02, mkt: 1, ask: 1, check: 1 } } });
  w.luno.command('/dev FAIL');
  w.luno.command('/dev SLEEP:60000');
  w.luno.command('/ask what is this?');
  await w.drain();
  await w.drain();
  await w.drain();
  while (w.agent.execution || w.agent.queue.queued().length) { await w.drain(); }
  assert.equal(w.agent.queue.get('T-0001').state, 'failed');
  assert.ok(w.agent.queue.get('T-0001').error.includes('model refused'));
  assert.ok(w.agent.queue.get('T-0002').error.includes('시간 초과'));
  assert.equal(w.agent.queue.get('T-0003').state, 'done');
  assert.ok(w.luno.text().includes('#T-0003 답변'));
});

test('/ask never writes; /check and /continue run; instant commands answer while idle', async () => {
  const w = world();
  w.luno.command('/ask WRITE:should-not-exist.txt');
  await w.drain();
  assert.ok(!existsSync(join(w.repo, 'should-not-exist.txt')), 'ask runs with writes disabled');
  w.luno.command('/check');
  await w.drain();
  assert.ok(w.luno.last('report').body.includes('통과 · unit'));
  w.luno.command('/continue');
  await w.drain();
  assert.ok(w.luno.last('report').body.includes('plan/next.txt'), 'continue uses the project prompt');
  for (const body of ['/status', '/git', '/usage', '/help', '/log T-0001', '/nope']) { w.luno.command(body); await w.drain(); }
  const text = w.luno.text();
  assert.ok(text.includes('실행 중인 작업 없음') && text.includes('Muse 사용량: 주간 53%'));
  assert.ok(text.includes('브랜치 main') && text.includes('최근 커밋'));
  assert.ok(text.includes('사용할 수 있는 명령') && text.includes('알 수 없는 명령 /nope'));
});

test('dedup, stale commands, limits, usage hold and presence', async () => {
  const w = world({ cfg: { maxQueued: 1 } });
  // The same message delivered twice (two bots in one room) runs once.
  const id = w.luno.command('/ask one');
  w.luno.jobs.push({ ...w.luno.jobs[0], id: 'dup' });
  w.luno.jobs[1].payload = { ...w.luno.jobs[0].payload };
  await w.drain();
  await w.drain();
  assert.equal(w.agent.queue.all().length, 1, id);
  // Old commands are not executed.
  w.luno.command('/dev WRITE:old.txt', { created_at: new Date(Date.now() - 45 * 60000).toISOString() });
  await w.drain();
  assert.ok(w.luno.last().body.includes('지난 명령'));
  assert.equal(w.agent.queue.all().length, 1);
  // Presence travels with every claim.
  assert.deepEqual(w.luno.presence.at(-1), { state: 'ready', detail: '', queue: 0, version: '1.0.0' });

  const held = world();
  process.env.FAKE_MUSE_WEEKLY = '95';
  try {
    held.luno.command('/dev WRITE:a.txt');
    await held.drain();
    assert.ok(held.luno.last('report').body.includes('주간 사용량 95%'));
    held.luno.command('/ask still answers');
    await held.drain();
    assert.equal(held.agent.queue.get('T-0002').state, 'done', 'questions still work over the limit');
  } finally { delete process.env.FAKE_MUSE_WEEKLY; }

  const stop = world();
  writeFileSync(join(stop.dir, 'STOP'), '');
  stop.luno.command('/dev WRITE:a.txt');
  await stop.drain();
  assert.ok(stop.luno.last().body.includes('STOP 파일'));
});

test('a second owner account commands the bot from its own 1:1 room; strangers there do not', async () => {
  const SECOND = 'owner-second-0002';
  const DM = 'dm-second-and-bot';
  const w = world({ cfg: { ownerUserIds: [SECOND] }, project: { roomIds: [ROOM, DM] } });
  assert.deepEqual(w.cfg.ownerUserIds, [OWNER, SECOND], 'the first owner stays on the list');
  const from = (author, room, body) => w.luno.jobs.push({ id: `j-${++w.luno.n}`, room_id: room, kind: 'command',
    payload: { message_id: `in-${w.luno.n}`, author_id: author, body, created_at: new Date().toISOString() } });
  from(SECOND, DM, '/dev WRITE:from-second.txt');
  await w.drain();
  assert.equal(w.agent.queue.get('T-0001').state, 'reported');
  assert.ok(w.luno.posts.every((p) => p.roomId === DM), 'replies go to the room the command came from');
  const proposal = w.luno.last('proposal');
  w.luno.jobs.push({ id: 'd1', room_id: DM, kind: 'decision', payload: { proposal_message_id: proposal.id, decision: 'approved', decided_by: SECOND } });
  await w.drain();
  assert.equal(w.agent.queue.get('T-0001').state, 'merged');
  assert.ok(existsSync(join(w.repo, 'from-second.txt')));
  const before = w.luno.posts.length;
  from('someone-else', DM, '/dev WRITE:evil.txt');
  await w.drain();
  assert.equal(w.luno.posts.length, before, 'a non-owner in an authorised room gets no reply');
  assert.equal(w.luno.completed.at(-1).status, 'failed');
});

test('/stop kills the running task; a restart marks interrupted work failed', async () => {
  const w = world();
  w.luno.command('/dev SLEEP:60000');
  await w.agent.pollOnce();
  assert.ok(w.agent.execution, 'running');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(w.agent.presence().state, 'busy');
  w.luno.command('/stop');
  await w.agent.pollOnce();
  await w.agent.execution;
  assert.equal(w.agent.queue.get('T-0001').state, 'stopped');
  assert.ok(w.luno.text().includes('중단 요청'));
  // Simulate a crash mid-run: a fresh runner over the same state folder.
  const task = w.agent.queue.get('T-0001');
  task.state = 'running';
  w.agent.queue.save(task);
  const reborn = new Agent({ cfg: w.cfg, secrets: { tokens: { line: 'cf-bot-test' } }, dir: w.dir, clientFactory: () => w.luno });
  assert.deepEqual(reborn.queue.recover().map((t) => t.id), ['T-0001']);
  assert.equal(JSON.parse(readFileSync(join(w.dir, 'tasks', 'T-0001.json'), 'utf8')).state, 'failed');
});

// ---- autopilot: card after card on one branch, unattended ----
test('autopilot chains cards on one branch, stops when the work order is done, main untouched until approval', async () => {
  const w = world();
  w.agent.autopilot.start({ projectId: 'line', roomId: ROOM, workOrder: 'docs/WO.md', maxCards: 10, instructions: 'DONE_AFTER:3' });
  w.agent.startNext();
  for (let i = 0; i < 10 && (w.agent.execution || w.agent.autopilot.active()); i++) {
    if (w.agent.execution) await w.agent.execution;
    w.agent.startNext();
  }
  const s = w.agent.autopilot.read();
  assert.equal(s.active, false);
  assert.match(s.stoppedReason, /모두 끝냈습니다/);
  assert.equal(s.cards, 4, 'three cards plus the turn that found nothing left');
  const tasks = w.agent.queue.all();
  assert.deepEqual(tasks.map((t) => t.cmd), ['continue', 'retry', 'retry', 'retry']);
  assert.ok(tasks.slice(1).every((t, i) => t.parentId === tasks[i].id), 'each card continues the previous one');
  const branch = tasks[0].branch;
  assert.ok(tasks.every((t) => t.branch === branch), 'one branch for the whole run');
  for (const n of [1, 2, 3]) assert.match(git(w.repo, 'show', `${branch}:card-${n}.txt`), new RegExp(`card ${n}`));
  assert.ok(!existsSync(join(w.repo, 'card-1.txt')), 'main untouched without approval');
  assert.ok(w.luno.text().includes('자동 진행 종료'));
  // Approving the last proposal merges every card at once.
  const proposal = w.luno.last('proposal');
  w.luno.decide(proposal.id, 'approved');
  await w.drain();
  for (const n of [1, 2, 3]) assert.ok(existsSync(join(w.repo, `card-${n}.txt`)), `card ${n} merged`);
});

test('autopilot stops after two failures in a row and on /auto off', async () => {
  const w = world();
  w.agent.autopilot.start({ projectId: 'line', roomId: ROOM, workOrder: 'docs/WO.md', maxCards: 10, instructions: 'FAIL' });
  w.agent.startNext();
  for (let i = 0; i < 6 && (w.agent.execution || w.agent.autopilot.active()); i++) {
    if (w.agent.execution) await w.agent.execution;
    w.agent.startNext();
  }
  const s = w.agent.autopilot.read();
  assert.equal(s.active, false);
  assert.match(s.stoppedReason, /연속 2번 실패/);
  assert.equal(w.agent.queue.all().length, 2, 'no third attempt');

  // From the phone: /auto <work order> turns it on, /auto off turns it off.
  const v = world();
  v.luno.command('/auto docs/WO.md');
  await v.agent.pollOnce();
  assert.ok(v.luno.text().includes('자동 진행을 켰습니다: docs/WO.md'));
  assert.ok(v.agent.autopilot.active());
  v.luno.command('/auto off');
  await v.agent.pollOnce();
  if (v.agent.execution) await v.agent.execution;
  assert.equal(v.agent.autopilot.active(), null);
  assert.ok(v.luno.text().includes('자동 진행을 멈췄습니다'));
  v.agent.startNext();
  assert.equal(v.agent.execution, null, 'nothing new starts once it is off');
});

test('autopilot hands the runner\'s failing test output to the next card', async () => {
  const w = world({ project: { testCommands: [{ label: 'all tests', cwd: '.', cmd: [process.execPath, '--test'] }] } });
  // The fake writes a broken test file, so the runner's own run goes red.
  w.agent.autopilot.start({ projectId: 'line', roomId: ROOM, workOrder: 'docs/WO.md', maxCards: 10, instructions: 'WRITE:broken.test.mjs' });
  w.agent.startNext();
  for (let i = 0; i < 4 && (w.agent.execution || w.agent.autopilot.active()); i++) {
    if (w.agent.execution) await w.agent.execution;
    w.agent.startNext();
  }
  const [first, second] = w.agent.queue.all();
  assert.equal(first.testsOk, false);
  assert.match(first.testFailures, /\[all tests\]/);
  assert.match(first.testFailures, /broken\.test\.mjs/);
  const prompt = readFileSync(join(w.dir, 'prompts', `${second.id}.md`), 'utf8');
  assert.match(prompt, /러너가 직접 돌린 테스트의 실패 내용/);
  assert.match(prompt, /broken\.test\.mjs/);
  assert.ok(w.luno.text().includes('all tests'), 'report labels the test by its name');
});

test('worktrees share each app\'s node_modules and removing them never touches the real ones', async () => {
  const w = world();
  mkdirSync(join(w.repo, 'apps', 'web'), { recursive: true });
  writeFileSync(join(w.repo, '.gitignore'), 'node_modules/\n**/node_modules/\n');
  writeFileSync(join(w.repo, 'apps', 'web', 'package.json'), '{}\n');
  git(w.repo, 'add', '-A');
  git(w.repo, 'commit', '-q', '-m', 'add app');
  const marker = join(w.repo, 'apps', 'web', 'node_modules', 'pkg', 'marker.txt');
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, 'real package\n');

  w.luno.command('/dev WRITE:x.txt');
  await w.drain();
  const task = w.agent.queue.get('T-0001');
  assert.ok(existsSync(join(task.worktree, 'apps', 'web', 'node_modules', 'pkg', 'marker.txt')), 'app packages visible in the worktree');
  assert.ok(!git(w.repo, 'show', '--name-only', '--format=', task.branch).includes('node_modules'), 'links never committed');
  w.luno.decide(w.luno.last('proposal').id, 'approved');
  await w.drain();
  assert.equal(w.agent.queue.get('T-0001').state, 'merged');
  assert.ok(!existsSync(task.worktree), 'worktree removed');
  assert.equal(readFileSync(marker, 'utf8'), 'real package\n', 'the real node_modules is untouched');
});

test('/revert: merged work is undone on a new branch, tested, proposed, merged back', async () => {
  const w = world();
  w.luno.command('/dev add a file WRITE:src/new.txt');
  await w.drain();
  w.luno.decide(w.luno.last('proposal').id, 'approved');
  await w.drain();
  assert.equal(w.agent.queue.get('T-0001').state, 'merged');
  assert.ok(existsSync(join(w.repo, 'src', 'new.txt')), 'main has the file before the revert');
  w.luno.command('/revert T-0001');
  await w.drain();
  const task = w.agent.queue.get('T-0002');
  assert.equal(task.state, 'reported');
  assert.ok(task.branch.startsWith('luno-auto/'), 'a new luno-auto branch');
  assert.notEqual(task.branch, w.agent.queue.get('T-0001').branch);
  assert.match(git(w.repo, 'log', '-1', '--format=%B', task.branch), /luno-auto\(T-0002\)[\s\S]*Luno-Revert: [0-9a-f]+/);
  const rp = w.luno.last('proposal');
  assert.ok(rp && rp.body.includes('#T-0002'));
  assert.ok(rp.body.includes('운영에는 아직 남아 있음, 배포 필요'), 'the proposal carries the ops note');
  w.luno.decide(rp.id, 'approved');
  await w.drain();
  assert.equal(w.agent.queue.get('T-0002').state, 'merged');
  assert.ok(!existsSync(join(w.repo, 'src', 'new.txt')), 'main no longer has the file');
  assert.ok(w.luno.last().body.includes('운영에는 아직 남아 있음, 배포 필요'), 'the merged notice carries the ops note');
});

test('/revert refuses work that was never merged', async () => {
  const w = world();
  w.luno.command('/dev WRITE:a.txt');
  await w.drain();
  w.luno.command('/revert T-0001');
  await w.drain();
  assert.ok(w.luno.last().body.includes('병합된 작업이 아니라'), 'reported-but-unmerged is refused with a reason');
  assert.equal(w.agent.queue.get('T-0002'), null, 'no task created');
  w.luno.command('/revert T-9999');
  await w.drain();
  assert.ok(w.luno.last().body.includes('/revert T-0001'), 'unknown id gets a usage hint');
});
