// E3: passphrase-encrypted key/history backup (5??. PBKDF2-SHA256 100k +
// AES-256-GCM via WebCrypto; the server only ever sees the blob.
import { aesGcmDecrypt, aesGcmEncrypt, randomBytes } from './keys.ts';
import { b64uDecode, b64uEncode, utf8Decode, utf8Encode } from './codec.ts';

export const BACKUP_PBKDF2_ITERS = 100000;
export const BACKUP_MIN_PASSPHRASE = 8;

export async function deriveBackupKey(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
  const base = await globalThis.crypto.subtle.importKey(
    'raw', utf8Encode(passphrase).slice().buffer as ArrayBuffer, { name: 'PBKDF2' }, false, ['deriveBits'],
  );
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt.slice().buffer as ArrayBuffer, iterations: BACKUP_PBKDF2_ITERS },
    base, 256,
  );
  return new Uint8Array(bits);
}

export interface BackupBlob {
  v: number;
  salt: string;
  iv: string;
  ct: string;
}

export async function encryptBackup(passphrase: string, payloadJson: string, fixed?: { salt: Uint8Array; iv: Uint8Array }): Promise<BackupBlob> {
  if (passphrase.length < BACKUP_MIN_PASSPHRASE) throw new Error('backup passphrase too short');
  const salt = fixed?.salt ?? randomBytes(16);
  const iv = fixed?.iv ?? randomBytes(12);
  const key = await deriveBackupKey(passphrase, salt);
  const ct = await aesGcmEncrypt(key, iv, utf8Encode(payloadJson));
  return { v: 1, salt: b64uEncode(salt), iv: b64uEncode(iv), ct: b64uEncode(ct) };
}

export async function decryptBackup(passphrase: string, blob: BackupBlob): Promise<string> {
  if (blob.v !== 1) throw new Error('unsupported backup version');
  const key = await deriveBackupKey(passphrase, b64uDecode(blob.salt));
  const pt = await aesGcmDecrypt(key, b64uDecode(blob.iv), b64uDecode(blob.ct));
  return utf8Decode(pt);
}
