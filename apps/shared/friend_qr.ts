// Real QR matrix for "my QR" (see scripts/friend_qr.test.mjs). Thin wrapper
// over qrcode-generator: deterministic, byte-mode, auto version, ECC-M.
// Annotation-free on purpose so the node suite can import it directly.
import qrcode from 'qrcode-generator';

export function friendQrPayload(handle = '') {
  return `LUNO-FRIEND:${String(handle || '').trim() || 'luno_user'}`;
}

function buildQr(handle = '') {
  const qr = qrcode(0, 'M');
  qr.addData(friendQrPayload(handle));
  qr.make();
  return qr;
}

export function makeFriendQrSvg(handle = '') {
  return buildQr(handle).createSvgTag({ cellSize: 4, margin: 8, scalable: true });
}

export function friendQrModuleCount(handle = '') {
  return buildQr(handle).getModuleCount();
}

export function friendQrIsDark(handle = '', row = 0, col = 0) {
  return buildQr(handle).isDark(row, col);
}
