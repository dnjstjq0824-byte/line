// S4 (blueprint 9-9): daily scheduled commands. Registration, listing and
// removal go through chat; due entries run at most once a day through the
// same job path as chat commands. Code-changing commands are refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../src/agent.mjs';
import { validateConfig } from '../src/config.mjs';

const FAKE_MUSE = join(dirname(fileURLToPath(import.meta.url)), 'fake-muse.mjs');
const OWNER = 'owner-user-0001';
const ROOM = 'room-pc';
const T = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();

class FakeLuno {
  constructor() { this.jobs = []; this.posts = []; this.n = 0; }
  async claim() { return this.jobs.shift() || null; }
  async complete() {}
  async post(roomId, msg) { const id = `msg-${++this.n}`; this.posts.push({ id, roomId, ...msg }); return id; }
  command(body) {
    this.jobs.push({ id: `job-${++this.n}`, room_id: ROOM, kind: 'command',
      payload: { message_id: `in-${this.n}`, author_id: OWNER, body, created_at: new Date().toISOString() } });
  }
  last() { return this.posts[this.posts.length - 1]; }
}
function lab() {
  const dir = mkdtempSync(join(tmpdir(), 'pca-every-'));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  const cfg = validateConfig({
    baseUrl: 'https://example.test/api/v1', ownerUserId: OWNER, museCommand: [process.execPath, FAKE_MUSE],
    worktreeRoot: join(dir, 'wt'),
    projects: [{ id: 'line', name: 'LUNO', roomIds: [ROOM], repoPath: repo }],
  }, { tokens: { line: 'cf-bot-test' } });
  const luno = new FakeLuno();
  const agent = new Agent({ cfg, secrets: { tokens: { line: 'cf-bot-test' } }, dir, clientFactory: () => luno });
  const drain = async () => { await agent.pollOnce(); while (agent.execution) { await agent.execution; agent.startNext(); } };
  return { dir, cfg, agent, luno, drain };
}

test('every: register, list, switch off, at most five', async () => {
  const w = lab();
  w.luno.command('/every 07:00 /ask 어제 커밋 요약');
  await w.drain();
  assert.ok(w.luno.last().body.includes('매일 07:00에 실행합니다'), w.luno.last().body);
  assert.ok(w.luno.last().body.includes('1번'), w.luno.last().body);
  w.luno.command('/every 7:30 /status');
  await w.drain();
  assert.ok(w.luno.last().body.includes('매일 07:30에 실행합니다'), w.luno.last().body);
  w.luno.command('/every list');
  await w.drain();
  assert.ok(w.luno.last().body.includes('1. 07:00 /ask 어제 커밋 요약'), w.luno.last().body);
  assert.ok(w.luno.last().body.includes('2. 07:30 /status'), w.luno.last().body);
  w.luno.command('/every off 1');
  await w.drain();
  assert.ok(w.luno.last().body.includes('1번을 껐습니다'), w.luno.last().body);
  w.luno.command('/every off 9');
  await w.drain();
  assert.ok(w.luno.last().body.includes('해당 번호의 정기 작업이 없습니다'), w.luno.last().body);
  for (let i = 0; i < 4; i++) { w.luno.command(`/every 08:0${i} /usage`); await w.drain(); }
  assert.equal(JSON.parse(readFileSync(join(w.dir, 'every.json'), 'utf8')).length, 5);
  w.luno.command('/every 09:00 /usage');
  await w.drain();
  assert.ok(w.luno.last().body.includes('최대 5개'), w.luno.last().body);
  w.luno.command('/every');
  await w.drain();
  assert.ok(w.luno.last().body.includes('/every 07:00'), w.luno.last().body);
});

test('every: code-changing commands are refused', async () => {
  const w = lab();
  for (const inner of ['/dev fix it', '/mkt slogan', '/auto docs/WO.md', '/continue next', '/retry T-0001 x']) {
    w.luno.command(`/every 07:00 ${inner}`);
    await w.drain();
    assert.ok(w.luno.last().body.includes('등록할 수 없습니다'), `${inner}: ${w.luno.last().body}`);
  }
  assert.equal(w.agent.every.list().length, 0);
  w.luno.command('/every 25:00 /ask x');
  await w.drain();
  assert.ok(w.luno.last().body.includes('형식'), w.luno.last().body);
});

test('every: due entries run once per day through the job path', async () => {
  const w = lab();
  w.agent.every.add({ time: '07:00', command: '/ask 어제 커밋 요약', roomId: ROOM, projectId: 'line' });
  assert.equal(await w.agent.checkEvery(T(2026, 11, 19, 6, 59)), 0);
  assert.equal(await w.agent.checkEvery(T(2026, 11, 19, 7, 0)), 1);
  while (w.agent.execution) { await w.agent.execution; w.agent.startNext(); }
  const task = w.agent.queue.get('T-0001');
  assert.equal(task.cmd, 'ask');
  assert.equal(task.state, 'done');
  assert.ok(w.luno.posts.some((p) => p.body.includes('#T-0001 답변')), 'the scheduled ask was answered');
  assert.equal(await w.agent.checkEvery(T(2026, 11, 19, 7, 5)), 0, 'already ran today');
  assert.equal(await w.agent.checkEvery(T(2026, 11, 20, 7, 0)), 1, 'runs again tomorrow');
  while (w.agent.execution) { await w.agent.execution; w.agent.startNext(); }
  assert.equal(w.agent.queue.get('T-0002').cmd, 'ask');
});

test('every: entries for unknown rooms are skipped, never crash', async () => {
  const w = lab();
  w.agent.every.add({ time: '07:00', command: '/status', roomId: 'gone-room', projectId: 'line' });
  assert.equal(await w.agent.checkEvery(T(2026, 11, 19, 7, 0)), 0);
  assert.equal(w.luno.posts.length, 0);
});
