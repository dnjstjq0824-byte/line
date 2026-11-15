import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCommand } from '../src/commands.mjs';
import { assertMuseArgs, matchesAny, mask, checkDiff } from '../src/guards.mjs';
import { splitBody, stripPaths, testDetail, reportBody } from '../src/report.mjs';
import { buildExecArgs, createEventReader, parseUsage } from '../src/muse.mjs';
import { TaskQueue } from '../src/queue.mjs';
import { validateConfig } from '../src/config.mjs';
import { branchName } from '../src/git.mjs';

test('commands: slash commands, Korean aliases, urgency and task ids', () => {
  assert.deepEqual(parseCommand('/dev fix the login button'), { cmd: 'dev', urgent: false, taskId: '', text: 'fix the login button' });
  assert.deepEqual(parseCommand('/dev! now'), { cmd: 'dev', urgent: true, taskId: '', text: 'now' });
  assert.equal(parseCommand('/status!').urgent, false, 'only dev/mkt can be urgent');
  assert.equal(parseCommand('/상태').cmd, 'status');
  assert.equal(parseCommand('/이어서 F26부터').cmd, 'continue');
  assert.deepEqual(parseCommand('/retry t-0007 make it blue'), { cmd: 'retry', urgent: false, taskId: 'T-0007', text: 'make it blue' });
  assert.deepEqual(parseCommand('/cancel SHOP-0003'), { cmd: 'cancel', urgent: false, taskId: 'SHOP-0003', text: '' });
  assert.equal(parseCommand('/log').taskId, '');
  assert.deepEqual(parseCommand('/nope x'), { cmd: 'unknown', name: 'nope' });
  assert.equal(parseCommand('hello /dev'), null);
  assert.equal(parseCommand(''), null);
  assert.equal(parseCommand('/dev line one\nline two').text, 'line one\nline two');
});

test('guards: forbidden muse flags refuse to run', () => {
  for (const flag of ['--yolo', '--disable-sandbox', '--disable-approval', '--allow-workspace-switch', '--trust-workspace']) {
    assert.throws(() => assertMuseArgs(['exec', flag]), /forbidden muse flag/);
  }
  const args = buildExecArgs({ cfg: { model: 'muse-spark-1.3', maxModelSteps: 150 }, mode: 'ask', promptFile: 'p.md', workspace: 'w', sessionId: 's' });
  assert.ok(args.includes('--disable-write') && args.includes('--disable-shell'), 'ask is read-only');
  assert.deepEqual(args.slice(args.indexOf('--approval-mode'), args.indexOf('--approval-mode') + 2), ['--approval-mode', 'never']);
  assert.ok(args.includes('--prompt-file'), 'the prompt travels in a file');
  const dev = buildExecArgs({ cfg: { model: 'm' }, mode: 'dev', promptFile: 'p.md', workspace: 'w', sessionId: 's' });
  assert.ok(!dev.includes('--disable-write'));
});

test('guards: path globs', () => {
  const forbidden = ['wrangler.jsonc', '.github/**', '**/*.jks', '**/key.properties', '.env*', 'scripts/migrations/**'];
  assert.ok(matchesAny('wrangler.jsonc', forbidden));
  assert.ok(matchesAny('.github/workflows/ci.yml', forbidden));
  assert.ok(matchesAny('mobile/flutter_app/android/app/release.jks', forbidden));
  assert.ok(matchesAny('mobile\\flutter_app\\android\\key.properties', forbidden), 'backslashes normalised');
  assert.ok(matchesAny('.env.local', forbidden));
  assert.ok(matchesAny('scripts/migrations/x.sql', forbidden));
  assert.ok(!matchesAny('scripts/cf_worker.js', forbidden));
  assert.ok(!matchesAny('docs/wrangler.jsonc.md', forbidden));
  assert.ok(matchesAny('marketing/drafts/a.md', ['marketing/**']));
  assert.ok(!matchesAny('apps/marketing/a.md', ['marketing/**']));
});

