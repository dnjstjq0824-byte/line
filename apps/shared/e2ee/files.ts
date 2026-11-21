// E7: per-file encryption. Random 256-bit key + AES-256-GCM; the key,
// IV and plaintext SHA-256 travel inside the sealed message body while
// R2 holds ciphertext only.
import { aesGcmDecrypt, aesGcmEncrypt, randomBytes } from './keys.ts';
import { sha256 } from '@noble/hashes/sha2';
import { b64uDecode, b64uEncode } from './codec.ts';

export interface SealedFile {
  key: string;
  iv: string;
  hash: string;
  ct: string;
}

export async function sealFile(
  plaintext: Uint8Array,
  opts?: { key?: Uint8Array; iv?: Uint8Array },
): Promise<SealedFile> {
  const key = opts?.key ?? randomBytes(32);
  const iv = opts?.iv ?? randomBytes(12);
  const ct = await aesGcmEncrypt(key, iv, plaintext);
  return {
    key: b64uEncode(key),
    iv: b64uEncode(iv),
    hash: b64uEncode(sha256(plaintext)),
    ct: b64uEncode(ct),
  };
}

export async function openFile(sealed: SealedFile): Promise<Uint8Array> {
  const pt = await aesGcmDecrypt(
    b64uDecode(sealed.key), b64uDecode(sealed.iv), b64uDecode(sealed.ct));
  const hash = b64uEncode(sha256(pt));
  if (hash !== sealed.hash) throw new Error('file hash mismatch');
  return pt;
}
