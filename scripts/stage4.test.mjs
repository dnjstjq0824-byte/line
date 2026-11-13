// Stage 4 (D4/D2/D3/D5/D1/D6/D7): durable data survives new isolates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeD1 } from './test_helpers.mjs';

const workerSource = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');

let stage4Serial = 0;
async function stage4Isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?stage4=${++stage4Serial}`);
  const env = { ...(db ? { DB: db } : {}), ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api, env };
}

async function registerLogin(api, email, handle, password = 'Str0ng!Passw0rd') {
  const reg = await api('auth/register', 'POST', { email, password, display_name: handle, handle });
  assert.equal(reg.status, 201, `register ${email}`);
  const id = (await reg.json()).id;
  const login = await api('auth/login', 'POST', { email, password });
  assert.equal(login.status, 200, `login ${email}`);
  return { id, token: (await login.json()).access_token };
}

async function loginAs(api, email, password = 'Str0ng!Passw0rd') {
  const login = await api('auth/login', 'POST', { email, password });
  assert.equal(login.status, 200, `login ${email}`);
  const body = await login.json();
  return { id: body.user_id, token: body.access_token };
}

async function befriend(api, token, handle) {
  assert.equal((await api('friends', 'POST', { handle }, token)).status, 201, `befriend ${handle}`);
}

async function makeRoom(api, token, memberIds, title = 'D2 Room') {
  const res = await api('conversations', 'POST', { kind: 'group', title, member_ids: memberIds }, token);
  assert.equal(res.status, 201, 'room created');
  return (await res.json()).id;
}

let d2MsgSerial = 0;
async function sendMsg(api, token, cid, body) {
  const res = await api(`conversations/${cid}/messages`, 'POST', { client_id: `d2-${++d2MsgSerial}-${Date.now()}`, body }, token);
  assert.equal(res.status, 201, 'message sent');
  return (await res.json()).message;
}

// ---------- D4: feed, stories, VOOM, openchat ----------

test('D4: timeline posts, comments and likes survive a new isolate', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db);
    const a = await registerLogin(first.api, 'd4-ta@luno-test.local', 'd4_ta');
    const b = await registerLogin(first.api, 'd4-tb@luno-test.local', 'd4_tb');
    await registerLogin(first.api, 'd4-tc@luno-test.local', 'd4_tc');
    await befriend(first.api, a.token, 'd4_tb');
    const post = await (await first.api('timeline', 'POST', { body: 'hello feed', bg: '#112233' }, a.token)).json();
    assert.equal((await first.api(`timeline/${post.id}/like`, 'POST', {}, b.token)).status, 200);
    assert.equal((await first.api(`timeline/${post.id}/comments`, 'POST', { body: 'nice!' }, b.token)).status, 201);
    await first.api('timeline', 'POST', { body: 'private', visibility: 'me' }, a.token);
    const second = await stage4Isolate(db);
    const b2 = await loginAs(second.api, 'd4-tb@luno-test.local');
    const feed = await (await second.api('timeline', 'GET', null, b2.token)).json();
    assert.equal(feed.posts.length, 1, 'friend sees the friends post, not the me-only one');
    assert.equal(feed.posts[0].body, 'hello feed');
    assert.equal(feed.posts[0].like_count, 1);
    assert.equal(feed.posts[0].liked, true);
    assert.equal(feed.posts[0].comments.length, 1);
    assert.equal(feed.posts[0].comments[0].body, 'nice!');
    assert.ok(feed.posts[0].author && feed.posts[0].author.display_name, 'author brief kept');
    const c2 = await loginAs(second.api, 'd4-tc@luno-test.local');
    assert.deepEqual((await (await second.api('timeline', 'GET', null, c2.token)).json()).posts, [], 'non-friend sees nothing');
    assert.equal((await second.api(`timeline/${post.id}`, 'DELETE', null, b2.token)).status, 403, 'deleting others is 403');
    const a2 = await loginAs(second.api, 'd4-ta@luno-test.local');
    assert.equal((await second.api(`timeline/${post.id}`, 'DELETE', null, a2.token)).status, 200);
    const third = await stage4Isolate(db);
    const a3 = await loginAs(third.api, 'd4-ta@luno-test.local');
    assert.deepEqual((await (await third.api('timeline', 'GET', null, a3.token)).json()).posts.map((p) => p.id).filter((id) => id === post.id), [], 'delete sticks');
  } finally { db.raw.close(); }
});

test('D4: stories persist, track views, hide after 24h, purge after 7d', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db);
    const a = await registerLogin(first.api, 'd4-sa@luno-test.local', 'd4_sa');
    const b = await registerLogin(first.api, 'd4-sb@luno-test.local', 'd4_sb');
    await befriend(first.api, a.token, 'd4_sb');
    const s = await (await first.api('stories', 'POST', { body: 'day one', bg: '#445566' }, a.token)).json();
    assert.equal((await first.api(`stories/${s.id}/view`, 'POST', {}, b.token)).status, 200);
    const second = await stage4Isolate(db);
    const b2 = await loginAs(second.api, 'd4-sb@luno-test.local');
    const feedB = await (await second.api('stories', 'GET', null, b2.token)).json();
    assert.equal(feedB.stories.length, 1);
    assert.equal(feedB.stories[0].viewed, true);
    assert.equal(feedB.stories[0].view_count, undefined, 'view count hidden from others');
    const a2 = await loginAs(second.api, 'd4-sa@luno-test.local');
    const feedA = await (await second.api('stories', 'GET', null, a2.token)).json();
    assert.equal(feedA.stories[0].view_count, 1, 'owner sees the view count');
    db.raw.prepare('UPDATE luno_stories SET created_at = ? WHERE id = ?').run(new Date(Date.now() - 25 * 3600 * 1000).toISOString(), s.id);
    assert.deepEqual((await (await second.api('stories', 'GET', null, b2.token)).json()).stories, [], '24h story hidden');
    db.raw.prepare('UPDATE luno_stories SET created_at = ? WHERE id = ?').run(new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(), s.id);
    await second.api('stories', 'POST', { body: 'fresh' }, a2.token);
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM luno_stories WHERE id = ?').get(s.id).n, 0, '7d story purged on write');
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM luno_story_views WHERE story_id = ?').get(s.id).n, 0, 'orphan views purged');
  } finally { db.raw.close(); }
});

test('D4: voom posts, likes and comments survive a new isolate', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db);
    const a = await registerLogin(first.api, 'd4-va@luno-test.local', 'd4_va');
    const b = await registerLogin(first.api, 'd4-vb@luno-test.local', 'd4_vb');
    const v1 = await (await first.api('voom', 'POST', { title: 'clip one', emoji: '🎬' }, a.token)).json();
    const v2 = await (await first.api('voom', 'POST', { title: 'clip two' }, a.token)).json();
    assert.notEqual(v1.bg, v2.bg, 'background rotation kept');
    assert.equal((await first.api(`voom/${v1.id}/like`, 'POST', {}, b.token)).status, 200);
    assert.equal((await first.api(`voom/${v1.id}/comments`, 'POST', { body: 'lol' }, b.token)).status, 201);
    const second = await stage4Isolate(db);
    const b2 = await loginAs(second.api, 'd4-vb@luno-test.local');
    const list = await (await second.api('voom', 'GET', null, b2.token)).json();
    assert.ok(Array.isArray(list.videos) && list.videos.length === 2, 'both clips listed');
    const clip = list.videos.find((v) => v.id === v1.id);
    assert.equal(clip.like_count, 1);
    assert.equal(clip.liked, true);
    assert.equal(clip.comments.length, 1);
    assert.equal(clip.comments[0].body, 'lol');
    assert.ok(clip.author && clip.author.display_name, 'author brief kept');
  } finally { db.raw.close(); }
});

test('D4: openchat rooms, membership, posts and likes survive a new isolate', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db);
    const a = await registerLogin(first.api, 'd4-ca@luno-test.local', 'd4_ca');
    const b = await registerLogin(first.api, 'd4-cb@luno-test.local', 'd4_cb');
    const room = await (await first.api('community/rooms', 'POST', { name: 'Lounge 4', description: 'durable', nickname: 'Ali' }, a.token)).json();
    assert.equal((await first.api(`community/rooms/${room.id}/join`, 'POST', { nickname: 'Bee' }, b.token)).status, 201);
    const post = await (await first.api(`community/rooms/${room.id}/posts`, 'POST', { body: 'hello room' }, a.token)).json();
    assert.equal(post.author_name, 'Ali', 'author nickname kept');
    assert.equal((await first.api(`community/rooms/${room.id}/posts/${post.id}/like`, 'POST', {}, b.token)).status, 200);
    const second = await stage4Isolate(db);
    const b2 = await loginAs(second.api, 'd4-cb@luno-test.local');
    const rooms = await (await second.api('community/rooms', 'GET', null, b2.token)).json();
    const found = rooms.rooms.find((r) => r.id === room.id);
    assert.ok(found, 'room listed on a new isolate');
    assert.equal(found.member_count, 2);
    assert.equal(found.joined, true);
    const filtered = await (await second.api('community/rooms?q=lounge', 'GET', null, b2.token)).json();
    assert.ok(filtered.rooms.some((r) => r.id === room.id), 'search finds the room');
    const posts = await (await second.api(`community/rooms/${room.id}/posts`, 'GET', null, b2.token)).json();
    assert.equal(posts.posts.length, 1);
    assert.equal(posts.posts[0].likes, 1);
    assert.equal(posts.posts[0].liked, true);
    assert.equal(posts.joined, true);
    assert.equal(posts.nickname, 'Bee');
    assert.equal((await second.api('community/rooms/no-such-room/posts', 'GET', null, b2.token)).status, 404);
    assert.equal((await second.api('community/rooms/no-such-room/join', 'POST', {}, b2.token)).status, 404);
    assert.equal((await second.api(`community/rooms/${room.id}/posts/${post.id}/like`, 'POST', {}, b2.token)).status, 200);
    const unliked = await (await second.api(`community/rooms/${room.id}/posts`, 'GET', null, b2.token)).json();
    assert.equal(unliked.posts[0].likes, 0, 'like toggles off');
  } finally { db.raw.close(); }
});

test('D4: social endpoints fail closed without a database', async () => {
  const { api } = await stage4Isolate(null);
  const me = await registerLogin(api, 'd4-nodb@luno-test.local', 'd4_nodb');
  for (const [path, method, body] of [['timeline', 'GET'], ['timeline', 'POST', { body: 'x' }], ['stories', 'GET'], ['voom', 'GET'], ['community/rooms', 'GET']]) {
    assert.equal((await api(path, method, body || null, me.token)).status, 501, `${method} ${path}`);
  }
});

test('D4: the six social memory stores are gone; one community impl remains', () => {
  for (const name of ['timelinePosts', 'voomPosts', 'storyStore', 'communityRooms', 'communityPosts', 'roomMembers']) {
    assert.ok(!new RegExp(`^(?:const|let) ${name} =`, 'm').test(workerSource), `${name} store removed`);
  }
  const communityRoutes = workerSource.match(/p === 'community\/rooms'/g) || [];
  assert.equal(communityRoutes.length, 1, 'single community/rooms handler');
});

// ---------- D2: conversation extras ----------
// Rooms themselves go durable in D1; these tests enable the durable flag so a
// new isolate can reach the same room (test_helpers makeD1 ships the table).
const DURABLE = { DURABLE_CONVERSATIONS: 'true' };

test('D2: reactions survive a new isolate and toggle off', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db, DURABLE);
    const a = await registerLogin(first.api, 'd2-ra@luno-test.local', 'd2_ra');
    const b = await registerLogin(first.api, 'd2-rb@luno-test.local', 'd2_rb');
    const cid = await makeRoom(first.api, a.token, [b.id]);
    const msg = await sendMsg(first.api, a.token, cid, 'react to this');
    assert.equal((await first.api(`conversations/${cid}/messages/${msg.id}/reactions`, 'POST', { reaction: '❤️' }, b.token)).status, 201);
    const second = await stage4Isolate(db, DURABLE);
    const b2 = await loginAs(second.api, 'd2-rb@luno-test.local');
    const list = await (await second.api(`conversations/${cid}/messages`, 'GET', null, b2.token)).json();
    const found = list.messages.find((m) => m.id === msg.id);
    assert.deepEqual(found.reactions, { '❤️': 1 });
    assert.deepEqual(found.my_reactions, ['❤️']);
    assert.equal((await second.api(`conversations/${cid}/messages/${msg.id}/reactions`, 'POST', { reaction: '❤️' }, b2.token)).status, 200);
    const third = await stage4Isolate(db, DURABLE);
    const b3 = await loginAs(third.api, 'd2-rb@luno-test.local');
    const relist = await (await third.api(`conversations/${cid}/messages`, 'GET', null, b3.token)).json();
    assert.deepEqual(relist.messages.find((m) => m.id === msg.id).reactions, {});
  } finally { db.raw.close(); }
});

test('D2: pins survive a new isolate; unsend clears them', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db, DURABLE);
    const a = await registerLogin(first.api, 'd2-pa@luno-test.local', 'd2_pa');
    const b = await registerLogin(first.api, 'd2-pb@luno-test.local', 'd2_pb');
    const cid = await makeRoom(first.api, a.token, [b.id]);
    const msg = await sendMsg(first.api, a.token, cid, 'pin this hello world message');
    assert.equal((await first.api(`conversations/${cid}/pins`, 'POST', { message_id: msg.id }, b.token)).status, 201);
    const second = await stage4Isolate(db, DURABLE);
    const b2 = await loginAs(second.api, 'd2-pb@luno-test.local');
    const pins = await (await second.api(`conversations/${cid}/pins`, 'GET', null, b2.token)).json();
    assert.equal(pins.pins.length, 1);
    assert.equal(pins.pins[0].message_id, msg.id);
    assert.ok(pins.pins[0].body.includes('pin this'), 'pin carries the message body');
    assert.equal((await second.api(`conversations/${cid}/pins/${msg.id}`, 'DELETE', null, b2.token)).status, 200);
    const third = await stage4Isolate(db, DURABLE);
    const b3 = await loginAs(third.api, 'd2-pb@luno-test.local');
    assert.deepEqual((await (await third.api(`conversations/${cid}/pins`, 'GET', null, b3.token)).json()).pins, []);
    const msg2 = await sendMsg(third.api, (await loginAs(third.api, 'd2-pa@luno-test.local')).token, cid, 'doomed pin');
    await third.api(`conversations/${cid}/pins`, 'POST', { message_id: msg2.id }, b3.token);
    const a3 = await loginAs(third.api, 'd2-pa@luno-test.local');
    assert.equal((await third.api(`conversations/${cid}/messages/${msg2.id}`, 'DELETE', null, a3.token)).status, 200);
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM luno_pins WHERE message_id = ?').get(msg2.id).n, 0, 'unsend clears the pin row');
  } finally { db.raw.close(); }
});

test('D2: polls, votes and close survive a new isolate', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db, DURABLE);
    const a = await registerLogin(first.api, 'd2-pla@luno-test.local', 'd2_pla');
    const b = await registerLogin(first.api, 'd2-plb@luno-test.local', 'd2_plb');
    const cid = await makeRoom(first.api, a.token, [b.id]);
    const poll = await (await first.api(`conversations/${cid}/polls`, 'POST', { question: 'lunch?', options: ['a', 'b'] }, a.token)).json();
    assert.equal((await first.api(`polls/${poll.id}/vote`, 'POST', { option_id: 'opt-0' }, b.token)).status, 200);
    const second = await stage4Isolate(db, DURABLE);
    const b2 = await loginAs(second.api, 'd2-plb@luno-test.local');
    const list = await (await second.api(`conversations/${cid}/polls`, 'GET', null, b2.token)).json();
    assert.equal(list.polls.length, 1);
    assert.equal(list.polls[0].options[0].votes, 1);
    assert.equal(list.polls[0].options[0].voted, true);
    assert.equal(list.polls[0].total_voters, 1);
    assert.equal((await second.api(`polls/${poll.id}/vote`, 'POST', { option_id: 'opt-1' }, b2.token)).status, 200);
    const third = await stage4Isolate(db, DURABLE);
    const b3 = await loginAs(third.api, 'd2-plb@luno-test.local');
    const switched = await (await third.api(`conversations/${cid}/polls`, 'GET', null, b3.token)).json();
    assert.equal(switched.polls[0].options[0].votes, 0, 'single-choice vote moves');
    assert.equal(switched.polls[0].options[1].votes, 1);
    const a3 = await loginAs(third.api, 'd2-pla@luno-test.local');
    assert.equal((await third.api(`polls/${poll.id}/vote`, 'POST', { option_id: 'opt-1' }, a3.token)).status, 200);
    assert.equal((await third.api(`polls/${poll.id}/close`, 'POST', {}, b3.token)).status, 403, 'only the creator closes');
    assert.equal((await third.api(`polls/${poll.id}/close`, 'POST', {}, a3.token)).status, 200);
    const fourth = await stage4Isolate(db, DURABLE);
    const b4 = await loginAs(fourth.api, 'd2-plb@luno-test.local');
    const closed = await (await fourth.api(`conversations/${cid}/polls`, 'GET', null, b4.token)).json();
    assert.equal(closed.polls[0].closed, true, 'close sticks');
  } finally { db.raw.close(); }
});

test('D2: notes survive a new isolate with author/owner delete rules', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db, DURABLE);
    const a = await registerLogin(first.api, 'd2-na@luno-test.local', 'd2_na');
    const b = await registerLogin(first.api, 'd2-nb@luno-test.local', 'd2_nb');
    const cid = await makeRoom(first.api, a.token, [b.id]);
    const note = await (await first.api(`conversations/${cid}/notes`, 'POST', { title: 'plan', body: 'v1' }, b.token)).json();
    const second = await stage4Isolate(db, DURABLE);
    const a2 = await loginAs(second.api, 'd2-na@luno-test.local');
    const notes = await (await second.api(`conversations/${cid}/notes`, 'GET', null, a2.token)).json();
    assert.equal(notes.notes.length, 1);
    assert.equal(notes.notes[0].title, 'plan');
    assert.ok(notes.notes[0].author && notes.notes[0].author.display_name, 'author brief kept');
    const c = await registerLogin(second.api, 'd2-nc@luno-test.local', 'd2_nc');
    await befriend(second.api, c.token, 'd2_na');
    const cid2 = await makeRoom(second.api, c.token, [a2.id]);
    assert.equal((await second.api(`conversations/${cid2}/notes/${note.id}`, 'DELETE', null, c.token)).status, 404, 'cross-room delete misses');
    assert.equal((await second.api(`conversations/${cid}/notes/${note.id}`, 'DELETE', null, a2.token)).status, 200, 'room owner deletes');
    const third = await stage4Isolate(db, DURABLE);
    const b3 = await loginAs(third.api, 'd2-nb@luno-test.local');
    assert.deepEqual((await (await third.api(`conversations/${cid}/notes`, 'GET', null, b3.token)).json()).notes, []);
  } finally { db.raw.close(); }
});

test('D2: events and rsvps survive a new isolate', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db, DURABLE);
    const a = await registerLogin(first.api, 'd2-ea@luno-test.local', 'd2_ea');
    const b = await registerLogin(first.api, 'd2-eb@luno-test.local', 'd2_eb');
    const cid = await makeRoom(first.api, a.token, [b.id]);
    const starts = new Date(Date.now() + 86400000).toISOString();
    const ev = await (await first.api(`conversations/${cid}/events`, 'POST', { title: 'offsite', starts_at: starts, location: 'jeju' }, a.token)).json();
    assert.equal((await first.api(`conversations/${cid}/events/${ev.id}/rsvp`, 'POST', { status: 'maybe' }, b.token)).status, 200);
    const second = await stage4Isolate(db, DURABLE);
    const b2 = await loginAs(second.api, 'd2-eb@luno-test.local');
    const list = await (await second.api(`conversations/${cid}/events`, 'GET', null, b2.token)).json();
    assert.equal(list.events.length, 1);
    assert.equal(list.events[0].title, 'offsite');
    assert.equal(list.events[0].my_rsvp, 'maybe');
    assert.deepEqual(list.events[0].rsvps, { [a.id]: 'going', [b.id]: 'maybe' });
    assert.ok(list.events[0].creator && list.events[0].creator.display_name, 'creator brief kept');
  } finally { db.raw.close(); }
});

test('D2: albums survive a new isolate', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db, DURABLE);
    const a = await registerLogin(first.api, 'd2-aa@luno-test.local', 'd2_aa');
    const b = await registerLogin(first.api, 'd2-ab@luno-test.local', 'd2_ab');
    const cid = await makeRoom(first.api, a.token, [b.id]);
    const album = await (await first.api(`conversations/${cid}/albums`, 'POST', { title: 'trip' }, a.token)).json();
    assert.equal(db.raw.prepare('SELECT created_by AS c FROM albums WHERE id = ?').get(album.id).c, a.id, 'album author stored');
    const second = await stage4Isolate(db, DURABLE);
    const b2 = await loginAs(second.api, 'd2-ab@luno-test.local');
    const list = await (await second.api(`conversations/${cid}/albums`, 'GET', null, b2.token)).json();
    assert.equal(list.albums.length, 1);
    assert.equal(list.albums[0].title, 'trip');
    assert.equal(list.albums[0].created_by, a.id);
  } finally { db.raw.close(); }
});

test('D2: hidden messages stay hidden on a new isolate', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db, DURABLE);
    const a = await registerLogin(first.api, 'd2-ha@luno-test.local', 'd2_ha');
    const b = await registerLogin(first.api, 'd2-hb@luno-test.local', 'd2_hb');
    const cid = await makeRoom(first.api, a.token, [b.id]);
    const msg = await sendMsg(first.api, a.token, cid, 'hide me');
    assert.equal((await first.api(`conversations/${cid}/messages/${msg.id}/hide`, 'POST', {}, b.token)).status, 200);
    const second = await stage4Isolate(db, DURABLE);
    const b2 = await loginAs(second.api, 'd2-hb@luno-test.local');
    const list = await (await second.api(`conversations/${cid}/messages`, 'GET', null, b2.token)).json();
    assert.ok(!list.messages.some((m) => m.id === msg.id), 'hidden message filtered');
    const a2 = await loginAs(second.api, 'd2-ha@luno-test.local');
    const lista = await (await second.api(`conversations/${cid}/messages`, 'GET', null, a2.token)).json();
    assert.ok(lista.messages.some((m) => m.id === msg.id), 'other members unaffected');
  } finally { db.raw.close(); }
});

test('D3: money-in stays 503 without a verified provider', async () => {
  const db = makeD1();
  try {
    const { api } = await stage4Isolate(db);
    const a = await registerLogin(api, 'd3-gate@luno-test.local', 'd3_gate');
    assert.equal((await api('wallet/charge', 'POST', { amount: 10000 }, a.token)).status, 503);
    assert.equal((await api('store/orders', 'POST', { pack_id: 'pack-1' }, a.token)).status, 503);
  } finally { db.raw.close(); }
});

test('D3: balances and transactions survive a new isolate', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db);
    const a = await registerLogin(first.api, 'd3-wa@luno-test.local', 'd3_wa');
    const b = await registerLogin(first.api, 'd3-wb@luno-test.local', 'd3_wb');
    await befriend(first.api, a.token, 'd3_wb');
    // Money-in is 503-gated, so the balance is seeded the way a provider
    // settlement would; wallet/send (reachable) moves it afterwards.
    db.raw.prepare('UPDATE wallets SET balance = 10000 WHERE user_id = ?').run(a.id);
    assert.equal((await first.api('wallet/send', 'POST', { to_user_id: b.id, amount: 2000, note: 'lunch' }, a.token)).status, 201);
    const second = await stage4Isolate(db);
    const a2 = await loginAs(second.api, 'd3-wa@luno-test.local');
    const wa = await (await second.api('wallet', 'GET', null, a2.token)).json();
    assert.equal(wa.balance, 8000);
    assert.equal(wa.transactions.length, 1);
    assert.equal(wa.transactions[0].type, 'send');
    assert.equal(wa.transactions[0].amount, -2000);
    assert.equal(wa.transactions[0].note, 'lunch');
    const b2 = await loginAs(second.api, 'd3-wb@luno-test.local');
    const wb = await (await second.api('wallet', 'GET', null, b2.token)).json();
    assert.equal(wb.balance, 2000);
    assert.equal(wb.transactions[0].type, 'receive');
    assert.equal(wb.transactions[0].amount, 2000);
    assert.equal(wb.transactions[0].counterparty, 'd3_wa', 'receiver sees the sender');
    assert.equal(wa.transactions[0].counterparty, 'd3_wb', 'sender sees the receiver');
    assert.equal(db.raw.prepare('SELECT balance AS b FROM wallets WHERE user_id = ?').get(a.id).b, 8000, 'D1 balance is truth');
  } finally { db.raw.close(); }
});

test('D3: owned packs and themes survive a new isolate', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db);
    const a = await registerLogin(first.api, 'd3-sa@luno-test.local', 'd3_sa');
    // Orders stay 503-gated, so ownership rows are seeded the way a future
    // provider settlement would; the read path is what this pins.
    db.raw.prepare('INSERT INTO luno_owned_items (user_id, item_type, item_id) VALUES (?, ?, ?)').run(a.id, 'pack', 'pack-1');
    db.raw.prepare('INSERT INTO luno_owned_items (user_id, item_type, item_id) VALUES (?, ?, ?)').run(a.id, 'theme', 'sunset');
    const second = await stage4Isolate(db);
    const a2 = await loginAs(second.api, 'd3-sa@luno-test.local');
    const packs = await (await second.api('store/stickers', 'GET', null, a2.token)).json();
    assert.equal(packs.packs.find((p) => p.id === 'pack-1').owned, true);
    assert.equal(packs.packs.find((p) => p.id === 'basic').owned, true, 'default pack kept');
    assert.equal(packs.packs.find((p) => p.id === 'pack-2').owned, false);
    const themes = await (await second.api('store/themes', 'GET', null, a2.token)).json();
    assert.equal(themes.themes.find((t) => t.id === 'sunset').owned, true);
    assert.equal(themes.themes.find((t) => t.id === 'mint').owned, true, 'free themes kept');
  } finally { db.raw.close(); }
});

test('D3: wallet keeps working without a database', async () => {
  const { api } = await stage4Isolate(null);
  const a = await registerLogin(api, 'd3-ma@luno-test.local', 'd3_ma');
  const b = await registerLogin(api, 'd3-mb@luno-test.local', 'd3_mb');
  await befriend(api, a.token, 'd3_mb');
  const w0 = await (await api('wallet', 'GET', null, a.token)).json();
  assert.equal(w0.balance, 0, 'fresh wallet starts at zero');
  assert.equal((await api('wallet/send', 'POST', { to_user_id: b.id, amount: 1000 }, a.token)).status, 402, 'overdraft rejected');
  assert.equal((await api('wallet/charge', 'POST', { amount: 5000 }, a.token)).status, 503, 'charge gated without a provider');
});

// ---------- D5: call logs, push tokens, settings ----------

test('D5: ended calls record call_logs and stay listed on a new isolate', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db, DURABLE);
    const a = await registerLogin(first.api, 'd5-ca@luno-test.local', 'd5_ca');
    const b = await registerLogin(first.api, 'd5-cb@luno-test.local', 'd5_cb');
    const cid = await makeRoom(first.api, a.token, [b.id], 'D5 Call Room');
    const call = await (await first.api('calls', 'POST', { conversation_id: cid, kind: 'voice' }, a.token)).json();
    assert.equal((await first.api(`calls/${call.id}/state`, 'POST', { state: 'connected' }, b.token)).status, 200);
    const ended = await (await first.api(`calls/${call.id}/state`, 'POST', { state: 'ended' }, a.token)).json();
    assert.equal(ended.result, 'completed');
    const row = db.raw.prepare('SELECT * FROM call_logs WHERE id = ?').get(call.id);
    assert.ok(row, 'call_logs row recorded');
    assert.equal(row.caller_id, a.id);
    assert.equal(row.status, 'completed');
    const second = await stage4Isolate(db, DURABLE);
    const a2 = await loginAs(second.api, 'd5-ca@luno-test.local');
    const list = await (await second.api('calls', 'GET', null, a2.token)).json();
    assert.ok(list.calls.some((c) => c.conversation_id === cid && c.result === 'completed'), 'ended call still listed');
  } finally { db.raw.close(); }
});

test('D5: push token registration persists without sending', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db);
    const a = await registerLogin(first.api, 'd5-pa@luno-test.local', 'd5_pa');
    assert.equal((await first.api('push-tokens', 'POST', { token: 'fcm-probe-token', platform: 'android', device_id: 'dev-1' }, a.token)).status, 201);
    const row = db.raw.prepare('SELECT * FROM push_tokens WHERE user_id = ?').get(a.id);
    assert.ok(row, 'push_tokens row recorded');
    assert.equal(row.token, 'fcm-probe-token');
    assert.equal(row.platform, 'android');
    assert.equal((await first.api('push-tokens', 'DELETE', null, a.token)).status, 200);
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM push_tokens WHERE user_id = ?').get(a.id).n, 0, 'clear removes rows');
  } finally { db.raw.close(); }
});

test('D5: settings survive a new isolate', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db);
    const a = await registerLogin(first.api, 'd5-sa@luno-test.local', 'd5_sa');
    const patched = await (await first.api('me/settings', 'PATCH', { dark_mode: true, language: 'en', notifications: false }, a.token)).json();
    assert.equal(patched.dark_mode, true);
    const second = await stage4Isolate(db);
    const a2 = await loginAs(second.api, 'd5-sa@luno-test.local');
    const prefs = await (await second.api('me/settings', 'GET', null, a2.token)).json();
    assert.equal(prefs.dark_mode, true);
    assert.equal(prefs.language, 'en');
    assert.equal(prefs.notifications, false);
    assert.equal(prefs.theme, 'mint', 'untouched defaults kept');
  } finally { db.raw.close(); }
});

// ---------- D1: rooms and members durable (demo excluded) ----------

test('D1: demo rooms never reach the durable tables', async () => {
  const db = makeD1();
  try {
    const demo = await stage4Isolate(db, { DEMO_MODE: 'true', DURABLE_CONVERSATIONS: 'true' });
    const a = await registerLogin(demo.api, 'd1-demo@luno-test.local', 'd1_demo');
    const created = await demo.api('conversations', 'POST', { kind: 'group', title: 'Peer Room', member_ids: ['peer-k'] }, a.token);
    assert.equal(created.status, 201, 'peer room still created via memory fallback');
    const room = await created.json();
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM luno_conversations WHERE id = ?').get(room.id).n, 0, 'peer room not durable');
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM luno_conversation_members WHERE user_id LIKE 'peer-%'").get().n, 0, 'no peer members durable');
    const convos = await (await demo.api('conversations', 'GET', null, a.token)).json();
    assert.ok(convos.conversations.length > 1, 'demo rooms listed');
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM luno_conversations').get().n, 0, 'seeded demo rooms never durable');
  } finally { db.raw.close(); }
});

test('D1: peer invites to durable rooms are skipped without FK errors', async () => {
  const db = makeD1();
  try {
    const demo = await stage4Isolate(db, { DEMO_MODE: 'true', DURABLE_CONVERSATIONS: 'true' });
    const a = await registerLogin(demo.api, 'd1-ia@luno-test.local', 'd1_ia');
    const b = await registerLogin(demo.api, 'd1-ib@luno-test.local', 'd1_ib');
    const cid = await makeRoom(demo.api, a.token, [b.id], 'Durable Room');
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM luno_conversations WHERE id = ?').get(cid).n, 1, 'real room is durable');
    const res = await demo.api(`conversations/${cid}/members`, 'POST', { member_ids: ['peer-k'] }, a.token);
    assert.equal(res.status, 400, 'peer invite adds nothing');
    assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM luno_conversation_members WHERE conversation_id = ?').get(cid).n, 2, 'membership unchanged');
    assert.equal(db.raw.prepare('PRAGMA foreign_key_check').all().length, 0, 'no FK violations');
  } finally { db.raw.close(); }
});

test('D2: keep vault survives a new isolate per user', async () => {
  const db = makeD1();
  try {
    const first = await stage4Isolate(db);
    const a = await registerLogin(first.api, 'd2-ka@luno-test.local', 'd2_ka');
    const b = await registerLogin(first.api, 'd2-kb@luno-test.local', 'd2_kb');
    const saved = await (await first.api('saved-messages', 'POST', { body: 'remember this', kind: 'text' }, a.token)).json();
    const second = await stage4Isolate(db);
    const a2 = await loginAs(second.api, 'd2-ka@luno-test.local');
    const mine = await (await second.api('saved-messages', 'GET', null, a2.token)).json();
    assert.equal(mine.saved_messages.length, 1);
    assert.equal(mine.saved_messages[0].body, 'remember this');
    assert.equal(mine.saved_messages[0].kind, 'text');
    const b2 = await loginAs(second.api, 'd2-kb@luno-test.local');
    assert.deepEqual((await (await second.api('saved-messages', 'GET', null, b2.token)).json()).saved_messages, [], 'vault is per user');
    assert.equal((await second.api(`saved-messages/${saved.id}`, 'DELETE', null, b2.token)).status, 200, 'delete is idempotent across users');
    assert.deepEqual((await (await second.api('saved-messages', 'GET', null, a2.token)).json()).saved_messages.length, 1, 'other user delete removes nothing');
    assert.equal((await second.api(`saved-messages/${saved.id}`, 'DELETE', null, a2.token)).status, 200);
    const third = await stage4Isolate(db);
    const a3 = await loginAs(third.api, 'd2-ka@luno-test.local');
    assert.deepEqual((await (await third.api('saved-messages', 'GET', null, a3.token)).json()).saved_messages, []);
  } finally { db.raw.close(); }
});
