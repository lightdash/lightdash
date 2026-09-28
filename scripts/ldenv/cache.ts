import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
    glob,
    lstat,
    mkdir,
    readFile,
    readdir,
    readlink,
    realpath,
    rm,
    writeFile,
    utimes,
} from 'node:fs/promises';
import path from 'node:path';
import { git, hashFile, home, readJson, runner, writeJson } from './io';
import {
    diffSet,
    matchingTiers,
    tierEnvironment,
    type Environment,
    type Parent,
    type Recipe,
    json,
} from './model';
import { cloneGlobalModules, globalModuleInputsMatch } from './modules';

export const builtPackages = ['formula', 'common', 'warehouses'];
export async function changedFiles(
    root: string,
    parent: string,
): Promise<string[]> {
    const results = await Promise.all([
        git(root, [
            'diff',
            '--no-renames',
            '--name-only',
            '-z',
            `${parent}...HEAD`,
        ]),
        git(root, ['diff', '--no-renames', '--name-only', '-z', 'HEAD']),
        git(root, ['ls-files', '--others', '--exclude-standard', '-z']),
    ]);
    return diffSet(...results);
}
export async function sourceHash(
    root: string,
    prefix: string,
): Promise<string> {
    const files = diffSet(
        await git(root, [
            'ls-files',
            '-z',
            '--cached',
            '--others',
            '--exclude-standard',
            '--',
            prefix,
        ]),
    );
    const hash = createHash('sha256');
    for (const file of files.filter(
        (name) => !name.includes('/dist/') && !name.endsWith('.tsbuildinfo'),
    )) {
        hash.update(file);
        hash.update('\0');
        try {
            hash.update(await readFile(path.join(root, file)));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            hash.update('deleted');
        }
        hash.update('\0');
    }
    return hash.digest('hex');
}
export async function sourceHashes(
    root: string,
): Promise<Record<string, string>> {
    const prefixes = [
        ...builtPackages.map((name) => `packages/${name}`),
        'packages/backend/src/generated',
    ];
    return Object.fromEntries(
        await Promise.all(
            prefixes.map(async (prefix) => [
                prefix,
                await sourceHash(root, prefix),
            ]),
        ),
    );
}
export async function clone(
    source: string,
    destination: string,
): Promise<void> {
    if (!existsSync(source))
        throw new Error(`Missing parent artifact: ${source}`);
    if (existsSync(destination))
        throw new Error(`Clone destination already exists: ${destination}`);
    await mkdir(path.dirname(destination), { recursive: true });
    await runner.run(
        'cp',
        process.platform === 'darwin'
            ? ['-cRp', source, destination]
            : ['-a', '--reflink=auto', source, destination],
        { cwd: path.dirname(destination) },
    );
}
async function moduleTrees(root: string): Promise<string[]> {
    const manifests = diffSet(
        await git(root, [
            'ls-files',
            '-z',
            '--',
            'package.json',
            '**/package.json',
        ]),
    );
    return manifests
        .map((file) => path.join(path.dirname(file), 'node_modules'))
        .filter((file) => existsSync(path.join(root, file)));
}
async function rewriteShims(
    root: string,
    trees: string[],
    source: string,
): Promise<void> {
    for (const tree of trees) {
        const bin = path.join(root, tree, '.bin');
        if (existsSync(bin)) {
            for (const name of await readdir(bin)) {
                const file = path.join(bin, name);
                if (!(await lstat(file)).isSymbolicLink()) {
                    const original = await readFile(file, 'utf8');
                    if (original.includes(source))
                        await writeFile(
                            file,
                            original.split(source).join(root),
                        );
                }
            }
        }
        const directory = path.join(root, tree);
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            if (
                entry.isSymbolicLink() &&
                path.isAbsolute(
                    await readlink(path.join(directory, entry.name)),
                )
            )
                throw new Error(
                    `Cannot reuse absolute dependency link in ${tree}/${entry.name}; run an offline install`,
                );
        }
    }
}
export async function cloneModules(
    parentRoot: string,
    root: string,
): Promise<void> {
    const trees = await moduleTrees(parentRoot);
    for (const tree of trees)
        await clone(path.join(parentRoot, tree), path.join(root, tree));
    await rewriteShims(root, trees, parentRoot);
}
export async function install(
    root: string,
    offline: boolean,
    env: Environment,
    label: string,
    store: 'global' | 'local' = 'global',
): Promise<void> {
    await runner.run(
        'sfw',
        [
            'pnpm',
            'install',
            '--frozen-lockfile',
            ...(offline ? ['--offline'] : []),
        ],
        {
            cwd: root,
            env: { ...env, PNPM_CONFIG_VIRTUAL_STORE_TYPE: store },
            log: path.join(home, 'logs', `${label}-install.log`),
        },
    );
    for (const file of [
        'node_modules/.bin/tsx',
        'node_modules/.bin/tsc',
        'packages/backend/node_modules/pg',
        'packages/frontend/node_modules/.bin/vite',
    ]) {
        if (!existsSync(path.join(root, file)))
            throw new Error(`Install reported success but ${file} is missing`);
    }
}
type DependencyStrategy = {
    strategy: 'clone' | 'offline' | 'global';
    cloneMs: number | null;
    offlineMs: number;
    globalMs: number;
    lockHash: string;
    platform: string;
    nodeVersion: string;
    pnpmVersion: string;
};
export async function moduleLayout(root: string): Promise<'global' | 'local'> {
    const resolved = await realpath(path.join(root, 'node_modules/tslib'));
    return resolved.startsWith(`${root}${path.sep}`) ? 'local' : 'global';
}
export async function pinnedPnpm(root: string): Promise<string> {
    const manifest = json<{ packageManager: string }>(
        await readFile(path.join(root, 'package.json'), 'utf8'),
    );
    return manifest.packageManager.replace(/^pnpm@/, '').split('+')[0];
}
export async function benchmarkDependencies(
    parent: Parent,
    env: Environment,
): Promise<DependencyStrategy> {
    const probe = path.join(home, 'probes', parent.sha.slice(0, 12));
    if (existsSync(probe))
        throw new Error(
            `Previous dependency probe remains at ${probe}; inspect it before retrying`,
        );
    await mkdir(path.dirname(probe), { recursive: true });
    await git(parent.path, ['worktree', 'add', '--detach', probe, parent.sha]);
    try {
        let cloneMs: number | null = null;
        if ((await moduleLayout(parent.path)) === 'local') {
            const cloneStart = Date.now();
            await cloneModules(parent.path, probe);
            cloneMs = Date.now() - cloneStart;
            for (const tree of await moduleTrees(probe))
                await rm(path.join(probe, tree), { recursive: true });
        }
        const offlineStart = Date.now();
        await install(probe, true, env, 'dependency-probe', 'local');
        const offlineMs = Date.now() - offlineStart;
        for (const tree of await moduleTrees(probe))
            await rm(path.join(probe, tree), { recursive: true });
        const globalStart = Date.now();
        await install(probe, true, env, 'dependency-probe-global', 'global');
        const globalMs = Date.now() - globalStart;
        const result: DependencyStrategy = {
            strategy:
                globalMs <= Math.min(cloneMs ?? Infinity, offlineMs)
                    ? 'global'
                    : (cloneMs ?? Infinity) < offlineMs
                      ? 'clone'
                      : 'offline',
            cloneMs,
            offlineMs,
            globalMs,
            lockHash: parent.lockHash,
            platform: process.platform,
            nodeVersion: process.version,
            pnpmVersion: await runner.run('pnpm', ['--version'], {
                cwd: probe,
            }),
        };
        await writeJson(path.join(home, 'dependency-strategy.json'), result);
        return result;
    } finally {
        await git(parent.path, ['worktree', 'remove', '--force', probe]);
    }
}
type DependencyPlan =
    | 'copy-global'
    | 'copy-local'
    | 'install-global'
    | 'install-local';

