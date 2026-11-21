// E7: per-file encryption. Mirrors apps/shared/e2ee/files.ts.
import 'dart:typed_data';

import 'codec.dart';
import 'keys.dart';

class SealedFile {
  final String key;
  final String iv;
  final String hash;
  final String ct;
  const SealedFile(
      {required this.key,
      required this.iv,
      required this.hash,
      required this.ct});
}

Future<SealedFile> sealFile(Uint8List plaintext,
    {Uint8List? key, Uint8List? iv}) async {
  final k = key ?? randomBytes(32);
  final v = iv ?? randomBytes(12);
  final ct = await aesGcmEncrypt(k, v, plaintext);
  final hash = await sha256Hash(plaintext);
  return SealedFile(
      key: b64uEncode(k),
      iv: b64uEncode(v),
      hash: b64uEncode(hash),
      ct: b64uEncode(ct));
}

Future<Uint8List> openFile(SealedFile sealed) async {
  final pt = await aesGcmDecrypt(b64uDecode(sealed.key),
      b64uDecode(sealed.iv), b64uDecode(sealed.ct));
  final hash = b64uEncode(await sha256Hash(pt));
  if (hash != sealed.hash) throw StateError('file hash mismatch');
  return pt;
}
