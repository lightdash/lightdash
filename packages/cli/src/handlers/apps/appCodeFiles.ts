import {
    generateSlug,
    getErrorMessage,
    validateDataAppCode,
    type DataAppCode,
    type DataAppCodeFile,
    type DataAppManifest,
    type ImportAppCodeRequestBody,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

const MANIFEST_FILENAME = 'lightdash-app.yml';

/**
 * Derives a collision-safe folder name for a data app.
 * Uses the slugified app name. If that slug is already taken by another app,
 * appends the first 8 characters of the app's UUID to disambiguate.
 */
export const appFolderName = (
    name: string,
    appUuid: string,
    takenFolders: Set<string>,
): string => {
    const slug = generateSlug(name);
    if (!takenFolders.has(slug)) {
        return slug;
    }
    const suffixed = `${slug}-${appUuid.slice(0, 8)}`;
    return suffixed;
};

export const writeFilesToDir = async (
    dir: string,
    files: DataAppCodeFile[],
): Promise<void> => {
    const resolvedRoot = path.resolve(dir);
    await Promise.all(
        files.map(async (file) => {
            const filePath = path.resolve(dir, file.path);
            // Defense-in-depth: never write outside the target directory, even
            // if the server returns a traversal path.
            if (
                filePath !== resolvedRoot &&
                !filePath.startsWith(resolvedRoot + path.sep)
            ) {
                throw new Error(
                    `Refusing to write file outside the target directory: ${file.path}`,
                );
            }
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(
                filePath,
                Buffer.from(file.contentBase64, 'base64'),
            );
        }),
    );
};

export const writeBundleToDir = async (
    dir: string,
    code: DataAppCode,
): Promise<void> => {
    await fs.mkdir(dir, { recursive: true });

    const manifestYaml = YAML.stringify(code.manifest);
    await fs.writeFile(
        path.join(dir, MANIFEST_FILENAME),
        manifestYaml,
        'utf-8',
    );

    await writeFilesToDir(dir, code.files);
};

const collectFiles = async (
    dir: string,
    baseDir: string,
): Promise<{ path: string; contentBase64: string }[]> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    const nestedResults = await Promise.all(
        entries.map(async (entry) => {
            const entryPath = path.join(dir, entry.name);
            const relativePath = path
                .relative(baseDir, entryPath)
                .split(path.sep)
                .join('/');

            if (entry.isDirectory()) {
                return collectFiles(entryPath, baseDir);
            }
            if (entry.name !== MANIFEST_FILENAME) {
                const content = await fs.readFile(entryPath);
                return [
                    {
                        path: relativePath,
                        contentBase64: content.toString('base64'),
                    },
                ];
            }
            return [];
        }),
    );

    return nestedResults.flat();
};

export const buildImportBody = (
    code: DataAppCode,
    targetProjectUuid: string,
    opts: { app?: string; space?: string },
): ImportAppCodeRequestBody => {
    let targetAppUuid: string | undefined;
    if (opts.app) {
        targetAppUuid = opts.app;
    } else if (targetProjectUuid === code.manifest.projectUuid) {
        targetAppUuid = code.manifest.appUuid;
    }

    return {
        code,
        targetAppUuid,
        spaceUuid: opts.space,
    };
};

export const readBundleFromDir = async (dir: string): Promise<DataAppCode> => {
    const manifestRaw = await fs.readFile(
        path.join(dir, MANIFEST_FILENAME),
        'utf-8',
    );
    let manifest: DataAppManifest;
    try {
        manifest = YAML.parse(manifestRaw) as DataAppManifest;
    } catch (err) {
        throw new Error(
            `Could not parse ${MANIFEST_FILENAME}: ${getErrorMessage(err)}`,
        );
    }

    const srcDir = path.join(dir, 'src');
    const srcExists = await fs
        .stat(srcDir)
        .then((s) => s.isDirectory())
        .catch(() => false);
    const files = srcExists ? await collectFiles(srcDir, dir) : [];
    files.sort((a, b) => a.path.localeCompare(b.path));

    return validateDataAppCode({ manifest, files });
};
