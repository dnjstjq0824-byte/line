// E4: X3DH key agreement. Mirrors apps/shared/e2ee/x3dh.ts.
import 'dart:typed_data';

import 'codec.dart';
import 'keys.dart';

class TheirBundle {
  final Uint8List identityX;
  final Uint8List signedPrekey;
  final Uint8List? oneTimePrekey;
  const TheirBundle({required this.identityX, required this.signedPrekey, this.oneTimePrekey});
}

class X3DHInit {
  final Uint8List sharedSecret;
  final Uint8List ephemeralPub;
  final Uint8List ephemeralPriv;
  final bool usedOneTime;
  const X3DHInit({required this.sharedSecret, required this.ephemeralPub, required this.ephemeralPriv, required this.usedOneTime});
}

final _zeroSalt = Uint8List(32);

Future<Uint8List> _kdf(Uint8List dhOut) =>
    hkdfSha256(dhOut, _zeroSalt, infoX3dh, 32);

Future<X3DHInit> x3dhInitiate(
    Uint8List ownIdentityPriv, TheirBundle bundle,
    [Uint8List? ephemeralSeed]) async {
  final ephPriv = ephemeralSeed ?? randomBytes(32);
  final ephPub = await x25519Public(ephPriv);
  final parts = [
    await x25519Shared(ownIdentityPriv, bundle.signedPrekey),
    await x25519Shared(ephPriv, bundle.identityX),
    await x25519Shared(ephPriv, bundle.signedPrekey),
  ];
  var usedOneTime = false;
  if (bundle.oneTimePrekey != null) {
    parts.add(await x25519Shared(ephPriv, bundle.oneTimePrekey!));
    usedOneTime = true;
  }
  return X3DHInit(
    sharedSecret: await _kdf(concatBytes(parts)),
    ephemeralPub: ephPub,
    ephemeralPriv: ephPriv,
    usedOneTime: usedOneTime,
  );
}

Future<Uint8List> x3dhRespond(
  Uint8List ownIdentityPriv,
  Uint8List ownSignedPriv,
  Uint8List? ownOneTimePriv,
  Uint8List theirIdentityX,
  Uint8List theirEphemeral,
) async {
  final parts = [
    await x25519Shared(ownSignedPriv, theirIdentityX),
    await x25519Shared(ownIdentityPriv, theirEphemeral),
    await x25519Shared(ownSignedPriv, theirEphemeral),
  ];
  if (ownOneTimePriv != null) {
    parts.add(await x25519Shared(ownOneTimePriv, theirEphemeral));
  }
  return _kdf(concatBytes(parts));
}
