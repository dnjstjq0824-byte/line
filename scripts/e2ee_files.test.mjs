// E7: sealed attachments end to end. Ciphertext bytes reach R2, the key
// rides inside a sealed message, strangers cannot download, and plaintext
// media kinds are refused in E2EE rooms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, makeBucket, F24_CONSENT } from './test_helpers.mjs';
import { E2eeStore, MemoryKV } from '../apps/user-web/src/e2ee/store.ts';
import { openFile, sealFile } from '../apps/shared/e2ee/files.ts';

let serial = 0;
async function isolate(db, bucket, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?e7=${++serial}`);
  const env = { DB: db, MEDIA_BUCKET: bucket, DURABLE_CONVERSATIONS: 'true', E2EE_ENFORCED: 'true', ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  const raw = (path, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }), env);
  return { api, raw };
}
const PW = 'Str0ng!Passw0rd';
const PLAINTEXT = 'e7-secret-file-bytes-0123456789';
async function regLogin(api, email) {
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201);
  const id = (await reg.json()).id;
  const token = (await (await api('auth/login', 'POST', { email, password: PW })).json()).access_token;
  return { id, token };
}

test('E7: sealed upload, sealed message, open download, member-only fetch', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const { api, raw } = await isolate(db, bucket);
    const a = await regLogin(api, 'e7-a@luno-test.local');
    const b = await regLogin(api, 'e7-b@luno-test.local');
    const c = await regLogin(api, 'e7-c@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    const ref = { id: room.id, kind: room.kind, memberIds: [a.id, b.id], e2ee: true };
    const mk = (u, did) => new E2eeStore({ kv: new MemoryKV(), api: (p, m, bo) => api(p, m || 'GET', bo || null, u.token).then((r) => r.json()), userId: u.id, deviceId: did });
    const sa = mk(a, 'w1');
    const sb = mk(b, 'w2');
    await sa.ready();
    await sb.ready();
    // Seal locally, upload ciphertext.
    const sealed = await sealFile(new TextEncoder().encode(PLAINTEXT));
    const up = await api('attachments', 'POST', {
      conversation_id: room.id, original_name: 'secret.txt', mime_type: 'text/plain',
      size_bytes: 32, checksum_sha256: 'x', content_base64: Buffer.from(sealed.ct, 'base64url').toString('base64'), encrypted: true,
    }, a.token);
    assert.equal(up.status, 201);
    const att = await up.json();
    assert.equal(att.encrypted, true);
    // R2 holds ciphertext, never the plaintext.
    const stored = await bucket.get(`conv/${room.id}/${att.id}`);
    const storedText = Buffer.from(await stored.arrayBuffer()).toString('utf8');
    assert.ok(!storedText.includes(PLAINTEXT), 'R2 holds ciphertext only');
    // The key rides inside a sealed message.
    const ct = await sa.encryptRoom(ref, {
      kind: 'file', body: 'secret.txt',
      meta: { attachment_id: att.id, fileKey: sealed.key, fileIv: sealed.iv, fileHash: sealed.hash, mime_type: 'text/plain', size_bytes: 32 },
    });
    assert.equal((await api(`conversations/${room.id}/messages`, 'POST', { kind: 'ciphertext', body: ct }, a.token)).status, 201);
    const got = await (await api(`conversations/${room.id}/messages?limit=5`, 'GET', null, b.token)).json();
    const wire = got.messages.find((m) => m.kind === 'ciphertext');
    const open = await sb.decryptBody(a.id, wire.body);
    assert.equal(open?.kind, 'file');
    const file = await openFile({ key: open.meta.fileKey, iv: open.meta.fileIv, hash: open.meta.fileHash, ct: sealed.ct });
    assert.equal(Buffer.from(file).toString('utf8'), PLAINTEXT);
    // Strangers cannot fetch the bytes.
    assert.equal((await raw(`attachments/${att.id}/content`, c.token)).status, 404);
    assert.equal((await raw(`attachments/${att.id}/content`, b.token)).status, 200);
    // Plaintext media is refused in the sealed room.
    const bad = await api(`conversations/${room.id}/messages`, 'POST', { kind: 'image', body: 'x' }, a.token);
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).code, 'E2EE_CIPHERTEXT_REQUIRED');
  } finally { db.raw.close(); }
});
