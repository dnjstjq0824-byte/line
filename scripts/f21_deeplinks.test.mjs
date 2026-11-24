// Stage 10 (F21): deep links + shares — the worker serves assetlinks.json
// for the release + debug certs, the manifest declares App Links (verified),
// the luno:// fallback and share targets, and the router mounts JoinPage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1 } from './test_helpers.mjs';

let f21Serial = 0;
async function f21Isolate(db) {
  const mod = await import(`./cf_worker.js?f21=${++f21Serial}`);
  const env = { DB: db };
  return {
    fetch: (path, method = 'GET') =>
      mod.default.fetch(new Request(`https://localhost${path}`, { method }), env),
  };
}

test('F21: assetlinks binds the package to both signing certs', async () => {
  const db = makeD1();
  try {
    const { fetch } = await f21Isolate(db);
    const res = await fetch('/.well-known/assetlinks.json');
    assert.equal(res.status, 200);
    assert.ok((res.headers.get('content-type') || '').includes('application/json'), 'json content type');
    const [entry] = await res.json();
    assert.deepEqual(entry.relation, ['delegate_permission/common.handle_all_urls']);
    assert.equal(entry.target.namespace, 'android_app');
    assert.equal(entry.target.package_name, 'com.lunotalk.messenger');
    // Pinned deliberately: a key rotation must update this file on purpose.
    // Order: current release (luno-release-2, apksigner-verified 2026-11-24),
    // legacy release (installed base), debug key.
    assert.deepEqual(entry.target.sha256_cert_fingerprints, [
      'F2:D7:2C:CC:80:54:A2:FA:EB:42:3F:18:5F:5F:F7:7B:A3:1D:EF:4B:90:2C:31:5E:07:1B:A8:D7:0B:4C:97:7C',
      '6D:CD:CD:38:DB:6A:48:5C:E9:99:FE:EC:9D:B5:8F:E5:CD:C7:80:63:16:AA:63:6A:56:90:8B:FD:F0:BA:64:F0',
      '15:09:C9:EE:A6:53:6E:9C:F4:9C:53:61:47:E0:66:27:0A:A9:B2:EC:93:C3:35:43:65:CF:2F:BD:D9:6C:BE:A9',
    ]);
  } finally { db.raw.close(); }
});

test('F21: manifest declares verified links, fallback scheme and shares', async () => {
  const manifest = await readFile(
    new URL('../mobile/flutter_app/android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  assert.ok(manifest.includes('android:autoVerify="true"'), 'app links verified');
  assert.ok(manifest.includes('luno-messenger.dnjstjqppk.workers.dev'), 'legacy host kept for old links');
  assert.ok(manifest.includes('lunotalk.com'), '6-6: new prod host');
  assert.ok(manifest.includes('/invite/..*') && manifest.includes('/chats/..*'), 'link paths');
  assert.ok(manifest.includes('android:scheme="luno"'), 'custom scheme fallback');
  assert.ok(manifest.includes('android.intent.action.SEND'), 'share targets');
  assert.ok(manifest.includes('text/plain'), 'text shares');
  // Audit P0-4: the photo share target stays out until the receive pipeline
  // lands — the manifest must not advertise it.
  assert.ok(!manifest.includes('mimeType="image/'), 'no image share target');
});

test('F21: router mounts the invite landing, activity bridges shares', async () => {
  const router = await readFile(
    new URL('../mobile/flutter_app/lib/router.dart', import.meta.url), 'utf8');
  assert.ok(router.includes("path: '/invite/:token'"), 'invite route');
  assert.ok(router.includes('JoinPage(token:'), 'invite landing');
  const activity = await readFile(
    new URL('../mobile/flutter_app/android/app/src/main/kotlin/com/lunotalk/messenger/MainActivity.kt', import.meta.url),
    'utf8');
  assert.ok(activity.includes('"luno.links"'), 'link channel');
  assert.ok(activity.includes('getInitialShare'), 'cold share');
  assert.ok(activity.includes('"onLink"') && activity.includes('"onShare"'), 'warm link + share');
  const handler = await readFile(
    new URL('../mobile/flutter_app/lib/util/deep_links.dart', import.meta.url), 'utf8');
  assert.ok(handler.includes("MethodChannel('luno.links')"), 'dart channel matches');
});