async function dependencyPlan(
    parent: Parent,
    root: string,
): Promise<DependencyPlan> {
    const equal =
        parent.lockHash === (await hashFile(path.join(root, 'pnpm-lock.yaml')));
    const pnpmVersion = await runner.run('pnpm', ['--version'], { cwd: root });
    const parentVersion = parent.pnpmVersion ?? (await pinnedPnpm(parent.path));
    if (!equal || pnpmVersion !== parentVersion) return 'install-local';
    if (
        !existsSync(path.join(root, 'node_modules')) &&
        (await moduleLayout(parent.path)) === 'global' &&
        (await globalModuleInputsMatch(parent.path, root))
    )
        return 'copy-global';
    const file = path.join(home, 'dependency-strategy.json');
    const preference = existsSync(file)
        ? await readJson<DependencyStrategy>(file)
        : null;
    const measured =
        preference?.lockHash === parent.lockHash &&
        preference.platform === process.platform &&
        preference.nodeVersion === process.version &&
        preference.pnpmVersion === pnpmVersion
            ? preference.strategy
            : 'global';
    if (
        measured === 'clone' &&
        !existsSync(path.join(root, 'node_modules')) &&
        (await moduleLayout(parent.path)) === 'local'
    )
        return 'copy-local';
    return measured === 'offline' ? 'install-local' : 'install-global';
}
async function copyGlobalDependencies(
    parent: Parent,
    root: string,
): Promise<void> {
    const result = await cloneGlobalModules(parent.path, root);
    process.stdout.write(
        `DEPENDENCIES: copied global-store links in ${result.cloneMs}ms\n`,
    );
}
function reportDependencyFallback(error: unknown): void {
    process.stdout.write(
        `DEPENDENCIES: link copy unavailable; installing (${runner.redact(error instanceof Error ? error.message : String(error))})\n`,
    );
}
async function executeDependencyPlan(
    plan: DependencyPlan,
    parent: Parent,
    root: string,
    env: Environment,
    label: string,
): Promise<void> {
    if (plan === 'copy-global') {
        try {
            await copyGlobalDependencies(parent, root);
            return;
        } catch (error) {
            reportDependencyFallback(error);
        }
    }
    if (plan === 'copy-local') await cloneModules(parent.path, root);
    else
        await install(
            root,
            true,
            env,
            label,
            plan === 'install-local' ? 'local' : 'global',
        );
}
export async function dependencies(
    parent: Parent,
    root: string,
    env: Environment,
    label: string,
): Promise<void> {
    await executeDependencyPlan(
        await dependencyPlan(parent, root),
        parent,
        root,
        env,
        label,
    );
}
export async function prepareForkCode(
    parent: Parent,
    root: string,
    env: Environment,
    label: string,
    timings: Record<string, number>,
): Promise<void> {
    const started = Date.now();
    const plan = await dependencyPlan(parent, root);
    if (plan !== 'copy-global') {
        await executeDependencyPlan(plan, parent, root, env, label);
        timings.dependencies = Date.now() - started;
        const artifactsStarted = Date.now();
        await cloneBuilds(parent, root);
        timings.artifactsClone = Date.now() - artifactsStarted;
        return;
    }
    const results = await Promise.allSettled([
        copyGlobalDependencies(parent, root).then(() => {
            timings.dependencies = Date.now() - started;
        }),
        (async () => {
            const artifactsStarted = Date.now();
            await copyBuildArtifacts(parent, root);
            timings.artifactsClone = Date.now() - artifactsStarted;
        })(),
    ]);
    if (results[1].status === 'rejected') throw results[1].reason;
    if (results[0].status === 'rejected') {
        reportDependencyFallback(results[0].reason);
        await install(root, true, env, label, 'global');
        timings.dependencies = Date.now() - started;
    }
    const finalizationStarted = Date.now();
    await finalizeBuildArtifacts(parent, root);
    timings.artifactsFinalize = Date.now() - finalizationStarted;
}
export function relocateBuildMetadata<T>(
    metadata: T,
    source: string,
    target: string,
    relativeFile: string,
): T {
    const sourceDirectory = path.dirname(path.join(source, relativeFile));
    const targetDirectory = path.dirname(path.join(target, relativeFile));
    const normalizedSource =
        process.platform === 'darwin' ? source.toLowerCase() : source;
    const relocate = (value: unknown): unknown => {
        if (typeof value === 'string' && /^\.\.?\//.test(value)) {
            const absolute = path.resolve(sourceDirectory, value);
            const normalized =
                process.platform === 'darwin'
                    ? absolute.toLowerCase()
                    : absolute;
            if (
                normalized === normalizedSource ||
                normalized.startsWith(`${normalizedSource}${path.sep}`)
            )
                return value;
            const relative = path.relative(targetDirectory, absolute);
            return relative.startsWith('.') ? relative : `./${relative}`;
        }
        if (Array.isArray(value)) return value.map(relocate);
        if (value && typeof value === 'object')
            return Object.fromEntries(
                Object.entries(value).map(([key, entry]) => [
                    key,
                    relocate(entry),
                ]),
            );
        return value;
    };
    return relocate(metadata) as T;
}
export async function cloneFormulaParser(
    parentRoot: string,
    root: string,
): Promise<void> {
    const relative = 'packages/formula/src/grammar/parser.js';
    const target = path.join(root, relative);
    await rm(target, { force: true });
    await clone(path.join(parentRoot, relative), target);
}
export async function copyBuildArtifacts(
    parent: Parent,
    root: string,
): Promise<void> {
    for (const name of builtPackages) {
        const prefix = `packages/${name}`;
        const source = path.join(parent.path, prefix);
        const destination = path.join(root, prefix);
        if (!existsSync(destination))
            throw new Error(
                `Built package removed: ${prefix}; build a compatible parent first`,
            );
        const dist = path.join(destination, 'dist');
        if (existsSync(dist)) {
            if ((await lstat(dist)).isSymbolicLink())
                throw new Error(`Refusing to replace linked dist: ${dist}`);
            await rm(dist, { recursive: true });
        }
        await clone(path.join(source, 'dist'), dist);
        for (const name of (await readdir(source)).filter((file) =>
            file.endsWith('.tsbuildinfo'),
        )) {
            await rm(path.join(destination, name), { force: true });
            await clone(path.join(source, name), path.join(destination, name));
        }
    }
    await cloneFormulaParser(parent.path, root);
    const generated = 'packages/backend/src/generated';
    if (
        (
            await git(root, ['diff', '--name-only', 'HEAD', '--', generated])
        ).trim()
    )
        throw new Error(
            'Generated API files have local edits; preserve them before ldenv up',
        );
    for (const name of ['routes.ts', 'swagger.json']) {
        const target = path.join(root, generated, name);
        await rm(target, { force: true });
        await clone(path.join(parent.path, generated, name), target);
    }
}
export async function finalizeBuildArtifacts(
    parent: Parent,
    root: string,
): Promise<void> {
    const sameLayout =
        (await moduleLayout(parent.path)) === (await moduleLayout(root));
    for (const name of builtPackages) {
        const prefix = `packages/${name}`;
        const destination = path.join(root, prefix);
        const unchanged =
            (await sourceHash(root, prefix)) === parent.sourceHashes[prefix];
        if (unchanged && sameLayout) {
            const now = new Date();
            for await (const metadata of glob(
                [
                    'dist/**/.tsbuildinfo',
                    'dist/**/*.tsbuildinfo',
                    '*.tsbuildinfo',
                ],
                { cwd: destination },
            )) {
                const file = path.join(destination, metadata);
                const original = json<unknown>(await readFile(file, 'utf8'));
                await writeFile(
                    file,
                    JSON.stringify(
                        relocateBuildMetadata(
                            original,
                            parent.path,
                            root,
                            path.join(prefix, metadata),
                        ),
                    ),
                );
                await utimes(file, now, now);
            }
        }
    }
}
export async function cloneBuilds(parent: Parent, root: string): Promise<void> {
    await copyBuildArtifacts(parent, root);
    await finalizeBuildArtifacts(parent, root);
}
export async function runTiers(
    root: string,
    recipe: Recipe,
    files: string[],
    env: Environment,
    timings: Record<string, number>,
    label: string,
): Promise<void> {
    for (const tier of matchingTiers(recipe.tiers, files)) {
        if (!tier.run || tier.preset === 'pnpm') continue;
        const started = Date.now();
        await runner.shell(tier.run, {
            cwd: root,
            env: tierEnvironment(env, tier.env),
            log: path.join(
                home,
                'logs',
                `${label}-tier-${tier.name.replace(/[^a-z0-9_-]/gi, '_')}.log`,
            ),
        });
        timings[`tier:${tier.name}`] = Date.now() - started;
    }
}
export async function buildDiff(
    parent: Parent,
    root: string,
): Promise<string[]> {
    const files = await changedFiles(root, parent.sha);
    const hashes = await sourceHashes(root);
    const layoutChanged =
        (await moduleLayout(parent.path)) !== (await moduleLayout(root));
    for (const name of builtPackages) {
        const prefix = `packages/${name}`;
        if (
            (layoutChanged || hashes[prefix] !== parent.sourceHashes[prefix]) &&
            !files.some((file) => file.startsWith(`${prefix}/`))
        )
            files.push(`${prefix}/package.json`);
    }
    return files;
}
