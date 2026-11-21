// E3: X3DH key agreement (Signal X3DH, info strings per E1).
import { x25519 } from '@noble/curves/ed25519';

import { concatBytes, hkdfSha256, x25519Shared } from './keys.ts';
import { INFO_X3DH } from './keys.ts';

export interface TheirBundle {
  identityX: Uint8Array;
  signedPrekey: Uint8Array;
  oneTimePrekey: Uint8Array | null;
}

export interface X3DHInit {
  sharedSecret: Uint8Array;
  ephemeralPub: Uint8Array;
  ephemeralPriv: Uint8Array;
  usedOneTime: boolean;
}

const ZERO_SALT = new Uint8Array(32);

function kdf(dhOut: Uint8Array): Uint8Array {
  return hkdfSha256(dhOut, ZERO_SALT, INFO_X3DH, 32);
}

// Initiator side (sender to a fresh peer bundle).
export function x3dhInitiate(ownIdentityPriv: Uint8Array, bundle: TheirBundle, ephemeralSeed?: Uint8Array): X3DHInit {
  const ephPriv = ephemeralSeed ?? x25519.utils.randomPrivateKey();
  const ephPub = x25519.getPublicKey(ephPriv);
  const parts = [
    x25519Shared(ownIdentityPriv, bundle.signedPrekey),
    x25519Shared(ephPriv, bundle.identityX),
    x25519Shared(ephPriv, bundle.signedPrekey),
  ];
  let usedOneTime = false;
  if (bundle.oneTimePrekey) {
    parts.push(x25519Shared(ephPriv, bundle.oneTimePrekey));
    usedOneTime = true;
  }
  return { sharedSecret: kdf(concatBytes(...parts)), ephemeralPub: ephPub, ephemeralPriv: ephPriv, usedOneTime };
}

// Responder side (receiver of a prekey message).
export function x3dhRespond(
  ownIdentityPriv: Uint8Array,
  ownSignedPriv: Uint8Array,
  ownOneTimePriv: Uint8Array | null,
  theirIdentityX: Uint8Array,
  theirEphemeral: Uint8Array,
): Uint8Array {
  const parts = [
    x25519Shared(ownSignedPriv, theirIdentityX),
    x25519Shared(ownIdentityPriv, theirEphemeral),
    x25519Shared(ownSignedPriv, theirEphemeral),
  ];
  if (ownOneTimePriv) parts.push(x25519Shared(ownOneTimePriv, theirEphemeral));
  return kdf(concatBytes(...parts));
}
