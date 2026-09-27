import { createHash, randomUUID } from 'node:crypto';
import {
    lstat,
    mkdir,
    readFile,
    readdir,
    realpath,
    rename,
    rm,
    writeFile,
} from 'node:fs/promises';
import path from 'node:path';

export type ViteHashes = {
    hash: string;
    configHash: string;
    lockfileHash: string;
    browserHash: string;
};
export type ViteCacheContext = {
    root: string;
    cacheDir: string;
    key: string;
    hashes: ViteHashes;
    fingerprints?: Record<string, string>;
};
export type ViteCacheResult = {
    status: 'hit' | 'miss' | 'populated';
    reason: string;
};
export type ViteCacheReport = ViteCacheResult & {
    key: string | null;
    snapshotKey: string | null;
    fingerprints: Record<string, string> | null;
    snapshotFingerprints: Record<string, string> | null;
};
type Entry = {
    file: string;
    src?: string;
    fileHash?: string;
    needsInterop?: boolean;
    isDynamicEntry?: boolean;
};
type Metadata = ViteHashes & {
    optimized: Record<string, Entry>;
    chunks: Record<string, Entry>;
};
type Manifest = {
    schema: 1;
    root: string;
    cacheDir: string;
    key: string;
    files: Record<string, string>;
    fingerprints?: Record<string, string>;
};

export const digest = (value: string | Buffer): string =>
    createHash('sha256').update(value).digest('hex');
export const viteSnapshotPath = (root: string): string =>
    path.join(root, 'packages/frontend/node_modules/.ldenv-vite-cache');
const inside = (root: string, file: string): boolean =>
    file === root || file.startsWith(`${root}${path.sep}`);
const relocate = (file: string, source: string, target: string): string =>
    inside(source, file)
        ? path.join(target, path.relative(source, file))
        : file;
const fail = (message: string): never => {
    throw new Error(message);
};

export function portableValue(value: unknown, root: string): string {
    return JSON.stringify(value, (_, item: unknown) => {
        if (typeof item === 'function' || item instanceof RegExp)
            return item.toString();
        if (typeof item === 'string')
            return item === root
                ? '<worktree>'
                : item.split(`${root}/`).join('<worktree>/');
        return item;
    });
}

async function readObject<T>(file: string): Promise<T> {
    try {
        return JSON.parse(await readFile(file, 'utf8')) as T;
    } catch {
        throw new Error(
            `Unreadable Vite cache metadata: ${path.basename(file)}`,
        );
    }
}

async function privateDirectory(directory: string): Promise<void> {
    if ((await realpath(directory)) !== path.resolve(directory))
        fail('Linked Vite cache directory');
}

async function filesIn(directory: string): Promise<string[]> {
    await privateDirectory(directory);
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.some((entry) => !entry.isFile()))
        fail('Vite cache contains a non-file entry');
    return entries.map((entry) => entry.name).sort();
}

function validateMetadata(value: Metadata, names: string[]): void {
    if (
        !value ||
        !value.optimized ||
        !value.chunks ||
        !['hash', 'configHash', 'lockfileHash', 'browserHash'].every(
            (key) => typeof value[key as keyof ViteHashes] === 'string',
        )
    )
        fail('Invalid Vite metadata');
    for (const entry of [
        ...Object.values(value.optimized),
        ...Object.values(value.chunks),
    ]) {
        if (
            !entry ||
            typeof entry.file !== 'string' ||
            path.basename(entry.file) !== entry.file ||
            !names.includes(entry.file)
        )
            fail('Missing or escaping optimized file');
    }
    for (const entry of Object.values(value.optimized)) {
        if (typeof entry.src !== 'string' || typeof entry.fileHash !== 'string')
            fail('Invalid optimized dependency');
    }
}

async function validateSources(
    metadata: Metadata,
    cacheDir: string,
): Promise<void> {
    for (const entry of Object.values(metadata.optimized)) {
        const source = await realpath(path.resolve(cacheDir, entry.src!));
        if (!source.includes(`${path.sep}node_modules${path.sep}`))
            fail('Workspace source was bundled into optimizer cache');
    }
}

