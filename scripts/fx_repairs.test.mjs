import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

// FX screen-repair package (2026-11-11 work order, tranche 2 + tranche 3).
// Each tripwire pins the exact repair so a restyle cannot silently regress
// it. QA re-click is the completion verdict; these are the executor's
// source-level self-checks.
const appCss = await readFile(new URL('../apps/user-web/src/App.vue', import.meta.url), 'utf8');
const v2Css = await readFile(new URL('../apps/user-web/src/styles/luno-v2.css', import.meta.url), 'utf8');
const viewSrc = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8');
const paneSrc = await readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8');
const workerSrc = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');

// ---- FX-01: mobile bottom nav pins to the viewport bottom ----
test('FX-01 tab bar pins to the bottom without a double toolbar term', () => {
  assert.match(v2Css, /\.lx-tabbar \{[^}]*position: fixed;[^}]*bottom: 0;[^}]*padding: 0 4px env\(safe-area-inset-bottom\);/);
  assert.ok(!appCss.includes('calc(100vh - 100dvh'), 'App.vue keeps no 100vh-100dvh term');
  assert.ok(!v2Css.includes('calc(100vh - 100dvh'), 'luno-v2 keeps no 100vh-100dvh term');
});

test('FX-01 list scroll clears the phone tab bar', () => {
  assert.match(v2Css, /\.lx-list \{ border-right: 0; padding-bottom: calc\(60px \+ env\(safe-area-inset-bottom\)\); \}/);
});

test('FX-01/FX-08 new chat lives in the list header, never floats over the tab bar', async () => {
  const list = await readFile(new URL('../apps/user-web/src/components/ChatList.vue', import.meta.url), 'utf8');
  const head = list.split('<header class="lx-pane-head">')[1].split('</header>')[0];
  assert.ok(head.includes("emit('new-chat')"), 'new-chat button sits in the header');
  assert.ok(!/floating-add/.test(viewSrc + list), 'no floating add button remains');
});

// ---- FX-02: chat input cluster always on screen ----
test('FX-02 message canvas shrinks so the composer stays visible', () => {
  assert.match(appCss, /\.pc-chat-messages-canvas \{[^}]*min-height: 0;/);
  assert.match(v2Css, /\.lx-room \{[^}]*min-height: 0;[^}]*flex-direction: column;/);
  assert.match(v2Css, /\.lx-composer-dock \{[^}]*flex-shrink: 0;/);
});

// ---- FX-07: iPhone height system + input sizes + keyboard ----
test('FX-07 root heights fall back to dynamic viewport units', () => {
  assert.match(appCss, /\.luno-desktop-app \{[^}]*height: 100dvh;/, 'app root carries a 100dvh fallback');
  assert.match(v2Css, /\.lx-shell \{[^}]*height: 100vh;[^}]*height: 100dvh;/, 'shell carries a 100dvh fallback');
});

test('FX-07 text-entry controls are 16px or larger (no Safari zoom)', () => {
  const m = appCss.match(/\/\* FX-07: text-entry minimums[\s\S]*?\*\/\s*([^{]+)\{([^}]+)\}/);
  assert.ok(m, 'FX-07 minimums block exists');
  assert.ok(m[1].includes('input:not('), 'inputs covered with control exclusions');
  assert.ok(m[1].includes('textarea'), 'textareas covered');
  assert.ok(m[1].includes('select'), 'selects covered');
  assert.match(m[2], /font-size: 16px !important;/);
  assert.match(v2Css, /font-size:16px!important/);
  assert.ok(!/<input[^>]*font-size:\s?1[0-5]px/.test(viewSrc), 'no inline sub-16px input remains in the view');
  assert.ok(!/<(input|textarea|select)[^>]*font-size:\s?1[0-5]px/.test(paneSrc), 'no inline sub-16px entry remains in the pane');
});

test('FX-07 keyboard keeps the composer above it', () => {
  assert.ok(viewSrc.includes('visualViewport'), 'MessengerView listens to visualViewport');
  assert.ok(viewSrc.includes('keyboard-open'), 'MessengerView toggles a keyboard-open state');
  assert.match(v2Css, /\.keyboard-open \.lx-composer-dock \{[^}]*position: sticky;/);
});

// ---- FX-09: toasts never cover a header, auto-dismissing ----
test('FX-09 alerts sit at the bottom centre, above the phone tab bar', async () => {
  const shellCss = v2Css;
  assert.match(appCss, /\.floating-alert \{[^}]*left: 50%;[^}]*transform: translateX\(-50%\);/);
  assert.match(shellCss, /\.luno-desktop-app \.floating-alert \{ top: auto !important; bottom: 96px; \}/);
  assert.match(shellCss, /\.floating-alert \{ bottom: calc\(72px \+ env\(safe-area-inset-bottom\)\); \}/);
});


