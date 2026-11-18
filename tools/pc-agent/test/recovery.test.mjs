// S1 (blueprint 9-2), runner side: after a gap of over 3 minutes without
// a successful poll the runner announces its recovery once, with the
// queued-command count. No muse binary is ever called here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent, RECOVERY_GAP_MS } from '../src/agent.mjs';
import { validateConfig } from '../src/config.mjs';

const OWNER = 'owner-user-0001';
class FakeLuno {
  constructor() { this.posts = []; this.n = 0; }
  async claim() { return null; }
  async complete() {}
  async post(roomId, msg) { const id = `msg-${++this.n}`; this.posts.push({ id, roomId, ...msg }); return id; }
}
function lab(roomIds = ['room-pc']) {
  const dir = mkdtempSync(join(tmpdir(), 'pca-rec-'));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  const cfg = validateConfig({
    baseUrl: 'https://example.test/api/v1', ownerUserId: OWNER,
    projects: [{ id: 'line', name: 'LUNO', roomIds, repoPath: repo }],
  }, { tokens: { line: 'cf-bot-test' } });
  const luno = new FakeLuno();
  const agent = new Agent({ cfg, secrets: { tokens: { line: 'cf-bot-test' } }, dir, clientFactory: () => luno });
  const project = agent.project('line');
  return { dir, cfg, agent, luno, project };
}

test('recovery: a stale last poll posts once per room with the queued count', async () => {
  const w = lab(['room-a', 'room-b']);
  const now = Date.now();
  writeFileSync(join(w.dir, 'lastpoll'), String(now - RECOVERY_GAP_MS - 1000));
  w.agent.queue.create({ project: w.project, cmd: 'dev', text: 'one', roomId: 'room-a', messageId: 'm1' });
  w.agent.queue.create({ project: w.project, cmd: 'ask', text: 'two', roomId: 'room-b', messageId: 'm2' });
  assert.equal(await w.agent.notePollOk(now), true);
  assert.equal(w.luno.posts.length, 2, 'one per room');
  assert.deepEqual(w.luno.posts.map((p) => p.roomId).sort(), ['room-a', 'room-b']);
  for (const p of w.luno.posts) assert.equal(p.body, '🟢 복구됨, 대기 중 지시 2건 처리 시작');
  assert.equal(await w.agent.notePollOk(now + 5000), false, 'the very next poll stays silent');
  assert.equal(w.luno.posts.length, 2);
});

test('recovery: a fresh last poll stays silent', async () => {
  const w = lab();
  const now = Date.now();
  writeFileSync(join(w.dir, 'lastpoll'), String(now - 60000));
  assert.equal(await w.agent.notePollOk(now), false);
  assert.equal(w.luno.posts.length, 0);
  assert.equal(readFileSync(join(w.dir, 'lastpoll'), 'utf8'), String(now), 'still records the poll');
});

test('recovery: the first run records the poll without posting', async () => {
  const w = lab();
  assert.ok(!existsSync(join(w.dir, 'lastpoll')));
  assert.equal(await w.agent.notePollOk(1700000000000), false);
  assert.equal(w.luno.posts.length, 0);
  assert.equal(readFileSync(join(w.dir, 'lastpoll'), 'utf8'), '1700000000000');
});

test('recovery: night polls stay inside the 3-minute detection budget', async () => {
  const w = lab();
  assert.ok(w.cfg.pollMs.night <= 180000, `night interval ${w.cfg.pollMs.night}ms`);
  assert.ok(w.cfg.pollMs.night <= RECOVERY_GAP_MS);
});
