import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Audit P1-3 (2026-11-22): production ALLOWED_ORIGINS must never list
// localhost. Local Vite cross-origin work uses `wrangler dev --env dev`.
async function loadConfigs() {
  const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const nobuild = await readFile(new URL('../wrangler.nobuild.jsonc', import.meta.url), 'utf8');
  return { wrangler, nobuild };
}

// Top-level vars ALLOWED_ORIGINS (the production value), not the env.dev one.
// The top-level key sits at 2-space indent; env.dev.vars is nested deeper.
function prodOrigins(text) {
  const at = text.indexOf('\n  "vars": {');
  assert.ok(at !== -1, 'top-level vars must exist');
  const varsBlock = text.slice(at);
  const m = /"ALLOWED_ORIGINS"\s*:\s*"([^"]*)"/.exec(varsBlock);
  assert.ok(m, 'top-level ALLOWED_ORIGINS must exist');
  return m[1];
}

function devOrigins(text) {
  const m = /"env"\s*:\s*\{[\s\S]*?"dev"\s*:\s*\{[\s\S]*?"ALLOWED_ORIGINS"\s*:\s*"([^"]*)"/.exec(text);
  assert.ok(m, 'env.dev ALLOWED_ORIGINS must exist');
  return m[1];
}

test('production ALLOWED_ORIGINS lists no localhost (both configs)', async () => {
  const { wrangler, nobuild } = await loadConfigs();
  for (const [label, text] of [['wrangler.jsonc', wrangler], ['wrangler.nobuild.jsonc', nobuild]]) {
    const origins = prodOrigins(text);
    assert.ok(!origins.includes('localhost'), `${label} prod origins must not include localhost: ${origins}`);
    assert.ok(origins.includes('https://lunotalk.com'), `${label} must keep lunotalk.com`);
    assert.ok(origins.includes('https://luno-messenger.dnjstjqppk.workers.dev'), `${label} must keep workers.dev`);
  }
});

test('env.dev keeps the localhost origins for local UI work', async () => {
  const { wrangler, nobuild } = await loadConfigs();
  for (const [label, text] of [['wrangler.jsonc', wrangler], ['wrangler.nobuild.jsonc', nobuild]]) {
    const origins = devOrigins(text);
    assert.ok(origins.includes('http://localhost:5173'), `${label} env.dev must keep :5173`);
    assert.ok(origins.includes('http://localhost:8080'), `${label} env.dev must keep :8080`);
  }
});

test('env blocks stay identical in both configs', async () => {
  const { wrangler, nobuild } = await loadConfigs();
  const envOf = (text) => {
    const start = text.indexOf('"env"');
    const end = text.indexOf('\n  "vars": {');
    assert.ok(start !== -1 && end !== -1 && start < end, 'env block must precede top-level vars');
    return text.slice(start, end).replace(/\s+/g, '');
  };
  assert.equal(envOf(nobuild), envOf(wrangler), 'env must be identical in both configs');
});
