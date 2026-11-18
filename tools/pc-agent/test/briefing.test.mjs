// S3 (blueprint 9-9): the morning briefing, the one-time
// approval-nudge and quiet hours. The clock is injected; no muse binary is
// ever called here (usage comes from the fake).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../src/agent.mjs';
import { validateConfig } from '../src/config.mjs';

const FAKE_MUSE = join(dirname(fileURLToPath(import.meta.url)), 'fake-muse.mjs');
const OWNER = 'owner-user-0001';
// Local wall-clock time, so the expectations hold in any runner timezone.
const T = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();
const iso = (t) => new Date(t).toISOString();

class FakeLuno {
  constructor() { this.posts = []; this.n = 0; this.tokenExpiresAt = 0; }
  async claim() { return null; }
  async complete() {}
  async post(roomId, msg) { const id = `msg-${++this.n}`; this.posts.push({ id, roomId, ...msg }); return id; }
  async tokenInfo() { return { bot_id: 'bot-1', expires_at: this.tokenExpiresAt, rooms: ['room-pc'], ops: ['read'] }; }
}
function lab(rawOverrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pca-brief-'));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  const cfg = validateConfig({
    baseUrl: 'https://example.test/api/v1', ownerUserId: OWNER, museCommand: [process.execPath, FAKE_MUSE],
    worktreeRoot: join(dir, 'wt'),
    projects: [{ id: 'line', name: 'LUNO', roomIds: ['room-pc'], repoPath: repo }],
    ...rawOverrides,
  }, { tokens: { line: 'cf-bot-test' } });
  let nowMs = 0;
  const luno = new FakeLuno();
  const agent = new Agent({ cfg, secrets: { tokens: { line: 'cf-bot-test' } }, dir, clientFactory: () => luno, now: () => nowMs });
  return { dir, cfg, agent, luno, project: agent.project('line'), setNow: (t) => { nowMs = t; } };
}
function seed(agent, project, patch) {
  const t = agent.queue.create({ project, cmd: 'dev', text: 'x', roomId: 'room-pc', messageId: 'm' });
  Object.assign(t, patch);
  return t;
}

test('briefing: one morning message carries every section', async () => {
  const w = lab();
  const now = T(2026, 11, 19, 7, 30);
  w.setNow(now);
  seed(w.agent, w.project, { state: 'done', updatedAt: iso(now - 3600000) });
  seed(w.agent, w.project, { state: 'failed', updatedAt: iso(now - 2 * 3600000) });
  seed(w.agent, w.project, { state: 'done', updatedAt: iso(now - 30 * 3600000) });
  seed(w.agent, w.project, { state: 'reported', proposalMessageId: 'prop-9', updatedAt: iso(now - 1800000) });
  w.agent.autopilot.start({ projectId: 'line', roomId: 'room-pc', workOrder: 'docs/WO.md', maxCards: 20 });
  w.luno.tokenExpiresAt = now + 12 * 86400000;
  assert.equal(await w.agent.maybeBriefing(now), true);
  assert.equal(w.luno.posts.length, 1);
  assert.equal(w.luno.posts[0].roomId, 'room-pc');
  const body = w.luno.posts[0].body;
  assert.ok(body.includes('☀️ 아침 브리핑 (2026-11-19)'), body);
  assert.ok(body.includes('완료 1건 · 실패 1건'), body);
  assert.ok(body.includes('승인 대기: #T-0004'), body);
  assert.ok(body.includes('자동 진행 켜짐'), body);
  assert.ok(body.includes('주간 53%'), body);
  assert.ok(body.includes('LUNO 토큰 만료 D-12 (12/1)'), body);
  assert.equal(JSON.parse(readFileSync(join(w.dir, 'briefing.json'), 'utf8')).day, '2026-11-19');
});

test('briefing: only after the configured time, once per day', async () => {
  const w = lab();
  assert.equal(await w.agent.maybeBriefing(T(2026, 11, 19, 7, 0)), false);
  assert.equal(w.luno.posts.length, 0);
  assert.equal(await w.agent.maybeBriefing(T(2026, 11, 19, 7, 30)), true);
  assert.equal(await w.agent.maybeBriefing(T(2026, 11, 19, 12, 0)), false);
  assert.equal(await w.agent.maybeBriefing(T(2026, 11, 20, 7, 30)), true);
  assert.equal(w.luno.posts.length, 2);
});

