import {
    MAX_THEME_FILE_BYTES,
    type OrganizationDesignFileKind,
} from '@lightdash/common';
import { brotliDecompress, inflate } from 'node:zlib';
import type { Logger } from 'winston';

// Canonical fallback values. Keep the two static authoring references linked
// below aligned when these change:
// - sandboxes/data-apps/template/references/themes.md
// - skills/developing-in-lightdash/resources/data-app-themes-reference.md
export const APPLE_SANS_SYSTEM_FONT_STACK =
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const APPLE_MONO_SYSTEM_FONT_STACK =
    'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace';
export const APPLE_SERIF_SYSTEM_FONT_STACK = 'ui-serif, Georgia, serif';

type RestrictedAppleFontPolicy = {
    family: string;
    fallback: string;
    identifiers: string[];
};

const RESTRICTED_APPLE_FONT_POLICIES: RestrictedAppleFontPolicy[] = [
    {
        family: 'SF Mono',
        fallback: APPLE_MONO_SYSTEM_FONT_STACK,
        identifiers: ['sf ns mono', 'sfns mono', 'sf mono', 'sfmono'],
    },
    {
        family: 'San Francisco',
        fallback: APPLE_SANS_SYSTEM_FONT_STACK,
        identifiers: [
            'san francisco display',
            'san francisco text',
            'san francisco',
            'sf compact rounded',
            'sf compact display',
            'sf compact text',
            'sf compact',
            'sfcompact rounded',
            'sfcompact display',
            'sfcompact text',
            'sfcompact',
            'sf pro rounded',
            'sf pro display',
            'sf pro text',
            'sf pro',
            'sfpro rounded',
            'sfpro display',
            'sfpro text',
            'sfpro',
            'sf arabic rounded',
            'sf arabic',
            'sfarabic rounded',
            'sfarabic',
            'sf armenian rounded',
            'sf armenian',
            'sfarmenian rounded',
            'sfarmenian',
            'sf georgian rounded',
            'sf georgian',
            'sfgeorgian rounded',
            'sfgeorgian',
            'sf hebrew rounded',
            'sf hebrew',
            'sfhebrew rounded',
            'sfhebrew',
            'sf ui display',
            'sf ui text',
            'sf ui',
            'sfui display',
            'sfui text',
            'sfui',
            'sf ns rounded',
            'sf ns display',
            'sf ns text',
            'sf ns',
            'sfns rounded',
            'sfns display',
            'sfns text',
            'sfns',
            'sf hello',
            'sfhello',
        ],
    },
    {
        family: 'New York',
        fallback: APPLE_SERIF_SYSTEM_FONT_STACK,
        identifiers: [
            'new york extra large',
            'new york small',
            'new york medium',
            'new york large',
            'new york',
            'newyork extra large',
            'newyork small',
            'newyork medium',
            'newyork large',
            'newyork',
        ],
    },
];

const FONT_STYLE_TOKENS = new Set([
    'black',
    'bold',
    'compressed',
    'condensed',
    'display',
    'expanded',
    'extra',
    'heavy',
    'italic',
    'light',
    'medium',
    'oblique',
    'regular',
    'roman',
    'semi',
    'semibold',
    'text',
    'thin',
    'ultra',
    'ultralight',
]);
const FONT_FILE_EXTENSION = /\.(?:woff2?|ttf|otf)$/i;
const FONT_NAME_IDS = new Set([1, 4, 6, 16]);
const MAX_FONT_NAME_TABLE_BYTES = 1024 * 1024;

const WOFF2_KNOWN_TAGS = [
    'cmap',
    'head',
    'hhea',
    'hmtx',
    'maxp',
    'name',
    'OS/2',
    'post',
    'cvt ',
    'fpgm',
    'glyf',
    'loca',
    'prep',
    'CFF ',
    'VORG',
    'EBDT',
    'EBLC',
    'gasp',
    'hdmx',
    'kern',
    'LTSH',
    'PCLT',
    'VDMX',
    'vhea',
    'vmtx',
    'BASE',
    'GDEF',
    'GPOS',
    'GSUB',
    'EBSC',
    'JSTF',
    'MATH',
    'CBDT',
    'CBLC',
    'COLR',
    'CPAL',
    'SVG ',
    'sbix',
    'acnt',
    'avar',
    'bdat',
    'bloc',
    'bsln',
    'cvar',
    'fdsc',
    'feat',
    'fmtx',
    'fvar',
    'gvar',
    'hsty',
    'just',
    'lcar',
    'mort',
    'morx',
    'opbd',
    'prop',
    'trak',
    'Zapf',
    'Silf',
    'Glat',
    'Gloc',
    'Feat',
    'Sill',
] as const;

