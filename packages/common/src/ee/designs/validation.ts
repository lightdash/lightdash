import { ParameterError } from '../../types/errors';
import {
    MAX_THEME_FILE_BYTES,
    ORGANIZATION_DESIGN_FILE_KINDS,
    ORGANIZATION_DESIGN_PACKAGE_CODE_VERSION,
    type OrganizationDesignFileKind,
    type OrganizationDesignPackageManifest,
} from './types';

export const MAX_THEME_MANIFEST_BYTES = 64 * 1024;
export const MAX_THEME_PACKAGE_ENTRY_PATH_LENGTH = 512;

export const ORGANIZATION_DESIGN_PACKAGE_DIRECTORY_BY_KIND = {
    css: 'css',
    font: 'fonts',
    image: 'images',
    instruction: 'instructions',
} as const satisfies Record<OrganizationDesignFileKind, string>;

export const ORGANIZATION_DESIGN_PACKAGE_DIRECTORIES = Object.values(
    ORGANIZATION_DESIGN_PACKAGE_DIRECTORY_BY_KIND,
);

const PACKAGE_KIND_BY_DIRECTORY = new Map<string, OrganizationDesignFileKind>(
    Object.entries(ORGANIZATION_DESIGN_PACKAGE_DIRECTORY_BY_KIND).map(
        ([kind, directory]) => [directory, kind as OrganizationDesignFileKind],
    ),
);

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.md': 'text/markdown; charset=utf-8',
    '.otf': 'font/otf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

const KIND_EXTENSIONS: Record<OrganizationDesignFileKind, string[]> = {
    css: ['.css'],
    font: ['.woff', '.woff2', '.ttf', '.otf'],
    image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
    instruction: ['.md'],
};

type SignatureAlternative = ReadonlyArray<{
    offset: number;
    bytes: ReadonlyArray<number>;
}>;

const BINARY_SIGNATURES: Record<string, ReadonlyArray<SignatureAlternative>> = {
    '.woff2': [[{ offset: 0, bytes: [0x77, 0x4f, 0x46, 0x32] }]],
    '.woff': [[{ offset: 0, bytes: [0x77, 0x4f, 0x46, 0x46] }]],
    '.ttf': [
        [{ offset: 0, bytes: [0x00, 0x01, 0x00, 0x00] }],
        [{ offset: 0, bytes: [0x74, 0x72, 0x75, 0x65] }],
    ],
    '.otf': [[{ offset: 0, bytes: [0x4f, 0x54, 0x54, 0x4f] }]],
    '.png': [
        [
            {
                offset: 0,
                bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
            },
        ],
    ],
    '.jpg': [[{ offset: 0, bytes: [0xff, 0xd8, 0xff] }]],
    '.jpeg': [[{ offset: 0, bytes: [0xff, 0xd8, 0xff] }]],
    '.gif': [
        [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }],
        [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }],
    ],
    '.webp': [
        [
            { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
            { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
        ],
    ],
};

const TEXT_EXTENSIONS = new Set(['.css', '.md', '.svg']);
const SVG_HEAD_PREFIX = /^\s*<(?:\?xml|svg|!--|!DOCTYPE)/i;
const TEXT_HEAD_SCAN_BYTES = 1024;
const FILENAME_BAD_CHARS = /[\0/\\]/;
const MAX_SLUG_LENGTH = 255;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_SHAPED_SLUG_PATTERN =
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const getOrganizationDesignFileExtension = (
    filename: string,
): string => {
    const lower = filename.toLowerCase();
    const dot = lower.lastIndexOf('.');
    return dot === -1 ? '' : lower.slice(dot);
};

export const getOrganizationDesignPackageContentType = (
    filename: string,
): string =>
    CONTENT_TYPE_BY_EXTENSION[getOrganizationDesignFileExtension(filename)] ??
    'application/octet-stream';

export const getOrganizationDesignPackageFilePath = (
    kind: OrganizationDesignFileKind,
    filename: string,
): string =>
    `${ORGANIZATION_DESIGN_PACKAGE_DIRECTORY_BY_KIND[kind]}/${filename}`;

export const isOrganizationDesignPackageDirectory = (value: string): boolean =>
    PACKAGE_KIND_BY_DIRECTORY.has(value);

export const validateOrganizationDesignPackageEntryPath = (
    entryName: string,
): string => {
    if (!entryName || entryName.length > MAX_THEME_PACKAGE_ENTRY_PATH_LENGTH) {
        throw new ParameterError('Theme package entry path is invalid');
    }
    if (
        entryName.startsWith('/') ||
        entryName.includes('\\') ||
        entryName.includes('\0')
    ) {
        throw new ParameterError(
            `Theme package entry path is unsafe: ${entryName}`,
        );
    }

    const withoutTrailingSlash = entryName.endsWith('/')
        ? entryName.slice(0, -1)
        : entryName;
    const segments = withoutTrailingSlash.split('/');
    if (
        !withoutTrailingSlash ||
        segments.some(
            (segment) => !segment || segment === '.' || segment === '..',
        )
    ) {
        throw new ParameterError(
            `Theme package entry path is unsafe: ${entryName}`,
        );
    }
    return withoutTrailingSlash;
};

export const parseOrganizationDesignPackageFilePath = (
    entryName: string,
): { kind: OrganizationDesignFileKind; filename: string } => {
    const segments = entryName.split('/');
    if (segments.length !== 2) {
        throw new ParameterError(
            `Theme package file must be inside css/, fonts/, images/, or instructions/: ${entryName}`,
        );
    }
    const kind = PACKAGE_KIND_BY_DIRECTORY.get(segments[0]);
    if (!kind) {
        throw new ParameterError(
            `Unknown theme package directory: ${segments[0]}`,
        );
    }
    if (segments[1] !== segments[1].trim()) {
        throw new ParameterError(
            `Theme package filename may not have surrounding whitespace: ${entryName}`,
        );
    }
    return { kind, filename: segments[1] };
};

const normalizeNullableText = (
    value: unknown,
    field: 'description' | 'extraInstructions',
): string | null => {
    if (value === null) return null;
    if (typeof value !== 'string') {
        throw new ParameterError(
            `Theme manifest ${field} must be a string or null`,
        );
    }
    return value.trim() || null;
};

export const parseOrganizationDesignPackageManifest = (
    parsed: unknown,
): OrganizationDesignPackageManifest => {
    if (!isRecord(parsed)) {
        throw new ParameterError('Theme manifest must be a YAML object');
    }

    const expectedKeys = new Set([
        'codeVersion',
        'slug',
        'name',
        'description',
        'extraInstructions',
    ]);
    const actualKeys = Object.keys(parsed);
    const unknownKey = actualKeys.find((key) => !expectedKeys.has(key));
    const missingKey = [...expectedKeys].find(
        (key) => !Object.prototype.hasOwnProperty.call(parsed, key),
    );
    if (unknownKey) {
        throw new ParameterError(`Unknown theme manifest field: ${unknownKey}`);
    }
    if (missingKey) {
        throw new ParameterError(`Missing theme manifest field: ${missingKey}`);
    }
    if (parsed.codeVersion !== ORGANIZATION_DESIGN_PACKAGE_CODE_VERSION) {
        throw new ParameterError(
            `Unsupported theme package codeVersion: ${String(parsed.codeVersion)}`,
        );
    }
    if (
        typeof parsed.slug !== 'string' ||
        parsed.slug.length > MAX_SLUG_LENGTH ||
        !SLUG_PATTERN.test(parsed.slug) ||
        UUID_SHAPED_SLUG_PATTERN.test(parsed.slug)
    ) {
        throw new ParameterError(
            'Theme manifest slug must contain lowercase letters, numbers, and single hyphen separators',
        );
    }
    if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
        throw new ParameterError('Theme manifest name is required');
    }

    return {
        codeVersion: ORGANIZATION_DESIGN_PACKAGE_CODE_VERSION,
        slug: parsed.slug,
        name: parsed.name.trim(),
        description: normalizeNullableText(parsed.description, 'description'),
        extraInstructions: normalizeNullableText(
            parsed.extraInstructions,
            'extraInstructions',
        ),
    };
};

