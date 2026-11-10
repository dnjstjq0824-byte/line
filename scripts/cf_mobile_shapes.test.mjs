import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'

// Mobile P0 audit (2026-11-10): the app broke silently whenever the worker's
// response keys drifted from what the client reads. This pins the shapes the
// mobile parsers rely on (mobile/flutter_app/lib/util/*).

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
const login = await api('auth/login', null, 'POST', { email: 'user@luno.local', password: PW })
const token = login.data.access_token
assert.ok(token, 'demo login works')
await api('friends', token, 'POST', { handle: 'alice_kim' })
const aliceId = (await api('friends', token)).data.friends.find(f => f.display_name === 'Alice Kim').id
await api('conversations', token, 'POST', { kind: 'group', member_ids: [aliceId], title: 'shape probe room' })

test('voom list uses videos and post requires title', async () => {
  const list = await api('voom', token)
  assert.equal(list.status, 200)
  assert.ok(Array.isArray(list.data.videos), 'videos array present')
  const bad = await api('voom', token, 'POST', { body: 'no title' })
  assert.equal(bad.status, 400)
  const good = await api('voom', token, 'POST', { title: 'shape probe' })
  assert.equal(good.status, 201)
  assert.equal(good.data.title, 'shape probe')
  assert.ok(good.data.author && good.data.author.display_name, 'author brief present')
})

test('official accounts use accounts with name/description', async () => {
  const r = await api('official-accounts', token)
  assert.equal(r.status, 200)
  assert.ok(Array.isArray(r.data.accounts))
  assert.ok(r.data.accounts.length > 0, 'seeded accounts exist')
  assert.ok('name' in r.data.accounts[0] && 'description' in r.data.accounts[0])
})

test('stories carry author object and body', async () => {
  const r = await api('stories', token)
  assert.equal(r.status, 200)
  assert.ok(Array.isArray(r.data.stories))
  const post = await api('stories', token, 'POST', { body: 'shape probe story' })
  assert.equal(post.status, 201)
})

test('sync returns delta_messages and wallet send routes on to_user_id', async () => {
  const convs = await api('conversations', token)
  const dm = convs.data.conversations.find(c => c.kind === 'direct') || convs.data.conversations[0]
  const sync = await api(`conversations/${dm.id}/sync?after_sequence=0`, token)
  assert.equal(sync.status, 200)
  assert.ok(Array.isArray(sync.data.delta_messages), 'delta_messages array present')
  const friends = await api('friends', token)
  const send = await api('wallet/send', token, 'POST', { to_user_id: friends.data.friends[0].id, amount: 100 })
  assert.notEqual(send.status, 403, 'valid shape must not trip friends-only guard')
})

test('group create and translate engine state are explicit', async () => {
  const friends = await api('friends', token)
  const g = await api('conversations', token, 'POST', { kind: 'group', member_ids: [friends.data.friends[0].id], title: 'shape probe group' })
  assert.equal(g.status, 201)
  const t = await api('translate', token, 'POST', { text: 'hi', target_lang: 'ko' })
  assert.equal(t.status, 503)
  assert.equal(t.data.code, 'TRANSLATE_NOT_CONFIGURED')
})
