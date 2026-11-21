// E3: identity + prekey management (X25519/ECDH via noble, hashing via
// WebCrypto so browsers and node --test share one code path).
import { x25519 } from '@noble/curves/ed25519';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { hkdf } from '@noble/hashes/hkdf';

import { b64uDecode, b64uEncode, concat, u8eq } from './codec.ts';

export { u8eq };

export const INFO_X3DH = 'LUNO-X3DH-v1';
export const INFO_ROOT = 'LUNO-Ratchet-Root-v1';
export const INFO_CHAIN = 'LUNO-Ratchet-Chain-v1';
export const INFO_MSG = 'LUNO-Ratchet-Msg-v1';
export const INFO_SK_MSG = 'LUNO-SK-Msg-v1';
export const INFO_SK_CHAIN = 'LUNO-SK-Chain-v1';

const te = new TextEncoder();

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function sha256Hash(data: Uint8Array): Uint8Array {
  return sha256(data);
}

// HKDF-SHA256 via noble: same bytes in every runtime (SubtleCrypto HKDF is
// equivalent but noble keeps one dependency for all KDF steps).
export function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: string | Uint8Array, length: number): Uint8Array {
  const infoBytes = typeof info === 'string' ? te.encode(info) : info;
  return hkdf(sha256, ikm, salt, infoBytes, length);
}

// AES-256-GCM via WebCrypto (browsers, workers, node >= 16).
export async function aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
  const k = await globalThis.crypto.subtle.importKey('raw', key.slice().buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['encrypt']);
  const out = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.slice().buffer as ArrayBuffer, ...(aad ? { additionalData: aad.slice().buffer as ArrayBuffer } : {}) },
    k,
    plaintext.slice().buffer as ArrayBuffer,
  );
  return new Uint8Array(out);
}

export async function aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, aad?: Uint8Array): Promise<Uint8Array> {
  const k = await globalThis.crypto.subtle.importKey('raw', key.slice().buffer as ArrayBuffer, { name: 'AES-GCM' }, false, ['decrypt']);
  const out = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.slice().buffer as ArrayBuffer, ...(aad ? { additionalData: aad.slice().buffer as ArrayBuffer } : {}) },
    k,
    ciphertext.slice().buffer as ArrayBuffer,
  );
  return new Uint8Array(out);
}

export interface IdentityKeys {
  xPriv: Uint8Array;
  xPub: Uint8Array;
  edPriv: Uint8Array;
  edPub: Uint8Array;
}

export function generateIdentity(seed?: Uint8Array): IdentityKeys {
  const xPriv = seed ? seed.slice(0, 32) : x25519.utils.randomPrivateKey();
  const edPriv = seed ? seed.slice(32, 64) : ed25519.utils.randomPrivateKey();
  return {
    xPriv,
    xPub: x25519.getPublicKey(xPriv),
    edPriv,
    edPub: ed25519.getPublicKey(edPriv),
  };
}

// Server directory format: base64url(X25519) + "." + base64url(Ed25519).
export function encodeIdentity(id: IdentityKeys): string {
  return `${b64uEncode(id.xPub)}.${b64uEncode(id.edPub)}`;
}

export function parseIdentity(s: string): { x: Uint8Array; ed: Uint8Array } | null {
  if (typeof s !== 'string') return null;
  const parts = s.split('.');
  if (parts.length !== 2) return null;
  try {
    const x = b64uDecode(parts[0]);
    const ed = b64uDecode(parts[1]);
    if (x.length !== 32 || ed.length !== 32) return null;
    return { x, ed };
  } catch {
    return null;
  }
}

export interface SignedPrekey {
  id: number;
  priv: Uint8Array;
  pub: Uint8Array;
  sig: Uint8Array;
}

export function generateSignedPrekey(id: IdentityKeys, spkId: number, seed?: Uint8Array): SignedPrekey {
  const priv = seed ?? x25519.utils.randomPrivateKey();
  const pub = x25519.getPublicKey(priv);
  const sig = ed25519.sign(pub, id.edPriv);
  return { id: spkId, priv, pub, sig };
}

export function verifyPrekeySig(identity: string, spkPub: Uint8Array, sig: Uint8Array): boolean {
  const id = parseIdentity(identity);
  if (!id) return false;
  try {
    return ed25519.verify(sig, spkPub, id.ed);
  } catch {
    return false;
  }
}

export function x25519Shared(priv: Uint8Array, pub: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(priv, pub);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  return concat(...parts);
}
