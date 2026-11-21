// E8 (F11): existing-feature impacts of sealed rooms — push bodies carry
// "new message" only, server search skips ciphertext, link previews need
// per-tap consent in sealed rooms, reports attach decrypted text only with
// consent, exports flag ciphertext.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeD1, F24_CONSENT } from './test_helpers.mjs';

let serial = 0;
async function isolate(db, extraEnv = {}) {
  const mod = await import(`./cf_worker.js?e8=${++serial}`);
  const env = { DB: db, DURABLE_CONVERSATIONS: 'true', ...extraEnv };
  const api = (path, method = 'GET', body = null, token = null) =>
    mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  return { api };
}
const PW = 'Str0ng!Passw0rd';
async function regLogin(api, email) {
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: email.split('@')[0] });
  assert.equal(reg.status, 201, `register ${email}`);
  const id = (await reg.json()).id;
  const token = (await (await api('auth/login', 'POST', { email, password: PW })).json()).access_token;
  return { id, token };
}
async function makeAdmin(db, email) {
  const { api } = await isolate(db);
  const reg = await api('auth/register', 'POST', { ...F24_CONSENT, email, password: PW, display_name: 'admin' });
  assert.equal(reg.status, 201);
  const id = (await reg.json()).id;
  const adm = await isolate(db, { ADMIN_USER_IDS: id });
  const token = (await (await adm.api('auth/login', 'POST', { email, password: PW })).json()).access_token;
  return { api: adm.api, token, id };
}

test('E8: sealed pushes carry "new message" only', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db, { PUSH_PROVIDER: 'log' });
    const a = await regLogin(api, 'e8p-a@luno-test.local');
    const b = await regLogin(api, 'e8p-b@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    const ct = JSON.stringify({ v: 1, secret_marker_inside_envelope: true });
    assert.equal((await api(`conversations/${room.id}/messages`, 'POST', { kind: 'ciphertext', body: ct }, a.token)).status, 201);
    const rows = db.raw.prepare('SELECT user_id, kind, body, title FROM luno_push_outbox ORDER BY id').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, b.id);
    assert.equal(rows[0].body, '새 메시지');
    assert.ok(!rows[0].body.includes('secret_marker'), 'no envelope bytes leak');
    assert.ok(rows[0].title.length > 0, 'sender name stays');
  } finally { db.raw.close(); }
});

test('E8: server search skips ciphertext, still finds plaintext', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e8s-a@luno-test.local');
    const b = await regLogin(api, 'e8s-b@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    const marker = 'zzqfindme';
    assert.equal((await api(`conversations/${room.id}/messages`, 'POST', { kind: 'ciphertext', body: JSON.stringify({ v: 1, pad: marker }) }, a.token)).status, 201);
    assert.equal((await api(`conversations/${room.id}/messages`, 'POST', { kind: 'text', body: `plain ${marker} here` }, a.token)).status, 201);
    const found = await (await api(`search?q=${marker}`, 'GET', null, b.token)).json();
    assert.ok(Array.isArray(found.messages));
    assert.ok(found.messages.every((m) => m.kind !== 'ciphertext'), 'no sealed hit');
    assert.ok(found.messages.some((m) => m.kind === 'text'), 'plaintext hit survives');
    const inRoom = await (await api(`conversations/${room.id}/search?q=${marker}`, 'GET', null, b.token)).json();
    assert.ok(Array.isArray(inRoom.messages));
    assert.ok(inRoom.messages.every((m) => m.kind !== 'ciphertext'), 'no sealed hit in-room');
    assert.ok(inRoom.messages.some((m) => m.kind === 'text'), 'plaintext hit survives in-room');
  } finally { db.raw.close(); }
});

test('E8: link preview in a sealed room needs per-tap consent', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e8l-a@luno-test.local');
    const b = await regLogin(api, 'e8l-b@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    const target = encodeURIComponent('https://preview-consent.invalid/x');
    const refused = await api(`link-preview?url=${target}&room=${room.id}`, 'GET', null, a.token);
    assert.equal(refused.status, 400);
    assert.equal((await refused.json()).code, 'PREVIEW_CONSENT_REQUIRED');
    const allowed = await api(`link-preview?url=${target}&room=${room.id}&consented=1`, 'GET', null, a.token);
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).unavailable, true);
  } finally { db.raw.close(); }
});

test('E8: reports attach sealed text only with consent, flagged for admins', async () => {
  const db = makeD1();
  try {
    const adm = await makeAdmin(db, 'e8r-admin@luno-test.local');
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e8r-a@luno-test.local');
    const b = await regLogin(api, 'e8r-b@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    const posted = await (await api(`conversations/${room.id}/messages`, 'POST', { kind: 'ciphertext', body: '{"v":1}' }, b.token)).json();
    const mid = posted.message?.id || posted.id;
    const base = { subject_user_id: b.id, category: 'spam', message_id: mid, e2ee_text: '신고자가 복호화한 내용' };
    const refused = await api('reports', 'POST', base, a.token);
    assert.equal(refused.status, 400);
    assert.equal((await refused.json()).code, 'E2EE_CONSENT_REQUIRED');
    const ok = await api('reports', 'POST', { ...base, plaintext_consent: true }, a.token);
    assert.equal(ok.status, 201);
    const rid = (await ok.json()).id;
    const mine = await (await api('reports/mine', 'GET', null, a.token)).json();
    const rep = mine.reports.find((r) => r.id === rid) || mine.reports[0];
    assert.equal(rep.e2ee_disclosed, true);
    assert.ok(rep.details.includes('신고자가 복호화한 내용'));
    const adminView = await (await adm.api('admin/reports', 'GET', null, adm.token)).json();
    const seen = adminView.reports.find((r) => r.id === rep.id);
    assert.ok(seen && seen.e2ee_disclosed === true, 'admin sees disclosure flag');
  } finally { db.raw.close(); }
});

test('E8: exports flag ciphertext and stay readable-versioned', async () => {
  const db = makeD1();
  try {
    const { api } = await isolate(db);
    const a = await regLogin(api, 'e8x-a@luno-test.local');
    const b = await regLogin(api, 'e8x-b@luno-test.local');
    const room = await (await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token)).json();
    assert.equal((await api(`conversations/${room.id}/messages`, 'POST', { kind: 'ciphertext', body: '{"v":1}' }, a.token)).status, 201);
    assert.equal((await api(`conversations/${room.id}/messages`, 'POST', { kind: 'text', body: 'hello' }, a.token)).status, 201);
    const exp = await (await api('me/export-data', 'GET', null, a.token)).json();
    assert.equal(exp.export_version, '1.2');
    assert.ok(typeof exp.e2ee_note === 'string' && exp.e2ee_note.length > 0);
    const sealed = exp.messages.find((m) => m.kind === 'ciphertext');
    assert.equal(sealed?.sealed, true);
    assert.ok(exp.messages.find((m) => m.kind === 'text' && !m.sealed), 'plaintext unflagged');
  } finally { db.raw.close(); }
});
