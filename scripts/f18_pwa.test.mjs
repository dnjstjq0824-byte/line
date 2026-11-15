// Stage 10 (F18): PWA shell — manifest with installable PNG icons,
// commit-versioned service worker (offline shell, API bypass, old-cache
// purge on deploy), registration in main.ts, build-time stamping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { stampServiceWorker } = require('./pwa_stamp.cjs');

const WEB = new URL('../apps/user-web/', import.meta.url);

function pngSize(buf) {
  assert.equal(buf.subarray(1, 4).toString(), 'PNG', 'not a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test('F18: manifest is installable (PNG 192/512 + maskable)', async () => {
  const manifest = JSON.parse(await readFile(new URL('public/manifest.webmanifest', WEB), 'utf8'));
  assert.equal(manifest.name, 'LUNO Global Messenger');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.start_url && manifest.theme_color, 'start + theme');
  const bySize = Object.fromEntries(manifest.icons.map((i) => [`${i.sizes}/${i.purpose}`, i]));
  for (const key of ['192x192/any', '512x512/any', '512x512/maskable']) {
    const icon = bySize[key];
    assert.ok(icon, `icon ${key} listed`);
    assert.equal(icon.type, 'image/png');
    const file = await readFile(new URL('public/' + icon.src.replace(/^\.\//, ''), WEB));
    const size = pngSize(file);
    const want = Number(key.split('x')[0]);
    assert.equal(size.width, want, `${key} width`);
    assert.equal(size.height, want, `${key} height`);
  }
});

test('F18: service worker shells offline, bypasses API, purges on deploy', async () => {
  const sw = await readFile(new URL('public/sw.js', WEB), 'utf8');
  assert.ok(sw.includes('__LUNO_BUILD_ID__'), 'commit version token');
  assert.ok(sw.includes('__LUNO_PRECACHE_JSON__'), 'shell list token');
  assert.ok(sw.includes("`luno-shell-${CACHE_VERSION}`"), 'versioned shell cache');
  assert.match(sw, /mode === 'navigate'[\s\S]{0,600}?caches\.match\(SHELL_URL/, 'offline shell fallback');
  assert.ok(sw.includes("startsWith('/api/')"), 'API bypass');
  assert.ok(sw.includes('version.json'), 'version check bypass');
  assert.match(sw, /caches\.keys\(\)[\s\S]{0,400}?caches\.delete/, 'old caches purged');
  assert.ok(sw.includes('self.skipWaiting()') && sw.includes('self.clients.claim()'), 'prompt takeover');
});

test('F18: app registers the worker', async () => {
  const main = await readFile(new URL('src/main.ts', WEB), 'utf8');
  assert.match(main, /serviceWorker.*register\(.*sw\.js/, 'registration present');
});

test('F18: stamp binds the worker to the deploy commit', async () => {
  const dir = await (async () => {
    const d = join(tmpdir(), `f18-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    await mkdir(join(d, 'assets'), { recursive: true });
    await mkdir(join(d, 'brand'), { recursive: true });
    await writeFile(join(d, 'sw.js'), await readFile(new URL('public/sw.js', WEB), 'utf8'));
    await writeFile(join(d, 'index.html'), '<html></html>');
    await writeFile(join(d, 'manifest.webmanifest'), '{}');
    await writeFile(join(d, 'assets', 'app-abc.js'), 'x');
    await writeFile(join(d, 'brand', 'luno-icon-192.png'), 'png');
    return d;
  })();
  const { buildId, precached } = stampServiceWorker(dir, 'abc1234');
  assert.equal(buildId, 'abc1234');
  const stamped = await readFile(join(dir, 'sw.js'), 'utf8');
  assert.ok(!stamped.includes('__LUNO_'), 'no tokens left');
  assert.ok(stamped.includes("CACHE_VERSION = 'abc1234'"), 'cache bound to commit');
  const list = JSON.parse(JSON.parse(stamped.match(/const PRECACHE = JSON\.parse\((.*?)\);/s)[1]));
  for (const e of ['./', './index.html', './manifest.webmanifest', './assets/app-abc.js', './brand/luno-icon-192.png']) {
    assert.ok(list.includes(e), `precached ${e}`);
  }
  assert.ok(precached >= 5);
  execFileSync(process.execPath, ['--check', join(dir, 'sw.js')], { stdio: 'pipe' });
  const build = await readFile(new URL('./build_cf.js', import.meta.url), 'utf8');
  assert.ok(build.includes("require('./pwa_stamp.cjs')"), 'build requires stamper');
  assert.ok(build.includes('stampServiceWorker(distRoot, versionData.short_commit)'), 'build stamps with commit');
});