export type RestrictedAppleFontMatch = {
    family: string;
    fallback: string;
    evidence: 'metadata' | 'filename';
    matchedValue: string;
};

export type AppleFontInspectionResult =
    | { status: 'allowed' }
    | { status: 'restricted'; match: RestrictedAppleFontMatch }
    | { status: 'unreadable' };

const normalizeFontIdentifier = (value: string): string =>
    value
        .normalize('NFKD')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/[^a-z\d]+/g, ' ')
        .trim();

const isKnownStyleSuffix = (suffix: string): boolean => {
    const tokens = suffix.split(' ');
    return (
        tokens.length > 0 &&
        tokens.every(
            (token) => FONT_STYLE_TOKENS.has(token) || /^\d{2,3}$/.test(token),
        )
    );
};

const matchesRestrictedIdentifier = (
    normalized: string,
    identifier: string,
): boolean => {
    if (normalized === identifier) return true;
    if (!normalized.startsWith(`${identifier} `)) return false;
    return isKnownStyleSuffix(normalized.slice(identifier.length + 1));
};

const matchRestrictedAppleFont = (
    value: string,
    evidence: RestrictedAppleFontMatch['evidence'],
): RestrictedAppleFontMatch | null => {
    const candidate =
        evidence === 'filename'
            ? value.replace(FONT_FILE_EXTENSION, '')
            : value;
    const normalized = normalizeFontIdentifier(candidate);
    const policy = RESTRICTED_APPLE_FONT_POLICIES.find(({ identifiers }) =>
        identifiers.some((identifier) =>
            matchesRestrictedIdentifier(normalized, identifier),
        ),
    );
    return policy
        ? {
              family: policy.family,
              fallback: policy.fallback,
              evidence,
              matchedValue: value,
          }
        : null;
};

export const classifyRestrictedAppleFont = ({
    metadataNames,
    filename,
}: {
    metadataNames: string[];
    filename: string;
}): RestrictedAppleFontMatch | null => {
    for (const name of metadataNames) {
        const match = matchRestrictedAppleFont(name, 'metadata');
        if (match) return match;
    }

    // Internal names are authoritative when present. Filename matching is a
    // fallback for malformed or unusually subsetted fonts whose name table
    // cannot be read.
    if (metadataNames.length > 0) return null;
    return matchRestrictedAppleFont(filename, 'filename');
};

const hasRange = (body: Buffer, offset: number, length: number): boolean =>
    Number.isSafeInteger(offset) &&
    Number.isSafeInteger(length) &&
    offset >= 0 &&
    length >= 0 &&
    offset <= body.length &&
    length <= body.length - offset;

const decodeUtf16Be = (value: Buffer): string | null => {
    if (value.length % 2 !== 0) return null;
    try {
        return Buffer.from(value).swap16().toString('utf16le');
    } catch {
        return null;
    }
};

const decodeNameRecord = (value: Buffer, platformId: number): string | null => {
    let decoded: string | null = null;
    if (platformId === 0 || platformId === 3) {
        decoded = decodeUtf16Be(value);
    } else if (platformId === 1) {
        decoded = value.toString('latin1');
    }
    const trimmed = decoded?.replaceAll('\0', '').trim();
    return trimmed ? trimmed : null;
};

const readNamesFromNameTable = (table: Buffer): string[] => {
    if (table.length < 6) return [];
    const count = table.readUInt16BE(2);
    const stringOffset = table.readUInt16BE(4);
    const recordsLength = count * 12;
    if (
        !hasRange(table, 6, recordsLength) ||
        stringOffset < 6 + recordsLength
    ) {
        return [];
    }

    const names = new Set<string>();
    for (let index = 0; index < count; index += 1) {
        const recordOffset = 6 + index * 12;
        const platformId = table.readUInt16BE(recordOffset);
        const nameId = table.readUInt16BE(recordOffset + 6);
        if (FONT_NAME_IDS.has(nameId)) {
            const length = table.readUInt16BE(recordOffset + 8);
            const relativeOffset = table.readUInt16BE(recordOffset + 10);
            const valueOffset = stringOffset + relativeOffset;
            if (hasRange(table, valueOffset, length)) {
                const decoded = decodeNameRecord(
                    table.subarray(valueOffset, valueOffset + length),
                    platformId,
                );
                if (decoded) names.add(decoded);
            }
        }
    }
    return [...names];
};

