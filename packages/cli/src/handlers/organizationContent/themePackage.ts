/* eslint-disable no-await-in-loop */
import {
    getErrorMessage,
    getOrganizationDesignPackageContentType,
    getOrganizationDesignPackageFilePath,
    isOrganizationDesignPackageDirectory,
    MAX_THEME_FILE_BYTES,
    MAX_THEME_MANIFEST_BYTES,
    MAX_THEME_PACKAGE_BYTES,
    MAX_THEME_TOTAL_BYTES,
    ORGANIZATION_DESIGN_PACKAGE_DIRECTORIES,
    ORGANIZATION_DESIGN_PACKAGE_DIRECTORY_BY_KIND,
    ORGANIZATION_DESIGN_PACKAGE_MANIFEST,
    ParameterError,
    parseOrganizationDesignPackageFilePath,
    parseOrganizationDesignPackageManifest,
    validateOrganizationDesignFileContent,
    validateOrganizationDesignFileMetadata,
    validateOrganizationDesignPackageEntryPath,
    type OrganizationDesignFileKind,
    type OrganizationDesignPackageManifest,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { promises as fs, type Dirent } from 'fs';
import * as path from 'path';
import {
    extract as tarExtract,
    pack as tarPack,
    type Headers,
} from 'tar-stream';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const TAR_EPOCH = new Date(0);
const MACOS_METADATA_FILENAME = '.DS_Store';
const THEME_BACKUP_DIRECTORY_PATTERN =
    /\.backup-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ThemePackageFile = {
    kind: OrganizationDesignFileKind;
    filename: string;
    contentType: string;
    body: Buffer;
};

export type ParsedThemePackage = {
    manifest: OrganizationDesignPackageManifest;
    files: ThemePackageFile[];
};

export type PreparedThemeUpload = {
    directory: string;
    manifest: OrganizationDesignPackageManifest;
    archive: Buffer;
};

export const getThemesFolder = (organizationContentPath: string): string =>
    path.join(organizationContentPath, 'themes');

const isEnoent = (error: unknown): boolean =>
    (error as NodeJS.ErrnoException).code === 'ENOENT';

const toError = (error: unknown): Error =>
    error instanceof Error ? error : new Error(String(error));

const withoutMacOsMetadata = (entries: Dirent[]): Dirent[] =>
    entries.filter((entry) => entry.name !== MACOS_METADATA_FILENAME);

const isInternalThemeDirectory = (name: string): boolean =>
    name.startsWith('.lightdash-theme-') ||
    THEME_BACKUP_DIRECTORY_PATTERN.test(name);

const assertNoCaseInsensitiveDuplicates = (
    entries: Dirent[],
    source: string,
): void => {
    const seen = new Map<string, string>();
    for (const entry of entries) {
        const key = entry.name.toLowerCase();
        const previous = seen.get(key);
        if (previous !== undefined) {
            throw new ParameterError(
                `Theme package contains case-insensitive duplicate paths in "${source}": "${previous}" and "${entry.name}"`,
            );
        }
        seen.set(key, entry.name);
    }
};

const parseManifestBody = (body: Buffer): OrganizationDesignPackageManifest => {
    if (body.length > MAX_THEME_MANIFEST_BYTES) {
        throw new ParameterError(
            `Theme manifest exceeds ${MAX_THEME_MANIFEST_BYTES} bytes`,
        );
    }

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

const buildThemeArchive = (
    manifest: OrganizationDesignPackageManifest,
    files: ThemePackageFile[],
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
            if (manifestBody.length > MAX_THEME_MANIFEST_BYTES) {
                throw new ParameterError(
                    `Theme manifest exceeds ${MAX_THEME_MANIFEST_BYTES} bytes`,
                );
            }
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
            for (const file of sortedFiles) {
                await addTarEntry(
                    packer,
                    {
                        name: getOrganizationDesignPackageFilePath(
                            file.kind,
                            file.filename,
                        ),
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

const readLocalThemeDirectory = async (
    directory: string,
): Promise<PreparedThemeUpload> => {
    const entries = withoutMacOsMetadata(
        await fs.readdir(directory, { withFileTypes: true }),
    );
    assertNoCaseInsensitiveDuplicates(entries, directory);

    const expectedEntries = new Set<string>([
        ORGANIZATION_DESIGN_PACKAGE_MANIFEST,
        ...ORGANIZATION_DESIGN_PACKAGE_DIRECTORIES,
    ]);
    const unknownEntry = entries.find(
        (entry) => !expectedEntries.has(entry.name),
    );
    if (unknownEntry) {
        throw new ParameterError(
            `Unknown theme package path: ${path.join(directory, unknownEntry.name)}`,
        );
    }

    if (
        !entries.some(
            (entry) => entry.name === ORGANIZATION_DESIGN_PACKAGE_MANIFEST,
        )
    ) {
        throw new ParameterError(
            `Theme package is missing ${path.join(directory, ORGANIZATION_DESIGN_PACKAGE_MANIFEST)}`,
        );
    }

    const manifestEntry = entries.find(
        (entry) => entry.name === ORGANIZATION_DESIGN_PACKAGE_MANIFEST,
    );
    if (!manifestEntry?.isFile()) {
        throw new ParameterError(
            `Theme manifest must be a regular file: ${path.join(directory, ORGANIZATION_DESIGN_PACKAGE_MANIFEST)}`,
        );
    }
    const manifestBody = await fs.readFile(
        path.join(directory, ORGANIZATION_DESIGN_PACKAGE_MANIFEST),
    );
    const manifest = parseManifestBody(manifestBody);
    if (path.basename(directory) !== manifest.slug) {
        throw new ParameterError(
            `Theme directory "${path.basename(directory)}" must match manifest slug "${manifest.slug}"`,
        );
    }

    const files: ThemePackageFile[] = [];
    let totalBytes = 0;
    for (const [kind, packageDirectory] of Object.entries(
        ORGANIZATION_DESIGN_PACKAGE_DIRECTORY_BY_KIND,
    ) as Array<[OrganizationDesignFileKind, string]>) {
        const directoryEntry = entries.find(
            (entry) => entry.name === packageDirectory,
        );
        if (directoryEntry && !directoryEntry.isDirectory()) {
            throw new ParameterError(
                `Theme package path must be a regular directory: ${path.join(directory, packageDirectory)}`,
            );
        }

        const assetDirectory = path.join(directory, packageDirectory);
        const assetEntries = directoryEntry
            ? withoutMacOsMetadata(
                  await fs.readdir(assetDirectory, {
                      withFileTypes: true,
                  }),
              )
            : [];
        assertNoCaseInsensitiveDuplicates(assetEntries, assetDirectory);
        for (const assetEntry of assetEntries.sort((left, right) =>
            left.name.localeCompare(right.name),
        )) {
            if (!assetEntry.isFile()) {
                throw new ParameterError(
                    `Theme package files must be regular files without symlinks or nested directories: ${path.join(assetDirectory, assetEntry.name)}`,
                );
            }
            const filePath = path.join(assetDirectory, assetEntry.name);
            const body = await fs.readFile(filePath);
            const metadata = validateOrganizationDesignFileMetadata({
                kind,
                filename: assetEntry.name,
            });
            if (metadata.filename !== assetEntry.name) {
                throw new ParameterError(
                    `Theme package filename may not have surrounding whitespace: ${filePath}`,
                );
            }
            validateOrganizationDesignFileContent({
                body,
                filename: metadata.filename,
            });
            totalBytes += body.length;
            if (totalBytes > MAX_THEME_TOTAL_BYTES) {
                throw new ParameterError(
                    `Theme package files exceed ${MAX_THEME_TOTAL_BYTES} bytes`,
                );
            }
            files.push({
                ...metadata,
                contentType: getOrganizationDesignPackageContentType(
                    metadata.filename,
                ),
                body,
            });
        }
    }

    const archive = await buildThemeArchive(manifest, files);
    if (archive.length > MAX_THEME_PACKAGE_BYTES) {
        throw new ParameterError(
            `Theme package exceeds ${MAX_THEME_PACKAGE_BYTES} bytes`,
        );
    }
    return { directory, manifest, archive };
};

export const prepareThemeUploads = async (
    organizationContentPath: string,
): Promise<PreparedThemeUpload[]> => {
    const themesFolder = getThemesFolder(organizationContentPath);
    let entries: Dirent[];
    try {
        entries = (
            await fs.readdir(themesFolder, { withFileTypes: true })
        ).filter(
            (entry) =>
                entry.name !== MACOS_METADATA_FILENAME &&
                !isInternalThemeDirectory(entry.name),
        );
    } catch (error) {
        if (isEnoent(error)) return [];
        throw error;
    }
    if (entries.length === 0) return [];
    assertNoCaseInsensitiveDuplicates(entries, themesFolder);

    const failures: Array<{ message: string }> = [];
    const prepared: PreparedThemeUpload[] = [];
    for (const entry of entries.sort((left, right) =>
        left.name.localeCompare(right.name),
    )) {
        const directory = path.join(themesFolder, entry.name);
        if (!entry.isDirectory()) {
            failures.push({
                message: `Invalid theme path "${directory}": expected a regular directory without symlinks`,
            });
        } else {
            try {
                prepared.push(await readLocalThemeDirectory(directory));
            } catch (error) {
                failures.push({
                    message: `Invalid theme directory "${directory}": ${getErrorMessage(error)}`,
                });
            }
        }
    }

    const bySlug = new Map<string, PreparedThemeUpload[]>();
    for (const item of prepared) {
        bySlug.set(item.manifest.slug, [
            ...(bySlug.get(item.manifest.slug) ?? []),
            item,
        ]);
    }
    for (const [slug, items] of bySlug) {
        if (items.length > 1) {
            failures.push({
                message: `Duplicate theme slug "${slug}" in ${items.map(({ directory }) => `"${directory}"`).join(', ')}`,
            });
        }
    }

    if (failures.length > 0) {
        throw new ParameterError(
            failures.map(({ message }) => message).join('\n'),
        );
    }
    return prepared;
};

export const parseThemeArchive = (
    archive: Buffer,
): Promise<ParsedThemePackage> =>
    new Promise((resolve, reject) => {
        if (archive.length === 0 || archive.length > MAX_THEME_PACKAGE_BYTES) {
            reject(
                new ParameterError(
                    `Theme package must be between 1 and ${MAX_THEME_PACKAGE_BYTES} bytes`,
                ),
            );
            return;
        }

        const extractor = tarExtract();
        const seenPaths = new Set<string>();
        const files: ThemePackageFile[] = [];
        let manifestBody: Buffer | null = null;
        let totalBytes = 0;
        let settled = false;
        const fail = (error: unknown): void => {
            if (settled) return;
            settled = true;
            extractor.destroy();
            reject(
                error instanceof ParameterError
                    ? error
                    : new ParameterError(
                          'Theme package is not a valid tar archive',
                      ),
            );
        };

        extractor.on('entry', (header, stream, next) => {
            try {
                const entryName = validateOrganizationDesignPackageEntryPath(
                    header.name,
                );
                const pathKey = entryName.toLowerCase();
                if (seenPaths.has(pathKey)) {
                    throw new ParameterError(
                        `Theme package contains a duplicate path: ${entryName}`,
                    );
                }
                seenPaths.add(pathKey);

                const entryType = header.type ?? 'file';
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
                            const metadata =
                                validateOrganizationDesignFileMetadata(
                                    parsedPath,
                                );
                            validateOrganizationDesignFileContent({
                                body,
                                filename: metadata.filename,
                            });
                            totalBytes += body.length;
                            if (totalBytes > MAX_THEME_TOTAL_BYTES) {
                                throw new ParameterError(
                                    `Theme package files exceed ${MAX_THEME_TOTAL_BYTES} bytes`,
                                );
                            }
                            files.push({
                                ...metadata,
                                contentType:
                                    getOrganizationDesignPackageContentType(
                                        metadata.filename,
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
                const manifest = parseManifestBody(manifestBody);
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

const replaceThemeDirectory = async (
    sourceDirectory: string,
    targetDirectory: string,
): Promise<void> => {
    const backupDirectory = path.join(
        path.dirname(path.dirname(targetDirectory)),
        `.lightdash-theme-backup-${randomUUID()}`,
    );
    let hasBackup = false;
    try {
        await fs.rename(targetDirectory, backupDirectory);
        hasBackup = true;
    } catch (error) {
        if (!isEnoent(error)) throw error;
    }

    try {
        await fs.rename(sourceDirectory, targetDirectory);
    } catch (error) {
        if (hasBackup) await fs.rename(backupDirectory, targetDirectory);
        throw error;
    }
    if (hasBackup) {
        await fs.rm(backupDirectory, { recursive: true, force: true });
    }
};

export const writeThemePackage = async (
    organizationContentPath: string,
    parsed: ParsedThemePackage,
): Promise<void> => {
    const themesFolder = getThemesFolder(organizationContentPath);
    await fs.mkdir(themesFolder, { recursive: true });
    const temporaryDirectory = await fs.mkdtemp(
        path.join(organizationContentPath, '.lightdash-theme-'),
    );
    try {
        for (const directory of ORGANIZATION_DESIGN_PACKAGE_DIRECTORIES) {
            await fs.mkdir(path.join(temporaryDirectory, directory));
        }
        await fs.writeFile(
            path.join(temporaryDirectory, ORGANIZATION_DESIGN_PACKAGE_MANIFEST),
            stringifyYaml(
                {
                    codeVersion: parsed.manifest.codeVersion,
                    slug: parsed.manifest.slug,
                    name: parsed.manifest.name,
                    description: parsed.manifest.description,
                    extraInstructions: parsed.manifest.extraInstructions,
                },
                { lineWidth: 0 },
            ),
        );
        for (const file of parsed.files) {
            await fs.writeFile(
                path.join(
                    temporaryDirectory,
                    getOrganizationDesignPackageFilePath(
                        file.kind,
                        file.filename,
                    ),
                ),
                file.body,
            );
        }
        await replaceThemeDirectory(
            temporaryDirectory,
            path.join(themesFolder, parsed.manifest.slug),
        );
    } catch (error) {
        await fs.rm(temporaryDirectory, { recursive: true, force: true });
        throw error;
    }
};
