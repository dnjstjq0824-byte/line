// APK download surface on the LUNO URL:
// /download streams the recommended APK itself (attachment headers, never
// cached); /app, /mobile and /apk 302 to the static /download.html page,
// which links the per-ABI release assets; /api/v1/app/latest is the
// machine-readable twin for in-app update checks. All public, no auth.
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'https://localhost';
const TAG = 'v2.0.0-build20';
const GH = `https://github.com/dnjstjq0824-byte/line/releases/download/${TAG}`;

let isoCounter = 9600;
async function isolate() {
  const mod = await import(`./cf_worker.js?dl=${++isoCounter}`);
  const api = (path, init = {}) => mod.default.fetch(new Request(`${BASE}${path}`, {
    method: 'GET', ...init,
  }), {});
  return { api };
}

// The release asset lives on GitHub; tests stand in for that fetch.
async function withUpstream(handler, run) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (target, init = {}) => { calls.push({ url: String(target), init }); return handler(String(target), init); };
  try { return await run(calls); } finally { globalThis.fetch = real; }
}

test('GET /download streams the recommended APK with attachment headers', async () => {
  const { api } = await isolate();
  const bytes = new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4]);
  await withUpstream(async () => new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length), 'content-type': 'application/octet-stream' } }), async (calls) => {
    for (const p of ['/download', '/download/']) {
      const res = await api(p, { redirect: 'manual' });
      assert.equal(res.status, 200, p);
      assert.equal(res.headers.get('content-type'), 'application/vnd.android.package-archive');
      assert.equal(res.headers.get('content-disposition'), 'attachment; filename="luno-messenger.apk"');
      assert.equal(res.headers.get('cache-control'), 'no-store, no-cache, must-revalidate');
      assert.equal(res.headers.get('content-length'), String(bytes.length));
      assert.deepEqual(new Uint8Array(await res.arrayBuffer()), bytes);
    }
    assert.ok(calls.every((c) => c.url === `${GH}/luno-messenger-arm64.apk`), 'always the recommended (arm64) asset');
  });
});

test('HEAD /download answers with the size and no body; Range passes through', async () => {
  const { api } = await isolate();
  await withUpstream(async (target, init) => {
    if (init.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': '44084350' } });
    return new Response(new Uint8Array(4), { status: 206, headers: { 'content-length': '4', 'content-range': 'bytes 0-3/44084350' } });
  }, async (calls) => {
    const head = await api('/download', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), '44084350');
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    const part = await api('/download', { headers: { Range: 'bytes=0-3' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get('content-range'), 'bytes 0-3/44084350');
    assert.equal(calls.at(-1).init.headers.Range, 'bytes=0-3');
    assert.equal((await api('/download', { method: 'POST' })).status, 405);
  });
});

test('GET /download falls back to the download page when the asset is unreachable', async () => {
  const { api } = await isolate();
  await withUpstream(async () => new Response('gone', { status: 404 }), async () => {
    const res = await api('/download', { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), `${BASE}/download.html`);
  });
  await withUpstream(async () => { throw new Error('network down'); }, async () => {
    const res = await api('/download', { redirect: 'manual' });
    assert.equal(res.status, 302);
  });
});

test('with the assets binding the landing page is served in place, never looped', async () => {
  const mod = await import(`./cf_worker.js?dl=${++isoCounter}`);
  const asked = [];
  const env = { ASSETS: { fetch: async (req) => { asked.push(new URL(req.url).pathname); return new Response('<html>page</html>', { status: 200, headers: { 'content-type': 'text/html' } }); } } };
  const call = (path) => mod.default.fetch(new Request(`${BASE}${path}`, { redirect: 'manual' }), env);
  for (const p of ['/download.html', '/app', '/mobile', '/apk']) {
    const res = await call(p);
    assert.equal(res.status, 200, p);
    assert.equal(await res.text(), '<html>page</html>', p);
  }
  // The APK route falls back to the same page when the release asset is down.
  await withUpstream(async () => new Response('gone', { status: 404 }), async () => {
    const res = await call('/download');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html');
  });
  assert.ok(asked.every((p) => p === '/download'), 'the page is always read as the /download asset');
  const wrangler = await (await import('node:fs/promises')).readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(wrangler, /"run_worker_first"\s*:\s*\[\s*"\/download"/, 'the worker must run before the asset layer for /download');
  // With a list, unlisted paths never reach the worker (the asset layer
  // answers them, 405 for a POST): the API and the probes must stay on it.
  const listed = JSON.parse(/"run_worker_first"\s*:\s*(\[[^\]]*\])/.exec(wrangler)[1]);
  for (const route of ['/api/*', '/healthz', '/readyz', '/metrics', '/.well-known/*', '/download.html']) {
    assert.ok(listed.includes(route), `${route} must be in run_worker_first`);
  }
});

test('wrangler.nobuild.jsonc stays in sync with wrangler.jsonc (deploy-from-main)', async () => {
  const { readFile } = await import('node:fs/promises');
  const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const nobuild = await readFile(new URL('../wrangler.nobuild.jsonc', import.meta.url), 'utf8');
  // The nobuild config ships the already-stamped dist_* without rebuilding.
  assert.ok(!/"build"\s*:\s*\{/.test(nobuild), 'wrangler.nobuild.jsonc must not have a build block');
  assert.ok(/"build"\s*:\s*\{/.test(wrangler), 'wrangler.jsonc must keep its build block');
  // Everything else that selects the worker, routes and bindings must match,
  // or a deploy from main silently diverges from local wrangler dev.
  const listed = JSON.parse(/"run_worker_first"\s*:\s*(\[[^\]]*\])/.exec(wrangler)[1]);
  const listedNoBuild = JSON.parse(/"run_worker_first"\s*:\s*(\[[^\]]*\])/.exec(nobuild)[1]);
  assert.deepEqual(listedNoBuild, listed, 'run_worker_first must be identical in both configs');
  for (const [pattern, label] of [
    [/"main"\s*:\s*"([^"]+)"/, 'main'],
    [/"workers_dev"\s*:\s*(true|false)/, 'workers_dev'],
    [/"database_id"\s*:\s*"([^"]+)"/, 'database_id'],
    [/"triggers"\s*:\s*(\{[^}]*\})/, 'triggers'],
  ]) {
    const a = pattern.exec(wrangler);
    const b = pattern.exec(nobuild);
    assert.ok(a && b, `${label} must exist in both configs`);
    assert.equal(b[1], a[1], `${label} must be identical in both configs`);
  }
  // 6-8: vars (feature flags like DURABLE_BUSINESS) must match too, or a
  // deploy silently runs different behavior than local wrangler dev.
  const varsOf = (text) => text.slice(text.indexOf('"vars"')).replace(/\s+/g, '');
  assert.equal(varsOf(nobuild), varsOf(wrangler), 'vars must be identical in both configs');
});

