// Real QR matrix for PC/web login (see scripts/login_qr.test.mjs). Thin
// wrapper over qrcode-generator: deterministic, byte-mode, auto version,
// ECC-M. Annotation-free on purpose so the node suite can import it
// directly. Payload mirrors POST auth/qr/challenge; the mobile scanner
// parses it back into challenge_id + qr_token for POST auth/qr/approve.
import qrcode from 'qrcode-generator';

export function loginQrPayload(challengeId = '', qrToken = '') {
  const cid = String(challengeId || '').trim();
  const tok = String(qrToken || '').trim();
  if (!cid || !tok) return '';
  return `LUNO-LOGIN:${cid}:${tok}`;
}

function buildQr(challengeId = '', qrToken = '') {
  const qr = qrcode(0, 'M');
  qr.addData(loginQrPayload(challengeId, qrToken));
  qr.make();
  return qr;
}

export function makeLoginQrSvg(challengeId = '', qrToken = '') {
  if (!loginQrPayload(challengeId, qrToken)) return '';
  return buildQr(challengeId, qrToken).createSvgTag({ cellSize: 4, margin: 8, scalable: true });
}

export function loginQrModuleCount(challengeId = '', qrToken = '') {
  return buildQr(challengeId, qrToken).getModuleCount();
}

export function loginQrIsDark(challengeId = '', qrToken = '', row = 0, col = 0) {
  return buildQr(challengeId, qrToken).isDark(row, col);
}