const readSfntNameTable = (body: Buffer): Buffer | null => {
    if (body.length < 12) return null;
    const numTables = body.readUInt16BE(4);
    if (!hasRange(body, 12, numTables * 16)) return null;

    for (let index = 0; index < numTables; index += 1) {
        const recordOffset = 12 + index * 16;
        if (body.toString('ascii', recordOffset, recordOffset + 4) === 'name') {
            const offset = body.readUInt32BE(recordOffset + 8);
            const length = body.readUInt32BE(recordOffset + 12);
            if (
                length > MAX_FONT_NAME_TABLE_BYTES ||
                !hasRange(body, offset, length)
            ) {
                return null;
            }
            return body.subarray(offset, offset + length);
        }
    }
    return null;
};

const inflateAsync = (body: Buffer, maxOutputLength: number): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        inflate(body, { maxOutputLength }, (error, result) => {
            if (error) reject(error);
            else resolve(Buffer.from(result));
        });
    });

const readWoffNameTable = async (body: Buffer): Promise<Buffer | null> => {
    const WOFF_HEADER_BYTES = 44;
    const WOFF_DIRECTORY_ENTRY_BYTES = 20;
    if (body.length < WOFF_HEADER_BYTES) return null;

    const numTables = body.readUInt16BE(12);
    if (
        !hasRange(
            body,
            WOFF_HEADER_BYTES,
            numTables * WOFF_DIRECTORY_ENTRY_BYTES,
        )
    ) {
        return null;
    }

    let nameTable:
        | { offset: number; compressedLength: number; originalLength: number }
        | undefined;
    for (let index = 0; index < numTables; index += 1) {
        const recordOffset =
            WOFF_HEADER_BYTES + index * WOFF_DIRECTORY_ENTRY_BYTES;
        if (body.toString('ascii', recordOffset, recordOffset + 4) === 'name') {
            nameTable = {
                offset: body.readUInt32BE(recordOffset + 4),
                compressedLength: body.readUInt32BE(recordOffset + 8),
                originalLength: body.readUInt32BE(recordOffset + 12),
            };
        }
    }
    if (!nameTable) return null;

    if (
        nameTable.originalLength > MAX_FONT_NAME_TABLE_BYTES ||
        nameTable.compressedLength > nameTable.originalLength ||
        !hasRange(body, nameTable.offset, nameTable.compressedLength)
    ) {
        return null;
    }

    const compressed = body.subarray(
        nameTable.offset,
        nameTable.offset + nameTable.compressedLength,
    );
    if (nameTable.compressedLength === nameTable.originalLength) {
        return compressed;
    }
    const decompressed = await inflateAsync(
        compressed,
        nameTable.originalLength,
    );
    return decompressed.length === nameTable.originalLength
        ? decompressed
        : null;
};

const readUIntBase128 = (
    body: Buffer,
    initialOffset: number,
): { value: number; nextOffset: number } => {
    let value = 0;
    let offset = initialOffset;
    for (let index = 0; index < 5; index += 1) {
        if (!hasRange(body, offset, 1)) throw new Error('Invalid UIntBase128');
        const byte = body[offset];
        offset += 1;
        if (index === 0 && byte === 0x80) {
            throw new Error('Invalid UIntBase128 leading zero');
        }
        if (value > 0x01ffffff) throw new Error('UIntBase128 overflow');
        value = value * 128 + (byte % 128);
        if (value > 0xffffffff) throw new Error('UIntBase128 overflow');
        if (byte < 0x80) return { value, nextOffset: offset };
    }
    throw new Error('Invalid UIntBase128 length');
};

const brotliDecompressAsync = (
    body: Buffer,
    maxOutputLength: number,
): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        brotliDecompress(body, { maxOutputLength }, (error, result) => {
            if (error) reject(error);
            else resolve(Buffer.from(result));
        });
    });

