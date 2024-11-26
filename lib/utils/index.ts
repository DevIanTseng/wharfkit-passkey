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
