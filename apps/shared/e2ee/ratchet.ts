// E3: Double Ratchet (Signal DR, HKDF-SHA256 KDFs, AES-256-GCM).
// v1 headers (dh pubkey, N, PN) travel in the clear as documented in E1:
// counts only, the same metadata grade the server already sees.
import { x25519 } from '@noble/curves/ed25519';

import { aesGcmDecrypt, aesGcmEncrypt, hkdfSha256, randomBytes, x25519Shared } from './keys.ts';
import { INFO_CHAIN, INFO_MSG, INFO_ROOT } from './keys.ts';
import { b64uDecode, b64uEncode, concat, u8eq, u32be, u32beRead } from './codec.ts';

export const RATCHET_JUMP_CAP = 200;
export const RATCHET_SKIPPED_CAP = 200;

const ZERO_SALT = new Uint8Array(32);

// Deterministic randomness for vector generation only (E3/E4 interop).
let testRandom: ((n: number) => Uint8Array) | null = null;
export function __setTestRandom(f: ((n: number) => Uint8Array) | null): void {
  testRandom = f;
}
function rnd(n: number): Uint8Array {
  return testRandom ? testRandom(n) : randomBytes(n);
}

function kdfRoot(rk: Uint8Array, dhOut: Uint8Array): { root: Uint8Array; chain: Uint8Array } {
  const out = hkdfSha256(concat(rk, dhOut), ZERO_SALT, INFO_ROOT, 64);
  return { root: out.slice(0, 32), chain: out.slice(32, 64) };
}

function kdfChain(ck: Uint8Array): { chain: Uint8Array; msgKey: Uint8Array } {
  return {
    chain: hkdfSha256(ck, ZERO_SALT, INFO_CHAIN, 32),
    msgKey: hkdfSha256(ck, ZERO_SALT, INFO_MSG, 32),
  };
}

export interface RatchetHeader {
  dh: Uint8Array;
  n: number;
  pn: number;
}

export interface RatchetMessage {
  header: RatchetHeader;
  iv: Uint8Array;
  ct: Uint8Array;
}

export interface RatchetState {
  root: Uint8Array;
  sendChain: Uint8Array | null;
  recvChain: Uint8Array | null;
  sendRatchetPriv: Uint8Array;
  sendRatchetPub: Uint8Array;
  recvRatchetPub: Uint8Array | null;
  sendN: number;
  recvN: number;
  prevSendLen: number;
  skipped: Array<{ dhHex: string; n: number; mk: string }>;
}

function hex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Initiator: sharedSecret from X3DH, theirSpk = responder's signed prekey.
export function ratchetInitInitiator(sharedSecret: Uint8Array, theirSpk: Uint8Array, ratchetSeed?: Uint8Array): RatchetState {
  const priv = ratchetSeed ?? x25519.utils.randomPrivateKey();
  const pub = x25519.getPublicKey(priv);
  const { root, chain } = kdfRoot(sharedSecret, x25519Shared(priv, theirSpk));
  return {
    root, sendChain: chain, recvChain: null,
    sendRatchetPriv: priv, sendRatchetPub: pub, recvRatchetPub: null,
    sendN: 0, recvN: 0, prevSendLen: 0, skipped: [],
  };
}

// Responder: sharedSecret from X3DH, ownSpkPriv = our signed prekey.
export function ratchetInitResponder(sharedSecret: Uint8Array, ownSpkPriv: Uint8Array): RatchetState {
  const priv = rnd(32);
  return {
    root: sharedSecret, sendChain: null, recvChain: null,
    sendRatchetPriv: priv, sendRatchetPub: x25519.getPublicKey(priv),
    recvRatchetPub: null, sendN: 0, recvN: 0, prevSendLen: 0, skipped: [],
  };
}

function skipRecv(st: RatchetState, untilN: number): void {
  if (!st.recvChain) throw new Error('no receiving chain');
  while (st.recvN < untilN) {
    const { chain, msgKey } = kdfChain(st.recvChain);
    st.recvChain = chain;
    if (st.recvRatchetPub) {
      st.skipped.push({ dhHex: hex(st.recvRatchetPub), n: st.recvN, mk: b64uEncode(msgKey) });
      while (st.skipped.length > RATCHET_SKIPPED_CAP) st.skipped.shift();
    }
    st.recvN += 1;
  }
}

function dhRatchetRecv(st: RatchetState, theirDh: Uint8Array): void {
  st.prevSendLen = st.sendN;
  st.sendN = 0;
  st.recvN = 0;
  st.recvRatchetPub = theirDh;
  const r1 = kdfRoot(st.root, x25519Shared(st.sendRatchetPriv, theirDh));
  st.root = r1.root;
  st.recvChain = r1.chain;
  st.sendRatchetPriv = rnd(32);
  st.sendRatchetPub = x25519.getPublicKey(st.sendRatchetPriv);
  const r2 = kdfRoot(st.root, x25519Shared(st.sendRatchetPriv, theirDh));
  st.root = r2.root;
  st.sendChain = r2.chain;
}

