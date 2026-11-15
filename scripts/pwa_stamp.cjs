// F18: stamp the service worker with the deploy commit and the shell file
// list. build_cf.js calls stampServiceWorker(distRoot, shortCommit) after
// copying user-web dist; f18_pwa.test.mjs exercises it on a fixture dir.
const fs = require('fs');
const path = require('path');

const BUILD_TOKEN = '__LUNO_BUILD_ID__';
const PRECACHE_TOKEN = '__LUNO_PRECACHE_JSON__';

function listFiles(dir, base = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

function stampServiceWorker(distRoot, buildId) {
  const swPath = path.join(distRoot, 'sw.js');
  if (!fs.existsSync(swPath)) throw new Error(`service worker missing: ${swPath}`);
  let sw = fs.readFileSync(swPath, 'utf8');
  if (!sw.includes(BUILD_TOKEN) || !sw.includes(PRECACHE_TOKEN)) {
    throw new Error('sw.js has no F18 stamp tokens; refusing to ship an unversioned worker');
  }
  const files = listFiles(distRoot);
  const shell = ['./', './index.html', './manifest.webmanifest'];
  for (const f of files) {
    if (/^assets\/.*\.(js|css)$/.test(f)) shell.push('./' + f);
    if (/^brand\/luno-icon-.*\.png$/.test(f)) shell.push('./' + f);
  }
  sw = sw.replaceAll(BUILD_TOKEN, String(buildId));
  sw = sw.replace(`'${PRECACHE_TOKEN}'`, JSON.stringify(JSON.stringify(shell)));
  if (sw.includes(BUILD_TOKEN) || sw.includes(PRECACHE_TOKEN)) {
    throw new Error('sw.js stamp incomplete; refusing to ship a half-stamped worker');
  }
  fs.writeFileSync(swPath, sw, 'utf8');
  return { buildId: String(buildId), precached: shell.length };
}

module.exports = { stampServiceWorker, BUILD_TOKEN, PRECACHE_TOKEN };
