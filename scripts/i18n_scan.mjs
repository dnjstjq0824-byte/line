// i18n_scan.mjs — reproducible hardcoded-Korean inventory.
// Counts lines containing Hangul outside i18n plumbing (dictionary entries,
// t() calls, locale lists). Calibrated to docs/i18n-hardcoded-inventory.md.
// Usage: node scripts/i18n_scan.mjs [--write]  (--write refreshes the doc)
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'apps/user-web/src/views/AuthView.vue',
  'apps/user-web/src/views/MessengerView.vue',
  'apps/admin-console/src/App.vue',
  'apps/partner-console/src/App.vue',
  'apps/developer-console/src/App.vue',
  'apps/creator-console/src/App.vue',
  'apps/ads-console/src/App.vue',
];
const HANGUL = /[가-힣]/;
// Lines that are i18n machinery or comments, not hardcoded user strings.
const PLUMBING = /\bt\(['"]|UI_DICTIONARY|handoffText|SUPPORTED_LOCALES|LunoLocale|locale:|locale =|setLocale\(|detectInitialLocale|console-i18n|import .*i18n|from '.*i18n'|<!--|\/\/|\/\*|^\s*\*/;

function scan(file) {
  const hits = [];
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (HANGUL.test(line) && !PLUMBING.test(line)) {
      const snippet = line.trim().replace(/\s+/g, ' ').slice(0, 60);
      hits.push({ line: i + 1, snippet });
    }
  });
  return hits;
}

const report = FILES.map((f) => ({ file: f, hits: scan(f) }));
let total = 0;
for (const r of report) {
  total += r.hits.length;
  console.log(`${r.file} — ${r.hits.length}`);
}
console.log(`TOTAL ${total}`);
if (process.argv.includes('--write')) {
  let md = '# i18n 하드코딩 인벤토리 (P1 전환 대상)\n\n재생성: `node scripts/i18n_scan.mjs --write` / `t()` 미경유 한국어 리터럴\n\n';
  for (const r of report) {
    md += `## ${r.file} — ${r.hits.length}줄\n\n`;
    for (const h of r.hits) md += `- L${h.line}: ${h.snippet}\n`;
    md += '\n';
  }
  writeFileSync('docs/i18n-hardcoded-inventory.md', md);
  console.log('inventory rewritten');
}
