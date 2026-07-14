import {
    generateSlug,
    getErrorMessage,
    validateDataAppCode,
    type DataAppCode,
    type DataAppCodeFile,
    type DataAppContext,
    type DataAppContextFile,
    type DataAppDependencies,
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
    // generateSlug returns a RANDOM 5-char string for names that sanitize to
    // nothing (e.g. unnamed apps whose first build never got auto-titled). A
    // random folder never matches the previous download's, so every run would
    // duplicate the app on disk — use a stable uuid-based fallback instead,
    // mirroring the "Untitled app <uuid8>" display convention.
    const slug = /[a-z0-9]/i.test(name)
        ? generateSlug(name)
        : `untitled-app-${appUuid.slice(0, 8)}`;
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

export const writeContextToDir = async (
    dir: string,
    context: DataAppContext,
): Promise<void> => {
    const files: DataAppContextFile[] = [
        context.semanticLayer,
        ...(context.parameters ? [context.parameters] : []),
        context.promptHistory,
        ...(context.theme.instructions ? [context.theme.instructions] : []),
        ...context.theme.assets,
    ];
    await writeFilesToDir(dir, files);
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
    opts: { app?: string; space?: string; createNew?: boolean },
): ImportAppCodeRequestBody => {
    let targetAppUuid: string | undefined;
    if (opts.createNew) {
        // No target app -> the server always creates a new app
        targetAppUuid = undefined;
    } else if (opts.app) {
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

/**
 * Points a downloaded app folder's manifest at a different app, so future
 * uploads update that app instead of the one it was downloaded from.
 */
export const retargetManifest = async (
    dir: string,
    target: { appUuid: string; projectUuid: string; version: number },
): Promise<void> => {
    const manifestPath = path.join(dir, MANIFEST_FILENAME);
    const manifest = YAML.parse(
        await fs.readFile(manifestPath, 'utf-8'),
    ) as DataAppManifest;
    await fs.writeFile(
        manifestPath,
        YAML.stringify({ ...manifest, ...target }),
        'utf-8',
    );
};

/**
 * Writes server-provided dependency files as the app folder's package.json +
 * pnpm-lock.yaml. Called after the scaffold write so they override the
 * scaffold's template package.json and the folder round-trips on re-upload.
 */
export const writeDependenciesToDir = async (
    dir: string,
    deps: DataAppDependencies,
): Promise<void> => {
    await fs.writeFile(path.join(dir, 'package.json'), deps.packageJson);
    await fs.writeFile(path.join(dir, 'pnpm-lock.yaml'), deps.lockfile);
};

export type LocalAppDependencies = {
    packageJson: string;
    // null = no pnpm-lock.yaml on disk. The download scaffold writes a
    // package.json but never a lockfile, so this is the normal state of a
    // freshly downloaded folder; it only becomes an error if the declared
    // set differs from the template baseline (the caller decides).
    lockfile: string | null;
};

/**
 * Reads package.json (+ pnpm-lock.yaml when present) from the app folder
 * root. Returns null when there is no package.json and no lockfile (no
 * declared deps at all). Throws on a lockfile without a package.json —
 * nothing declares it, so the folder is broken.
 */
export const readDependenciesFromDir = async (
    dir: string,
): Promise<LocalAppDependencies | null> => {
    const pkgJsonPath = path.join(dir, 'package.json');
    const lockfilePath = path.join(dir, 'pnpm-lock.yaml');

    const [pkgJsonExists, lockfileExists] = await Promise.all([
        fs
            .stat(pkgJsonPath)
            .then(() => true)
            .catch(() => false),
        fs
            .stat(lockfilePath)
            .then(() => true)
            .catch(() => false),
    ]);

    if (!pkgJsonExists && !lockfileExists) return null;

    if (!pkgJsonExists) {
        throw new Error(
            'App folder has pnpm-lock.yaml but is missing package.json. Restore the package.json or remove the lockfile.',
        );
    }

    const [packageJson, lockfile] = await Promise.all([
        fs.readFile(pkgJsonPath, 'utf-8'),
        lockfileExists ? fs.readFile(lockfilePath, 'utf-8') : null,
    ]);

    return { packageJson, lockfile };
};

/**
 * Builds the human-readable warning lines listing packages that will be
 * installed in the build sandbox (i.e., the custom dep set).
 */
export const buildDepsWarningLines = (
    customDeps: Record<string, string>,
    templateDependencies: Record<string, string>,
): string[] =>
    Object.entries(customDeps).map(([name, spec]) => {
        const templateSpec = templateDependencies[name];
        const note = templateSpec
            ? `overrides template ${templateSpec}`
            : 'not in default template';
        return `  + ${name}@${spec} (${note})`;
    });

/**
 * Mirrors the server's baseline rule: the declared `@lightdash/query-sdk` spec
 * is copied into the template baseline so the SDK never counts as custom. The
 * scaffold pins the SDK per release, so a folder scaffolded under an older CLI
 * would otherwise flag the SDK as an override after every CLI upgrade.
 */
export const applySdkMirrorToTemplateDeps = (
    templateDependencies: Record<string, string>,
    packageJson: string,
): Record<string, string> => {
    try {
        const parsed = JSON.parse(packageJson) as {
            dependencies?: Record<string, unknown>;
        };
        const sdkSpec = parsed.dependencies?.['@lightdash/query-sdk'];
        if (typeof sdkSpec === 'string') {
            return {
                ...templateDependencies,
                '@lightdash/query-sdk': sdkSpec,
            };
        }
    } catch {
        // Unparseable packageJson — validateDataAppDependencies reports it.
    }
    return templateDependencies;
};

/**
 * Returns a new DataAppCode with `dependencies` attached when the custom set
 * is non-empty, or the original code object unchanged when there are no custom
 * deps (payload stays identical to today's format).
 */
export const attachDependenciesToCode = (
    code: DataAppCode,
    customDeps: Record<string, string>,
    deps: DataAppDependencies,
): DataAppCode =>
    Object.keys(customDeps).length > 0 ? { ...code, dependencies: deps } : code;

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
