import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'

// QA-P0-4: attachment + drawer + collapse + favorite controls must each show a
// visible effect. Live click evidence (2026-11-10, Chromium 1920px, demo user):
// camera modal OK, file chooser OK, voice starts OK, drawers open OK with a
// chat selected, favorite pill toggles OK. Three defects found:
//  (a) pane collapse toggles the class but the width stays 340px
//      (luno-v2.css 340px!important wins over the 52px rule),
//  (b) drawer buttons with no chat selected are a silent no-op,
//  (c) the file input uses the `hidden` attribute, which Safari and some
//      mobile webviews refuse to open programmatically.

const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8')
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

async function api(path, token, method = 'GET', body) {
  const res = await worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }), { ALLOW_LOCAL_DEMO: 'true' })
  let data = null
  try { data = await res.json() } catch { data = null }
  return { status: res.status, data }
}

const PW = 'T3st#Migrated2026'
await api('auth/register', null, 'POST', { email: 'user@luno.local', password: PW, display_name: 'LUNO Demo User' })
await api('auth/register', null, 'POST', { email: 'alice@luno-test.local', password: PW, display_name: 'Alice Kim', handle: 'alice_kim' })
const me = (await api('auth/login', null, 'POST', { email: 'user@luno.local', password: PW })).data || {}
assert.ok(me.access_token, 'demo login works')
await api('friends', me.access_token, 'POST', { handle: 'alice_kim' })

async function aliceFavorite() {
  const r = await api('friends', me.access_token)
  assert.equal(r.status, 200)
  return (r.data.friends || []).find(f => f.display_name === 'Alice Kim')
}

test('favorite toggle persists and restores (star path contract)', async () => {
  const before = await aliceFavorite()
  assert.ok(before, 'Alice is a friend of the demo user')
  const on = await api(`friends/${before.id}`, me.access_token, 'PATCH', { favorite: true })
  assert.equal(on.status, 200)
  assert.equal((await aliceFavorite()).is_favorite, true)
  const off = await api(`friends/${before.id}`, me.access_token, 'PATCH', { favorite: false })
  assert.equal(off.status, 200)
  assert.equal((await aliceFavorite()).is_favorite, false)
})

const vue = await readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8')
const appCss = await readFile(new URL('../apps/user-web/src/App.vue', import.meta.url), 'utf8')
const v2Css = await readFile(new URL('../apps/user-web/src/styles/luno-v2.css', import.meta.url), 'utf8')
const i18n = await readFile(new URL('../apps/user-web/src/luno-i18n.ts', import.meta.url), 'utf8')

test('drawer buttons guide the user when no chat is selected', () => {
  assert.match(vue, /function toggleDrawer[\s\S]{0,400}selectedChatId\.value/)
  assert.match(vue, /mvDrawerNeedChat/)
  const hits = i18n.split('\n').filter(l => l.includes('mvDrawerNeedChat'))
  assert.equal(hits.length, 4)
  for (const h of hits) assert.doesNotMatch(h, /mvDrawerNeedChat:\s*'mvDrawerNeedChat'/)
})

test('collapse wins over the desktop width override and stays reversible', () => {
  assert.match(v2Css, /\.pc-side-pane\.is-collapsed\{\s*width:\s*52px\s*!important/)
  assert.match(v2Css, /\.pc-side-pane\.is-collapsed\{[^}]*min-width:\s*0\s*!important/)
  assert.match(vue, /btn-pane-expand[\s\S]{0,200}isPanelCollapsed\s*=\s*false/)
})

test('file input is programmatically clickable (no hidden attribute)', () => {
  assert.doesNotMatch(vue, /type="file"\s+hidden/)
  assert.match(vue, /ref="attachmentInput"[^>]*type="file"/)
  assert.match(appCss, /\.file-input-hidden\s*\{[^}]*position:\s*absolute/)
  assert.match(appCss, /\.file-input-hidden\s*\{[^}]*opacity:\s*0/)
})

test('camera/file/voice entry points stay wired', () => {
  assert.match(vue, /@click="openCamera"/)
  assert.match(vue, /showCameraModal/)
  assert.match(vue, /@click="chooseAttachment\('file'\)"/)
  assert.match(vue, /@click="toggleVoiceRecording"/)
  assert.match(vue, /@change="uploadSelectedFile"/)
})
