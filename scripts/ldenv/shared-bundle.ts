import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
    chmod,
    lstat,
    mkdir,
    mkdtemp,
    readdir,
    rename,
    rm,
} from 'node:fs/promises';
import path from 'node:path';
import { createBackendBuilder } from './backend-bundle.cjs';
import type { BundleState } from './bundle-state';
import { sourceHash } from './cache';
import { alive, hashFile, home, readJson, withLock, writeJson } from './io';

export type SharedBundle = {
    key: string;
    backendHash: string;
    lockHash: string;
    bundleHash: string;
    buildMs: number;
    inputs: number;
    builtAt: string;
};

const keyPattern = /^[a-f0-9]{64}$/;
const sharedRoot = (base = home) => path.join(base, 'bundles', 'shared');

export function sharedBundleDirectory(key: string, base = home): string {
    if (!keyPattern.test(key)) throw new Error('Invalid shared bundle key');
    return path.join(sharedRoot(base), key);
}

export function bundleKeyFromParts(parts: Record<string, string>): string {
    return createHash('sha256')
        .update(JSON.stringify({ format: 1, ...parts }))
        .digest('hex');
}

async function inputHash(file: string): Promise<string> {
    return existsSync(file) ? hashFile(file) : 'missing';
}

export async function backendBundleInputs(root: string): Promise<{
    key: string;
    backendHash: string;
    lockHash: string;
}> {
    const [
        backendHash,
        lockHash,
        packageHash,
        workspaceHash,
        tsconfigHash,
        patchesHash,
        routesHash,
        swaggerHash,
        builderHash,
    ] = await Promise.all([
        sourceHash(root, 'packages/backend'),
        inputHash(path.join(root, 'pnpm-lock.yaml')),
        inputHash(path.join(root, 'package.json')),
        inputHash(path.join(root, 'pnpm-workspace.yaml')),
        inputHash(path.join(root, 'tsconfig.json')),
        sourceHash(root, 'patches'),
        inputHash(path.join(root, 'packages/backend/src/generated/routes.ts')),
        inputHash(
            path.join(root, 'packages/backend/src/generated/swagger.json'),
        ),
        hashFile(path.join(__dirname, 'backend-bundle.cjs')),
    ]);
    return {
        key: bundleKeyFromParts({
            backendHash,
            lockHash,
            packageHash,
            workspaceHash,
            tsconfigHash,
            patchesHash,
            routesHash,
            swaggerHash,
            builderHash,
            node: process.version,
            platform: process.platform,
            arch: process.arch,
        }),
        backendHash,
        lockHash,
    };
}

export async function readSharedBundle(
    key: string,
    base = home,
): Promise<SharedBundle | null> {
    const directory = sharedBundleDirectory(key, base);
    const info = await lstat(directory).catch(() => null);
    if (!info) return null;
    if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error('Shared bundle path is not a directory');
    const metadata = await readJson<SharedBundle>(
        path.join(directory, 'bundle.json'),
    );
    if (
        metadata.key !== key ||
        !existsSync(path.join(directory, 'api.cjs.map')) ||
        metadata.bundleHash !==
            (await hashFile(path.join(directory, 'api.cjs')))
    )
        throw new Error('Shared bundle integrity check failed');
    return metadata;
}

export async function publishSharedBundle(
    root: string,
    inputs: Awaited<ReturnType<typeof backendBundleInputs>>,
    base = home,
): Promise<SharedBundle> {
    return withLock(`shared-bundle-${inputs.key}`, async () => {
        const existing = await readSharedBundle(inputs.key, base);
        if (existing) return existing;
        const parent = sharedRoot(base);
        await mkdir(parent, { recursive: true, mode: 0o700 });
        const temporary = await mkdtemp(path.join(parent, '.building-'));
        const previousGoMemoryLimit = process.env.GOMEMLIMIT;
        process.env.GOMEMLIMIT = '512MiB';
        try {
            const builder = await createBackendBuilder({
                root,
                outDir: temporary,
                portable: true,
            });
            let event: Awaited<ReturnType<typeof builder.rebuild>>;
            try {
                event = await builder.rebuild();
            } finally {
                await builder.dispose();
            }
            if (!event.ok)
                throw new Error(
                    `Shared bundle build failed: ${event.errors.join('; ')}`,
                );
            const checked = await backendBundleInputs(root);
            if (checked.key !== inputs.key)
                throw new Error(
                    'Backend inputs changed during shared bundle build',
                );
            await rm(path.join(temporary, 'node_modules'));
            const metadata: SharedBundle = {
                key: inputs.key,
                backendHash: inputs.backendHash,
                lockHash: inputs.lockHash,
                bundleHash: await hashFile(path.join(temporary, 'api.cjs')),
                buildMs: Math.round(event.seconds * 1000),
                inputs: event.inputs,
                builtAt: new Date().toISOString(),
            };
            await writeJson(path.join(temporary, 'bundle.json'), metadata);
            for (const filename of ['api.cjs', 'api.cjs.map', 'bundle.json'])
                await chmod(path.join(temporary, filename), 0o444);
            await rename(temporary, sharedBundleDirectory(inputs.key, base));
            return metadata;
        } finally {
            if (previousGoMemoryLimit === undefined)
                delete process.env.GOMEMLIMIT;
            else process.env.GOMEMLIMIT = previousGoMemoryLimit;
            await rm(temporary, { recursive: true, force: true });
        }
    });
}

async function activeSharedKeys(base: string): Promise<Set<string>> {
    const bundleEntries = await readdir(path.join(base, 'bundles'), {
        withFileTypes: true,
    });
    const statuses = (
        await Promise.all(
            bundleEntries
                .filter(
                    (entry) =>
                        entry.isDirectory() && entry.name.startsWith('ldenv_'),
                )
                .map((entry) =>
                    readJson<BundleState>(
                        path.join(base, 'bundles', entry.name, 'status.json'),
                    ).catch(() => null),
                ),
        )
    ).filter((state): state is BundleState => state !== null);
    return new Set(
        statuses
            .filter(
                (state) =>
                    Boolean(state.sharedKey) &&
                    ((Boolean(state.apiPid) && alive(state.apiPid)) ||
                        (Boolean(state.supervisorPid) &&
                            alive(state.supervisorPid))),
            )
            .map((state) => state.sharedKey)
            .filter((key): key is string => Boolean(key)),
    );
}

export async function sharedBundleGc(
    dryRun = false,
    keep = 2,
    base = home,
): Promise<string[]> {
    const directory = sharedRoot(base);
    if (!existsSync(directory)) return [];
    const entries = await readdir(directory, { withFileTypes: true });
    const candidates = await Promise.all(
        entries
            .filter(
                (entry) => entry.isDirectory() && keyPattern.test(entry.name),
            )
            .map(async (entry) => ({
                key: entry.name,
                builtAt: (await readSharedBundle(entry.name, base))!.builtAt,
            })),
    );
    candidates.sort((a, b) => b.builtAt.localeCompare(a.builtAt));
    const active = await activeSharedKeys(base);
    const old = candidates
        .slice(keep)
        .filter((entry) => !active.has(entry.key))
        .map((entry) => entry.key);
    if (!dryRun)
        for (const key of old)
            await withLock(`shared-bundle-${key}`, async () => {
                if ((await activeSharedKeys(base)).has(key)) return;
                await rm(sharedBundleDirectory(key, base), {
                    recursive: true,
                    force: true,
                });
            });
    return old;
}
