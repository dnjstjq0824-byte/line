// Stage 8 (UX1-UX5): one design spec everywhere (Harbor v3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'user-web', 'src');

async function srcFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await srcFiles(p));
    else if (/\.(vue|css|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('UX1: no --line- or --om- variables remain in user-web src', async () => {
  const offenders = [];
  for (const f of await srcFiles(root)) {
    const text = await readFile(f, 'utf8');
    const m = text.match(/--(?:line|om)-[a-z0-9-]+/g);
    if (m) offenders.push(`${f}: ${[...new Set(m)].join(',')}`);
  }
  assert.deepEqual(offenders, []);
});

test('UX1: main.ts loads exactly the v3 tokens and one skin', async () => {
  const main = await readFile(join(root, 'main.ts'), 'utf8');
  const css = [...main.matchAll(/import '([^']+\.css)'/g)].map((m) => m[1]);
  assert.ok(css.length <= 2, `CSS imports: ${css.join(',')}`);
  assert.deepEqual(css, ['../../shared/design-v3.css', './styles/luno-v2.css']);
});

test('UX1: legacy token files and dead views are deleted', async () => {
  for (const f of [
    'components/luno-design-tokens.css',
    'luno-theme.css',
    'luno-theme-advanced.css',
    'styles/luno-design-tokens.css',
    'styles/open-messenger-tokens.css',
    'styles/design-tokens.css',
    'components/ChatRoomView.vue',
    'components/ChatsView.vue',
    'components/HomeView.vue',
    'components/OpenChatView.vue',
    'components/VoomView.vue',
    'components/WalletView.vue',
  ]) {
    await assert.rejects(readFile(join(root, f), 'utf8'), `${f} deleted`);
  }
});

test('UX1: one font load, extracted rules survive in the skin', async () => {
  const skin = await readFile(join(root, 'styles', 'luno-v2.css'), 'utf8');
  assert.equal((skin.match(/@import url\(/g) || []).length, 1, 'single font load');
  for (const rule of ['.btn-primary{', '.btn-secondary{', '.story-ring{', '.ln-tnum {']) {
    assert.ok(skin.includes(rule), `${rule} kept`);
  }
  assert.ok(!skin.includes('--om-primary:var(--ln-accent)'), 'remap block gone');
});
