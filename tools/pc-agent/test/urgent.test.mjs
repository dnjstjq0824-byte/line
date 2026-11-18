// S5 (blueprint 9-8): urgent commands jump the queue, at most five a day.
// The sixth urgent command of the day rides the normal line, and is told so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../src/agent.mjs';
import { TaskQueue, URGENT_PER_DAY } from '../src/queue.mjs';
import { validateConfig } from '../src/config.mjs';

const FAKE_MUSE = join(dirname(fileURLToPath(import.meta.url)), 'fake-muse.mjs');
const OWNER = 'owner-user-0001';
const ROOM = 'room-pc';

class FakeLuno {
  constructor() { this.jobs = []; this.posts = []; this.n = 0; }
  async claim() { return this.jobs.shift() || null; }
  async complete() {}
  async post(roomId, msg) { const id = `msg-${++this.n}`; this.posts.push({ id, roomId, ...msg }); return id; }
  command(body) {
    this.jobs.push({ id: `job-${++this.n}`, room_id: ROOM, kind: 'command',
      payload: { message_id: `in-${this.n}`, author_id: OWNER, body, created_at: new Date().toISOString() } });
  }
}
function lab() {
  const dir = mkdtempSync(join(tmpdir(), 'pca-urgent-'));
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

test('urgent: five jump the queue, the sixth rides the normal line', async () => {
  assert.equal(URGENT_PER_DAY, 5);
  const w = lab();
  for (let i = 0; i < 6; i++) {
    w.luno.command(`/dev! urgent work ${i + 1}`);
    await w.drain();
  }
  for (let n = 1; n <= 5; n++) assert.equal(w.agent.queue.get(`T-${String(n).padStart(4, '0')}`).urgent, true, `T-${n} urgent`);
  const sixth = w.agent.queue.get('T-0006');
  assert.equal(sixth.urgent, false, 'the sixth is a normal task');
  const accepted = w.luno.posts.filter((p) => p.body.includes('접수'));
  assert.equal(accepted.length, 6);
  assert.ok(accepted[4].body.includes('/dev!'), 'the fifth still shows urgent');
  assert.ok(!accepted[5].body.includes('/dev!') && accepted[5].body.includes('/dev '), 'the sixth shows a normal command');
  assert.ok(accepted[5].body.includes('일반 대기'), 'the sixth is told it rides the normal line');
  assert.equal(w.agent.queue.countUrgentToday(), 5);
});

test('urgent: urgent tasks sort ahead of normal ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pca-urgent-q-'));
  const queue = new TaskQueue(dir);
  const project = { id: 'line', prefix: 'T' };
  queue.create({ project, cmd: 'dev', text: 'normal first', roomId: ROOM, messageId: 'a' });
  queue.create({ project, cmd: 'dev', text: 'urgent', urgent: true, roomId: ROOM, messageId: 'b' });
  queue.create({ project, cmd: 'dev', text: 'normal second', roomId: ROOM, messageId: 'c' });
  assert.deepEqual(queue.queued().map((t) => t.id), ['T-0002', 'T-0001', 'T-0003']);
});

test('urgent: the daily allowance rolls over at midnight', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pca-urgent-day-'));
  const queue = new TaskQueue(dir);
  queue.meta.urgentDay = '2000-01-01';
  queue.meta.urgentCount = 5;
  assert.equal(queue.countUrgentToday(), 0);
  queue.noteUrgent();
  assert.equal(queue.countUrgentToday(), 1);
});
