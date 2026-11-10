// APK download from the LUNO URL: landing page, redirect, and latest-build API.
// All three are public (no auth) by design.
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'https://localhost';
const APK = 'https://github.com/dnjstjq0824-byte/line/releases/download/v2.0.0-build5/luno-v2.0.0-build5.apk';

let isoCounter = 9500;
async function isolate() {
  const mod = await import(`./cf_worker.js?dl=${++isoCounter}`);
  const api = (path, init = {}) => mod.default.fetch(new Request(`${BASE}${path}`, {
    method: 'GET', ...init,
  }), {});
  return { api };
}

test('GET /download serves a script-free landing page with version and button', async () => {
  const { api } = await isolate();
  const res = await api('/download');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/html/);
  const html = await res.text();
  assert.match(html, /2\.0\.0/);
  assert.match(html, /build 5/);
  assert.match(html, /href="\/download\/apk"/);
  assert.doesNotMatch(html, /<script/i);
});

test('GET /download/apk redirects to the release asset without caching', async () => {
  const { api } = await isolate();
  const res = await api('/download/apk', { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), APK);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('GET /api/v1/app/latest reports the build for update checks', async () => {
  const { api } = await isolate();
  const res = await api('/api/v1/app/latest');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    platform: 'android', version: '2.0.0', build: 5, size_bytes: 63283179, url: APK,
  });
});
