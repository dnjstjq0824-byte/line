// E3: ciphertext message envelopes (E1 §4). JSON with v:1; unknown
// versions and shapes are rejected, never guessed.
import { b64uDecode } from './codec.ts';
import { parseIdentity } from './keys.ts';

export interface PrekeyEnvelope {
  v: 1;
  type: 'prekey';
  ik: string;
  ek: string;
  spkId: number | null;
  opkId: string | null;
  /** E5: responder selects the signed-prekey private half by this pubkey. */
  spk?: string;
  header: string;
  iv: string;
  ct: string;
}

export interface MsgEnvelope {
  v: 1;
  type: 'msg';
  header: string;
  iv: string;
  ct: string;
}

export interface SkDistEnvelope {
  v: 1;
  type: 'sk';
  room: string;
  gen: number;
  chain: string;
  signPub: string;
}

export type CipherEnvelope = PrekeyEnvelope | MsgEnvelope | SkDistEnvelope;

export function encodeEnvelope(e: CipherEnvelope): string {
  return JSON.stringify(e);
}

export function decodeEnvelope(s: string): CipherEnvelope {
  const o = JSON.parse(s);
  if (o.v !== 1) throw new Error('unsupported envelope version');
  if (o.type === 'prekey') {
    for (const k of ['ik', 'ek', 'header', 'iv', 'ct']) {
      if (typeof o[k] !== 'string' || !o[k]) throw new Error('bad prekey envelope');
    }
    // Validate shapes eagerly so corrupt envelopes fail here (ik is dotted).
    if (!parseIdentity(o.ik)) throw new Error('bad prekey envelope');
    for (const k of ['ek', 'header', 'iv', 'ct']) b64uDecode(o[k]);
    if (o.spk !== undefined) {
      if (typeof o.spk !== 'string' || !o.spk) throw new Error('bad prekey envelope');
      b64uDecode(o.spk);
    }
    return { v: 1, type: 'prekey', ik: o.ik, ek: o.ek, spkId: o.spkId ?? null, opkId: o.opkId ?? null, ...(o.spk !== undefined ? { spk: o.spk } : {}), header: o.header, iv: o.iv, ct: o.ct };
  }
  if (o.type === 'msg') {
    for (const k of ['header', 'iv', 'ct']) {
      if (typeof o[k] !== 'string' || !o[k]) throw new Error('bad msg envelope');
    }
    for (const k of ['header', 'iv', 'ct']) b64uDecode(o[k]);
    return { v: 1, type: 'msg', header: o.header, iv: o.iv, ct: o.ct };
  }
  if (o.type === 'sk') {
    if (typeof o.room !== 'string' || !o.room || typeof o.gen !== 'number') throw new Error('bad sk envelope');
    for (const k of ['chain', 'signPub']) {
      if (typeof o[k] !== 'string' || !o[k]) throw new Error('bad sk envelope');
    }
    b64uDecode(o.chain);
    b64uDecode(o.signPub);
    return { v: 1, type: 'sk', room: o.room, gen: o.gen, chain: o.chain, signPub: o.signPub };
  }
  throw new Error('unknown envelope type');
}
