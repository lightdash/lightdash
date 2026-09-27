import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, readlink, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildDiff, changedFiles, dependencies, runTiers } from './cache';
import { diskGuard, dotenv, localSecrets, movePortRegistration } from './infra';
import {
    git,
    backgroundWork,
    foregroundWork,
    yieldToForeground,
    home,
    readJson,
    runner,
    saveInstance,
    withLock,
    writeJson,
} from './io';
import {
    ancestor,
    down,
    environment,
    instanceAt,
    instances,
    parents,
    recipeAt,
    start,
    timed,
    up,
    writeInstanceEnv,
} from './lifecycle';
import { matchingTiers, selectParent, type Instance } from './model';
import {
    background,
    cheapReady,
    processPriority,
    stopProcesses,
} from './processes';

export async function availableMemory(root: string): Promise<number> {
    if (process.platform === 'darwin') {
        const output = await runner.run('memory_pressure', ['-Q'], {
            cwd: root,
        });
        const percent = output.match(
            /System-wide memory free percentage: (\d+)%/,
        );
        if (!percent) throw new Error('Cannot read macOS available memory');
        return (os.totalmem() * Number(percent[1])) / 100;
    }
    const output = await readFile('/proc/meminfo', 'utf8');
    const available = output.match(/^MemAvailable:\s+(\d+) kB/m);
    if (!available) throw new Error('Cannot read Linux available memory');
    return Number(available[1]) * 1024;
}

