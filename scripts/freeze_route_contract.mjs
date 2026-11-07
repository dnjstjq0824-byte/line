// One-shot: freeze the working-tree backend route table as the V3 baseline.
// Run deliberately; the pre-deploy gate fails if the table drifts from this.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'backend', 'internal', 'server');
const routes = new Set();
for (const e of readdirSync(dir)) {
  if (!e.endsWith('.go') || e.endsWith('_test.go')) continue;
  const src = readFileSync(join(dir, e), 'utf8');
  for (const m of src.matchAll(/HandleFunc\("([A-Z]+ [^"]+)"/g)) routes.add(m[1]);
}
const list = [...routes].sort();
writeFileSync(
  join(root, 'scripts', 'route_contract.golden.json'),
  JSON.stringify({ frozen: 'working-tree 2026-11-07, V3 renewal baseline', count: list.length, routes: list }, null, 1) + '\n',
);
console.log('routes:', list.length);
