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

test('UX2: tokens, app and web share one breakpoint scale', async () => {
  const tokens = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'shared', 'design-v3.tokens.json'), 'utf8'));
  assert.deepEqual(tokens.breakpoints, [400, 700, 1100]);
  assert.deepEqual(tokens.layout.railPx, 76);
  assert.deepEqual(tokens.layout.listPx, 340);
  assert.deepEqual([tokens.layout.compactMaxPx, tokens.layout.mobileMaxPx, tokens.layout.tabletMaxPx], [400, 700, 1100]);
  const dart = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'mobile', 'flutter_app', 'lib', 'design', 'responsive.dart'), 'utf8');
  assert.ok(dart.includes('compactMax = 400'), 'app compactMax 400');
  assert.ok(dart.includes('mobileMax = 700'), 'app mobileMax 700');
  assert.ok(dart.includes('tabletMax = 1100'), 'app tabletMax 1100');
  const skin = await readFile(join(root, 'styles', 'luno-v2.css'), 'utf8');
  for (const px of [480, 1000]) {
    assert.ok(!new RegExp(`\\((min|max)-width\\s*:\\s*${px}px`).test(skin), `no ${px}px media bound in the skin`);
  }
});

test('UX3: tablet keeps rail 76, list 340, inline conversation, no floating nav', async () => {
  const skin = await readFile(join(root, 'styles', 'luno-v2.css'), 'utf8');
  const m = skin.match(/@media\(min-width:700px\) and \(max-width:1099px\)\{([\s\S]*?)\n\}/);
  assert.ok(m, 'tablet 700-1099 media block present');
  const block = m[1];
  assert.ok(block.includes('.pc-side-pane{width:340px!important'), 'list pane 340px on tablet');
  assert.ok(!/max-width:42vw/.test(block), 'no vw clamp shrinking the list below spec');
  assert.ok(block.includes('.luno-mobile-floating-nav{display:none!important}'), 'floating bottom nav hidden on tablet');
  assert.ok(block.includes('.pc-chat-viewport{position:relative!important'), 'conversation renders inline next to the list');
  assert.ok(block.includes('.pc-friend-profile-viewport{flex:1;min-width:0'), 'friend profile stays inside its tablet slot');
  assert.ok(block.includes('.pc-profile-preview-card{max-width:100%!important}'), 'friend card capped so its action row scrolls instead of clipping');
  assert.ok(block.includes('.pc-rail-bottom{display:flex!important}'), 'rail bottom row visible on tablet');
  assert.ok(skin.includes('.pc-rail{width:76px!important'), 'rail 76px shared by tablet and desktop');
});

test('UX3: translate languages load only after the token is restored (no 401 on boot)', async () => {
  const view = await readFile(join(root, 'views', 'MessengerView.vue'), 'utf8');
  const mounted = view.indexOf('onMounted(async () => {');
  assert.ok(mounted >= 0, 'mounted hook present');
  // F19: restore is the silent cookie refresh, not a stored token read.
  const restore = view.indexOf('await ensureSession()', mounted);
  const fire = view.indexOf('void ensureTranslateLanguages()', mounted);
  assert.ok(restore >= 0 && fire >= 0, 'restore and translate kickoff both present');
  assert.ok(fire > restore, 'translate kickoff runs after token restore');
});
