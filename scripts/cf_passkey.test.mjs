import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, createSign, createHash, randomBytes } from 'node:crypto';

const source = await readFile(new URL('./cf_worker.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

async function api(path, token, method = 'GET', body) {
  return worker.fetch(new Request(`http://localhost/api/v1/${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { ALLOW_LOCAL_DEMO: 'true' });
}

async function login(email, password) {
  await api('auth/register', null, 'POST', { email, password, display_name: email.split('@')[0] });
  return (await (await api('auth/login', null, 'POST', { email, password })).json()).access_token;
}

// --- Virtual authenticator (mirrors the Go fixtures) ---
const b64e = (b) => Buffer.from(b).toString('base64url');

function cborHead(major, n) {
  if (n < 24) return [major << 5 | n];
  if (n < 256) return [major << 5 | 24, n];
  if (n < 65536) return [major << 5 | 25, (n >> 8) & 255, n & 255];
  return [major << 5 | 26, (n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const cborInt = (n) => (n >= 0 ? cborHead(0, n) : cborHead(1, -1 - n));
const cborBytes = (b) => [...cborHead(2, b.length), ...new Uint8Array(b)];
const cborText = (s) => {
  const b = new TextEncoder().encode(s);
  return [...cborHead(3, b.length), ...b];
};

function makeCredential() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const x = new Uint8Array(Buffer.from(jwk.x, 'base64url'));
  const y = new Uint8Array(Buffer.from(jwk.y, 'base64url'));
  const credId = new Uint8Array(randomBytes(32));
  const cose = Uint8Array.from([
    ...cborHead(5, 5),
    ...cborInt(1), ...cborInt(2),
    ...cborInt(3), ...cborInt(-7),
    ...cborInt(-1), ...cborInt(1),
    ...cborInt(-2), ...cborBytes(x),
    ...cborInt(-3), ...cborBytes(y),
  ]);
  const rpHash = createHash('sha256').update('localhost').digest();
  const authData = Buffer.concat([
    rpHash,
    Buffer.from([0x41, 0, 0, 0, 0]),
    Buffer.alloc(16),
    Buffer.from([(credId.length >> 8) & 255, credId.length & 255]),
    credId,
    cose,
  ]);
  return { privateKey, credId, authData: new Uint8Array(authData) };
}

function clientData(challenge, origin = 'http://localhost') {
  return new TextEncoder().encode(JSON.stringify({ type: 'webauthn.create', challenge, origin }));
}

function attestationNone(authData) {
  return Uint8Array.from([
    ...cborHead(5, 3),
    ...cborText('fmt'), ...cborText('none'),
    ...cborText('authData'), ...cborBytes(authData),
    ...cborText('attStmt'), ...cborHead(5, 0),
  ]);
}

function attestationPacked(cred, clientDataBytes, extraStmt = []) {
  const cdHash = createHash('sha256').update(clientDataBytes).digest();
  const sig = createSign('sha256').update(Buffer.concat([cred.authData, cdHash])).sign(cred.privateKey);
  return Uint8Array.from([
    ...cborHead(5, 3),
    ...cborText('fmt'), ...cborText('packed'),
    ...cborText('authData'), ...cborBytes(cred.authData),
    ...cborText('attStmt'), ...cborHead(5, 2 + extraStmt.length / 2),
    ...cborText('alg'), ...cborInt(-7),
    ...cborText('sig'), ...cborBytes(new Uint8Array(sig)),
    ...extraStmt,
  ]);
}

function finishBody(cred, clientDataBytes, attObj) {
  return {
    id: b64e(cred.credId),
    rawId: b64e(cred.credId),
    type: 'public-key',
    response: {
      clientDataJSON: b64e(clientDataBytes),
      attestationObject: b64e(attObj),
    },
  };
}

test('passkey registration with none attestation', async () => {
  const alice = await login('alice@luno-test.local', 'Alice#Migrated2026!');
  const begun = await (await api('passkeys/register/begin', alice, 'POST')).json();
  const pk = begun.publicKey;
  assert.ok(pk.challenge);
  assert.equal(pk.rp.id, 'localhost');
  assert.equal(pk.attestation, 'none');
  assert.ok(pk.pubKeyCredParams.some((p) => p.alg === -7));

  const cred = makeCredential();
  const cd = clientData(pk.challenge);
  const done = await api('passkeys/register/finish', alice, 'POST', finishBody(cred, cd, attestationNone(cred.authData)));
  assert.equal(done.status, 200);
  const body = await done.json();
  assert.equal(body.verified, true);
  assert.equal(body.credential_id, b64e(cred.credId));

  const begun2 = await (await api('passkeys/register/begin', alice, 'POST')).json();
  assert.ok(begun2.publicKey.excludeCredentials.some((e) => e.id === b64e(cred.credId)));

  const replay = await api('passkeys/register/finish', alice, 'POST', finishBody(cred, cd, attestationNone(cred.authData)));
  assert.equal(replay.status, 400);

  const begun3 = await (await api('passkeys/register/begin', alice, 'POST')).json();
  const evil = makeCredential();
  const cdEvil = clientData(begun3.publicKey.challenge, 'https://evil.test');
  const tampered = await api('passkeys/register/finish', alice, 'POST', finishBody(evil, cdEvil, attestationNone(evil.authData)));
  assert.equal(tampered.status, 400);

  const bob = await login('bob@luno-test.local', 'Bob#Migrated2026!');
  const lonely = makeCredential();
  const cdLonely = clientData('unused-challenge', 'http://localhost');
  const noCeremony = await api('passkeys/register/finish', bob, 'POST', finishBody(lonely, cdLonely, attestationNone(lonely.authData)));
  assert.equal(noCeremony.status, 400);
});

test('passkey registration with packed self attestation', async () => {
  const bob = await login('bob@luno-test.local', 'Bob#Migrated2026!');
  const begun = await (await api('passkeys/register/begin', bob, 'POST')).json();
  const cred = makeCredential();
  const cd = clientData(begun.publicKey.challenge);
  const done = await api('passkeys/register/finish', bob, 'POST', finishBody(cred, cd, attestationPacked(cred, cd)));
  assert.equal(done.status, 200);
  assert.equal((await done.json()).verified, true);
});

test('passkey registration rejects x5c and unknown formats', async () => {
  const bob = await login('bob@luno-test.local', 'Bob#Migrated2026!');
  const begun = await (await api('passkeys/register/begin', bob, 'POST')).json();
  const cred = makeCredential();
  const cd = clientData(begun.publicKey.challenge);
  const withX5c = attestationPacked(cred, cd, [...cborText('x5c'), ...cborHead(4, 1), ...cborBytes(new Uint8Array([1, 2, 3]))]);
  assert.equal((await api('passkeys/register/finish', bob, 'POST', finishBody(cred, cd, withX5c))).status, 400);

  const begun2 = await (await api('passkeys/register/begin', bob, 'POST')).json();
  const cred2 = makeCredential();
  const cd2 = clientData(begun2.publicKey.challenge);
  const tpm = Uint8Array.from([
    ...cborHead(5, 3),
    ...cborText('fmt'), ...cborText('tpm'),
    ...cborText('authData'), ...cborBytes(cred2.authData),
    ...cborText('attStmt'), ...cborHead(5, 0),
  ]);
  assert.equal((await api('passkeys/register/finish', bob, 'POST', finishBody(cred2, cd2, tpm))).status, 400);
});

function makeAssertion(cred, challenge, origin = 'http://localhost', counter = 1) {
  const rpHash = createHash('sha256').update('localhost').digest();
  const authData = Buffer.concat([
    rpHash,
    Buffer.from([0x01, (counter >>> 24) & 255, (counter >> 16) & 255, (counter >> 8) & 255, counter & 255]),
  ]);
  const cd = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge, origin }));
  const cdHash = createHash('sha256').update(cd).digest();
  const sig = createSign('sha256').update(Buffer.concat([authData, cdHash])).sign(cred.privateKey);
  return {
    id: b64e(cred.credId),
    rawId: b64e(cred.credId),
    type: 'public-key',
    response: {
      clientDataJSON: b64e(cd),
      authenticatorData: b64e(new Uint8Array(authData)),
      signature: b64e(new Uint8Array(sig)),
    },
  };
}

test('passkey login ceremony mints a working session', async () => {
  const demo = await login('user@luno.local', 'User#Migrated2026!');
  const begun = await (await api('passkeys/register/begin', demo, 'POST')).json();
  const cred = makeCredential();
  const cd = clientData(begun.publicKey.challenge);
  const fin = await api('passkeys/register/finish', demo, 'POST', finishBody(cred, cd, attestationNone(cred.authData)));
  assert.equal(fin.status, 200);

  const listed = await (await api('passkeys', demo, 'GET')).json();
  assert.equal(listed.passkeys.length, 1);
  assert.equal(listed.passkeys[0].id, b64e(cred.credId));

  assert.equal((await api('passkeys/login/begin', null, 'POST', { email: 'nobody@luno.local' })).status, 401);
  assert.equal((await api('passkeys/login/begin', null, 'POST', { email: 'admin@luno.local' })).status, 401);

  const lbegun = await (await api('passkeys/login/begin', null, 'POST', { email: 'user@luno.local' })).json();
  assert.ok(lbegun.publicKey.allowCredentials.some((e) => e.id === b64e(cred.credId)));
  const lfin = await api('passkeys/login/finish', null, 'POST', makeAssertion(cred, lbegun.publicKey.challenge));
  assert.equal(lfin.status, 200);
  const sess = await lfin.json();
  assert.ok(sess.access_token);
  const me = await (await api('me', sess.access_token, 'GET')).json();
  assert.equal(me.email, 'user@luno.local');

  const lbegun2 = await (await api('passkeys/login/begin', null, 'POST', { email: 'user@luno.local' })).json();
  const replay = await api('passkeys/login/finish', null, 'POST', makeAssertion(cred, lbegun.publicKey.challenge, 'http://localhost', 2));
  assert.equal(replay.status, 400);

  const stale = await api('passkeys/login/finish', null, 'POST', makeAssertion(cred, lbegun2.publicKey.challenge, 'http://localhost', 1));
  assert.equal(stale.status, 401);

  const del = await api(`passkeys/${b64e(cred.credId)}`, demo, 'DELETE');
  assert.equal(del.status, 200);
  assert.equal((await api(`passkeys/${b64e(cred.credId)}`, demo, 'DELETE')).status, 404);
  assert.equal((await (await api('passkeys', demo, 'GET')).json()).passkeys.length, 0);
  assert.equal((await api('passkeys/login/begin', null, 'POST', { email: 'user@luno.local' })).status, 401);
});