// ---- FX-14: detail buttons stay on one line ----
test('FX-14 subaction row scrolls instead of wrapping labels', () => {
  assert.match(appCss, /\.profile-preview-subactions \{[^}]*flex-wrap: nowrap;[^}]*overflow-x: auto;/);
  assert.match(appCss, /\.btn-subaction-pill \{[^}]*flex-shrink: 0;/);
});

// ---- FX-16: call peer name readable on dark ----
test('FX-16 call dialog name stays white', () => {
  assert.match(v2Css, /\.call-dialog-box h3\{[^}]*color:#fff/);
});

// ---- FX-19: in-room search answers ----
test('FX-19 search reads the server messages key', () => {
  assert.ok(viewSrc.includes('res.results || res.messages') || viewSrc.includes('res.messages || res.results'), 'search accepts both keys');
});

test('FX-19 search hits jump to the message', () => {
  assert.ok(paneSrc.includes('jumpToSearchedMessage') || paneSrc.includes('scrollToSearchedMessage'), 'pane exposes a jump handler');
  assert.ok(paneSrc.includes('searched-flash') || paneSrc.includes('search-flash'), 'jumped message flashes');
});

// ---- FX-20: news hero and tabs ----
test('FX-20 hero title sits under the photo in the text colour', () => {
  assert.match(v2Css, /\.lx-news-hero-text h3 \{[^}]*color: var\(--ln-text\);/);
});

test('FX-20 category tabs never wrap to two lines', () => {
  assert.match(v2Css, /\.lx-chip \{[^}]*flex-shrink: 0;[^}]*white-space: nowrap;/);
  assert.match(v2Css, /\.lx-chips \{[^}]*overflow-x: auto;/);
});

test('FX-20 hero shows a shimmer while the photo loads', () => {
  assert.match(v2Css, /\.lx-news-hero-media \{[^}]*background: linear-gradient\(/);
});

// ---- FX-21: floating buttons yield to content ----
test('FX-21 jump button only shows when scrolled up', () => {
  assert.ok(paneSrc.includes('showJumpBottom') || paneSrc.includes('isNearBottom'), 'pane tracks bottom proximity');
  assert.ok(/btn-scroll-bottom" v-(if|show)=/.test(paneSrc), 'jump button is gated on scroll state');
});

// ---- FX-17: new-call contact selection step ----
test('FX-17 new call opens a contact picker, never dials blind', () => {
  assert.ok(viewSrc.includes('showNewCallModal'), 'new-call picker state exists');
  assert.ok(!viewSrc.includes('@click="startCall(\'voice\')"'), 'no blind-dial new-call button remains');
  assert.match(viewSrc, /showNewCallModal[\s\S]{0,400}startCallWithUser/);
});

// ---- FX-18: redial matches the record kind ----
test('FX-18 call kind is normalized on every entry', () => {
  assert.ok(viewSrc.includes('normalizeCallKind') || paneSrc.includes('normalizeCallKind'), 'a kind normalizer exists');
  assert.ok(viewSrc.includes("normalizeCallKind(log.call_type)") || viewSrc.includes('normalizeCallKind('), 'redial normalizes the record kind');
});

test('FX-18 history rows show their kind icon', () => {
  assert.ok(viewSrc.includes('call-kind-icon') || viewSrc.includes('call_kind_icon'), 'history rows carry a kind icon');
});

test('FX-18 server defaults missing kinds to voice', () => {
  assert.match(workerSrc, /const call = \{[^}]*kind: b\.kind \|\| 'voice'/);
  assert.match(workerSrc, /if \(!\['voice', 'video'\]\.includes\(b\.kind \|\| 'voice'\)\)/);
});

// ---- FX-15: cached lists and rooms render instantly ----
test('FX-15 list snapshots render before the network answers', () => {
  assert.ok(viewSrc.includes('luno-chats-snapshot'), 'chat list snapshot key exists');
  assert.ok(viewSrc.includes('luno-calls-snapshot'), 'call history snapshot key exists');
});

test('FX-15 rooms show cached messages while refreshing', () => {
  assert.ok(viewSrc.includes('roomMessageCache') || viewSrc.includes('cachedRoomMessages'), 'per-room message cache exists');
});

// ---- FX-10: avatars and initials never render broken ----
test('FX-10 avatar images fall back on load failure', () => {
  assert.ok(viewSrc.includes('@error="hideBrokenAvatar"') || viewSrc.includes('onAvatarError'), 'MessengerView avatars handle errors');
});

test('FX-10 initials reject surrogates and blanks', async () => {
  const { initialOf } = await import('../apps/shared/avatar_initial.ts');
  assert.equal(initialOf('😀민수', 'L'), '😀');
  assert.equal(initialOf('\uD800', 'L'), 'L');
  assert.equal(initialOf('\uD800abc', 'L'), 'a');
  assert.equal(initialOf('  민수', 'L'), '민');
  assert.equal(initialOf('', 'L'), 'L');
});
