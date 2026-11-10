import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

// QA-P0-3: the Add Friend UI promises ID-or-email search, so existing demo
// users must be found by handle, email, and exact display name.

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

async function login(email, password) {
  const res = await api('auth/login', null, 'POST', { email, password })
  return (await res.data) || {}
}

const PW = 'T3st#Migrated2026'
await api('auth/register', null, 'POST', { email: 'user@luno.local', password: PW, display_name: 'LUNO Demo User' })
await api('auth/register', null, 'POST', { email: 'alice@luno-test.local', password: PW, display_name: 'Alice Kim', handle: 'alice_kim' })
const me = await login('user@luno.local', PW)
assert.ok(me.access_token, 'demo login works')
await api('friends', me.access_token, 'POST', { handle: 'alice_kim' })

test('add-friend finds Alice by handle (existing behavior)', async () => {
  const r = await api('friends', me.access_token, 'POST', { handle: 'alice_kim' })
  assert.equal(r.status, 200)
  assert.equal(r.data.status, 'already_friends')
})

test('add-friend by email honors searchable_by_email (private by default)', async () => {
  // Registered users are private; the old 200 was a public-seed artifact.
  const r = await api('friends', me.access_token, 'POST', { handle: 'alice@luno-test.local' })
  assert.equal(r.status, 404)
})

test('add-friend finds Alice by exact display name', async () => {
  const r = await api('friends', me.access_token, 'POST', { handle: 'Alice Kim' })
  assert.equal(r.status, 200)
  assert.equal(r.data.status, 'already_friends')
})

test('add-friend rejects partial names (no wrong-person add)', async () => {
  const r = await api('friends', me.access_token, 'POST', { handle: 'Alice' })
  assert.equal(r.status, 404)
})

test('email lookup honors searchable_by_email for ordinary users', async () => {
  const reg = await api('auth/register', null, 'POST', { email: 'carol-qa@example.test', password: 'Carol#Qa2026!', display_name: 'Carol QA' })
  assert.equal(reg.status, 201)
  const byEmail = await api('friends', me.access_token, 'POST', { handle: 'carol-qa@example.test' })
  assert.equal(byEmail.status, 404)
  const byName = await api('friends', me.access_token, 'POST', { handle: 'Carol QA' })
  assert.equal(byName.status, 201)
  assert.equal(byName.data.status, 'friend_added')
})

test('user search lists Alice for substring queries', async () => {
  const r = await api('users?q=Alice', me.access_token)
  assert.equal(r.status, 200)
  assert.ok((r.data.users || []).some(u => u.display_name === 'Alice Kim'))
})

test('add-friend modal offers candidate search over GET /users', () => {
  const vue = readFileSync('apps/user-web/src/views/MessengerView.vue', 'utf8')
  assert.match(vue, /\/api\/v1\/users\?q=/)
  assert.match(vue, /addFriendResults/)
})

test('add-friend copy does not promise phone search (no phone data exists)', () => {
  const i18n = readFileSync('apps/user-web/src/luno-i18n.ts', 'utf8')
  const descs = i18n.split('\n').filter(l => l.includes('mvAddFriendDesc'))
  assert.equal(descs.length, 4)
  for (const d of descs) assert.doesNotMatch(d, /전화|phone|โทร|電話/)
})
