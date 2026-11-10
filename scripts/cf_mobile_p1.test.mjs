import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'

// Mobile P1 (2026-11-10): server shapes the new archive/album/lounge/
// profile/friend/file/QR features rely on. All green at pinning time;
// failures mean server drift, not client bugs.

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

const login = await api('auth/login', null, 'POST', { email: 'user@luno.local', password: 'LunoUser#2026!' })
const token = login.data.access_token
assert.ok(token, 'demo login works')
const me = login.data.user_id
const convs = (await api('conversations', token)).data.conversations
const dm = convs.find(c => c.kind === 'direct') || convs[0]

test('archive writes: notes events polls albums', async () => {
  const note = await api(`conversations/${dm.id}/notes`, token, 'POST', { title: 't', body: 'b' })
  assert.equal(note.status, 201)
  const ev = await api(`conversations/${dm.id}/events`, token, 'POST', { title: 't', starts_at: new Date(Date.now() + 86400000).toISOString(), location: 'here' })
  assert.equal(ev.status, 201)
  assert.ok(ev.data.id)
  const badRsvp = await api(`conversations/${dm.id}/events/${ev.data.id}/rsvp`, token, 'POST', { status: 'bogus' })
  assert.equal(badRsvp.status, 400)
  const rsvp = await api(`conversations/${dm.id}/events/${ev.data.id}/rsvp`, token, 'POST', { status: 'maybe' })
  assert.equal(rsvp.status, 200)
  const poll = await api(`conversations/${dm.id}/polls`, token, 'POST', { question: 'q?', options: ['a', 'b'] })
  assert.equal(poll.status, 201)
  const vote = await api(`polls/${poll.data.id}/vote`, token, 'POST', { option_id: poll.data.options[0].id })
  assert.equal(vote.status, 200)
  assert.equal(vote.data.status, 'voted')
  const album = await api(`conversations/${dm.id}/albums`, token, 'POST', { title: 'probe album' })
  assert.equal(album.status, 201)
  const albums = await api(`conversations/${dm.id}/albums`, token)
  assert.equal(albums.status, 200)
  assert.ok(albums.data.albums.length >= 1)
})

test('community rooms: create join posts like leave', async () => {
  const room = await api('community/rooms', token, 'POST', { name: 'probe room', description: 'd' })
  assert.equal(room.status, 201)
  const join = await api(`community/rooms/${room.data.id}/join`, token, 'POST', { nickname: 'prober' })
  assert.equal(join.status, 201)
  const post = await api(`community/rooms/${room.data.id}/posts`, token, 'POST', { body: 'hello room' })
  assert.equal(post.status, 201)
  const like = await api(`community/rooms/${room.data.id}/posts/${post.data.id}/like`, token, 'POST')
  assert.equal(like.status, 200)
  const posts = await api(`community/rooms/${room.data.id}/posts`, token)
  assert.equal(posts.status, 200)
  assert.ok(posts.data.posts.length >= 1 && posts.data.joined === true)
  const leave = await api(`community/rooms/${room.data.id}/leave`, token, 'POST')
  assert.equal(leave.status, 200)
})

test('profile patch validates fields', async () => {
  const bad = await api('me', token, 'PATCH', { birthday: '999' })
  assert.equal(bad.status, 400)
  const good = await api('me', token, 'PATCH', { display_name: 'Probe Name', status_message: 'hi', birthday: '01-02' })
  assert.equal(good.status, 200)
  const self = await api('me', token)
  assert.equal(self.data.display_name, 'Probe Name')
  assert.equal(self.data.birthday, '01-02')
  await api('me', token, 'PATCH', { display_name: 'wonsup', status_message: '', birthday: '' })
  const big = await api('me', token, 'PATCH', { avatar_url: 'data:image/png;base64,' + 'A'.repeat(400000) })
  assert.equal(big.status, 400)
})

test('friend block toggles and qr approve roundtrips', async () => {
  const friends = await api('friends', token)
  const fid = friends.data.friends[0].id
  const blk = await api(`friends/${fid}`, token, 'PATCH', { blocked: true })
  assert.equal(blk.status, 200)
  const un = await api(`friends/${fid}`, token, 'PATCH', { blocked: false })
  assert.equal(un.status, 200)
  const ch = await api('auth/qr/challenge', null, 'POST', {})
  assert.equal(ch.status, 201)
  const ap = await api('auth/qr/approve', token, 'POST', { challenge_id: ch.data.challenge_id, qr_token: ch.data.qr_token })
  assert.equal(ap.status, 200)
})

test('file attachments roundtrip and cap size', async () => {
  const b64 = Buffer.from('probe file bytes').toString('base64')
  const up = await api('attachments', token, 'POST', { conversation_id: dm.id, content_base64: b64, mime_type: 'text/plain', original_name: 'probe.txt' })
  assert.equal(up.status, 201)
  const big = await api('attachments', token, 'POST', { conversation_id: dm.id, content_base64: 'A'.repeat(2000001), mime_type: 'text/plain', original_name: 'big.txt' })
  assert.equal(big.status, 413)
})