export type PoolSettings = { size: number; source: string };
export async function poolSettings(source: string): Promise<PoolSettings> {
    const file = path.join(home, 'pool.json');
    return existsSync(file)
        ? readJson<PoolSettings>(file)
        : { size: Number(process.env.LDENV_POOL_SIZE ?? 1), source };
}
export async function fillPool(
    root: string,
    requestedSize: number | null,
): Promise<Instance[]> {
    return backgroundWork(() =>
        withLock('pool-fill', async () => {
            await yieldToForeground();
            const settings = await poolSettings(root);
            if (requestedSize !== null) settings.size = requestedSize;
            settings.source = root;
            if (
                !Number.isInteger(settings.size) ||
                settings.size < 0 ||
                settings.size > 2
            )
                throw new Error('Pool size must be 0, 1 or 2');
            await writeJson(path.join(home, 'pool.json'), settings);
            const parent = (await parents()).sort((a, b) =>
                b.builtAt.localeCompare(a.builtAt),
            )[0];
            if (!parent)
                throw new Error('Build a parent before filling the pool');
            const secrets = await localSecrets(root);
            if (!secrets.LIGHTDASH_LICENSE_KEY)
                Object.assign(secrets, await localSecrets(parent.path));
            await withLock('pool', async () => {
                const stale = (await instances()).filter(
                    (instance) =>
                        (instance.kind === 'spare' ||
                            instance.kind === 'warming') &&
                        (instance.parent !== parent.sha ||
                            instance.phase === 'failed'),
                );
                for (const instance of stale)
                    await withLock(instance.id, () => down(instance));
            });
            const spares = (await instances()).filter(
                (instance) =>
                    instance.kind === 'spare' &&
                    instance.parent === parent.sha &&
                    instance.phase === 'ready',
            );
            while (spares.length < settings.size) {
                await diskGuard();
                if ((await availableMemory(root)) < 3 * 1024 ** 3)
                    throw new Error(
                        'Pool refill needs 3 GiB available memory; existing spares remain available',
                    );
                const directory = path.join(
                    home,
                    'warm',
                    randomUUID().slice(0, 12),
                );
                await mkdir(path.dirname(directory), { recursive: true });
                await git(root, [
                    'worktree',
                    'add',
                    '--detach',
                    directory,
                    parent.sha,
                ]);
                const instance = await up(
                    directory,
                    parent.sha,
                    false,
                    'warming',
                    secrets,
                );
                await withLock('pool', async () => {
                    instance.kind = 'spare';
                    await saveInstance(instance);
                });
                spares.push(instance);
            }
            return spares;
        }),
    );
}
async function claimInstance(
    root: string,
    branch: string,
    base: string,
): Promise<Instance> {
    const started = Date.now();
    await git(root, ['check-ref-format', '--branch', branch]);
    let existingBranch = true;
    try {
        await git(root, [
            'show-ref',
            '--verify',
            '--quiet',
            `refs/heads/${branch}`,
        ]);
    } catch {
        existingBranch = false;
    }
    const target = await git(root, [
        'rev-parse',
        '--verify',
        `${existingBranch ? `refs/heads/${branch}` : base}^{commit}`,
    ]);
    const instance = await withLock('pool', async () => {
        const available = (await instances()).filter(
            (item) => item.kind === 'spare' && item.phase === 'ready',
        );
        if (!available.length)
            throw new Error(
                'No ready spare. Run ~/.ldenv/bin/ldenv pool fill, or use ~/.ldenv/bin/ldenv up in a worktree.',
            );
        const parent = await selectParent(
            (await parents()).filter((item) =>
                available.some((spare) => spare.parent === item.sha),
            ),
            (sha) => ancestor(root, sha, target),
        );
        const spare = available.find((item) => item.parent === parent.sha)!;
        return withLock(spare.id, async () => {
            const tracked = await git(spare.worktree, [
                'status',
                '--porcelain',
                '--untracked-files=normal',
                '--',
                '.',
                ':!packages/backend/src/generated',
                ':!packages/common/src/schemas/json',
                ':!packages/formula/src/grammar/parser.js',
            ]);
            if (tracked)
                throw new Error(
                    `Spare has user edits: ${spare.worktree}; refusing to switch it`,
                );
            await processPriority(spare, false);
            spare.kind = 'claimed';
            spare.phase = 'starting';
            spare.readyAt = null;
            spare.startedAt = new Date(started).toISOString();
            spare.timings = spare.timings.rssBytes
                ? { rssBytes: spare.timings.rssBytes }
                : {};
            await saveInstance(spare);
            try {
                const delta = (
                    await git(root, [
                        'diff',
                        '--name-only',
                        '-z',
                        `${parent.sha}...${target}`,
                    ])
                )
                    .split('\0')
                    .filter(Boolean);
                const recipe = await recipeAt(spare.worktree);
                const deep =
                    process.env.LDENV_TRACING === 'true' ||
                    matchingTiers(recipe.tiers, delta).some(
                        (tier) => tier.run || tier.preset,
                    );
                if (deep) await stopProcesses(spare, true);
                await timed(spare.timings, 'checkout', async () => {
                    await git(
                        spare.worktree,
                        existingBranch
                            ? ['switch', branch]
                            : ['switch', '-c', branch, target],
                    );
                });
                const env = await dotenv(
                    path.join(spare.worktree, '.env.development.local'),
                );
                if (deep) {
                    if (
                        matchingTiers(recipe.tiers, delta).some(
                            (tier) => tier.preset === 'pnpm',
                        )
                    )
                        await timed(spare.timings, 'dependencies', () =>
                            dependencies(parent, spare.worktree, env, spare.id),
                        );
                    await runTiers(
                        spare.worktree,
                        await recipeAt(spare.worktree),
                        await changedFiles(spare.worktree, parent.sha),
                        env,
                        spare.timings,
                        spare.id,
                    );
                    await start(spare, false);
                } else {
                    await cheapReady(spare);
                    spare.monitorPid = await background(
                        ['verify', spare.id],
                        `${spare.id}-verify`,
                    );
                }
                spare.timings.claim = Date.now() - started;
                await saveInstance(spare);
                return spare;
            } catch (error) {
                spare.phase = 'failed';
                spare.error = runner.redact(
                    error instanceof Error ? error.message : String(error),
                );
                await saveInstance(spare);
                throw error;
            }
        });
    });
    const settings = await poolSettings(root);
    const refillPid = await background(
        ['pool', 'fill', '--size', String(settings.size)],
        'pool-refill',
    );
    await writeJson(path.join(home, 'pool-refill.json'), {
        pid: refillPid,
        startedAt: new Date().toISOString(),
        log: path.join(home, 'logs/pool-refill.log'),
    });
    return instance;
}

export async function claimSpare(
    ...args: Parameters<typeof claimInstance>
): Promise<Instance> {
    return foregroundWork(() => claimInstance(...args));
}

async function callerPids(): Promise<Set<number>> {
    const callers = new Set<number>();
    let pid = process.pid;
    while (pid > 1 && !callers.has(pid)) {
        callers.add(pid);
        const status = await readFile(`/proc/${pid}/status`, 'utf8');
        pid = Number(status.match(/^PPid:\s+(\d+)/m)?.[1] ?? 0);
    }
    return callers;
}

