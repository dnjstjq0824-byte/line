// S9: add-project provisions bot, room, allowlist, token and config entry in
// one command. The real CLI runs in a child process against a fake server;
// no real Secrets leave the state folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const PROVISION = join(dirname(fileURLToPath(import.meta.url)), '..', 'setup', 'provision.mjs');

function redact(body) {
  if (!body || typeof body !== 'object') return body;
  const out = { ...body };
  for (const k of ['password', 'token']) if (k in out) out[k] = '***';
  return out;
}
async function fakeServer(handler) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      calls.push({ method: req.method, path: req.url, body: redact(body) });
      const [status, json] = handler(req.method, req.url, body);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return { calls, base: `http://127.0.0.1:${port}/api/v1`, close: () => server.close() };
}
function shopHandler() {
  return (method, url, body) => {
    if (method === 'POST' && url === '/api/v1/auth/login') return [200, { access_token: 'owner-token', role: 'admin' }];
    if (method === 'POST' && url === '/api/v1/admin/bots') return [201, { id: 'bot-shop', handle: body && body.handle }];
    if (method === 'POST' && url === '/api/v1/conversations') return [201, { id: 'room-shop' }];
    if (method === 'POST' && url === '/api/v1/admin/llm/allowlist') return [201, { status: 'added' }];
    if (method === 'POST' && url === '/api/v1/admin/bots/bot-shop/tokens') {
      return [201, { id: 'tok-1', token: 'cf-bot-fake-shop', expires_at: 9999999999999 }];
    }
    return [404, { error: 'not found' }];
  };
}
function lab() {
  const dir = mkdtempSync(join(tmpdir(), 'pca-prov-'));
  const repo = join(dir, 'shop-repo');
  mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  writeFileSync(join(dir, 'owner-login.json'), JSON.stringify({ email: 'ceo@x.test', password: 'pw', userId: 'owner-1' }));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({
    baseUrl: 'http://127.0.0.1:9/api/v1', ownerUserId: 'owner-1',
    projects: [{ id: 'line', name: 'LUNO', prefix: 'T', roomIds: ['room-line'], repoPath: join(dir, 'line-repo') }],
  }));
  writeFileSync(join(dir, 'provision-state.json'), JSON.stringify({ botId: 'bot-line', roomId: 'room-line' }));
  return { dir, repo };
}
const execFileAsync = promisify(execFile);
// Async spawn: the fake server answers on this loop while the child runs.
async function runProvision(home, args) {
  try {
    const { stdout } = await execFileAsync(process.execPath, [PROVISION, ...args], {
      encoding: 'utf8', timeout: 60000,
      env: { ...process.env, LUNO_AGENT_HOME: home },
    });
    return { code: 0, out: stdout };
  } catch (error) {
    return { code: typeof error.code === 'number' ? error.code : 1, out: String((error.stdout || '') + (error.stderr || '')) };
  }
}

test('provision: add-project wires bot, room, allowlist, token and config', async () => {
  const w = lab();
  const srv = await fakeServer(shopHandler());
  try {
    const r = await runProvision(w.dir, ['add-project', '--id', 'shop', '--name', '쇼핑몰', '--repo', w.repo, '--base', srv.base]);
    assert.equal(r.code, 0, r.out);
    const paths = srv.calls.map((c) => `${c.method} ${c.path}`);
    assert.deepEqual(paths, [
      'POST /api/v1/auth/login',
      'POST /api/v1/admin/bots',
      'POST /api/v1/conversations',
      'POST /api/v1/admin/llm/allowlist',
      'POST /api/v1/admin/bots/bot-shop/tokens',
    ]);
    assert.equal(srv.calls[1].body.handle, 'luno_shop');
    assert.equal(srv.calls[1].body.display_name, '쇼핑몰 작업봇');
    assert.deepEqual(srv.calls[2].body.member_ids, ['bot-shop']);
    assert.deepEqual(srv.calls[3].body, { kind: 'room', ref_id: 'room-shop' });
    assert.deepEqual(srv.calls[4].body, { rooms: ['room-shop'], ops: ['read', 'post', 'propose'], ttl_sec: 2592000 });
    const config = JSON.parse(readFileSync(join(w.dir, 'config.json'), 'utf8'));
    assert.deepEqual(config.projects.find((p) => p.id === 'shop'),
      { id: 'shop', name: '쇼핑몰', prefix: 'SHOP', roomIds: ['room-shop'], repoPath: w.repo, mainBranch: 'main' });
    assert.equal(config.projects.find((p) => p.id === 'line').roomIds[0], 'room-line', 'existing project untouched');
    const secrets = JSON.parse(readFileSync(join(w.dir, 'secrets.json'), 'utf8'));
    assert.equal(secrets.tokens.shop, 'cf-bot-fake-shop');
    assert.equal(secrets.expires.shop, 9999999999999);
    assert.equal(secrets.tokenIds.shop, 'tok-1');
    const state = JSON.parse(readFileSync(join(w.dir, 'provision-state.json'), 'utf8'));
    assert.deepEqual(state.projects.shop, { botId: 'bot-shop', roomId: 'room-shop', name: '쇼핑몰', repo: w.repo });
    assert.ok(!r.out.includes('cf-bot-fake-shop'), 'token never printed');
  } finally { srv.close(); }
});

test('provision: add-project resumes after a partial run', async () => {
  const w = lab();
  writeFileSync(join(w.dir, 'provision-state.json'),
    JSON.stringify({ botId: 'bot-line', roomId: 'room-line', projects: { shop: { botId: 'bot-shop' } } }));
  const srv = await fakeServer(shopHandler());
  try {
    const r = await runProvision(w.dir, ['add-project', '--id', 'shop', '--name', '쇼핑몰', '--repo', w.repo, '--base', srv.base]);
    assert.equal(r.code, 0, r.out);
    const paths = srv.calls.map((c) => `${c.method} ${c.path}`);
    assert.ok(!paths.includes('POST /api/v1/admin/bots'), 'issued bot reused');
    assert.ok(paths.includes('POST /api/v1/conversations'), 'missing room created');
    const config = JSON.parse(readFileSync(join(w.dir, 'config.json'), 'utf8'));
    assert.equal(config.projects.find((p) => p.id === 'shop').roomIds[0], 'room-shop');
  } finally { srv.close(); }
});

test('provision: add-project fails fast without touching the server', async () => {
  const w = lab();
  const srv = await fakeServer(shopHandler());
  try {
    const badRepo = join(w.dir, 'nope');
    mkdirSync(badRepo);
    const r1 = await runProvision(w.dir, ['add-project', '--id', 'shop', '--name', '쇼핑몰', '--repo', badRepo, '--base', srv.base]);
    assert.equal(r1.code, 1);
    assert.equal(srv.calls.length, 0, 'bad repo stops before any call');
    const r2 = await runProvision(w.dir, ['add-project', '--id', 'line', '--name', 'LUNO', '--repo', w.repo, '--base', srv.base]);
    assert.equal(r2.code, 1, 'duplicate id refused');
    const r3 = await runProvision(w.dir, ['add-project', '--id', 'Shop', '--name', 'x', '--repo', w.repo, '--base', srv.base]);
    assert.equal(r3.code, 1, 'id must be lowercase');
    const r4 = await runProvision(w.dir, ['add-project', '--id', 'shop2', '--name', 'x', '--base', srv.base]);
    assert.equal(r4.code, 1, 'missing repo refused');
    assert.ok(!existsSync(join(w.dir, 'secrets.json')), 'no secrets written on failure');
  } finally { srv.close(); }
});
