import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const output = 'docs/audit-20261105';
const origin = 'https://luno-messenger.dnjstjqppk.workers.dev';
const source = fs.readFileSync('scripts/cf_worker.js', 'utf8');
const probes = await Promise.all(['/api/v1/version', '/readyz', '/', '/admin/', '/partner/', '/developer/', '/creator/', '/ads/'].map(async path => {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(15000) });
  const details = path.startsWith('/api/') || path === '/readyz' ? await response.json() : undefined;
  return { path, status: response.status, details };
}));
const maps = [...source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*new Map\(/g)].map(match => match[1]);
const tables = [...new Set([...source.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)/g)].map(match => match[1]))];
const baseline = {
  measuredAt: new Date().toISOString(), scope: 'Read-only production HTTP and local source inspection; no production authentication or data/schema/deployment changes',
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  worktree: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().split(/\r?\n/),
  localWorkerSha256: createHash('sha256').update(source).digest('hex'),
  probes, localStateMaps: maps, runtimeSchemaTables: tables,
  note: 'This is not a full authorized workflow audit. Production role accounts, live provider/device workflows and full schema constraints are not assessed by these probes.'
};
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(output + '/phase0-baseline.json', JSON.stringify(baseline, null, 2));
console.log(JSON.stringify({ gitHead: baseline.gitHead, probes: probes.map(({ path, status }) => ({ path, status })), localStateMaps: maps.length, runtimeSchemaTables: tables.length }));
