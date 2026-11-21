// E3: generate scripts/fixtures/e2ee_vectors.json — the shared web/app
// interop vectors. Deterministic: fixed seeds + counter randomness.
// Usage: node scripts/gen_e2ee_vectors.mjs (rewrites the fixture).
import { writeFileSync, mkdirSync } from 'node:fs';
import { x25519 } from '@noble/curves/ed25519';
import { ed25519 } from '@noble/curves/ed25519';
import { b64uEncode, utf8Encode, utf8Decode } from '../apps/shared/e2ee/codec.ts';
import { encodeIdentity, generateIdentity, generateSignedPrekey, hkdfSha256, sha256Hash } from '../apps/shared/e2ee/keys.ts';
import { x3dhInitiate, x3dhRespond } from '../apps/shared/e2ee/x3dh.ts';
import {
  __setTestRandom, decodeHeader, encodeHeader,
  ratchetDecrypt, ratchetEncrypt, ratchetInitInitiator, ratchetInitResponder,
} from '../apps/shared/e2ee/ratchet.ts';
import { createSenderKey, decodeSenderMessage, encodeSenderMessage, importSenderKey, senderDecrypt, senderEncrypt } from '../apps/shared/e2ee/sender.ts';
import { decryptBackup, encryptBackup } from '../apps/shared/e2ee/backup.ts';
import { decodeEnvelope, encodeEnvelope } from '../apps/shared/e2ee/envelope.ts';

let counter = 1;
__setTestRandom((n) => {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (counter + i) & 0xff;
  counter += n;
  return out;
});
const seed = (from, n) => {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (from + i) & 0xff;
  return out;
};
const iv = (from) => seed(from, 12);
const b64 = (b) => b64uEncode(b);

// ---- identities ----
const alice = generateIdentity(seed(1, 64));
const bob = generateIdentity(seed(101, 64));
const bobSpk = generateSignedPrekey(bob, 7, seed(201, 32));
const bobOpkPriv = seed(233, 32);
const bobOpkPub = x25519.getPublicKey(bobOpkPriv);

// ---- X3DH (with + without one-time prekey) ----
const init = x3dhInitiate(alice.xPriv, { identityX: bob.xPub, signedPrekey: bobSpk.pub, oneTimePrekey: bobOpkPub }, seed(44, 32));
const respSk = x3dhRespond(bob.xPriv, bobSpk.priv, bobOpkPriv, alice.xPub, init.ephemeralPub);
const initNo = x3dhInitiate(alice.xPriv, { identityX: bob.xPub, signedPrekey: bobSpk.pub, oneTimePrekey: null }, seed(77, 32));
const respNo = x3dhRespond(bob.xPriv, bobSpk.priv, null, alice.xPub, initNo.ephemeralPub);

// ---- Double Ratchet conversation ----
const aSt = ratchetInitInitiator(init.sharedSecret, bobSpk.pub, seed(300, 32));
const bSt = ratchetInitResponder(respSk, bobSpk.priv);
const pt1 = utf8Encode('hello bob, this is alice (1)');
const pt2 = utf8Encode('second message, still alice (2)');
const pt3 = utf8Encode('hi alice, bob here (3)');
const pt4 = utf8Encode('alice again after bob (4)');
const m1 = await ratchetEncrypt(aSt, pt1, undefined, iv(11));
const m2 = await ratchetEncrypt(aSt, pt2, undefined, iv(22));
// Bob reads #2 first (out of order), then #1 from the skipped store.
const d2 = await ratchetDecrypt(bSt, m2, bobSpk.priv);
const d1 = await ratchetDecrypt(bSt, m1, bobSpk.priv);
const m3 = await ratchetEncrypt(bSt, pt3, undefined, iv(33));
const d3 = await ratchetDecrypt(aSt, m3, null);
const m4 = await ratchetEncrypt(aSt, pt4, undefined, iv(44));
const d4 = await ratchetDecrypt(bSt, m4, bobSpk.priv);
const wire = (m) => ({ header: encodeHeader(m.header), iv: b64(m.iv), ct: b64(m.ct) });

// ---- Sender Keys ----
const skA = createSenderKey(3, seed(400, 64));
const skB = importSenderKey(skA.chain.slice(), skA.signPub.slice(), 3);
const g1 = await senderEncrypt(skA, 'alice', utf8Encode('group hello (1)'), iv(55));
const g2 = await senderEncrypt(skA, 'alice', utf8Encode('group hello (2)'), iv(66));
const g3 = await senderEncrypt(skA, 'alice', utf8Encode('group hello (3)'), iv(77));
// Bob receives 1, 3 (holds 2), then 2.
const gd1 = await senderDecrypt(skB, 'alice', g1);
const gd3 = await senderDecrypt(skB, 'alice', g3);
const gd2 = await senderDecrypt(skB, 'alice', g2);