export async function ratchetEncrypt(st: RatchetState, plaintext: Uint8Array, aad?: Uint8Array, ivOverride?: Uint8Array): Promise<RatchetMessage> {
  if (!st.sendChain) {
    // Responder's first send: DH-ratchet against their latest key.
    if (!st.recvRatchetPub) throw new Error('no sending chain yet');
    const priv = rnd(32);
    const r = kdfRoot(st.root, x25519Shared(priv, st.recvRatchetPub));
    st.root = r.root;
    st.sendChain = r.chain;
    st.sendRatchetPriv = priv;
    st.sendRatchetPub = x25519.getPublicKey(priv);
    st.prevSendLen = 0;
    st.sendN = 0;
  }
  const { chain, msgKey } = kdfChain(st.sendChain);
  st.sendChain = chain;
  const header: RatchetHeader = { dh: st.sendRatchetPub, n: st.sendN, pn: st.prevSendLen };
  const iv = ivOverride ?? randomBytes(12);
  const ct = await aesGcmEncrypt(msgKey, iv, plaintext, aad);
  st.sendN += 1;
  return { header, iv, ct };
}

async function trySkipped(st: RatchetState, header: RatchetHeader, iv: Uint8Array, ct: Uint8Array, aad?: Uint8Array): Promise<Uint8Array | null> {
  const h = hex(header.dh);
  const at = st.skipped.findIndex((s) => s.dhHex === h && s.n === header.n);
  if (at < 0) return null;
  const [found] = st.skipped.splice(at, 1);
  return aesGcmDecrypt(b64uDecode(found.mk), iv, ct, aad);
}

export async function ratchetDecrypt(st: RatchetState, msg: RatchetMessage, ownSpkPriv: Uint8Array | null, aad?: Uint8Array): Promise<Uint8Array> {
  const skipped = await trySkipped(st, msg.header, msg.iv, msg.ct, aad).catch(() => null);
  if (skipped) return skipped;
  const sameChain = st.recvRatchetPub !== null && u8eq(st.recvRatchetPub, msg.header.dh);
  if (!sameChain) {
    if (msg.header.n > RATCHET_JUMP_CAP || msg.header.pn > RATCHET_JUMP_CAP) throw new Error('ratchet jump too far');
    // First message ever (responder): root-step against our signed prekey.
    if (st.recvChain === null && st.sendChain === null && ownSpkPriv && st.recvRatchetPub === null) {
      const r1 = kdfRoot(st.root, x25519Shared(ownSpkPriv, msg.header.dh));
      st.root = r1.root;
      st.recvChain = r1.chain;
      st.recvRatchetPub = msg.header.dh;
    } else {
      dhRatchetRecv(st, msg.header.dh);
    }
  }
  skipRecv(st, msg.header.n);
  if (!st.recvChain) throw new Error('no receiving chain');
  const { chain, msgKey } = kdfChain(st.recvChain);
  st.recvChain = chain;
  st.recvN += 1;
  return aesGcmDecrypt(msgKey, msg.iv, msg.ct, aad);
}

export function encodeHeader(h: RatchetHeader): string {
  return b64uEncode(concat(h.dh, u32be(h.pn), u32be(h.n)));
}

export function decodeHeader(s: string): RatchetHeader {
  const raw = b64uDecode(s);
  if (raw.length !== 40) throw new Error('bad header');
  return { dh: raw.slice(0, 32), pn: u32beRead(raw, 32), n: u32beRead(raw, 36) };
}

export function serializeRatchet(st: RatchetState): string {
  return JSON.stringify({
    root: b64uEncode(st.root),
    sendChain: st.sendChain ? b64uEncode(st.sendChain) : null,
    recvChain: st.recvChain ? b64uEncode(st.recvChain) : null,
    sendRatchetPriv: b64uEncode(st.sendRatchetPriv),
    sendRatchetPub: b64uEncode(st.sendRatchetPub),
    recvRatchetPub: st.recvRatchetPub ? b64uEncode(st.recvRatchetPub) : null,
    sendN: st.sendN, recvN: st.recvN, prevSendLen: st.prevSendLen,
    skipped: st.skipped,
  });
}

export function deserializeRatchet(s: string): RatchetState {
  const o = JSON.parse(s);
  const opt = (v: string | null) => (v === null || v === undefined ? null : b64uDecode(v));
  return {
    root: b64uDecode(o.root),
    sendChain: opt(o.sendChain),
    recvChain: opt(o.recvChain),
    sendRatchetPriv: b64uDecode(o.sendRatchetPriv),
    sendRatchetPub: b64uDecode(o.sendRatchetPub),
    recvRatchetPub: opt(o.recvRatchetPub),
    sendN: o.sendN, recvN: o.recvN, prevSendLen: o.prevSendLen,
    skipped: Array.isArray(o.skipped) ? o.skipped : [],
  };
}
