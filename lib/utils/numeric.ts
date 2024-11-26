import { RIPEMD160 } from "./ripemd";

const base58Chars =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const base64Chars =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Key types this library supports */
export enum KeyType {
  k1 = 0,
  r1 = 1,
  wa = 2,
}

/** Public key data size, excluding type field */
export const publicKeyDataSize = 33;

/** Private key data size, excluding type field */
export const privateKeyDataSize = 32;

/** Signature data size, excluding type field */
export const signatureDataSize = 65;

/** Public key, private key, or signature in binary form */
export interface Key {
  type: KeyType;
  data: Uint8Array;
}

const create_base58_map = (): number[] => {
  const base58M = Array(256).fill(-1) as number[];
  for (let i = 0; i < base58Chars.length; ++i) {
    base58M[base58Chars.charCodeAt(i)] = i;
  }
  return base58M;
};

const ripemd160 = (input: Uint8Array): ArrayBuffer => {
  return RIPEMD160.hash(input);
};

const digestSuffixRipemd160 = (
  data: Uint8Array,
  suffix: string
): ArrayBuffer => {
  const d = new Uint8Array(data.length + suffix.length);
  for (let i = 0; i < data.length; ++i) {
    d[i] = data[i];
  }
  for (let i = 0; i < suffix.length; ++i) {
    d[data.length + i] = suffix.charCodeAt(i);
  }
  return ripemd160(d);
};

/**
 * Convert `bignum` to a base-58 number
 *
 * @param minDigits 0-pad result to this many digits
 */
export const binaryToBase58 = (bignum: Uint8Array, minDigits = 1): string => {
  const result = [] as number[];
  const base58Map = create_base58_map();

  for (let i = 0; i < bignum.length; ++i) {
    const byte = bignum[i];
    let carry = byte;
    for (let j = 0; j < result.length; ++j) {
      const x = (base58Map[result[j]] << 8) + carry;
      result[j] = base58Chars.charCodeAt(x % 58);
      carry = (x / 58) | 0;
    }
    while (carry) {
      result.push(base58Chars.charCodeAt(carry % 58));
      carry = (carry / 58) | 0;
    }
  }

  for (let i = 0; i < bignum.length; ++i) {
    const byte = bignum[i];
    if (byte) {
      break;
    } else {
      result.push("1".charCodeAt(0));
    }
  }

  result.reverse();
  return String.fromCharCode(...result);
};

const base58ToBinaryVarSize = (s: string): Uint8Array => {
  const result = [] as number[];
  const base58Map = create_base58_map();

  for (let i = 0; i < s.length; ++i) {
    let carry = base58Map[s.charCodeAt(i)];
    if (carry < 0) {
      throw new Error("invalid base-58 value");
    }
    for (let j = 0; j < result.length; ++j) {
      const x = result[j] * 58 + carry;
      result[j] = x & 0xff;
      carry = x >> 8;
    }
    if (carry) {
      result.push(carry);
    }
  }

  for (const ch of s) {
    if (ch === "1") {
      result.push(0);
    } else {
      break;
    }
  }

  result.reverse();
  return new Uint8Array(result);
};

/**
 * Convert an unsigned base-58 number in `s` to a bignum
 *
 * @param size bignum size (bytes)
 */
export const base58ToBinary = (size: number, s: string): Uint8Array => {
  if (!size) {
    return base58ToBinaryVarSize(s);
  }
  const result = new Uint8Array(size);
  const base58Map = create_base58_map();

  for (let i = 0; i < s.length; ++i) {
    let carry = base58Map[s.charCodeAt(i)];
    if (carry < 0) {
      throw new Error("invalid base-58 value");
    }
    for (let j = 0; j < size; ++j) {
      const x = result[j] * 58 + carry;
      result[j] = x;
      carry = x >> 8;
    }
    if (carry) {
      throw new Error("base-58 value is out of range");
    }
  }
  result.reverse();
  return result;
};

const keyToString = (key: Key, suffix: string, prefix: string): string => {
  const digest = new Uint8Array(digestSuffixRipemd160(key.data, suffix));
  const whole = new Uint8Array(key.data.length + 4);
  for (let i = 0; i < key.data.length; ++i) {
    whole[i] = key.data[i];
  }
  for (let i = 0; i < 4; ++i) {
    whole[i + key.data.length] = digest[i];
  }
  return prefix + binaryToBase58(whole);
};

const stringToKey = (
  s: string,
  type: KeyType,
  size: number,
  suffix: string
): Key => {
  const whole = base58ToBinary(size ? size + 4 : 0, s);
  const result = {
    type,
    data: new Uint8Array(whole.buffer, 0, whole.length - 4),
  };
  const digest = new Uint8Array(digestSuffixRipemd160(result.data, suffix));
  if (
    digest[0] !== whole[whole.length - 4] ||
    digest[1] !== whole[whole.length - 3] ||
    digest[2] !== whole[whole.length - 2] ||
    digest[3] !== whole[whole.length - 1]
  ) {
    throw new Error("checksum doesn't match");
  }
  return result;
};

export const publicKeyToString = (key: Key): string => {
  if (key.type === KeyType.k1 && key.data.length === publicKeyDataSize) {
    return keyToString(key, "K1", "PUB_K1_");
  } else if (key.type === KeyType.r1 && key.data.length === publicKeyDataSize) {
    return keyToString(key, "R1", "PUB_R1_");
  } else if (key.type === KeyType.wa) {
    return keyToString(key, "WA", "PUB_WA_");
  } else {
    throw new Error("unrecognized public key format");
  }
};

/** Convert key in `s` to binary form */
export const stringToPublicKey = (s: string): Key => {
  if (typeof s !== "string") {
    throw new Error("expected string containing public key");
  }
  if (s.slice(0, 3) === "EOS") {
    const whole = base58ToBinary(publicKeyDataSize + 4, s.slice(3));
    const key = { type: KeyType.k1, data: new Uint8Array(publicKeyDataSize) };
    for (let i = 0; i < publicKeyDataSize; ++i) {
      key.data[i] = whole[i];
    }
    const digest = new Uint8Array(ripemd160(key.data));
    if (
      digest[0] !== whole[publicKeyDataSize] ||
      digest[1] !== whole[34] ||
      digest[2] !== whole[35] ||
      digest[3] !== whole[36]
    ) {
      throw new Error("checksum doesn't match");
    }
    return key;
  } else if (s.slice(0, 7) === "PUB_K1_") {
    return stringToKey(s.slice(7), KeyType.k1, publicKeyDataSize, "K1");
  } else if (s.slice(0, 7) === "PUB_R1_") {
    return stringToKey(s.slice(7), KeyType.r1, publicKeyDataSize, "R1");
  } else if (s.slice(0, 7) === "PUB_WA_") {
    return stringToKey(s.slice(7), KeyType.wa, 0, "WA");
  } else {
    throw new Error("unrecognized public key format");
  }
};

/** Convert `signature` to string (base-58) form */
export const signatureToString = (signature: Key): string => {
  if (signature.type === KeyType.k1) {
    return keyToString(signature, "K1", "SIG_K1_");
  } else if (signature.type === KeyType.r1) {
    return keyToString(signature, "R1", "SIG_R1_");
  } else if (signature.type === KeyType.wa) {
    return keyToString(signature, "WA", "SIG_WA_");
  } else {
    throw new Error("unrecognized signature format");
  }
};
