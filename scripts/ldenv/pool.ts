import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { changedFiles, dependencies, runTiers } from './cache';
import { diskGuard, dotenv, localSecrets } from './infra';
import {
    git,
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
    instances,
    parents,
    recipeAt,
    start,
    timed,
    up,
} from './lifecycle';
import { matchingTiers, selectParent, type Instance } from './model';
import { background, ready, stopProcesses } from './processes';

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
    return withLock('pool-fill', async () => {
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
        if (!parent) throw new Error('Build a parent before filling the pool');
        const secrets = await localSecrets(root);
        if (!secrets.LIGHTDASH_LICENSE_KEY)
            Object.assign(secrets, await localSecrets(parent.path));
        await withLock('pool', async () => {
            const stale = (await instances()).filter(
                (instance) =>
                    instance.kind === 'spare' &&
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
                'spare',
                secrets,
            );
            spares.push(instance);
        }
        return spares;
    });
}
export async function claimSpare(
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
            spare.kind = 'claimed';
            spare.phase = 'starting';
            spare.readyAt = null;
            spare.timings = {};
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
                const deep = matchingTiers(recipe.tiers, delta).some(
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
                } else await ready(spare);
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
