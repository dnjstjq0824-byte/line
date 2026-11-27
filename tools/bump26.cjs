// usage: node tools/bump26.cjs <repoDir> <relDir> <extra download.html>...
// Moves the download refs from build 25 to build 26 (sizes + sha256 of the
// APKs in <relDir>). Also rewrites any extra download.html copies (dist_cf).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const [repo, rel, ...extraHtml] = process.argv.slice(2);
const FROM = 25, TO = 26;
const OLD = {
  arm64: { size: 44477274, sha: 'C2C2DA7409838B1760ACEFA8F32633AAAB13B67AD18769C50539EC0FB10A5AFC' },
  arm32: { size: 35562954, sha: '6CF47A10B1EB3D8D11C4837C04A2A51F5FE26C5CEA9E1F209FE2CFE85365F9A3' },
  x86_64: { size: 50998098, sha: 'A210760644CFBA09682C966BA29C41F161194242BE011814844304A9EEDB944A' },
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
  s = s.split(`(Build ${FROM})`).join(`(Build ${TO})`);
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
