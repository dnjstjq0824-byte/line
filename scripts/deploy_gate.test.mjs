import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// B1: every npm path that reaches `wrangler deploy` must run the node suite,
// the pre-deploy gate, and the build first (transitively through `npm run`).
test('B1: all wrangler-deploy scripts are gated on tests + pre gate + build', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const expand = (cmd, seen = new Set()) =>
    cmd.replace(/npm run ([A-Za-z0-9:_-]+)/g, (m, name) => {
      // Unknown names are workspace delegations (`npm run dev -w ...`) or
      // typos that fail closed at runtime; only root scripts expand here.
      if (!pkg.scripts[name] || seen.has(name)) return m;
      return expand(pkg.scripts[name], new Set([...seen, name]));
    });
  const deployers = Object.entries(pkg.scripts).filter(([, cmd]) => expand(cmd).includes('wrangler deploy'));
  assert.ok(deployers.length > 0, 'at least one deploy path exists');
  for (const [name, cmd] of deployers) {
    const full = expand(cmd);
    const at = full.indexOf('wrangler deploy');
    const testAt = full.indexOf('node --test');
    const gateAt = full.indexOf('pre_deploy_gate.mjs');
    const buildAt = full.indexOf('build_cf.js');
    assert.ok(testAt !== -1 && testAt < at, `${name} runs the node suite before wrangler`);
    assert.ok(gateAt !== -1 && gateAt < at, `${name} runs the pre gate before wrangler`);
    assert.ok(buildAt !== -1 && buildAt < at, `${name} rebuilds before wrangler`);
  }
  assert.ok((pkg.scripts.postdeploy || '').includes('post_deploy_gate.mjs'), 'postdeploy verifies the live surface');
});

test('B1: no watcher or helper script deploys behind the npm scripts', () => {
  // scripts/*.test.mjs excluded: tests necessarily name the gated commands.
  const offenders = [];
  const dir = fileURLToPath(new URL('./', import.meta.url));
  for (const e of readdirSync(dir)) {
    if ((!e.endsWith('.js') && !e.endsWith('.mjs')) || e.endsWith('.test.mjs')) continue;
    if (/wrangler['",\s]+deploy/.test(readFileSync(join(dir, e), 'utf8'))) offenders.push(e);
  }
  assert.deepEqual(offenders, [], 'raw wrangler-deploy invocations must not exist outside gated npm scripts');
});

// The live gate's api checks, run against the worker with an asset layer
// that serves the SPA: an /api/ miss must never come back as the page.
test('B1: unknown api paths are json errors, never the spa', async () => {
  const { makeD1 } = await import('./test_helpers.mjs');
  const mod = await import('./cf_worker.js?gate-404');
  const env = {
    DB: makeD1(),
    DURABLE_CONVERSATIONS: 'true',
    ASSETS: { fetch: async () => new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } }) },
  };
  const get = async (path) => {
    const res = await mod.default.fetch(new Request('https://localhost' + path), env);
    return { status: res.status, type: res.headers.get('content-type') || '', body: await res.json().catch(() => null) };
  };
  for (const path of ['/api/definitely-not-a-route', '/api/v2/x', '/api']) {
    const r = await get(path);
    assert.equal(r.status, 404, path);
    assert.match(r.type, /application\/json/, path);
    assert.equal(r.body?.error, 'not_found', path);
  }
  const v1 = await get('/api/v1/definitely-not-a-route');
  assert.equal(v1.status, 401);
  assert.equal(v1.body?.error, 'unauthorized');
});
