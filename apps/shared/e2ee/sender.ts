// E3: Sender Keys for group rooms. Each sender owns a forward-ratcheting
// symmetric chain plus an Ed25519 chain-signing key; the (chain, signing)
// pair is dealt to members over 1:1 sessions (E6) and rotated on exit.
import { ed25519 } from '@noble/curves/ed25519';

import { aesGcmDecrypt, aesGcmEncrypt, hkdfSha256, randomBytes } from './keys.ts';
import { INFO_SK_CHAIN, INFO_SK_MSG } from './keys.ts';
import { b64uDecode, b64uEncode, concat, utf8Encode } from './codec.ts';

export const SENDER_JUMP_CAP = 200;

const ZERO_SALT = new Uint8Array(32);

export interface SenderKey {
  chain: Uint8Array;
  signPriv: Uint8Array | null; // present on our own sending key only
  signPub: Uint8Array;
  gen: number;
  n: number;
  skipped: Array<{ n: number; mk: string }>;
}

export function createSenderKey(gen: number, seed?: Uint8Array): SenderKey {
  const chain = seed ? seed.slice(0, 32) : randomBytes(32);
  const signPriv = seed ? seed.slice(32, 64) : ed25519.utils.randomPrivateKey();
  return { chain, signPriv, signPub: ed25519.getPublicKey(signPriv), gen, n: 0, skipped: [] };
}

export function importSenderKey(chain: Uint8Array, signPub: Uint8Array, gen: number): SenderKey {
  return { chain: chain.slice(), signPriv: null, signPub: signPub.slice(), gen, n: 0, skipped: [] };
}

export function exportSenderKey(sk: SenderKey): { chain: string; signPub: string; signPriv: string | null; gen: number } {
  return {
    chain: b64uEncode(sk.chain),
    signPub: b64uEncode(sk.signPub),
    signPriv: sk.signPriv ? b64uEncode(sk.signPriv) : null,
    gen: sk.gen,
  };
}

function stepChain(chain: Uint8Array): { chain: Uint8Array; msgKey: Uint8Array } {
  return {
    chain: hkdfSha256(chain, ZERO_SALT, INFO_SK_CHAIN, 32),
    msgKey: hkdfSha256(chain, ZERO_SALT, INFO_SK_MSG, 32),
  };
}

export interface SenderMessage {
  gen: number;
  n: number;
  iv: Uint8Array;
  ct: Uint8Array;
  sig: Uint8Array;
}

function senderAad(senderId: string, gen: number, n: number): Uint8Array {
  return concat(utf8Encode(senderId), utf8Encode(`|${gen}|${n}|`));
}

export async function senderEncrypt(
  sk: SenderKey, senderId: string, plaintext: Uint8Array, ivOverride?: Uint8Array,
): Promise<SenderMessage> {
  if (!sk.signPriv) throw new Error('cannot send with an imported key');
  const { chain, msgKey } = stepChain(sk.chain);
  sk.chain = chain;
  const n = sk.n;
  const iv = ivOverride ?? randomBytes(12);
  const ct = await aesGcmEncrypt(msgKey, iv, plaintext, senderAad(senderId, sk.gen, n));
  const sig = ed25519.sign(concat(senderAad(senderId, sk.gen, n), iv, ct), sk.signPriv);
  sk.n += 1;
  return { gen: sk.gen, n, iv, ct, sig };
}

export async function senderDecrypt(
  sk: SenderKey, senderId: string, msg: SenderMessage,
): Promise<Uint8Array> {
  if (msg.gen !== sk.gen) throw new Error('sender key generation mismatch');
  if (!ed25519.verify(msg.sig, concat(senderAad(senderId, msg.gen, msg.n), msg.iv, msg.ct), sk.signPub)) {
    throw new Error('bad sender signature');
  }
  const held = sk.skipped.findIndex((s) => s.n === msg.n);
  if (held >= 0) {
    const [found] = sk.skipped.splice(held, 1);
    return aesGcmDecrypt(b64uDecode(found.mk), msg.iv, msg.ct, senderAad(senderId, msg.gen, msg.n));
  }
  if (msg.n < sk.n) throw new Error('replayed sender message');
  if (msg.n - sk.n > SENDER_JUMP_CAP) throw new Error('sender jump too far');
  while (sk.n < msg.n) {
    const { chain, msgKey } = stepChain(sk.chain);
    sk.chain = chain;
    sk.skipped.push({ n: sk.n, mk: b64uEncode(msgKey) });
    while (sk.skipped.length > 50) sk.skipped.shift();
    sk.n += 1;
  }
  const { chain, msgKey } = stepChain(sk.chain);
  sk.chain = chain;
  sk.n += 1;
  return aesGcmDecrypt(msgKey, msg.iv, msg.ct, senderAad(senderId, msg.gen, msg.n));
}

export function encodeSenderMessage(m: SenderMessage): string {
  return JSON.stringify({
    v: 1, type: 'group', gen: m.gen, n: m.n,
    iv: b64uEncode(m.iv), ct: b64uEncode(m.ct), sig: b64uEncode(m.sig),
  });
}

export function decodeSenderMessage(s: string): SenderMessage {
  const o = JSON.parse(s);
  if (o.v !== 1 || o.type !== 'group') throw new Error('bad sender envelope');
  return {
    gen: o.gen, n: o.n,
    iv: b64uDecode(o.iv), ct: b64uDecode(o.ct), sig: b64uDecode(o.sig),
  };
}
