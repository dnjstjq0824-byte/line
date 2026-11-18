// S7 (blueprint 9-5), runner side: when a reported task touched the web UI
// and the project lists screenshots, the runner captures each page at phone
// and PC sizes and attaches the shots after the report. Capture itself is
// injected; these tests pin the flow with a fake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../src/agent.mjs';
import { LunoClient } from '../src/luno.mjs';
import { validateConfig } from '../src/config.mjs';

const FAKE_MUSE = join(dirname(fileURLToPath(import.meta.url)), 'fake-muse.mjs');
const OWNER = 'owner-user-0001';
const ROOM = 'room-pc';

class FakeLuno {
  constructor() { this.jobs = []; this.posts = []; this.uploads = []; this.n = 0; this.failUploadAt = -1; }
  async claim() { return this.jobs.shift() || null; }
  async complete() {}
  async post(roomId, msg) { const id = `msg-${++this.n}`; this.posts.push({ id, roomId, ...msg }); return id; }
  async uploadAttachment(roomId, file) {
    this.uploads.push({ roomId, ...file });
    if (this.uploads.length === this.failUploadAt) throw new Error('r2 down');
    return `att-${this.uploads.length}`;
  }
  command(body) {
    this.jobs.push({ id: `job-${++this.n}`, room_id: ROOM, kind: 'command',
      payload: { message_id: `in-${this.n}`, author_id: OWNER, body, created_at: new Date().toISOString() } });
  }
}
function lab({ screenshots, captureImpl = null, testCommands = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pca-shot-'));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  writeFileSync(join(repo, 'pass.test.mjs'), "import test from 'node:test';\ntest('ok', () => {});\n");
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init'], { cwd: repo });
  const cfg = validateConfig({
    baseUrl: 'https://example.test/api/v1', ownerUserId: OWNER, museCommand: [process.execPath, FAKE_MUSE],
    worktreeRoot: join(dir, 'wt'),
    projects: [{ id: 'line', name: 'LUNO', roomIds: [ROOM], repoPath: repo,
      screenshots: screenshots === undefined ? ['/', '/download.html'] : screenshots,
      testCommands: testCommands || [[process.execPath, '--test', 'pass.test.mjs']] }],
  }, { tokens: { line: 'cf-bot-test' } });
  const captures = [];
  const capture = captureImpl || (async ({ worktree, pages }) => {
    captures.push({ worktree, pages });
    const shots = [];
    for (const page of pages) for (const size of ['phone', 'pc']) shots.push({ page, size, png: Buffer.from(`fake-${page}-${size}`) });
    return shots;
  });
  const luno = new FakeLuno();
  const agent = new Agent({ cfg, secrets: { tokens: { line: 'cf-bot-test' } }, dir, clientFactory: () => luno, captureImpl: capture });
  const drain = async () => { await agent.pollOnce(); while (agent.execution) { await agent.execution; agent.startNext(); } };
  return { dir, cfg, agent, luno, drain, captures };
}

test('capture: web changes attach phone and pc shots after the report', async () => {
  const w = lab({});
  w.luno.command('/dev tweak the header WRITE:apps/user-web/src/x.vue');
  await w.drain();
  const task = w.agent.queue.get('T-0001');
  assert.equal(task.state, 'reported');
  assert.equal(w.captures.length, 1);
  assert.deepEqual(w.captures[0].pages, ['/', '/download.html']);
  assert.ok(w.captures[0].worktree.includes('T-0001'), 'capture runs in the task worktree');
  assert.deepEqual(w.luno.uploads.map((u) => u.name),
    ['shot-home-phone.png', 'shot-home-pc.png', 'shot-download-html-phone.png', 'shot-download-html-pc.png']);
  assert.ok(w.luno.uploads.every((u) => u.mime === 'image/png' && u.roomId === ROOM));
  const kinds = w.luno.posts.map((p) => p.kind);
  assert.deepEqual(kinds, ['text', 'text', 'report', 'image', 'image', 'image', 'image', 'proposal']);
  const images = w.luno.posts.filter((p) => p.kind === 'image');
  assert.deepEqual(images.map((p) => p.metadata.attachment_id), ['att-1', 'att-2', 'att-3', 'att-4']);
  assert.ok(images[0].body.includes('/download.html') === false && images[0].body.includes('/'), images[0].body);
});

test('capture: skipped without web changes, without screenshots, or on red', async () => {
  const plain = lab({});
  plain.luno.command('/dev backend only WRITE:src/a.txt');
  await plain.drain();
  assert.equal(plain.captures.length, 0, 'no web change');
  const off = lab({ screenshots: [] });
  off.luno.command('/dev tweak WRITE:apps/user-web/src/x.vue');
  await off.drain();
  assert.equal(off.captures.length, 0, 'screenshots off');
  const red = lab({ testCommands: [[process.execPath, '--eval', 'process.exit(1)']] });
  red.luno.command('/dev tweak WRITE:apps/user-web/src/x.vue');
  await red.drain();
  assert.equal(red.agent.queue.get('T-0001').testsOk, false);
  assert.equal(red.captures.length, 0, 'red builds are not screenshotted');
});

test('capture: capture failures never fail the task', async () => {
  const w = lab({ captureImpl: async () => { throw new Error('playwright missing'); } });
  w.luno.command('/dev tweak WRITE:apps/user-web/src/x.vue');
  await w.drain();
  const task = w.agent.queue.get('T-0001');
  assert.equal(task.state, 'reported');
  assert.ok(task.proposalMessageId);
  assert.equal(w.luno.posts.filter((p) => p.kind === 'image').length, 0);
});

test('capture: one failed upload skips only that shot', async () => {
  const w = lab({});
  w.luno.failUploadAt = 2;
  w.luno.command('/dev tweak WRITE:apps/user-web/src/x.vue');
  await w.drain();
  assert.equal(w.luno.uploads.length, 4, 'every shot attempted');
  assert.equal(w.luno.posts.filter((p) => p.kind === 'image').length, 3);
  assert.ok(w.agent.queue.get('T-0001').proposalMessageId);
});

test('capture: screenshots config fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pca-shot-cfg-'));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  const base = {
    baseUrl: 'https://example.test/api/v1', ownerUserId: OWNER, museCommand: [process.execPath, FAKE_MUSE],
    worktreeRoot: join(dir, 'wt'),
    projects: [{ id: 'line', name: 'LUNO', roomIds: [ROOM], repoPath: repo }],
  };
  const secrets = { tokens: { line: 'cf-bot-test' } };
  const withShots = (screenshots) => () => validateConfig(
    { ...base, projects: [{ ...base.projects[0], screenshots }] }, secrets);
  assert.throws(withShots('nope'), /screenshots/);
  assert.throws(withShots(['nope']), /screenshots/);
  assert.throws(withShots(['/ok', `/${'a'.repeat(200)}`]), /screenshots/);
  assert.deepEqual(withShots(['/'])().projects[0].screenshots, ['/']);
});

test('client: post carries metadata, uploads send base64', async () => {
  const seen = [];
  const client = new LunoClient({ baseUrl: 'https://x.test/api/v1', token: 'cf-bot-t',
    fetchImpl: async (url, opts) => { seen.push({ url, method: opts.method, body: JSON.parse(opts.body) }); return { ok: true, json: async () => ({ id: 'm1' }) }; } });
  await client.post('room-1', { kind: 'image', body: 'shot', metadata: { attachment_id: 'a1' }, clientId: 'c1' });
  await client.uploadAttachment('room-1', { name: 's.png', mime: 'image/png', bytes: Buffer.from([1, 2, 3]) });
  assert.deepEqual(seen[0].body, { kind: 'image', body: 'shot', metadata: { attachment_id: 'a1' }, client_id: 'c1' });
  assert.deepEqual(seen[1], { url: 'https://x.test/api/v1/attachments', method: 'POST',
    body: { conversation_id: 'room-1', content_base64: 'AQID', mime_type: 'image/png', original_name: 's.png' } });
});
