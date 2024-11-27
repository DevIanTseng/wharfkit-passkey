import { stringToPublicKey } from "./numeric";

export const hexToUint8Array = (hex: string): Uint8Array => {
  if (typeof hex !== "string") {
    throw new Error("Expected string containing hex digits");
  }
  if (hex.length % 2) {
    throw new Error("Odd number of hex digits");
  }
  const l = hex.length / 2;
  const result = new Uint8Array(l);
  for (let i = 0; i < l; ++i) {
    const x = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(x)) {
      throw new Error("Expected hex string");
    }
    result[i] = x;
  }
  return result;
};

export const arrayToHex = (data: Uint8Array): string => {
  let result = "";
  for (let i = 0; i < data.length; i++) {
    result += ("00" + data[i].toString(16)).slice(-2);
  }
  return result.toUpperCase();
};

export const compareBytes = (a: Uint8Array, b: Uint8Array): number => {
  const minLength = Math.min(a.length, b.length);

  for (let i = 0; i < minLength; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }

  return a.length - b.length;
};

enum PublicKeyFormat {
  K1 = "K1",
  R1 = "R1",
  WA = "WA",
}

const getPublicKeyFormat = (pubkey: string): PublicKeyFormat => {
  if (pubkey.startsWith("PUB_K1_") || pubkey.startsWith("EOS")) {
    return PublicKeyFormat.K1;
  } else if (pubkey.startsWith("PUB_R1_")) {
    return PublicKeyFormat.R1;
  } else if (pubkey.startsWith("PUB_WA_")) {
    return PublicKeyFormat.WA;
  }

  throw new Error("unrecognized public key format");
};

export const sortPubKeys = (
  pubKeys: { key: string; weight: number }[]
): { key: string; weight: number }[] => {
  const formatOrder: Record<PublicKeyFormat, number> = {
    K1: 0,
    R1: 1,
    WA: 2,
  };

  return pubKeys.sort((a, b) => {
    const pubkeyA = stringToPublicKey(a.key);
    const pubkeyB = stringToPublicKey(b.key);

    const formatA = getPublicKeyFormat(a.key);
    const formatB = getPublicKeyFormat(b.key);

    const formatCompare = formatOrder[formatA] - formatOrder[formatB];

    if (formatCompare !== 0) {
      return formatCompare;
    }

    return compareBytes(pubkeyA.data, pubkeyB.data);
  });
};