const readWoff2NameTable = async (body: Buffer): Promise<Buffer | null> => {
    const WOFF2_HEADER_BYTES = 48;
    if (body.length < WOFF2_HEADER_BYTES) return null;

    // Collections have an additional variable-length directory. They are not
    // accepted as TTF/OTF uploads, so preserve rather than deeply parsing an
    // unusual legacy WOFF2 collection.
    if (body.toString('ascii', 4, 8) === 'ttcf') return null;

    const declaredLength = body.readUInt32BE(8);
    const numTables = body.readUInt16BE(12);
    const compressedLength = body.readUInt32BE(20);
    if (declaredLength > body.length || declaredLength < WOFF2_HEADER_BYTES) {
        return null;
    }

    let directoryOffset = WOFF2_HEADER_BYTES;
    let decompressedLength = 0;
    let nameTableOffset: number | null = null;
    let nameTableLength = 0;

    for (let index = 0; index < numTables; index += 1) {
        if (!hasRange(body, directoryOffset, 1)) return null;
        const flags = body[directoryOffset];
        directoryOffset += 1;

        const tagIndex = flags % 64;
        let tag: string;
        if (tagIndex === 0x3f) {
            if (!hasRange(body, directoryOffset, 4)) return null;
            tag = body.toString('ascii', directoryOffset, directoryOffset + 4);
            directoryOffset += 4;
        } else {
            tag = WOFF2_KNOWN_TAGS[tagIndex];
            if (!tag) return null;
        }

        const original = readUIntBase128(body, directoryOffset);
        directoryOffset = original.nextOffset;
        const transformVersion = Math.floor(flags / 64);
        let transformed = transformVersion !== 0;
        if (tag === 'glyf' || tag === 'loca') {
            transformed = transformVersion === 0;
        }
        let storedLength = original.value;
        if (transformed) {
            const transform = readUIntBase128(body, directoryOffset);
            directoryOffset = transform.nextOffset;
            storedLength = transform.value;
        }

        if (tag === 'name') {
            if (transformed || original.value > MAX_FONT_NAME_TABLE_BYTES) {
                return null;
            }
            nameTableOffset = decompressedLength;
            nameTableLength = original.value;
        }

        decompressedLength += storedLength;
        if (
            !Number.isSafeInteger(decompressedLength) ||
            decompressedLength > MAX_THEME_FILE_BYTES
        ) {
            return null;
        }
    }

    if (
        nameTableOffset === null ||
        decompressedLength === 0 ||
        !hasRange(body, directoryOffset, compressedLength)
    ) {
        return null;
    }

    const decompressed = await brotliDecompressAsync(
        body.subarray(directoryOffset, directoryOffset + compressedLength),
        decompressedLength,
    );
    if (
        decompressed.length !== decompressedLength ||
        !hasRange(decompressed, nameTableOffset, nameTableLength)
    ) {
        return null;
    }
    return decompressed.subarray(
        nameTableOffset,
        nameTableOffset + nameTableLength,
    );
};

const readFontMetadataNames = async (body: Buffer): Promise<string[]> => {
    try {
        const signature = body.toString('ascii', 0, 4);
        let nameTable: Buffer | null;
        if (signature === 'wOFF') {
            nameTable = await readWoffNameTable(body);
        } else if (signature === 'wOF2') {
            nameTable = await readWoff2NameTable(body);
        } else {
            nameTable = readSfntNameTable(body);
        }
        return nameTable ? readNamesFromNameTable(nameTable) : [];
    } catch {
        return [];
    }
};

export const inspectAppleFont = async ({
    body,
    filename,
}: {
    body: Buffer;
    filename: string;
}): Promise<AppleFontInspectionResult> => {
    const metadataNames = await readFontMetadataNames(body);
    const match = classifyRestrictedAppleFont({ metadataNames, filename });
    if (match) return { status: 'restricted', match };
    return metadataNames.length > 0
        ? { status: 'allowed' }
        : { status: 'unreadable' };
};

export const restrictedAppleFontUploadMessage = ({
    filename,
    match,
}: {
    filename: string;
    match: RestrictedAppleFontMatch;
}): string =>
    `Font file "${filename}" matches the restricted Apple system font ${match.family} (${match.evidence}: "${match.matchedValue}") and can't be uploaded as a web font. Remove the file and use this system font stack instead: ${match.fallback}.`;

export const inspectThemeFileForBundling = async ({
    file,
    body,
    designUuid,
    logger,
}: {
    file: { kind: OrganizationDesignFileKind; filename: string };
    body: Buffer;
    designUuid: string;
    logger: Logger;
}): Promise<
    { status: 'include' } | { status: 'omit'; match: RestrictedAppleFontMatch }
> => {
    if (file.kind !== 'font') return { status: 'include' };

    const inspection = await inspectAppleFont({
        body,
        filename: file.filename,
    });
    if (inspection.status === 'restricted') {
        logger.warn(
            `Theme ${designUuid}: omitted restricted Apple font filename=${file.filename} family=${inspection.match.family} evidence=${inspection.match.evidence}`,
        );
        return { status: 'omit', match: inspection.match };
    }
    if (inspection.status === 'unreadable') {
        logger.warn(
            `Theme ${designUuid}: could not inspect font metadata; preserving filename=${file.filename}`,
        );
    }
    return { status: 'include' };
};

export const omittedThemeFontGuidance = (
    matches: RestrictedAppleFontMatch[],
): string => {
    const stacks = [...new Set(matches.map(({ fallback }) => fallback))];
    const count = matches.length;
    return [
        `${count} theme font file${count === 1 ? ' was' : 's were'} omitted because ${count === 1 ? 'it matches' : 'they match'} the restricted Apple system-font policy.`,
        'Do not recreate, embed, or download the omitted font files. Preserve the intended typography with these system font stacks:',
        ...stacks.map((fallback) => `- \`${fallback}\``),
    ].join('\n');
};