test('remind: a proposal waiting over 6 hours gets exactly one nudge', async () => {
  const w = lab();
  const now = T(2026, 11, 19, 15, 0);
  seed(w.agent, w.project, { state: 'reported', proposalMessageId: 'prop-1', updatedAt: iso(now - 7 * 3600000) });
  seed(w.agent, w.project, { state: 'reported', proposalMessageId: 'prop-2', updatedAt: iso(now - 1800000) });
  assert.equal(await w.agent.maybeRemind(now), 1);
  assert.equal(w.luno.posts.length, 1);
  assert.ok(w.luno.posts[0].body.includes('#T-0001') && w.luno.posts[0].body.includes('7시간째'), w.luno.posts[0].body);
  assert.equal(w.luno.posts[0].replyTo, 'prop-1');
  assert.ok(w.agent.queue.get('T-0001').remindedAt);
  assert.equal(await w.agent.maybeRemind(now + 3600000), 0);
  assert.equal(w.luno.posts.length, 1);
});

test('quiet: the night window and wrapped ranges, progress pings pause', async () => {
  const w = lab();
  const q = (h, m) => w.agent.quietNow(T(2026, 11, 19, h, m));
  assert.equal(q(0, 59), false);
  assert.equal(q(1, 0), true);
  assert.equal(q(3, 0), true);
  assert.equal(q(6, 59), true);
  assert.equal(q(7, 0), false);
  assert.equal(q(12, 0), false);
  const night = lab({ briefing: { time: '07:30', quietStart: '22:00', quietEnd: '07:00', remindAfterHours: 6 } });
  assert.equal(night.agent.quietNow(T(2026, 11, 19, 23, 0)), true);
  assert.equal(night.agent.quietNow(T(2026, 11, 19, 6, 0)), true);
  assert.equal(night.agent.quietNow(T(2026, 11, 19, 12, 0)), false);
  const t = w.agent.queue.create({ project: w.project, cmd: 'dev', text: 'x', roomId: 'room-pc', messageId: 'm' });
  const start = T(2026, 11, 19, 2, 30) - 200000;
  w.agent.current = { task: t, startedAt: start, steps: 0 };
  w.setNow(T(2026, 11, 19, 12, 0));
  w.agent.watchProgress(w.project, t, start)({ steps: 5 });
  assert.equal(w.luno.posts.length, 1, 'daytime progress posts');
  w.agent.current = { task: t, startedAt: start, steps: 0 };
  w.setNow(T(2026, 11, 19, 2, 40));
  w.agent.watchProgress(w.project, t, start)({ steps: 9 });
  assert.equal(w.luno.posts.length, 1, 'night progress stays silent');
  assert.equal(w.agent.current.steps, 9, 'tracking continues');
});

test('quiet: check runs still report at night, minus the started ping', async () => {
  const w = lab();
  w.setNow(T(2026, 11, 19, 3, 0));
  const t = w.agent.queue.create({ project: w.project, cmd: 'check', text: '', roomId: 'room-pc', messageId: 'm' });
  await w.agent.runCheck(w.project, t, w.agent.now());
  assert.equal(w.luno.posts.length, 1, 'report only');
  assert.equal(w.luno.posts[0].kind, 'report');
  assert.ok(!w.luno.posts.some((p) => p.body.includes('▶️')));
  w.setNow(T(2026, 11, 19, 12, 0));
  const t2 = w.agent.queue.create({ project: w.project, cmd: 'check', text: '', roomId: 'room-pc', messageId: 'm2' });
  await w.agent.runCheck(w.project, t2, w.agent.now());
  assert.equal(w.luno.posts.length, 3, 'started plus report by day');
  assert.ok(w.luno.posts[1].body.includes('▶️'));
});

test('briefing config fails closed on bad times', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pca-brief-cfg-'));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  const base = {
    baseUrl: 'https://example.test/api/v1', ownerUserId: OWNER, museCommand: [process.execPath, FAKE_MUSE],
    worktreeRoot: join(dir, 'wt'),
    projects: [{ id: 'line', name: 'LUNO', roomIds: ['room-pc'], repoPath: repo }],
  };
  const secrets = { tokens: { line: 'cf-bot-test' } };
  assert.throws(() => validateConfig({ ...base, briefing: { time: '25:00' } }, secrets), /briefing/);
  assert.throws(() => validateConfig({ ...base, briefing: { quietStart: 'x' } }, secrets), /briefing/);
  assert.throws(() => validateConfig({ ...base, briefing: { remindAfterHours: 0 } }, secrets), /briefing/);
  assert.ok(!existsSync(join(dir, 'briefing.json')));
});
