// APK download surface on the LUNO URL (canonical design):
// /download (and family) 302-redirects to the static /download.html page,
// which links the per-ABI release assets; /api/v1/app/latest is the
// machine-readable twin for in-app update checks. All public, no auth.
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = 'https://localhost';
const TAG = 'v2.0.0-build6';
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

test('GET /api/v1/app/latest reports the per-ABI Build 6 assets', async () => {
  const { api } = await isolate();
  const res = await api('/api/v1/app/latest');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.platform, 'android');
  assert.equal(body.version, '2.0.0');
  assert.equal(body.build, 6);
  assert.equal(body.package, 'com.bookingnetwork.messenger.global_messenger');
  assert.equal(body.assets.length, 3);
  const byAbi = Object.fromEntries(body.assets.map((a) => [a.abi, a]));
  assert.deepEqual(byAbi['arm64-v8a'], {
    abi: 'arm64-v8a', label: 'arm64', recommended: true, file: 'luno-messenger-arm64.apk',
    size_bytes: 20814864, sha256: '3064232E31DD2FCF8ECE21055F6479664BF02AF586023D212865CDCFF3F31581',
    url: `${GH}/luno-messenger-arm64.apk`,
  });
  assert.deepEqual(byAbi['armeabi-v7a'], {
    abi: 'armeabi-v7a', label: 'arm32', file: 'luno-messenger-arm32.apk',
    size_bytes: 18683518, sha256: '9A704D30E2A02E8ADC248E47116059371E92EAE3A2CD557D231BF5A1A1A41719',
    url: `${GH}/luno-messenger-arm32.apk`,
  });
  assert.deepEqual(byAbi['x86_64'], {
    abi: 'x86_64', label: 'x86_64', file: 'luno-messenger-x86_64.apk',
    size_bytes: 22420497, sha256: 'A3B9876259DA9C147BD7DA4B9389373BB319F9793C582FF3FB2A5A3D4E330467',
    url: `${GH}/luno-messenger-x86_64.apk`,
  });
});