test('guards: masking and diff checks', () => {
  const masked = mask('token cf-bot-12345678-aaaa password: hunter2 Authorization: Bearer abc.def api_key=XYZ');
  assert.ok(!/cf-bot-1234|hunter2|abc\.def|XYZ/.test(masked), masked);
  const clean = checkDiff({ files: [{ path: 'src/a.js', added: 10, deleted: 2 }], forbiddenPaths: ['wrangler.jsonc'] });
  assert.deepEqual([clean.violations, clean.large, clean.added, clean.deleted], [[], false, 10, 2]);
  assert.equal(checkDiff({ files: [{ path: 'wrangler.jsonc', added: 1, deleted: 0 }], forbiddenPaths: ['wrangler.jsonc'] }).violations.length, 1);
  assert.equal(checkDiff({ files: [{ path: 'src/a.js', added: 1, deleted: 0 }], allowedPaths: ['marketing/**'] }).violations.length, 1);
  assert.equal(checkDiff({ files: [{ path: 'a.bin', added: 0, deleted: 0, binary: true }] }).violations.length, 1);
  assert.equal(checkDiff({ files: [{ path: 'a.png', added: 0, deleted: 0, binary: true }] }).violations.length, 0);
  assert.equal(checkDiff({ files: [{ path: 'a.js', added: 1, deleted: 0 }], addedText: '+const t = "cf-bot-aaaaaaaa-bbbb"' }).violations.length, 1);
  assert.equal(checkDiff({ files: [{ path: 'a.js', added: 3001, deleted: 0 }] }).large, true);
});

test('report: long bodies split on line boundaries within the limit', () => {
  const body = Array.from({ length: 400 }, (_, i) => `line ${i} ${'x'.repeat(40)}`).join('\n');
  const parts = splitBody(body, 2000);
  assert.ok(parts.length > 5);
  assert.ok(parts.every((p) => p.length <= 2000));
  assert.equal(parts.join('\n'), body);
  assert.deepEqual(splitBody('x'.repeat(4500), 2000).map((p) => p.length), [2000, 2000, 500]);
  assert.equal(testDetail('ℹ pass 12\nℹ fail 0'), '12 통과 / 0 실패');
  assert.equal(testDetail('# pass 3\n# fail 1'), '3 통과 / 1 실패');
  // Reports carry repo-relative paths, never the PC's folder layout.
  const roots = ['C:\\luno-wt\\T-0002', 'C:\\Users\\me\\project\\line'];
  assert.equal(
    stripPaths('see [README.md](/C:/luno-wt/T-0002/README.md:1) and C:\\luno-wt\\T-0002\\src\\a.js', roots),
    'see [README.md](README.md:1) and src\\a.js',
  );
  assert.equal(stripPaths('c:/users/me/project/line/scripts/x.js', roots), 'scripts/x.js', 'case-insensitive');
  assert.equal(stripPaths('nothing here', [undefined, '']), 'nothing here');
  assert.equal(testDetail('No issues found! (ran in 3s)'), '문제 없음');
  const report = reportBody({ task: { id: 'T-0001', cmd: 'dev', text: 't', branch: 'b' }, ok: true, ms: 120000, summary: 'key: cf-bot-12345678-zzzz', tests: [{ label: 'node --test', ok: true, detail: '3 통과 / 0 실패' }] });
  assert.ok(report.includes('#T-0001') && report.includes('✅') && !report.includes('cf-bot-1234'));
});

test('muse: event reader keeps the final text and counts steps; usage parses', () => {
  const r = createEventReader();
  r.push('muse: workspace root: C:\\x');
  r.push('{"payload_type":"task.lifecycle.started","payload":{}}');
  r.push('{"payload_type":"task.lifecycle.started","payload":{}}');
  r.push('{"payload_type":"run.output.delta","payload":{"text":"par"}}');
  r.push('{"payload_type":"run.output.delta","payload":{"text":"tial"}}');
  r.push('{broken json');
  r.push('{"payload_type":"something.new","payload":{"x":1}}');
  assert.deepEqual([r.state.steps, r.state.text, r.state.terminal], [2, 'partial', '']);
  r.push('{"payload_type":"run.terminal.completed","payload":{"terminal":"completed","text":"final answer","reason":null}}');
  assert.deepEqual([r.state.terminal, r.state.finalText], ['completed', 'final answer']);
  assert.deepEqual(parseUsage('Tier: X\nWindow: 7% used, resets in 2h 11m\nWeekly: 53% used, resets in 12h'), { weekly: 53, window: 7 });
  assert.equal(parseUsage('not logged in'), null);
});

