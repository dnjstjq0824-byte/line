// S6 (blueprint 9-1): content-free ntfy one-liners for completion, failure,
// approval-waiting and PC recovery. Default off; when off, zero external
// calls. Bodies carry the task id and the status only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../src/agent.mjs';
import { ntfyPing } from '../src/ntfy.mjs';
import { validateConfig } from '../src/config.mjs';

const FAKE_MUSE = join(dirname(fileURLToPath(import.meta.url)), 'fake-muse.mjs');
const OWNER = 'owner-user-0001';
const ROOM = 'room-pc';
const TOPIC = 'test-topic-12345678901234567890123456';

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
function lab(topic = '') {
  const dir = mkdtempSync(join(tmpdir(), 'pca-ntfy-'));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  writeFileSync(join(repo, 'pass.test.mjs'), "import test from 'node:test';\ntest('ok', () => {});\n");
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'], { cwd: repo });
  const cfg = validateConfig({
    baseUrl: 'https://example.test/api/v1', ownerUserId: OWNER, museCommand: [process.execPath, FAKE_MUSE],
    worktreeRoot: join(dir, 'wt'), notify: { ntfyTopic: topic },
    projects: [{ id: 'line', name: 'LUNO', roomIds: [ROOM], repoPath: repo,
      testCommands: [[process.execPath, '--test', 'pass.test.mjs']] }],
  }, { tokens: { line: 'cf-bot-test' } });
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, method: opts && opts.method, body: String(opts && opts.body) });
    return { ok: true };
  };
  const luno = new FakeLuno();
  const agent = new Agent({ cfg, secrets: { tokens: { line: 'cf-bot-test' } }, dir, clientFactory: () => luno, ntfyFetch: fetchImpl });
  const drain = async () => { await agent.pollOnce(); while (agent.execution) { await agent.execution; agent.startNext(); } };
  return { dir, cfg, agent, luno, drain, calls };
}

test('ntfy: unconfigured sends nothing at all', async () => {
  const w = lab();
  w.luno.command('/ask hello');
  await w.drain();
  w.luno.command('/ask FAIL please');
  await w.drain();
  assert.equal(w.agent.queue.get('T-0001').state, 'done');
  assert.equal(w.agent.queue.get('T-0002').state, 'failed');
  const { writeFileSync: write } = await import('node:fs');
  write(join(w.dir, 'lastpoll'), String(Date.now() - 600000));
  await w.agent.notePollOk(Date.now());
  assert.ok(w.luno.posts.some((p) => p.body.includes('복구됨')), 'recovery still posts to the room');
  assert.equal(w.calls.length, 0);
});

test('ntfy: completions and failures ping id plus status only', async () => {
  const w = lab(TOPIC);
  w.luno.command('/ask hello');
  await w.drain();
  w.luno.command('/ask FAIL please');
  await w.drain();
  assert.deepEqual(w.calls, [
    { url: `https://ntfy.sh/${TOPIC}`, method: 'POST', body: 'LUNO: T-0001 완료' },
    { url: `https://ntfy.sh/${TOPIC}`, method: 'POST', body: 'LUNO: T-0002 실패' },
  ]);
});

test('ntfy: proposals ping approval-waiting instead of completion', async () => {
  const w = lab(TOPIC);
  w.luno.command('/dev add a file WRITE:a.txt');
  await w.drain();
  const task = w.agent.queue.get('T-0001');
  assert.equal(task.state, 'reported');
  assert.ok(task.proposalMessageId);
  assert.deepEqual(w.calls.map((c) => c.body), ['LUNO: T-0001 승인 대기']);
});

test('ntfy: recovery pings without content', async () => {
  const w = lab(TOPIC);
  const { writeFileSync: write } = await import('node:fs');
  write(join(w.dir, 'lastpoll'), String(Date.now() - 600000));
  await w.agent.notePollOk(Date.now());
  assert.deepEqual(w.calls.map((c) => c.body), ['LUNO: PC 복구됨']);
});

test('ntfy: user-stopped tasks stay silent', async () => {
  const w = lab(TOPIC);
  w.luno.command('/dev SLEEP:60000');
  await w.agent.pollOnce();
  assert.ok(w.agent.execution, 'running');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  w.luno.command('/stop');
  await w.agent.pollOnce();
  await w.agent.execution;
  assert.equal(w.agent.queue.get('T-0001').state, 'stopped');
  assert.equal(w.calls.length, 0);
});

test('ntfy: transport failures never throw', async () => {
  assert.deepEqual(await ntfyPing({ topic: '', body: 'x', fetchImpl: async () => { throw new Error('must not run'); } }), { sent: false });
  assert.deepEqual(await ntfyPing({ topic: 't', body: 'x', fetchImpl: async () => { throw new Error('down'); } }), { sent: false });
  assert.deepEqual(await ntfyPing({ topic: 't', body: 'x', fetchImpl: async () => ({ ok: false }) }), { sent: false });
  const seen = [];
  const r = await ntfyPing({ topic: 'a/b c', body: 'hi', fetchImpl: async (url, opts) => { seen.push([url, opts.method]); return { ok: true }; } });
  assert.deepEqual(r, { sent: true });
  assert.deepEqual(seen, [['https://ntfy.sh/a%2Fb%20c', 'POST']]);
});