export const validateOrganizationDesignFileMetadata = ({
    kind: inputKind,
    filename: inputFilename,
}: {
    kind: string;
    filename: string;
}): { kind: OrganizationDesignFileKind; filename: string } => {
    if (
        !(ORGANIZATION_DESIGN_FILE_KINDS as readonly string[]).includes(
            inputKind,
        )
    ) {
        throw new ParameterError(
            `Invalid kind "${inputKind}". Allowed: ${ORGANIZATION_DESIGN_FILE_KINDS.join(', ')}`,
        );
    }
    const kind = inputKind as OrganizationDesignFileKind;
    const filename = inputFilename.trim();
    if (!filename) {
        throw new ParameterError('Filename is required');
    }
    if (filename.length > 255) {
        throw new ParameterError('Filename exceeds 255 characters');
    }
    if (filename.includes('..')) {
        throw new ParameterError('Filename may not contain ".."');
    }
    if (FILENAME_BAD_CHARS.test(filename)) {
        throw new ParameterError(
            'Filename may not contain slashes or null bytes',
        );
    }

    const allowed = KIND_EXTENSIONS[kind];
    if (
        !allowed.some((extension) => filename.toLowerCase().endsWith(extension))
    ) {
        throw new ParameterError(
            `Filename "${filename}" does not match kind "${kind}". Allowed extensions: ${allowed.join(', ')}`,
        );
    }

    return { kind, filename };
};

export const validateOrganizationDesignFileContent = ({
    body,
    filename,
}: {
    body: Uint8Array;
    filename: string;
}): void => {
    if (body.length === 0) {
        throw new ParameterError('Theme package file is empty');
    }
    if (body.length > MAX_THEME_FILE_BYTES) {
        throw new ParameterError(
            `Theme package file exceeds ${MAX_THEME_FILE_BYTES} bytes`,
        );
    }

    const extension = getOrganizationDesignFileExtension(filename);
    const binaryAlternatives = BINARY_SIGNATURES[extension];
    if (binaryAlternatives) {
        const matchesAny = binaryAlternatives.some((alternative) =>
            alternative.every(({ offset, bytes }) =>
                bytes.every((byte, index) => body[offset + index] === byte),
            ),
        );
        if (!matchesAny) {
            throw new ParameterError(
                `File content does not match ${extension} signature`,
            );
        }
        return;
    }

    if (TEXT_EXTENSIONS.has(extension)) {
        try {
            new TextDecoder('utf-8', { fatal: true }).decode(body);
        } catch {
            throw new ParameterError(
                `File content for ${extension} must be valid UTF-8 text`,
            );
        }
        const head = body.subarray(
            0,
            Math.min(body.length, TEXT_HEAD_SCAN_BYTES),
        );
        if (head.includes(0)) {
            throw new ParameterError(
                `File content for ${extension} contains null bytes`,
            );
        }
        if (
            extension === '.svg' &&
            !SVG_HEAD_PREFIX.test(new TextDecoder('utf-8').decode(head))
        ) {
            throw new ParameterError(
                'SVG content must start with <?xml, <svg, or an XML comment/doctype',
            );
        }
    }
};
