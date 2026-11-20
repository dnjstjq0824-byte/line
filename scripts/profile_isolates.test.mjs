// Field report: a new profile photo / name was not visible to other users.
// Another isolate kept its cached copy of the user forever. Public profile
// fields are now re-read after a TTL (0 here).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';

let serial = 0;
async function isolate(db) {
  const mod = await import(`./cf_worker.js?profiso=${++serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', MEDIA_BUCKET: makeBucket(), PROFILE_REFRESH_MS: '0' };
  return (path, method = 'GET', body = null, token = null) => mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === null ? undefined : JSON.stringify(body),
  }), env);
}
const PW = 'Str0ng!Passw0rd';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('a profile change on one isolate reaches a peer served by another', async () => {
  const db = makeD1();
  try {
    const one = await isolate(db);
    const reg = async (email) => {
      const r = await one('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
      assert.equal(r.status, 201);
      const id = (await r.json()).id;
      const token = (await (await one('auth/login', 'POST', { email, password: PW })).json()).access_token;
      return { id, token };
    };
    const a = await reg('pf-a@luno-test.local');
    const b = await reg('pf-b@luno-test.local');
    const room = await (await one('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();

    // B's isolate caches A as "pf-a" with no photo.
    const bIso = await isolate(db);
    const before = await (await bIso('conversations', 'GET', null, b.token)).json();
    const row0 = (before.conversations || before).find((c) => c.id === room.id);
    assert.equal(row0.title, 'pf-a');

    // A changes name and photo elsewhere.
    const other = await isolate(db);
    const patched = await other('me', 'PATCH', { display_name: 'Alice New', avatar_url: PNG }, a.token);
    assert.equal(patched.status, 200, await patched.clone().text());
    const meA = await patched.json();
    assert.ok(meA.avatar_url, 'photo stored');

    const after = await (await bIso('conversations', 'GET', null, b.token)).json();
    const row1 = (after.conversations || after).find((c) => c.id === room.id);
    assert.equal(row1.title, 'Alice New');
    const peer = (row1.members || []).find((m) => m.id === a.id);
    assert.ok(peer, 'peer brief present');
    assert.equal(peer.avatar_url, meA.avatar_url);
  } finally { db.raw.close(); }
});
