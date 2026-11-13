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
  const reg = await api('auth/register', 'POST', { email, password, display_name: handle });
  assert.equal(reg.status, 201, `register ${email}`);
  const id = (await reg.json()).id;
  const login = await api('auth/login', 'POST', { email, password });
  assert.equal(login.status, 200, `login ${email}`);
  return { id, token: (await login.json()).access_token };
}

async function befriend(api, token, handle) {
  const res = await api('friends', 'POST', { handle }, token);
  assert.equal(res.status, 201, `befriend ${handle}`);
}

async function loginAs(api, email, password = 'Str0ng!Passw0rd') {
  const login = await api('auth/login', 'POST', { email, password });
  assert.equal(login.status, 200, `login ${email}`);
  const body = await login.json();
  return { id: body.user_id, token: body.access_token };
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
