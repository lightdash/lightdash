import {
    getOrganizationDesignPackageContentType,
    getOrganizationDesignPackageFilePath,
    isOrganizationDesignPackageDirectory,
    MAX_THEME_FILE_BYTES,
    MAX_THEME_MANIFEST_BYTES,
    MAX_THEME_TOTAL_BYTES,
    ORGANIZATION_DESIGN_PACKAGE_DIRECTORIES,
    ORGANIZATION_DESIGN_PACKAGE_MANIFEST,
    ParameterError,
    parseOrganizationDesignPackageFilePath,
    parseOrganizationDesignPackageManifest,
    validateOrganizationDesignPackageEntryPath,
    type OrganizationDesignFileKind,
    type OrganizationDesignPackageManifest,
} from '@lightdash/common';
import {
    extract as tarExtract,
    pack as tarPack,
    type Headers,
} from 'tar-stream';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const TAR_EPOCH = new Date(0);

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
    return parseOrganizationDesignPackageManifest(parsed);
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
                const entryName = validateOrganizationDesignPackageEntryPath(
                    header.name,
                );
                const entryType = header.type ?? 'file';
                const pathKey = entryName.toLowerCase();
                if (seenPaths.has(pathKey)) {
                    throw new ParameterError(
                        `Theme package contains a duplicate path: ${entryName}`,
                    );
                }
                seenPaths.add(pathKey);

                if (entryType === 'directory') {
                    if (!isOrganizationDesignPackageDirectory(entryName)) {
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
                    ? MAX_THEME_MANIFEST_BYTES
                    : MAX_THEME_FILE_BYTES;
                if ((header.size ?? 0) > maxBytes) {
                    throw new ParameterError(
                        `Theme package entry exceeds ${maxBytes} bytes: ${entryName}`,
                    );
                }

                const parsedPath = isManifest
                    ? null
                    : parseOrganizationDesignPackageFilePath(entryName);
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

            for (const directory of ORGANIZATION_DESIGN_PACKAGE_DIRECTORIES) {
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
                const entryName = validateOrganizationDesignPackageEntryPath(
                    getOrganizationDesignPackageFilePath(
                        file.kind,
                        file.filename,
                    ),
                );
                parseOrganizationDesignPackageFilePath(entryName);
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
