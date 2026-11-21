// usage: node tools/bump21.cjs <repoDir> <relDir> <extra download.html>...
// Moves the download refs from build 20 to build 21 (sizes + sha256 of the
// APKs in <relDir>). Also rewrites any extra download.html copies (dist_cf).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const [repo, rel, ...extraHtml] = process.argv.slice(2);
const FROM = 20, TO = 21;
const OLD = {
  arm64: { size: 44084350, sha: 'FF5B092CCBAFB6FFE41F90C3E2E27BD0EDF61CB7BDD4DB1062B3622E1FEF960E' },
  arm32: { size: 35088114, sha: '0C55F3EFDEC71A578ACF1A862F03CF339A737881CC44BB71DCDE4CECC215EB12' },
  x86_64: { size: 50539638, sha: 'D4346F0DA4474A25F6560572AAEC56E77D1031DBE06912E4EDD0BF2E71E347DE' },
};
const NEW = {};
for (const abi of Object.keys(OLD)) {
  const buf = fs.readFileSync(path.join(rel, `luno-messenger-${abi}.apk`));
  NEW[abi] = { size: buf.length, sha: crypto.createHash('sha256').update(buf).digest('hex').toUpperCase() };
}
function edit(p, fn) {
  const before = fs.readFileSync(p, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`no change in ${p}`);
  fs.writeFileSync(p, after);
}
const swapCommon = (s) => {
  s = s.split(`v2.0.0-build${FROM}`).join(`v2.0.0-build${TO}`);
  for (const abi of Object.keys(OLD)) {
    s = s.split(OLD[abi].sha).join(NEW[abi].sha);
    s = s.split(String(OLD[abi].size)).join(String(NEW[abi].size));
  }
  return s;
};
edit(path.join(repo, 'scripts/cf_worker.js'), (s) => {
  const out = swapCommon(s);
  const re = new RegExp(`(const LATEST_ANDROID_BUILD = \\{[\\s\\S]{0,120}build: )${FROM},`);
  if (!re.test(out)) throw new Error(`build: ${FROM} not found`);
  return out.replace(re, `$1${TO},`);
});
edit(path.join(repo, 'scripts/app_download.test.mjs'), (s) => swapCommon(s)
  .split(`Build ${FROM} assets`).join(`Build ${TO} assets`)
  .split(`body.build, ${FROM})`).join(`body.build, ${TO})`));
const mb = (n) => (n / 1048576).toFixed(1);
const commas = (n) => n.toLocaleString('en-US');
const html = (s) => {
  s = swapCommon(s);
  const label = { arm64: 'arm64 \\(권장\\)', arm32: 'arm32', x86_64: 'x86_64' };
  for (const abi of Object.keys(OLD)) {
    const re = new RegExp(`(<b>${label[abi]}:</b> )[0-9.]+ MB \\([0-9,]+ bytes\\)`);
    if (!re.test(s)) throw new Error(`size line for ${abi} not found`);
    s = s.replace(re, `$1${mb(NEW[abi].size)} MB (${commas(NEW[abi].size)} bytes)`);
  }
  return s;
};
edit(path.join(repo, 'apps/user-web/public/download.html'), html);
for (const p of extraHtml) edit(p, html);
console.log(JSON.stringify(NEW));
