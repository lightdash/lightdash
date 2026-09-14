import { brotliCompressSync, deflateSync } from 'node:zlib';

type TestFontNames = {
    familyName: string;
    fullName: string;
    postscriptName: string;
};

const uint16 = (value: number): Buffer => {
    const result = Buffer.alloc(2);
    result.writeUInt16BE(value);
    return result;
};

const encodeUtf16Be = (value: string): Buffer =>
    Buffer.from(value, 'utf16le').swap16();

const makeNameTable = ({
    familyName,
    fullName,
    postscriptName,
}: TestFontNames): Buffer => {
    const names = [familyName, fullName, postscriptName].map(encodeUtf16Be);
    let stringOffset = 0;
    const records = names.map((name, index) => {
        const record = Buffer.alloc(12);
        record.writeUInt16BE(3, 0); // Windows platform
        record.writeUInt16BE(1, 2); // Unicode BMP encoding
        record.writeUInt16BE(0x0409, 4); // en-US
        record.writeUInt16BE([1, 4, 6][index], 6); // family/full/PostScript
        record.writeUInt16BE(name.length, 8);
        record.writeUInt16BE(stringOffset, 10);
        stringOffset += name.length;
        return record;
    });
    return Buffer.concat([
        uint16(0),
        uint16(records.length),
        uint16(6 + records.length * 12),
        ...records,
        ...names,
    ]);
};

/**
 * Build a minimal sfnt with a standard name table. It is intentionally not
 * renderable: tests only need real binary metadata parsing without committing
 * a third-party font fixture.
 */
export const makeTestTrueTypeFont = (names: TestFontNames): Buffer => {
    const nameTable = makeNameTable(names);

    const sfntHeader = Buffer.alloc(28);
    sfntHeader.writeUInt32BE(0x00010000, 0);
    sfntHeader.writeUInt16BE(1, 4);
    sfntHeader.write('name', 12, 'ascii');
    sfntHeader.writeUInt32BE(sfntHeader.length, 20);
    sfntHeader.writeUInt32BE(nameTable.length, 24);
    return Buffer.concat([sfntHeader, nameTable]);
};

export const makeTestWoffFont = (names: TestFontNames): Buffer => {
    const nameTable = makeNameTable(names);
    const compressed = deflateSync(nameTable);
    const stored =
        compressed.length < nameTable.length ? compressed : nameTable;
    const header = Buffer.alloc(64);
    header.write('wOFF', 0, 'ascii');
    header.writeUInt32BE(0x00010000, 4);
    header.writeUInt32BE(header.length + stored.length, 8);
    header.writeUInt16BE(1, 12);
    header.writeUInt32BE(28 + nameTable.length, 16);
    header.write('name', 44, 'ascii');
    header.writeUInt32BE(header.length, 48);
    header.writeUInt32BE(stored.length, 52);
    header.writeUInt32BE(nameTable.length, 56);
    return Buffer.concat([header, stored]);
};

const encodeUIntBase128 = (value: number): Buffer => {
    const bytes = [value % 128];
    let remaining = Math.floor(value / 128);
    while (remaining > 0) {
        bytes.unshift((remaining % 128) + 128);
        remaining = Math.floor(remaining / 128);
    }
    return Buffer.from(bytes);
};

export const makeTestWoff2Font = (names: TestFontNames): Buffer => {
    const nameTable = makeNameTable(names);
    const compressed = brotliCompressSync(nameTable);
    const directory = Buffer.concat([
        Buffer.from([5]), // `name` in the WOFF2 known-tag table, null transform
        encodeUIntBase128(nameTable.length),
    ]);
    const header = Buffer.alloc(48);
    const totalLength = header.length + directory.length + compressed.length;
    header.write('wOF2', 0, 'ascii');
    header.writeUInt32BE(0x00010000, 4);
    header.writeUInt32BE(totalLength, 8);
    header.writeUInt16BE(1, 12);
    header.writeUInt32BE(28 + nameTable.length, 16);
    header.writeUInt32BE(compressed.length, 20);
    return Buffer.concat([header, directory, compressed]);
};

export const makeOversizedTestWoff2Font = (): Buffer => {
    const directory = Buffer.concat([
        Buffer.from([5]),
        encodeUIntBase128(10 * 1024 * 1024 + 1),
    ]);
    const header = Buffer.alloc(48);
    header.write('wOF2', 0, 'ascii');
    header.writeUInt32BE(0x00010000, 4);
    header.writeUInt32BE(header.length + directory.length, 8);
    header.writeUInt16BE(1, 12);
    header.writeUInt32BE(directory.length, 16);
    header.writeUInt32BE(0, 20);
    return Buffer.concat([header, directory]);
};