// ---- Backup ----
const payload = JSON.stringify({ v: 1, note: 'vector-backup', rooms: { r1: [{ body: 'kept secret' }] } });
const blob = await encryptBackup('correct horse 99!', payload, { salt: seed(500, 16), iv: seed(516, 12) });
const restored = await decryptBackup('correct horse 99!', blob);

// ---- Envelopes ----
const prekeyEnv = encodeEnvelope({ v: 1, type: 'prekey', ik: b64(alice.xPub), ek: b64(init.ephemeralPub), spkId: 7, opkId: 'opk-9', header: wire(m1).header, iv: wire(m1).iv, ct: wire(m1).ct });
const msgEnv = encodeEnvelope({ v: 1, type: 'msg', header: wire(m2).header, iv: wire(m2).iv, ct: wire(m2).ct });
const skEnv = encodeEnvelope({ v: 1, type: 'sk', room: 'room-7', gen: 3, chain: b64(skA.chain), signPub: b64(skA.signPub) });
decodeEnvelope(prekeyEnv);
decodeEnvelope(msgEnv);
decodeEnvelope(skEnv);

const vectors = {
  v: 1,
  note: 'Deterministic E2EE interop vectors (E3). Regenerate with node scripts/gen_e2ee_vectors.mjs; both web and app must reproduce every output byte.',
  hkdf_sha256_rfc5869_case1: {
    ikm_hex: '0b'.repeat(22), salt_hex: '000102030405060708090a0b0c', info_hex: 'f0f1f2f3f4f5f6f7f8f9', length: 42,
    okm_hex: '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
  },
  x25519_crosscheck: {
    note: 'pub/DH cross-verified noble<->node:crypto (see e2ee_vectors test)',
    priv_hex: '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
    pub_hex: '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
  },
  ed25519_crosscheck: {
    note: 'seed/pub pair cross-verified noble<->node:crypto (see e2ee_vectors test)',
    seed_hex: '9d61b19f0868fdd5d4a2b19e3af3c6fde7ca790f30c06923c557b650adcaa7ff',
    pub_hex: '5b777059c5a11ad2577c989b074b924b96175cf8f2c6f1c7af9a9d3a0952f4ed',
  },
  identities: {
    alice: encodeIdentity(alice),
    bob: encodeIdentity(bob),
    bob_spk_pub: b64(bobSpk.pub),
    bob_spk_sig: b64(bobSpk.sig),
    bob_opk_pub: b64(bobOpkPub),
  },
  x3dh_with_opk: { sk: b64(init.sharedSecret), eph: b64(init.ephemeralPub) },
  x3dh_without_opk: { sk: b64(initNo.sharedSecret), eph: b64(initNo.ephemeralPub) },
  ratchet: {
    m1: wire(m1), m2: wire(m2), m3: wire(m3), m4: wire(m4),
    d1: utf8Decode(d1), d2: utf8Decode(d2), d3: utf8Decode(d3), d4: utf8Decode(d4),
  },
  sender: {
    chain_pub: b64(skA.signPub),
    g1: { gen: g1.gen, n: g1.n, iv: b64(g1.iv), ct: b64(g1.ct), sig: b64(g1.sig) },
    g2: { gen: g2.gen, n: g2.n, iv: b64(g2.iv), ct: b64(g2.ct), sig: b64(g2.sig) },
    g3: { gen: g3.gen, n: g3.n, iv: b64(g3.iv), ct: b64(g3.ct), sig: b64(g3.sig) },
    gd1: utf8Decode(gd1), gd2: utf8Decode(gd2), gd3: utf8Decode(gd3),
    wire_g1: encodeSenderMessage(g1),
  },
  backup: { blob, restored },
  envelopes: { prekey: prekeyEnv, msg: msgEnv, sk: skEnv },
  sha256_empty_hex: Buffer.from(sha256Hash(new Uint8Array(0))).toString('hex'),
};

mkdirSync('scripts/fixtures', { recursive: true });
writeFileSync('scripts/fixtures/e2ee_vectors.json', JSON.stringify(vectors, null, 1) + '\n');
console.log('wrote scripts/fixtures/e2ee_vectors.json');
