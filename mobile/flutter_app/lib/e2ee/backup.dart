// E4: passphrase-encrypted backup. Mirrors apps/shared/e2ee/backup.ts.
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

import 'codec.dart';
import 'keys.dart';

const backupPbkdf2Iters = 100000;
const backupMinPassphrase = 8;

Future<Uint8List> deriveBackupKey(String passphrase, Uint8List salt) async {
  final out = await Pbkdf2(
    macAlgorithm: Hmac.sha256(),
    iterations: backupPbkdf2Iters,
    bits: 256,
  ).deriveKeyFromPassword(password: passphrase, nonce: salt);
  return Uint8List.fromList(await out.extractBytes());
}

class BackupBlob {
  final int v;
  final String salt;
  final String iv;
  final String ct;
  const BackupBlob({required this.v, required this.salt, required this.iv, required this.ct});

  factory BackupBlob.fromJson(Map<String, dynamic> j) => BackupBlob(
      v: j['v'] as int, salt: j['salt'] as String, iv: j['iv'] as String, ct: j['ct'] as String);
}

Future<BackupBlob> encryptBackup(String passphrase, String payloadJson,
    {Uint8List? saltOverride, Uint8List? ivOverride}) async {
  if (passphrase.length < backupMinPassphrase) {
    throw StateError('backup passphrase too short');
  }
  final salt = saltOverride ?? randomBytes(16);
  final iv = ivOverride ?? randomBytes(12);
  final key = await deriveBackupKey(passphrase, salt);
  final ct = await aesGcmEncrypt(key, iv, utf8Encode(payloadJson));
  return BackupBlob(v: 1, salt: b64uEncode(salt), iv: b64uEncode(iv), ct: b64uEncode(ct));
}

Future<String> decryptBackup(String passphrase, BackupBlob blob) async {
  if (blob.v != 1) throw StateError('unsupported backup version');
  final key = await deriveBackupKey(passphrase, b64uDecode(blob.salt));
  final pt = await aesGcmDecrypt(key, b64uDecode(blob.iv), b64uDecode(blob.ct));
  return utf8Decode(pt);
}
