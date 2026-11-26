// Worker module: Web Push crypto + single-send (P2 monolith split). Pure over
// (env, cfg, sub, event); subscription fanout stays in cf_worker.js (needs db).
import { fcmB64url } from './fcm.mjs';

const WEBPUSH_MAX_SUBS_PER_USER = 10;
const WEBPUSH_TTL_MESSAGE = 86400;
const WEBPUSH_TTL_CALL = 45;
const WEBPUSH_TTL_DISMISS = 60;
function webpushB64uDecode(s) {
  const b = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function webpushConcat(...parts) {
  const bytes = parts.map((p) => (typeof p === 'number' ? new Uint8Array([p]) : p));
  const out = new Uint8Array(bytes.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of bytes) { out.set(p, at); at += p.length; }
  return out;
}
function webpushConfig(env) {
  try {
    const pub = webpushB64uDecode(env && env.VAPID_PUBLIC_KEY);
    const priv = webpushB64uDecode(env && env.VAPID_PRIVATE_KEY);
    const subject = String((env && env.VAPID_SUBJECT) || '');
    if (pub.length !== 65 || pub[0] !== 0x04 || priv.length !== 32) return null;
    if (!subject) return null;
    return { pub, priv, subject, pubB64u: String(env.VAPID_PUBLIC_KEY) };
  } catch { return null; }
}
async function webpushHkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8);
  return new Uint8Array(bits);
}
// RFC 8291 section 3.4 (single aes128gcm record). opts pins the random
// inputs for the section 5 vector test: { salt, asPublicRaw,
// asPrivateRaw, rs, padLen }. Production omits them (fresh ephemeral
// key, random salt, no extra padding).
async function webpushEncrypt(receiverPubRaw, authRaw, plaintext, opts = {}) {
  const enc = new TextEncoder();
  let asPub = opts.asPublicRaw || null;
  let asPrivKey = null;
  if (opts.asPrivateRaw && asPub) {
    asPrivKey = await crypto.subtle.importKey('jwk', {
      kty: 'EC', crv: 'P-256',
      x: fcmB64url(asPub.slice(1, 33)), y: fcmB64url(asPub.slice(33, 65)),
      d: fcmB64url(opts.asPrivateRaw),
    }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    asPrivKey = pair.privateKey;
    const j = await crypto.subtle.exportKey('jwk', pair.publicKey);
    asPub = webpushConcat(0x04, webpushB64uDecode(j.x), webpushB64uDecode(j.y));
  }
  const uaPubKey = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256',
    x: fcmB64url(receiverPubRaw.slice(1, 33)), y: fcmB64url(receiverPubRaw.slice(33, 65)),
  }, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPubKey }, asPrivKey, 256));
  const keyInfo = webpushConcat(enc.encode('WebPush: info'), 0x00, receiverPubRaw, asPub);
  const ikm = await webpushHkdf(authRaw, ecdh, keyInfo, 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await webpushHkdf(salt, ikm, webpushConcat(enc.encode('Content-Encoding: aes128gcm'), 0x00), 16);
  const nonce = await webpushHkdf(salt, ikm, webpushConcat(enc.encode('Content-Encoding: nonce'), 0x00), 12);
  const record = webpushConcat(plaintext, 0x02, new Uint8Array(opts.padLen || 0));
  const rs = opts.rs || (record.length + 16);
  if (rs < record.length + 16) throw new Error('webpush rs too small');
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, record));
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = 65;
  header.set(asPub, 21);
  return webpushConcat(header, ct);
}
async function webpushVapidJwt(cfg, audience) {
  const enc = new TextEncoder();
  const nowS = Math.floor(Date.now() / 1000);
  const h = fcmB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const c = fcmB64url(enc.encode(JSON.stringify({ aud: audience, exp: nowS + 12 * 3600, sub: cfg.subject })));
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256',
    x: fcmB64url(cfg.pub.slice(1, 33)), y: fcmB64url(cfg.pub.slice(33, 65)),
    d: fcmB64url(cfg.priv),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${h}.${c}`)));
  return `${h}.${c}.${fcmB64url(sig)}`;
}
// Payload the service worker renders. call_end carries a dismiss tag
// (the worker closes the ring notification); everything else opens url.
function webpushPayloadFor(event) {
  const kind = String((event && event.kind) || 'message');
  const cid = String((event && event.conversation_id) || '');
  const callId = String((event && event.call_id) || '');
  if (kind === 'call_end' && callId) return { dismiss: `call-${callId}` };
  const url = cid ? `/chats/${cid}` : '/chats';
  const tag = kind === 'call' && callId ? `call-${callId}` : (cid ? `chat-${cid}` : 'luno');
  return {
    title: String((event && event.title) || 'LUNO'),
    body: String((event && event.body) || '새 알림').slice(0, 200),
    url, tag, kind, conversation_id: cid,
  };
}
function webpushTopicFor(event) {
  const cid = String((event && event.conversation_id) || 'luno').replace(/[^A-Za-z0-9-_]/g, '').slice(0, 32);
  return cid || 'luno';
}
async function webpushSendOne(env, cfg, sub, payloadBytes, event) {
  const doFetch = typeof env.WEBPUSH_FETCH === 'function' ? env.WEBPUSH_FETCH : fetch;
  let uaPub = null, auth = null;
  try {
    uaPub = webpushB64uDecode(sub.p256dh);
    auth = webpushB64uDecode(sub.auth);
  } catch { return { ok: false, gone: true }; }
  if (uaPub.length !== 65 || uaPub[0] !== 0x04 || auth.length !== 16) return { ok: false, gone: true };
  const body = await webpushEncrypt(uaPub, auth, payloadBytes);
  const aud = new URL(sub.endpoint).origin;
  const jwt = await webpushVapidJwt(cfg, aud);
  const ringing = event && event.kind === 'call';
  const dismiss = event && event.kind === 'call_end';
  const res = await doFetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': String(body.length),
      TTL: String(ringing ? WEBPUSH_TTL_CALL : (dismiss ? WEBPUSH_TTL_DISMISS : WEBPUSH_TTL_MESSAGE)),
      Urgency: ringing ? 'high' : 'normal',
      Topic: webpushTopicFor(event),
      Authorization: `vapid t=${jwt}, k=${cfg.pubB64u}`,
    },
    body,
  });
  await res.arrayBuffer().catch(() => null);
  if (res.status === 404 || res.status === 410) return { ok: false, gone: true };
  return { ok: res.ok, gone: false };
}

export {
  WEBPUSH_MAX_SUBS_PER_USER, WEBPUSH_TTL_MESSAGE, WEBPUSH_TTL_CALL, WEBPUSH_TTL_DISMISS,
  webpushB64uDecode, webpushConcat, webpushConfig, webpushHkdf, webpushEncrypt,
  webpushVapidJwt, webpushPayloadFor, webpushTopicFor, webpushSendOne,
};