test('queue: atomic files, numbering, urgency, project rotation, reboot recovery, dedup', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pca-q-'));
  const line = { id: 'line', prefix: 'T' };
  const shop = { id: 'shop', prefix: 'SHOP' };
  const q = new TaskQueue(dir);
  const a = q.create({ project: line, cmd: 'dev', text: 'a', roomId: 'r', messageId: 'm1' });
  const b = q.create({ project: line, cmd: 'dev', text: 'b', roomId: 'r', messageId: 'm2' });
  const c = q.create({ project: shop, cmd: 'dev', text: 'c', roomId: 'r', messageId: 'm3' });
  assert.deepEqual([a.id, b.id, c.id], ['T-0001', 'T-0002', 'SHOP-0001']);
  assert.equal(q.next('').id, 'T-0001');
  assert.equal(q.next('line').id, 'SHOP-0001', 'another project goes next');
  const u = q.create({ project: line, cmd: 'dev', text: 'urgent', urgent: true, roomId: 'r', messageId: 'm4' });
  assert.equal(q.next('line').id, u.id, 'urgent jumps the queue');
  a.state = 'running';
  q.save(a);
  assert.ok(!existsSync(join(dir, 'tasks', `T-0001.json.${process.pid}.tmp`)), 'no temp file left behind');
  q.markSeen('m1');
  // A second runner process (after a crash) sees the same state from disk.
  const again = new TaskQueue(dir);
  assert.ok(again.seen('m1') && !again.seen('nope'));
  const interrupted = again.recover();
  assert.deepEqual(interrupted.map((t) => t.id), ['T-0001']);
  assert.equal(again.get('T-0001').state, 'failed');
  assert.equal(again.create({ project: line, cmd: 'ask', text: 'q', roomId: 'r', messageId: 'm5' }).id, 'T-0004', 'counter survives restart');
  assert.ok(readFileSync(join(dir, 'TASK_QUEUE.md'), 'utf8').includes('T-0004'));
  // A torn task file is skipped instead of crashing the runner.
  writeFileSync(join(dir, 'tasks', 'T-9999.json'), '{"id":"T-99');
  assert.equal(new TaskQueue(dir).get('T-9999'), null);
});

test('config: fails closed', () => {
  const repo = mkdtempSync(join(tmpdir(), 'pca-c-'));
  mkdirSync(join(repo, '.git'));
  const base = {
    baseUrl: 'https://example.test/api/v1', ownerUserId: 'user-12345678', museCommand: ['node', 'x'], worktreeRoot: join(tmpdir(), 'pca-wt'),
    projects: [{ id: 'line', roomIds: ['room-1'], repoPath: repo }],
  };
  const secrets = { tokens: { line: 'cf-bot-abc' } };
  const ok = validateConfig(base, secrets);
  assert.equal(ok.projects[0].prefix, 'T');
  assert.equal(ok.projects[0].allowPush, false);
  assert.throws(() => validateConfig({ ...base, baseUrl: 'http://evil.test/api/v1' }, secrets), /baseUrl/);
  assert.throws(() => validateConfig({ ...base, ownerUserId: '' }, secrets), /ownerUserId/);
  assert.throws(() => validateConfig(base, { tokens: {} }), /bot token/);
  assert.throws(() => validateConfig({ ...base, projects: [{ ...base.projects[0], roomIds: [] }] }, secrets), /roomIds/);
  assert.throws(() => validateConfig({ ...base, projects: [{ ...base.projects[0], repoPath: join(repo, 'missing') }] }, secrets), /git repository/);
  assert.throws(() => validateConfig({ ...base, worktreeRoot: join(repo, 'wt') }, secrets), /outside the repository/);
  assert.equal(branchName({ id: 'T-0007', cmd: 'dev' }, new Date('2026-11-15T03:00:00Z')), 'luno-auto/task-20261115-t-0007');
  assert.equal(branchName({ id: 'T-0008', cmd: 'mkt' }, new Date('2026-11-15T03:00:00Z')), 'luno-auto/mkt-20261115-t-0008');
});
