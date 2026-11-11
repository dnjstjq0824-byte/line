// APK download surface on the LUNO URL (canonical design):
// /download (and family) 302-redirects to the static /download.html page,
// which links the per-ABI release assets; /api/v1/app/latest is the
// machine-readable twin for in-app update checks. All public, no auth.
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'https://localhost';
const TAG = 'v2.0.0-build7';
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

test('GET /api/v1/app/latest reports the per-ABI Build 7 assets', async () => {
  const { api } = await isolate();
  const res = await api('/api/v1/app/latest');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.platform, 'android');
  assert.equal(body.version, '2.0.0');
  assert.equal(body.build, 7);
  assert.equal(body.package, 'com.bookingnetwork.messenger.global_messenger');
  assert.equal(body.assets.length, 3);
  const byAbi = Object.fromEntries(body.assets.map((a) => [a.abi, a]));
  assert.deepEqual(byAbi['arm64-v8a'], {
    abi: 'arm64-v8a', label: 'arm64', recommended: true, file: 'luno-messenger-arm64.apk',
    size_bytes: 22880124, sha256: '075FB1F3A5B71C04447DF25B74D47F0A0BB764422030A4776CA740BBAD87E330',
    url: `${GH}/luno-messenger-arm64.apk`,
  });
  assert.deepEqual(byAbi['armeabi-v7a'], {
    abi: 'armeabi-v7a', label: 'arm32', file: 'luno-messenger-arm32.apk',
    size_bytes: 20748778, sha256: '2D56035F66586142647ACF0DD7103296585F4C41528F83209B380F6E54359437',
    url: `${GH}/luno-messenger-arm32.apk`,
  });
  assert.deepEqual(byAbi['x86_64'], {
    abi: 'x86_64', label: 'x86_64', file: 'luno-messenger-x86_64.apk',
    size_bytes: 24485757, sha256: '48FCD20D9EECD990983621993DA2700856922ED9883096B9D26623FEF0078E09',
    url: `${GH}/luno-messenger-x86_64.apk`,
  });
});
