import { decode } from "cbor2";
import { arrayToHex, hexToUint8Array } from ".";
import { SerialBuffer } from "./serial-buffer";
import { KeyType, publicKeyToString } from "./numeric";

const enum AttestationFlags {
  userPresent = 0x01,
  userVerified = 0x04,
  attestedCredentialPresent = 0x40,
  extensionDataPresent = 0x80,
}

const enum UserPresence {
  none = 0,
  present = 1,
  verified = 2,
}

const flagsToPresence = (flags: number) => {
  if (flags & AttestationFlags.userVerified) return UserPresence.verified;
  else if (flags & AttestationFlags.userPresent) return UserPresence.present;
  else return UserPresence.none;
};

export const decodeKey = async (payload: {
  rpid: string;
  id: string;
  attestationObject: string;
}): Promise<{
  credentialId: string;
  key: string;
}> => {
  const att: {
    authData: Uint8Array;
  } = await decode(hexToUint8Array(payload.attestationObject));

  const data = new DataView(att.authData.buffer);

  let pos = 30; // skip unknown
  pos += 32; // RP ID hash
  const flags = data.getUint8(pos++);
  const signCount = data.getUint32(pos);
  pos += 4;

  if (!(flags & AttestationFlags.attestedCredentialPresent)) {
    throw new Error("attestedCredentialPresent flag not set");
  }

  const aaguid = arrayToHex(new Uint8Array(data.buffer, pos, 16));
  pos += 16;
  const credentialIdLength = data.getUint16(pos);
  pos += 2;
  const credentialId = new Uint8Array(data.buffer, pos, credentialIdLength);
  pos += credentialIdLength;

  const pubKey: Map<number, any> = await decode(
    new Uint8Array(data.buffer, pos)
  );

  if (arrayToHex(credentialId) !== payload.id) {
    throw new Error("Credential ID does not match");
  }

  if (pubKey.get(1) !== 2) {
    throw new Error("Public key is not EC2");
  }
  if (pubKey.get(3) !== -7) {
    throw new Error("Public key is not ES256");
  }
  if (pubKey.get(-1) !== 1) {
    throw new Error("Public key has unsupported curve");
  }

  const x = pubKey.get(-2);
  const y = pubKey.get(-3);
  if (x.length !== 32 || y.length !== 32) {
    throw new Error("Public key has invalid X or Y size");
  }

  const ser = new SerialBuffer({
    textEncoder: new TextEncoder(),
    textDecoder: new TextDecoder(),
  });

  ser.push(y[31] & 1 ? 3 : 2);
  ser.pushArray(x);
  ser.push(flagsToPresence(flags));
  ser.pushString(payload.rpid);
  const compact = ser.asUint8Array();

  console.log(compact);

  const key = publicKeyToString({
    type: KeyType.wa,
    data: compact,
  });

  console.log(key);

  return {
    credentialId: arrayToHex(credentialId),
    key,
  };
};
