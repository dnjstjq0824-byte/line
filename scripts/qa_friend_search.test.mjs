import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { F24_CONSENT } from './test_helpers.mjs';

// QA-P0-3, revised 2026-11-27 (user decision "ID로만 검색"): friends are
// found and added by exact ID (handle) only. Display names (H4) and emails
// never resolve, even for users who opted into email search.

const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8')
const { default: worker } = await import('./cf_worker.js?qa_friend_search')

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

async function login(email, password) {
  const res = await api('auth/login', null, 'POST', { email, password })
  return (await res.data) || {}
}

const PW = 'T3st#Migrated2026'
await api('auth/register', null, 'POST', { ...F24_CONSENT, email: 'user@luno.local', password: PW, display_name: 'LUNO Demo User' })
await api('auth/register', null, 'POST', { ...F24_CONSENT, email: 'alice@luno-test.local', password: PW, display_name: 'Alice Kim', handle: 'alice_kim' })
const me = await login('user@luno.local', PW)
assert.ok(me.access_token, 'demo login works')
await api('friends', me.access_token, 'POST', { handle: 'alice_kim' })

test('add-friend finds Alice by handle (existing behavior)', async () => {
  const r = await api('friends', me.access_token, 'POST', { handle: 'alice_kim' })
  assert.equal(r.status, 200)
  assert.equal(r.data.status, 'already_friends')
})

test('add-friend never resolves an email', async () => {
  const r = await api('friends', me.access_token, 'POST', { handle: 'alice@luno-test.local' })
  assert.equal(r.status, 404)
})

test('add-friend no longer resolves exact display names (H4)', async () => {
  const r = await api('friends', me.access_token, 'POST', { handle: 'Alice Kim' })
  assert.equal(r.status, 404)
})

test('add-friend rejects partial names (no wrong-person add)', async () => {
  const r = await api('friends', me.access_token, 'POST', { handle: 'Alice' })
  assert.equal(r.status, 404)
})

test('email stays unresolvable even when the owner opted into email search', async () => {
  const reg = await api('auth/register', null, 'POST', { ...F24_CONSENT, email: 'carol-qa@example.test', password: 'Carol#Qa2026!', display_name: 'Carol QA', handle: 'carol_qa' })
  assert.equal(reg.status, 201)
  const carol = await login('carol-qa@example.test', 'Carol#Qa2026!')
  await api('me/settings', carol.access_token, 'PATCH', { searchable_by_email: true })
  const byEmail = await api('friends', me.access_token, 'POST', { handle: 'carol-qa@example.test' })
  assert.equal(byEmail.status, 404)
  const search = await api('users?q=carol-qa@example.test', me.access_token)
  assert.deepEqual(search.data.users, [])
  const byName = await api('friends', me.access_token, 'POST', { handle: 'Carol QA' })
  assert.equal(byName.status, 404, 'H4: display names stay unresolvable')
})

test('user search finds by exact ID only (with or without @)', async () => {
  for (const q of ['alice_kim', '@alice_kim', 'ALICE_KIM']) {
    const r = await api(`users?q=${encodeURIComponent(q)}`, me.access_token)
    assert.equal(r.status, 200)
    assert.deepEqual((r.data.users || []).map(u => u.handle), ['alice_kim'], q)
  }
})

test('user search never matches names or partial IDs', async () => {
  for (const q of ['Alice', 'Alice Kim', 'alice', 'kim', 'ali']) {
    const r = await api(`users?q=${encodeURIComponent(q)}`, me.access_token)
    assert.deepEqual(r.data.users, [], q)
  }
})

test('the source keeps user search ID-only', () => {
  const start = source.indexOf("if (p === 'users' && method === 'GET') {")
  const block = source.slice(start, source.indexOf('return json({ users: target', start))
  assert.ok(start > 0 && block.length > 0)
  assert.doesNotMatch(block, /display_name\.toLowerCase\(\)\.includes|LOWER\(email\)|searchable_by_email|\bLIKE\b/)
  assert.match(block, /u\.role !== 'admin'/, 'admins stay hidden')
})

test('add-friend modal offers candidate search over GET /users', () => {
  const vue = readFileSync('apps/user-web/src/views/MessengerView.vue', 'utf8')
  const friends = readFileSync('apps/user-web/src/composables/useFriendsGroups.ts', 'utf8')
  assert.match(friends, /\/api\/v1\/users\?q=/)
  assert.match(friends, /addFriendResults/)
  assert.ok(vue.includes('<AddFriendModal'), 'view renders the add-friend modal')
})

test('add-friend copy does not promise phone search (no phone data exists)', () => {
  const i18n = readFileSync('apps/user-web/src/luno-i18n.ts', 'utf8')
  const descs = i18n.split('\n').filter(l => l.includes('mvAddFriendDesc'))
  assert.equal(descs.length, 4)
  for (const d of descs) assert.doesNotMatch(d, /전화|phone|โทร|電話/)
})
