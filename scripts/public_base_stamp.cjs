// F27: stamp __LUNO_PUBLIC_BASE__ in dist text files with the deploy base.
// The default comes from the worker's single constant (parsed from source),
// so the production host has exactly one home; PUBLIC_BASE_URL overrides it.
const fs = require('fs');
const path = require('path');

const PUBLIC_BASE_TOKEN = '__LUNO_PUBLIC_BASE__';
const STAMP_EXTS = new Set(['.html', '.xml', '.txt', '.js', '.json']);

function defaultBaseFromWorker(workerPath) {
  const src = fs.readFileSync(workerPath, 'utf8');
  const m = src.match(/DEFAULT_PUBLIC_BASE_URL = '([^']+)'/);
  if (!m) throw new Error(`DEFAULT_PUBLIC_BASE_URL not found in ${workerPath}`);
  return m[1];
}

function stampPublicBase(distRoot, base) {
  const clean = String(base || '').replace(/\/+$/, '');
  if (!clean) throw new Error('public base URL is empty');
  let files = 0;
  let hits = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (!STAMP_EXTS.has(path.extname(e.name).toLowerCase())) continue;
      const text = fs.readFileSync(p, 'utf8');
      if (!text.includes(PUBLIC_BASE_TOKEN)) continue;
      fs.writeFileSync(p, text.split(PUBLIC_BASE_TOKEN).join(clean));
      files += 1;
      hits += text.split(PUBLIC_BASE_TOKEN).length - 1;
    }
  };
  walk(distRoot);
  return { files, hits, base: clean };
}

module.exports = { stampPublicBase, defaultBaseFromWorker, PUBLIC_BASE_TOKEN };
