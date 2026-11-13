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