export async function captureViteCache(
    context: ViteCacheContext,
): Promise<ViteCacheResult> {
    const destination = viteSnapshotPath(context.root);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    const previous = `${destination}.${randomUUID()}.old`;
    let moved = false;
    try {
        if (!inside(context.root, context.cacheDir))
            fail('Cache directory is outside worktree');
        const names = await filesIn(context.cacheDir);
        const metadata = await readObject<Metadata>(
            path.join(context.cacheDir, '_metadata.json'),
        );
        validateMetadata(metadata, names);
        if (
            metadata.configHash !== context.hashes.configHash ||
            metadata.lockfileHash !== context.hashes.lockfileHash
        )
            fail('Optimizer cache hashes do not match its source');
        await validateSources(metadata, context.cacheDir);
        await mkdir(temporary, { mode: 0o700 });
        const files: Record<string, string> = {};
        for (const name of names) {
            const content = await readFile(path.join(context.cacheDir, name));
            files[name] = digest(content);
            await writeFile(path.join(temporary, name), content);
        }
        if (
            files['_metadata.json'] !==
            digest(
                await readFile(path.join(context.cacheDir, '_metadata.json')),
            )
        )
            fail('Optimizer changed while snapshotting');
        const manifest: Manifest = {
            schema: 1,
            root: context.root,
            cacheDir: context.cacheDir,
            key: context.key,
            files,
            fingerprints: context.fingerprints,
        };
        await writeFile(
            path.join(temporary, 'ldenv-manifest.json'),
            JSON.stringify(manifest),
        );
        try {
            await privateDirectory(destination);
            await rename(destination, previous);
            moved = true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        try {
            await rename(temporary, destination);
        } catch (error) {
            if (moved) await rename(previous, destination);
            moved = false;
            throw error;
        }
        if (moved) await rm(previous, { recursive: true });
        return { status: 'populated', reason: 'Optimizer snapshot saved' };
    } catch (error) {
        return { status: 'miss', reason: (error as Error).message };
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}

export async function viteSnapshotIdentity(root: string): Promise<{
    key: string | null;
    fingerprints: Record<string, string> | null;
}> {
    try {
        const manifest = await readObject<Manifest>(
            path.join(viteSnapshotPath(root), 'ldenv-manifest.json'),
        );
        return {
            key: typeof manifest.key === 'string' ? manifest.key : null,
            fingerprints: manifest.fingerprints ?? null,
        };
    } catch {
        return { key: null, fingerprints: null };
    }
}

export async function hasViteSnapshot(
    context: ViteCacheContext,
): Promise<boolean> {
    try {
        const directory = viteSnapshotPath(context.root);
        const names = await filesIn(directory);
        const manifest = await readObject<Manifest>(
            path.join(directory, 'ldenv-manifest.json'),
        );
        if (
            manifest.schema !== 1 ||
            manifest.key !== context.key ||
            manifest.root !== context.root ||
            manifest.cacheDir !== context.cacheDir ||
            !manifest.files
        )
            return false;
        if (
            Object.keys(manifest.files).sort().join('\0') !==
            names.filter((name) => name !== 'ldenv-manifest.json').join('\0')
        )
            return false;
        for (const name of Object.keys(manifest.files))
            if (
                digest(await readFile(path.join(directory, name))) !==
                manifest.files[name]
            )
                return false;
        validateMetadata(
            await readObject<Metadata>(path.join(directory, '_metadata.json')),
            names,
        );
        return true;
    } catch {
        return false;
    }
}

async function relocateMap(
    content: string,
    sourceDir: string,
    targetDir: string,
    sourceRoot: string,
    targetRoot: string,
): Promise<string> {
    let map: {
        sources: string[];
        sourceRoot?: string;
        sourcesContent?: Array<string | null>;
    };
    try {
        map = JSON.parse(content);
    } catch {
        return fail('Invalid optimizer sourcemap');
    }
    if (!Array.isArray(map.sources) || map.sourceRoot)
        fail('Unsupported optimizer sourcemap');
    map.sources = await Promise.all(
        map.sources.map(async (source, index) => {
            if (
                typeof source !== 'string' ||
                source.includes('://') ||
                source.startsWith('\0')
            )
                return source;
            const absolute = path.resolve(sourceDir, source);
            const external = /^(?:\.\.\/)*browser-external:(.+)$/.exec(
                source,
            )?.[1];
            const embedded = map.sourcesContent?.[index];
            if (external && typeof embedded === 'string') {
                const normalized = embedded
                    .replace(`Module "${external}"`, 'Module "<external>"')
                    .replace(
                        `Cannot access "${external}.`,
                        'Cannot access "<external>.',
                    );
                if (
                    digest(normalized) ===
                    'd4c467dc565324b1b7ecd69c7adbe1f1f9de1ee8c9320c97354f9dd1c56ffd0a'
                ) {
                    try {
                        await lstat(absolute);
                        fail(
                            'Browser external sourcemap resolves to a real file',
                        );
                    } catch (error) {
                        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                            throw error;
                    }
                    return `browser-external:${external}`;
                }
            }
            if (
                inside(sourceRoot, absolute) &&
                !absolute.includes(`${path.sep}node_modules${path.sep}`)
            )
                fail('Sourcemap includes bundled workspace source');
            return path
                .relative(targetDir, relocate(absolute, sourceRoot, targetRoot))
                .split(path.sep)
                .join('/');
        }),
    );
    return JSON.stringify(map);
}

export async function restoreViteSnapshot(
    parentRoot: string,
    context: ViteCacheContext,
): Promise<ViteCacheResult> {
    const source = viteSnapshotPath(parentRoot);
    const temporary = `${context.cacheDir}.${randomUUID()}.tmp`;
    try {
        const names = await filesIn(source);
        const manifest = await readObject<Manifest>(
            path.join(source, 'ldenv-manifest.json'),
        );
        if (manifest.schema !== 1) fail('Unsupported Vite snapshot schema');
        if (manifest.root !== parentRoot)
            fail('Vite snapshot source root does not match parent');
        if (
            typeof manifest.cacheDir !== 'string' ||
            !inside(parentRoot, manifest.cacheDir)
        )
            fail('Vite snapshot source cache is outside parent');
        if (manifest.key !== context.key)
            fail('Vite snapshot key does not match target');
        if (
            !manifest.files ||
            Object.keys(manifest.files).sort().join('\0') !==
                names
                    .filter((name) => name !== 'ldenv-manifest.json')
                    .join('\0')
        )
            fail('Incomplete Vite snapshot');
        if (!inside(context.root, context.cacheDir))
            fail('Cache directory is outside worktree');
        try {
            await lstat(context.cacheDir);
            return {
                status: 'miss',
                reason: 'Existing optimizer cache retained',
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        await mkdir(path.dirname(context.cacheDir), { recursive: true });
        await privateDirectory(path.dirname(context.cacheDir));
        await mkdir(temporary, { mode: 0o700 });
        for (const name of Object.keys(manifest.files)) {
            const content = await readFile(path.join(source, name));
            if (digest(content) !== manifest.files[name])
                fail('Optimizer snapshot checksum mismatch');
            const original = content.toString('utf8');
            const transformed = name.endsWith('.map')
                ? await relocateMap(
                      original,
                      manifest.cacheDir,
                      context.cacheDir,
                      parentRoot,
                      context.root,
                  )
                : content;
            if (name.endsWith('.js') && original.includes(parentRoot))
                fail('Optimizer JavaScript contains checkout-specific paths');
            await writeFile(path.join(temporary, name), transformed);
        }
        const metadata = await readObject<Metadata>(
            path.join(temporary, '_metadata.json'),
        );
        validateMetadata(metadata, names);
        for (const entry of Object.values(metadata.optimized)) {
            entry.src = path
                .relative(
                    context.cacheDir,
                    relocate(
                        path.resolve(manifest.cacheDir, entry.src!),
                        parentRoot,
                        context.root,
                    ),
                )
                .split(path.sep)
                .join('/');
        }
        await validateSources(metadata, context.cacheDir);
        metadata.hash = context.hashes.hash;
        metadata.configHash = context.hashes.configHash;
        metadata.lockfileHash = context.hashes.lockfileHash;
        metadata.browserHash = digest(
            `${context.hashes.hash}:${manifest.files['_metadata.json']}`,
        ).slice(0, 8);
        await writeFile(
            path.join(temporary, '_metadata.json'),
            JSON.stringify(metadata, null, 2),
        );
        await rename(temporary, context.cacheDir);
        return {
            status: 'hit',
            reason: 'Compatible optimizer snapshot restored',
        };
    } catch (error) {
        return { status: 'miss', reason: (error as Error).message };
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}
