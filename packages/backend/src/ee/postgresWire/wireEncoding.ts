/** Big-endian primitives shared by the message writers and the binary codec */

export const cstring = (s: string): Buffer =>
    // a NUL inside the string would terminate it early on the client
    Buffer.concat([
        Buffer.from(s.replace(/\0/g, ''), 'utf8'),
        Buffer.from([0]),
    ]);

export const int16 = (n: number): Buffer => {
    const b = Buffer.alloc(2);
    b.writeInt16BE(n);
    return b;
};

/** Counts on the wire are unsigned (Postgres reads them with pq_getmsgint) */
export const uint16 = (n: number): Buffer => {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(n);
    return b;
};

export const int32 = (n: number): Buffer => {
    const b = Buffer.alloc(4);
    b.writeInt32BE(n);
    return b;
};

export const int64 = (n: bigint): Buffer => {
    const b = Buffer.alloc(8);
    b.writeBigInt64BE(n);
    return b;
};

export const float64 = (n: number): Buffer => {
    const b = Buffer.alloc(8);
    b.writeDoubleBE(n);
    return b;
};
