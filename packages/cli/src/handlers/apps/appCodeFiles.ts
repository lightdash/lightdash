import { type DataAppCode, type DataAppManifest } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';

const MANIFEST_FILENAME = 'lightdash-app.yml';

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

    const resolvedRoot = path.resolve(dir);
    await Promise.all(
        code.files.map(async (file) => {
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

export const readBundleFromDir = async (dir: string): Promise<DataAppCode> => {
    const manifestRaw = await fs.readFile(
        path.join(dir, MANIFEST_FILENAME),
        'utf-8',
    );
    const manifest = YAML.parse(manifestRaw) as DataAppManifest;

    const files = await collectFiles(dir, dir);
    files.sort((a, b) => a.path.localeCompare(b.path));

    return { manifest, files };
};