async function worktreeIsFree(root: string): Promise<boolean> {
    if (process.platform !== 'linux') return false;
    const callers = await callerPids();
    for (const entry of await readdir('/proc')) {
        const pid = Number(entry);
        if (!Number.isInteger(pid) || callers.has(pid)) continue;
        try {
            const cwd = await readlink(`/proc/${pid}/cwd`);
            if (cwd === root || cwd.startsWith(`${root}${path.sep}`))
                return false;
        } catch (error) {
            if (
                (error as NodeJS.ErrnoException).code !== 'ENOENT' &&
                (error as NodeJS.ErrnoException).code !== 'EACCES'
            )
                throw error;
        }
    }
    return true;
}

async function adoptionTarget(
    root: string,
): Promise<{ branch: string; head: string } | null> {
    if (await instanceAt(root)) return null;
    if (await git(root, ['status', '--porcelain', '--untracked-files=all']))
        return null;
    if (!(await worktreeIsFree(root))) return null;
    const branch = await git(root, [
        'symbolic-ref',
        '--quiet',
        '--short',
        'HEAD',
    ]);
    const head = await git(root, ['rev-parse', 'HEAD']);
    return { branch, head };
}

async function adoptInstance(root: string): Promise<Instance> {
    const started = Date.now();
    const target = await adoptionTarget(root);
    if (!target) return up(root, null, false);
    const adopted = await withLock('pool', async () => {
        const available = (await instances()).filter(
            (item) => item.kind === 'spare' && item.phase === 'ready',
        );
        const parent = await selectParent(
            (await parents()).filter((item) =>
                available.some((spare) => spare.parent === item.sha),
            ),
            (sha) => ancestor(root, sha, target.head),
        ).catch(() => null);
        if (!parent) return null;
        const spare = available.find((item) => item.parent === parent.sha)!;
        return withLock(spare.id, async () => {
            const oldRoot = spare.worktree;
            const common = async (directory: string) =>
                realpath(
                    path.resolve(
                        directory,
                        await git(directory, ['rev-parse', '--git-common-dir']),
                    ),
                );
            if ((await common(root)) !== (await common(oldRoot)))
                throw new Error(
                    'Target and spare belong to different repositories',
                );
            if (
                await git(oldRoot, [
                    'status',
                    '--porcelain',
                    '--untracked-files=normal',
                    '--',
                    '.',
                    ':!packages/backend/src/generated',
                    ':!packages/common/src/schemas/json',
                    ':!packages/formula/src/grammar/parser.js',
                ])
            )
                throw new Error('Spare has local changes; refusing adoption');
            if (!(await worktreeIsFree(root))) return null;
            spare.startedAt = new Date(started).toISOString();
            spare.timings = {};
            spare.phase = 'starting';
            spare.readyAt = null;
            spare.verification = null;
            await timed(spare.timings, 'pm2Stop', () =>
                stopProcesses(spare, true),
            );
            await timed(spare.timings, 'worktreeRemove', () =>
                git(root, ['worktree', 'remove', root]),
            );
            await timed(spare.timings, 'worktreeMove', () =>
                git(oldRoot, ['worktree', 'move', oldRoot, root]),
            );
            spare.adoptedFrom = oldRoot;
            spare.worktree = root;
            spare.kind = 'claimed';
            await movePortRegistration(spare.id, oldRoot, root);
            await saveInstance(spare);
            try {
                await timed(spare.timings, 'checkout', () =>
                    git(root, ['switch', target.branch]),
                );
                if ((await git(root, ['rev-parse', 'HEAD'])) !== target.head)
                    throw new Error(
                        'Adopted branch HEAD changed during checkout',
                    );
                const secrets = await localSecrets(root);
                const env = await environment(root, spare, secrets);
                await timed(spare.timings, 'environment', () =>
                    writeInstanceEnv(spare, env),
                );
                await runTiers(
                    root,
                    await recipeAt(root),
                    await buildDiff(parent, root),
                    env,
                    spare.timings,
                    spare.id,
                );
                await start(spare, false);
                spare.timings.adopt = Date.now() - started;
                await saveInstance(spare);
                return spare;
            } catch (error) {
                spare.phase = 'failed';
                spare.error = runner.redact(
                    error instanceof Error ? error.message : String(error),
                );
                await saveInstance(spare);
                throw error;
            }
        });
    });
    if (!adopted) return up(root, null, false);
    const settings = await poolSettings(root);
    const refillPid = await background(
        ['pool', 'fill', '--size', String(settings.size)],
        'pool-refill',
    );
    await writeJson(path.join(home, 'pool-refill.json'), {
        pid: refillPid,
        startedAt: new Date().toISOString(),
        log: path.join(home, 'logs/pool-refill.log'),
    });
    return adopted;
}

export async function adoptSpare(root: string): Promise<Instance> {
    return foregroundWork(() => adoptInstance(root));
}
