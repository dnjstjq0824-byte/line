#!/usr/bin/env node
// pre_deploy_gate.mjs — must pass BEFORE any build/deploy of the V3 renewal.
// Fails closed: any red check blocks the release. Never pushes by itself.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL  ${name}: ${e.message.split('\n')[0]}`);
  }
}
function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, {
    cwd: cwd ?? root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
}
function urlPath(rel) {
  return fileURLToPath(new URL(rel, import.meta.url));
}

console.log('=== LUNO V3 pre-deploy gate ===');

// 1. Backend route contract frozen: the working-tree table must equal the
// V3 baseline golden. Any added/removed/renamed route blocks the release.
check('backend route table matches frozen contract', () => {
  const golden = JSON.parse(readFileSync(urlPath('./route_contract.golden.json'), 'utf8'));
  const dir = join(root, 'backend', 'internal', 'server');
  const live = new Set();
  for (const e of readdirSync(dir)) {
    if (!e.endsWith('.go') || e.endsWith('_test.go')) continue;
    const src = readFileSync(join(dir, e), 'utf8');
    for (const m of src.matchAll(/HandleFunc\("([A-Z]+ [^"]+)"/g)) live.add(m[1]);
  }
  const want = new Set(golden.routes);
  const added = [...live].filter((r) => !want.has(r));
  const removed = [...want].filter((r) => !live.has(r));
  if (added.length || removed.length) {
    throw new Error(`drift added=[${added.join(';')}] removed=[${removed.join(';')}]`);
  }
});

// 2. Static analysis clean.
check('flutter analyze reports no issues', () => {
  const out = sh('flutter', ['analyze'], join(root, 'mobile/flutter_app'));
  if (!/No issues found/.test(out)) throw new Error(out.slice(0, 400));
});

// 3. Full Flutter suite green.
check('flutter test all pass', () => {
  const out = sh('flutter', ['test'], join(root, 'mobile/flutter_app'));
  if (!/All tests passed/.test(out)) throw new Error(out.slice(-400));
});

// 4. Console token parity (v2 frozen, v3 layered).
check('design v2+v3 suites pass', () => {
  const out = sh('node', ['--test', 'scripts/design_v2.test.mjs', 'scripts/design_v3.test.mjs']);
  if (!/fail 0/.test(out) || !/pass [1-9]/.test(out)) throw new Error(out.slice(-300));
});

// 5. Route map: one route renders exactly one page.
check('go_router map is 1 route = 1 page', () => {
  const src = readFileSync(urlPath('../mobile/flutter_app/lib/router.dart'), 'utf8');
  const paths = [...src.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]);
  const pages = [...src.matchAll(/harborPage\(\s*\w+,\s*\w+,\s*(?:const\s+)?(\w+)\(/g)].map((m) => m[1]);
  if (paths.length === 0) throw new Error('no routes parsed');
  if (new Set(paths).size !== paths.length) throw new Error('duplicate path');
  if (pages.length !== paths.length) throw new Error(`page/route count mismatch (${pages.length}/${paths.length})`);
  // Archive sub-routes share a widget with distinct kinds; count (page+kind).
  const pageMatches = [...src.matchAll(/harborPage\(\s*\w+,\s*\w+,\s*(?:const\s+)?\w+\(/g)];
  const full = paths.map((p, i) => {
    const start = pageMatches[i].index;
    const end = i + 1 < pageMatches.length ? pageMatches[i + 1].index : src.length;
    const span = src.slice(start, Math.min(end, start + 600));
    const kind = span.match(/ChatArchiveKind\.(\w+)/);
    return `${pages[i]}:${kind ? kind[1] : '-'}`;
  });
  const topLevel = full.filter((_, i) => paths[i].startsWith('/'));
  if (new Set(full).size !== full.length) throw new Error('two routes render the same page');
  if (topLevel.length < 18) throw new Error(`expected >=18 top-level routes, got ${topLevel.length}`);
});

// 6. API contract: every Flutter endpoint exists on the backend.
check('flutter endpoints all exist in backend route table', () => {
  // Legacy-known 404s (no backend route; behaviour preserved, never rewired).
  const allowlist = new Set(['/api/v1/me/export-data', '/api/v1/bookmarks', '/api/v1/auth/', '/api/v1/auth/change-password']); // '/api/v1/auth/' = mobile route-prefix filter, never requested; change-password = worker-only (Go uses PATCH /api/v1/auth/password)
  const lib = join(root, 'mobile', 'flutter_app', 'lib');
  const dart = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.dart')) dart.push(p);
    }
  };
  walk(lib);
  const used = new Set();
  for (const f of dart) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/'(\/api\/v1\/[^'$]*?)'/g)) {
      let p = m[1].split('?')[0];
      // Normalize $id interpolations to {param} segments.
      p = p.replace(/\$[a-zA-Z_]+/g, '{param}').replace(/\{[^}]*\}/g, '{x}');
      if (p.includes('/api/v1/')) used.add(p);
    }
  }
  const backend = join(root, 'backend', 'internal', 'server');
  const table = new Set();
  for (const e of readdirSync(backend)) {
    if (!e.endsWith('.go') || e.endsWith('_test.go')) continue;
    const src = readFileSync(join(backend, e), 'utf8');
    for (const m of src.matchAll(/HandleFunc\("[A-Z]+ ([^"]+)"/g)) {
      table.add(m[1].replace(/\{[^}]*\}/g, '{x}'));
    }
  }
  const missing = [...used].filter((p) => {
    if (allowlist.has(p)) return false;
    if (table.has(p)) return false;
    // Dynamic tails: /api/v1/conversations/{x}/messages matches table entry.
    return ![...table].some((t) => {
      const tre = new RegExp('^' + t.replace(/\{x\}/g, '[^/]+') + '$');
      return tre.test(p);
    });
  });
  if (missing.length) throw new Error(`unknown endpoints: ${missing.join(', ')}`);
});

console.log(failures.length ? `\nGATE RED (${failures.length})` : '\nGATE GREEN — approved to build, deploy still needs human approval');
process.exit(failures.length ? 1 : 0);