test('GET /app, /mobile and /apk redirect to the static download page', async () => {
  const { api } = await isolate();
  for (const p of ['/app', '/mobile', '/apk']) {
    const res = await api(p, { redirect: 'manual' });
    assert.equal(res.status, 302, p);
    assert.equal(res.headers.get('location'), `${BASE}/download.html`, p);
  }
});

test('GET /api/v1/app/latest reports the per-ABI Build 20 assets', async () => {
  const { api } = await isolate();
  const res = await api('/api/v1/app/latest');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.platform, 'android');
  assert.equal(body.version, '2.0.0');
  assert.equal(body.build, 20);
  assert.equal(body.package, 'com.bookingnetwork.messenger.global_messenger');
  assert.equal(body.assets.length, 3);
  const byAbi = Object.fromEntries(body.assets.map((a) => [a.abi, a]));
  assert.deepEqual(byAbi['arm64-v8a'], {
    abi: 'arm64-v8a', label: 'arm64', recommended: true, file: 'luno-messenger-arm64.apk',
    size_bytes: 44084350, sha256: 'FF5B092CCBAFB6FFE41F90C3E2E27BD0EDF61CB7BDD4DB1062B3622E1FEF960E',
    url: `${GH}/luno-messenger-arm64.apk`,
  });
  assert.deepEqual(byAbi['armeabi-v7a'], {
    abi: 'armeabi-v7a', label: 'arm32', file: 'luno-messenger-arm32.apk',
    size_bytes: 35088114, sha256: '0C55F3EFDEC71A578ACF1A862F03CF339A737881CC44BB71DCDE4CECC215EB12',
    url: `${GH}/luno-messenger-arm32.apk`,
  });
  assert.deepEqual(byAbi['x86_64'], {
    abi: 'x86_64', label: 'x86_64', file: 'luno-messenger-x86_64.apk',
    size_bytes: 50539638, sha256: 'D4346F0DA4474A25F6560572AAEC56E77D1031DBE06912E4EDD0BF2E71E347DE',
    url: `${GH}/luno-messenger-x86_64.apk`,
  });
});
