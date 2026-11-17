#!/usr/bin/env node
// post_deploy_gate.mjs — runs AFTER a deploy, against the live base URL.
// Usage: node scripts/post_deploy_gate.mjs [BASE_URL]
// Never deploys; only verifies.
const base = (process.argv[2] || process.env.DEPLOY_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
}
async function get(path, headers = {}) {
  const res = await fetch(base + path, { headers });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html body */ }
  return { status: res.status, json, text };
}

console.log(`=== LUNO V3 post-deploy gate @ ${base} ===`);
await check('healthz reports ok', async () => {
  const r = await get('/healthz');
  if (r.status !== 200 || r.json?.status !== 'ok') throw new Error(`status=${r.status}`);
});
await check('readyz reports ready', async () => {
  const r = await get('/readyz');
  if (r.status !== 200) throw new Error(`status=${r.status}`);
});
await check('version exposes commit metadata', async () => {
  const r = await get('/api/v1/version');
  if (r.status !== 200 || !r.json?.commit) throw new Error(`status=${r.status}`);
});
await check('authed route rejects anonymous callers', async () => {
  const r = await get('/api/v1/me');
  if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`);
});
// /api/v1 checks auth before route lookup, so an anonymous miss is a JSON
// 401 (anonymous callers cannot map which routes exist); signed-in misses
// are 404s (f22_monitor.test.mjs). Either way it must never be the SPA page.
await check('unknown v1 api path is a json error, not the spa', async () => {
  const r = await get('/api/v1/definitely-not-a-route');
  if (r.status !== 401 || r.json?.error !== 'unauthorized') throw new Error(`status=${r.status}`);
});
await check('unknown api path 404s as json', async () => {
  const r = await get('/api/definitely-not-a-route');
  if (r.status !== 404 || !r.json?.error) throw new Error(`status=${r.status}`);
});

console.log(failures.length ? `\nGATE RED (${failures.length})` : '\nGATE GREEN — live surface verified');
process.exit(failures.length ? 1 : 0);
