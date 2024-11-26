export class SerialBuffer {
  /** Amount of valid data in `array` */
  public length: number;

  /** Data in serialized (binary) form */
  public array: Uint8Array;

  /** Current position while reading (deserializing) */
  public readPos = 0;

  public textEncoder: TextEncoder;
  public textDecoder: TextDecoder;

  /**
   * @param __namedParameters
   * `array`: `null` if serializing, or binary data to deserialize
   * `textEncoder`: `TextEncoder` instance to use. Pass in `null` if running in a browser
   * `textDecoder`: `TextDecider` instance to use. Pass in `null` if running in a browser
   */
  constructor(
    { textEncoder, textDecoder, array } = {} as {
      textEncoder?: TextEncoder;
      textDecoder?: TextDecoder;
      array?: Uint8Array;
    }
  ) {
    this.array = array || new Uint8Array(1024);
    this.length = array ? array.length : 0;
    this.textEncoder = textEncoder || new TextEncoder();
    this.textDecoder = textDecoder || new TextDecoder("utf-8", { fatal: true });
  }

  /** Resize `array` if needed to have at least `size` bytes free */
  public reserve(size: number): void {
    if (this.length + size <= this.array.length) {
      return;
    }
    let l = this.array.length;
    while (this.length + size > l) {
      l = Math.ceil(l * 1.5);
    }
    const newArray = new Uint8Array(l);
    newArray.set(this.array);
    this.array = newArray;
  }

  /** Return data with excess storage trimmed away */
  public asUint8Array(): Uint8Array {
    return new Uint8Array(
      this.array.buffer,
      this.array.byteOffset,
      this.length
    );
  }

  /** Append bytes */
  public pushArray(v: number[] | Uint8Array): void {
    this.reserve(v.length);
    this.array.set(v, this.length);
    this.length += v.length;
  }

  /** Append bytes */
  public push(...v: number[]): void {
    this.pushArray(v);
  }

  /** Append a `varuint32` */
  public pushVaruint32(v: number): void {
    while (true) {
      if (v >>> 7) {
        this.push(0x80 | (v & 0x7f));
        v = v >>> 7;
      } else {
        this.push(v);
        break;
      }
    }
  }

  /** Append length-prefixed binary data */
  public pushBytes(v: number[] | Uint8Array): void {
    this.pushVaruint32(v.length);
    this.pushArray(v);
  }

  /** Append a string */
  public pushString(v: string): void {
    this.pushBytes(this.textEncoder.encode(v));
  }

  /** Get a single byte */
  public get(): number {
    if (this.readPos < this.length) {
      return this.array[this.readPos++];
    }
    throw new Error("Read past end of buffer");
  }

  /** Get `len` bytes */
  public getUint8Array(len: number): Uint8Array {
    if (this.readPos + len > this.length) {
      throw new Error("Read past end of buffer");
    }
    const result = new Uint8Array(
      this.array.buffer,
      this.array.byteOffset + this.readPos,
      len
    );
    this.readPos += len;
    return result;
  }
}
