// APK download surface on the LUNO URL (canonical design):
// /download (and family) 302-redirects to the static /download.html page,
// which links the per-ABI release assets; /api/v1/app/latest is the
// machine-readable twin for in-app update checks. All public, no auth.
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'https://localhost';
const TAG = 'v2.0.0-build8';
const GH = `https://github.com/dnjstjq0824-byte/line/releases/download/${TAG}`;

let isoCounter = 9600;
async function isolate() {
  const mod = await import(`./cf_worker.js?dl=${++isoCounter}`);
  const api = (path, init = {}) => mod.default.fetch(new Request(`${BASE}${path}`, {
    method: 'GET', ...init,
  }), {});
  return { api };
}

test('GET /download redirects to the static download page (canonical, no shadow)', async () => {
  const { api } = await isolate();
  const res = await api('/download', { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), `${BASE}/download.html`);
});

test('GET /download family (/download/, /app, /mobile, /apk) shares the redirect', async () => {
  const { api } = await isolate();
  for (const p of ['/download/', '/app', '/mobile', '/apk']) {
    const res = await api(p, { redirect: 'manual' });
    assert.equal(res.status, 302, p);
    assert.equal(res.headers.get('location'), `${BASE}/download.html`, p);
  }
});

test('GET /api/v1/app/latest reports the per-ABI Build 8 assets', async () => {
  const { api } = await isolate();
  const res = await api('/api/v1/app/latest');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.platform, 'android');
  assert.equal(body.version, '2.0.0');
  assert.equal(body.build, 8);
  assert.equal(body.package, 'com.bookingnetwork.messenger.global_messenger');
  assert.equal(body.assets.length, 3);
  const byAbi = Object.fromEntries(body.assets.map((a) => [a.abi, a]));
  assert.deepEqual(byAbi['arm64-v8a'], {
    abi: 'arm64-v8a', label: 'arm64', recommended: true, file: 'luno-messenger-arm64.apk',
    size_bytes: 29662696, sha256: 'D0388416AB02CBC8E1026778CA5428CAD7B97CA02881245ACB382778A8B4F186',
    url: `${GH}/luno-messenger-arm64.apk`,
  });
  assert.deepEqual(byAbi['armeabi-v7a'], {
    abi: 'armeabi-v7a', label: 'arm32', file: 'luno-messenger-arm32.apk',
    size_bytes: 25811032, sha256: '968C93A21E83E0F6EF7F2C939A816F03A495BA395A337348976914F094B99781',
    url: `${GH}/luno-messenger-arm32.apk`,
  });
  assert.deepEqual(byAbi['x86_64'], {
    abi: 'x86_64', label: 'x86_64', file: 'luno-messenger-x86_64.apk',
    size_bytes: 32234982, sha256: '7B248A637CC0D09B0EA37D0B7C5BC27C23EA5A1CAB7472D9DF9322F416CC1F28',
    url: `${GH}/luno-messenger-x86_64.apk`,
  });
});
