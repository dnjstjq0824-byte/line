const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createHash } = require('node:crypto');

console.log('Building all Vue workspaces for Cloudflare deployment...');
execSync('npm run build:apps', { stdio: 'inherit' });

const distRoot = path.join(__dirname, '..', 'dist_cf');
if (fs.existsSync(distRoot)) {
  fs.rmSync(distRoot, { recursive: true, force: true });
}
fs.mkdirSync(distRoot, { recursive: true });

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Root app is user-web (the main Messenger application)
const userWebDist = path.join(__dirname, '..', 'apps', 'user-web', 'dist');
if (fs.existsSync(userWebDist)) {
  copyDir(userWebDist, distRoot);
}

// 2. Sub-apps accessible via /admin, /partner, /developer, /creator, /ads
const subApps = [
  { name: 'admin', path: 'admin-console' },
  { name: 'partner', path: 'partner-console' },
  { name: 'developer', path: 'developer-console' },
  { name: 'creator', path: 'creator-console' },
  { name: 'ads', path: 'ads-console' }
];

for (const sub of subApps) {
  const subSrc = path.join(__dirname, '..', 'apps', sub.path, 'dist');
  const subDest = path.join(distRoot, sub.name);
  if (fs.existsSync(subSrc)) {
    copyDir(subSrc, subDest);
  }
}

// 3. Generate version.json and update worker BUILD_INFO
let gitCommit = 'unknown';
try {
  gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
  console.warn('Could not read git commit:', e.message);
}
const buildTime = new Date().toISOString();
const versionData = {
  commit: gitCommit,
  short_commit: gitCommit.length >= 7 ? gitCommit.slice(0, 7) : gitCommit,
  worker_version: 'v2.0.0-remediated',
  build_time: buildTime,
  env: 'production',
  brand: 'LUNO',
  status: 'ok'
};
// A local hotfix may be authorized while Git writes are on hold. Never present
// its old HEAD as though it uniquely identified the deployed worker source.
versionData.source_dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
versionData.worker_source_sha256 = createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'cf_worker.js'))).digest('hex');

fs.writeFileSync(path.join(distRoot, 'version.json'), JSON.stringify(versionData, null, 2));

// F18: version the service worker with the deploy commit + shell file list.
const { stampServiceWorker } = require('./pwa_stamp.cjs');
const stampedSw = stampServiceWorker(distRoot, versionData.short_commit);
console.log(`Service worker stamped (${stampedSw.buildId}, ${stampedSw.precached} shell files)`);

// The source worker is left untouched; wrangler.jsonc deploys this stamped copy.
// Stamping the source itself made every deploy produce a commit that only
// recorded the previous commit's SHA.
const workerSrc = path.join(__dirname, 'cf_worker.js');
const workerOutDir = path.join(__dirname, '..', 'dist_worker');
const workerOut = path.join(workerOutDir, 'cf_worker.js');
const buildInfoPattern = /const BUILD_INFO = \{[\s\S]*?\};/;
const workerCode = fs.readFileSync(workerSrc, 'utf8');
if (!buildInfoPattern.test(workerCode)) {
  throw new Error('BUILD_INFO block not found in scripts/cf_worker.js; refusing to deploy an unstamped worker');
}
fs.rmSync(workerOutDir, { recursive: true, force: true });
fs.mkdirSync(workerOutDir, { recursive: true });
// workerd rejects non-function named exports at boot ("not of type
// 'function or ExportedHandler'"), so the node-test seams below are stripped
// from the deployed copy. Tests import scripts/cf_worker.js (seams intact);
// wrangler serves dist_worker/cf_worker.js (seams removed).
const testSeams = [
  'export { recoveryMailOutbox, verificationMailOutbox, smsOutbox };',
  'export { QUOTA_UPLOADS_PER_DAY, QUOTA_UPLOAD_BYTES_PER_DAY, QUOTA_ROOMS_PER_DAY, quotaWouldExceed };',
  'export { TRANSLATE_MAX_CHARS, TRANSLATE_PER_MINUTE, TRANSLATE_CHARS_PER_DAY, translateProviderCalls, registerTranslateProvider };',
];
let stamped = workerCode.replace(buildInfoPattern, `const BUILD_INFO = ${JSON.stringify(versionData, null, 2)};`);
for (const seam of testSeams) {
  if (!stamped.includes(seam)) {
    throw new Error(`test seam missing from scripts/cf_worker.js, refusing a half-stripped worker: ${seam}`);
  }
  stamped = stamped.replace(seam, '// (test seam stripped for workerd)');
}
const leftover = stamped.match(/^export \{[^}]*\};?$/m);
if (leftover) {
  throw new Error(`unknown named export would break workerd boot, add it to testSeams or remove it: ${leftover[0]}`);
}
fs.writeFileSync(workerOut, stamped, 'utf8');

console.log(`✅ Combined Cloudflare distribution prepared in ./dist_cf (Commit: ${versionData.short_commit})`);

