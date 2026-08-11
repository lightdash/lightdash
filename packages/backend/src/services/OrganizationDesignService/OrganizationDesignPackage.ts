import {
    MAX_THEME_FILE_BYTES,
    MAX_THEME_TOTAL_BYTES,
    ORGANIZATION_DESIGN_PACKAGE_CODE_VERSION,
    ORGANIZATION_DESIGN_PACKAGE_MANIFEST,
    ParameterError,
    type OrganizationDesignFileKind,
    type OrganizationDesignPackageManifest,
} from '@lightdash/common';
import {
    extract as tarExtract,
    pack as tarPack,
    type Headers,
} from 'tar-stream';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_SLUG_LENGTH = 255;
const MAX_ENTRY_PATH_LENGTH = 512;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_SHAPED_SLUG_PATTERN =
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const TAR_EPOCH = new Date(0);

const PACKAGE_DIRECTORY_BY_KIND: Record<OrganizationDesignFileKind, string> = {
    css: 'css',
    font: 'fonts',
    image: 'images',
    instruction: 'instructions',
};

const PACKAGE_KIND_BY_DIRECTORY = new Map<string, OrganizationDesignFileKind>(
    Object.entries(PACKAGE_DIRECTORY_BY_KIND).map(([kind, directory]) => [
        directory,
        kind as OrganizationDesignFileKind,
    ]),
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

export type OrganizationDesignPackageFile = {
    kind: OrganizationDesignFileKind;
    filename: string;
    contentType: string;
    body: Buffer;
};

export type ParsedOrganizationDesignPackage = {
    manifest: OrganizationDesignPackageManifest;
    files: OrganizationDesignPackageFile[];
};

const getExtension = (filename: string): string => {
    const dot = filename.lastIndexOf('.');
    return dot === -1 ? '' : filename.slice(dot).toLowerCase();
};

export const getOrganizationDesignPackageContentType = (
    filename: string,
): string =>
    CONTENT_TYPE_BY_EXTENSION[getExtension(filename)] ??
    'application/octet-stream';

export const getOrganizationDesignPackageFilePath = (
    kind: OrganizationDesignFileKind,
    filename: string,
): string => `${PACKAGE_DIRECTORY_BY_KIND[kind]}/${filename}`;

const validateArchivePath = (entryName: string): string => {
    if (!entryName || entryName.length > MAX_ENTRY_PATH_LENGTH) {
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

const parseFilePath = (
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

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

const parseManifest = (body: Buffer): OrganizationDesignPackageManifest => {
    let source: string;
    try {
        source = new TextDecoder('utf-8', { fatal: true }).decode(body);
    } catch {
        throw new ParameterError('Theme manifest must be valid UTF-8 YAML');
    }

    let parsed: unknown;
    try {
        parsed = parseYaml(source, { strict: true, uniqueKeys: true });
    } catch {
        throw new ParameterError('Theme manifest contains invalid YAML');
    }
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

const toError = (error: unknown): Error =>
    error instanceof Error ? error : new Error(String(error));

const toPackageParseError = (error: unknown): ParameterError =>
    error instanceof ParameterError
        ? error
        : new ParameterError('Theme package is not a valid tar archive');

export const parseOrganizationDesignPackage = (
    archive: Buffer,
): Promise<ParsedOrganizationDesignPackage> =>
    new Promise((resolve, reject) => {
        const extractor = tarExtract();
        const seenPaths = new Set<string>();
        const files: OrganizationDesignPackageFile[] = [];
        let manifestBody: Buffer | null = null;
        let totalFileBytes = 0;
        let settled = false;

        const fail = (error: unknown): void => {
            if (settled) return;
            settled = true;
            extractor.destroy();
            reject(toPackageParseError(error));
        };

        extractor.on('entry', (header, stream, next) => {
            try {
                const entryName = validateArchivePath(header.name);
                const entryType = header.type ?? 'file';
                const pathKey = entryName.toLowerCase();
                if (seenPaths.has(pathKey)) {
                    throw new ParameterError(
                        `Theme package contains a duplicate path: ${entryName}`,
                    );
                }
                seenPaths.add(pathKey);

                if (entryType === 'directory') {
                    if (!PACKAGE_KIND_BY_DIRECTORY.has(entryName)) {
                        throw new ParameterError(
                            `Unknown theme package directory: ${entryName}`,
                        );
                    }
                    stream.resume();
                    stream.on('end', next);
                    return;
                }
                if (entryType !== 'file') {
                    throw new ParameterError(
                        `Theme package entry type is not allowed: ${entryType}`,
                    );
                }

                const isManifest =
                    entryName === ORGANIZATION_DESIGN_PACKAGE_MANIFEST;
                const maxBytes = isManifest
                    ? MAX_MANIFEST_BYTES
                    : MAX_THEME_FILE_BYTES;
                if ((header.size ?? 0) > maxBytes) {
                    throw new ParameterError(
                        `Theme package entry exceeds ${maxBytes} bytes: ${entryName}`,
                    );
                }

                const parsedPath = isManifest ? null : parseFilePath(entryName);
                const chunks: Buffer[] = [];
                let bytes = 0;
                stream.on('data', (chunk: Buffer | string) => {
                    const buffer = Buffer.isBuffer(chunk)
                        ? chunk
                        : Buffer.from(chunk);
                    bytes += buffer.length;
                    if (bytes > maxBytes) {
                        stream.destroy(
                            new ParameterError(
                                `Theme package entry exceeds ${maxBytes} bytes: ${entryName}`,
                            ),
                        );
                        return;
                    }
                    chunks.push(buffer);
                });
                stream.on('error', fail);
                stream.on('end', () => {
                    if (settled) return;
                    try {
                        const body = Buffer.concat(chunks);
                        if (isManifest) {
                            manifestBody = body;
                        } else if (parsedPath) {
                            if (body.length === 0) {
                                throw new ParameterError(
                                    `Theme package file is empty: ${entryName}`,
                                );
                            }
                            totalFileBytes += body.length;
                            if (totalFileBytes > MAX_THEME_TOTAL_BYTES) {
                                throw new ParameterError(
                                    `Theme package files exceed ${MAX_THEME_TOTAL_BYTES} bytes`,
                                );
                            }
                            files.push({
                                ...parsedPath,
                                contentType:
                                    getOrganizationDesignPackageContentType(
                                        parsedPath.filename,
                                    ),
                                body,
                            });
                        }
                        next();
                    } catch (error) {
                        fail(error);
                    }
                });
            } catch (error) {
                stream.resume();
                fail(error);
            }
        });
        extractor.on('error', fail);
        extractor.on('finish', () => {
            if (settled) return;
            try {
                if (!manifestBody) {
                    throw new ParameterError(
                        `Theme package is missing ${ORGANIZATION_DESIGN_PACKAGE_MANIFEST}`,
                    );
                }
                const manifest = parseManifest(manifestBody);
                settled = true;
                resolve({ manifest, files });
            } catch (error) {
                fail(error);
            }
        });
        try {
            extractor.end(archive);
        } catch (error) {
            fail(error);
        }
    });

const addTarEntry = (
    packer: ReturnType<typeof tarPack>,
    header: Headers,
    body?: Buffer,
): Promise<void> =>
    new Promise((resolve, reject) => {
        packer.entry(header, body, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });

export const buildOrganizationDesignPackage = (
    manifest: OrganizationDesignPackageManifest,
    files: OrganizationDesignPackageFile[],
): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        const packer = tarPack();
        const chunks: Buffer[] = [];
        packer.on('data', (chunk: Buffer) => chunks.push(chunk));
        packer.on('end', () => resolve(Buffer.concat(chunks)));
        packer.on('error', reject);

        void (async () => {
            const manifestBody = Buffer.from(
                stringifyYaml(
                    {
                        codeVersion: manifest.codeVersion,
                        slug: manifest.slug,
                        name: manifest.name,
                        description: manifest.description,
                        extraInstructions: manifest.extraInstructions,
                    },
                    { lineWidth: 0 },
                ),
                'utf8',
            );
            await addTarEntry(
                packer,
                {
                    name: ORGANIZATION_DESIGN_PACKAGE_MANIFEST,
                    type: 'file',
                    mode: 0o644,
                    mtime: TAR_EPOCH,
                    uid: 0,
                    gid: 0,
                },
                manifestBody,
            );

            for (const directory of PACKAGE_KIND_BY_DIRECTORY.keys()) {
                // eslint-disable-next-line no-await-in-loop
                await addTarEntry(packer, {
                    name: `${directory}/`,
                    type: 'directory',
                    mode: 0o755,
                    mtime: TAR_EPOCH,
                    uid: 0,
                    gid: 0,
                });
            }

            const sortedFiles = [...files].sort((left, right) =>
                getOrganizationDesignPackageFilePath(
                    left.kind,
                    left.filename,
                ).localeCompare(
                    getOrganizationDesignPackageFilePath(
                        right.kind,
                        right.filename,
                    ),
                ),
            );
            const seenPaths = new Set<string>();
            for (const file of sortedFiles) {
                const entryName = validateArchivePath(
                    getOrganizationDesignPackageFilePath(
                        file.kind,
                        file.filename,
                    ),
                );
                parseFilePath(entryName);
                const pathKey = entryName.toLowerCase();
                if (seenPaths.has(pathKey)) {
                    throw new ParameterError(
                        `Theme contains a duplicate package path: ${entryName}`,
                    );
                }
                seenPaths.add(pathKey);
                // eslint-disable-next-line no-await-in-loop
                await addTarEntry(
                    packer,
                    {
                        name: entryName,
                        type: 'file',
                        mode: 0o644,
                        mtime: TAR_EPOCH,
                        uid: 0,
                        gid: 0,
                    },
                    file.body,
                );
            }
            packer.finalize();
        })().catch((error: unknown) => packer.destroy(toError(error)));
    });
