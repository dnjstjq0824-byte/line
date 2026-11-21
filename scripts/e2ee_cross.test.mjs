// E5: app -> web interop. Ciphertexts minted by the Dart stack
// (mobile/flutter_app/tool/gen_app_vectors.dart) must decrypt on the
// TS stack. The reverse direction is covered by the Dart replay test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { b64uDecode, utf8Decode } from '../apps/shared/e2ee/codec.ts';
import { x3dhRespond } from '../apps/shared/e2ee/x3dh.ts';
import { decodeHeader, ratchetDecrypt, ratchetInitResponder } from '../apps/shared/e2ee/ratchet.ts';
import { decodeEnvelope } from '../apps/shared/e2ee/envelope.ts';

const V = JSON.parse(readFileSync(new URL('./fixtures/e2ee_vectors.json', import.meta.url), 'utf8'));
const A = JSON.parse(readFileSync(new URL('./fixtures/e2ee_app_vectors.json', import.meta.url), 'utf8'));

test('E5: TS decrypts Dart prekey + follow-up messages', async () => {
  const priv = V._priv;
  const bobX = b64uDecode(priv.bob_x);
  const bobSpk = b64uDecode(priv.bob_spk);
  const bobOpk = b64uDecode(priv.bob_opk);
  void bobX;
  const pre = decodeEnvelope(JSON.stringify(A.prekey));
  if (pre.type !== 'prekey') throw new Error('expected prekey');
  const theirX = b64uDecode(pre.ik.split('.')[0]);
  const sk = x3dhRespond(
    b64uDecode(priv.bob_x), bobSpk, pre.opkId ? bobOpk : null, theirX, b64uDecode(pre.ek));
  const st = ratchetInitResponder(sk, bobSpk);
  const m1 = {
    header: decodeHeader(pre.header),
    iv: b64uDecode(pre.iv),
    ct: b64uDecode(pre.ct),
  };
  assert.equal(utf8Decode(await ratchetDecrypt(st, m1, bobSpk)), A.pt1);
  const follow = decodeEnvelope(JSON.stringify(A.msg));
  if (follow.type !== 'msg') throw new Error('expected msg');
  const m2 = {
    header: decodeHeader(follow.header),
    iv: b64uDecode(follow.iv),
    ct: b64uDecode(follow.ct),
  };
  assert.equal(utf8Decode(await ratchetDecrypt(st, m2, null)), A.pt2);
});
