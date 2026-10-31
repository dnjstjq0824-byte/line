const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

fs.writeFileSync(path.join(distRoot, 'version.json'), JSON.stringify(versionData, null, 2));
const workerPath = path.join(__dirname, 'cf_worker.js');
if (fs.existsSync(workerPath)) {
  let workerCode = fs.readFileSync(workerPath, 'utf8');
  workerCode = workerCode.replace(
    /const BUILD_INFO = \{[\s\S]*?\};/,
    `const BUILD_INFO = ${JSON.stringify(versionData, null, 2)};`
  );
  fs.writeFileSync(workerPath, workerCode, 'utf8');
}

console.log(`✅ Combined Cloudflare distribution prepared in ./dist_cf (Commit: ${versionData.short_commit})`);

