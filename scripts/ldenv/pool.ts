import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { changedFiles, dependencies, runTiers } from './cache';
import { isOwnedWarm } from './cleanup';
import { inheritLicensePair } from './env';
import { diskGuard, dotenv, localSecrets } from './infra';
import {
    git,
    alive,
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
    instances,
    parents,
    recipeAt,
    start,
    timed,
    up,
} from './lifecycle';
import { instanceIsLive } from './live';
import {
    assertInstance,
    matchingTiers,
    selectParent,
    type Instance,
} from './model';
import {
    background,
    cheapReady,
    processPriority,
    stopProcesses,
    stopClaimApi,
    startClaimApi,
} from './processes';
import { claimChangesApi, processEpoch } from './readiness';

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
const poolStateOperations = { withLock, instances, saveInstance, down, alive };

async function retainLiveSpare(
    instance: Instance,
    operations: {
        instanceIsLive: typeof instanceIsLive;
        saveInstance: typeof saveInstance;
    },
): Promise<boolean> {
    if (await operations.instanceIsLive(instance)) return true;
    instance.phase = 'failed';
    instance.readyAt = null;
    instance.error = 'Ready spare is not live; awaiting pool cleanup';
    await operations.saveInstance(instance);
    return false;
}

export async function inspectReadySpares(
    parent: string,
    operations = { ...poolStateOperations, instanceIsLive },
): Promise<{ ready: Instance[]; failed: number }> {
    return operations.withLock('pool', async () => {
        const ready: Instance[] = [];
        let failed = 0;
        const eligible = (instance: Instance) =>
            instance.kind === 'spare' &&
            instance.phase === 'ready' &&
            instance.parent === parent;
        for (const instance of (await operations.instances()).filter(eligible))
            await operations.withLock(instance.id, async () => {
                const current = (await operations.instances()).find(
                    (item) => item.id === instance.id,
                );
                if (!current || !eligible(current)) return;
                if (await retainLiveSpare(current, operations))
                    ready.push(current);
                else failed += 1;
            });
        return { ready, failed };
    });
}

export async function publishSpare(
    instance: Instance,
    operations = poolStateOperations,
): Promise<void> {
    const current = await operations.withLock(
        'pool',
        () =>
            operations.withLock(
                instance.id,
                async () => {
                    const registered = (await operations.instances()).find(
                        (item) => item.id === instance.id,
                    );
                    if (
                        !registered ||
                        registered.kind !== 'warming' ||
                        registered.phase !== 'ready' ||
                        registered.startedAt !== instance.startedAt
                    )
                        throw new Error(
                            `Warm instance changed before publication: ${instance.worktree}`,
                        );
                    registered.kind = 'spare';
                    await operations.saveInstance(registered);
                    return registered;
                },
                { timeoutMs: null },
            ),
        { timeoutMs: null, yieldToForeground: false },
    );
    Object.assign(instance, current);
}

export async function retireStalePoolInstances(
    parent: string,
    operations = poolStateOperations,
): Promise<void> {
    const stale = (instance: Instance) =>
        (instance.kind === 'spare' || instance.kind === 'warming') &&
        (instance.parent !== parent ||
            instance.phase === 'failed' ||
            (instance.kind === 'warming' &&
                instance.phase === 'ready' &&
                !operations.alive(instance.monitorPid)));
    const reserved = await operations.withLock('pool', async () => {
        const records: Instance[] = [];
        for (const instance of (await operations.instances()).filter(stale))
            await operations.withLock(instance.id, async () => {
                const current = (await operations.instances()).find(
                    (item) => item.id === instance.id,
                );
                if (!current || !stale(current)) return;
                current.phase = 'failed';
                await operations.saveInstance(current);
                records.push(structuredClone(current));
            });
        return records;
    });
    for (const instance of reserved)
        await operations.withLock(
            instance.id,
            async () => {
                const current = (await operations.instances()).find(
                    (item) => item.id === instance.id,
                );
                if (
                    !current ||
                    current.phase !== 'failed' ||
                    current.kind !== instance.kind ||
                    current.startedAt !== instance.startedAt ||
                    current.updatedAt !== instance.updatedAt ||
                    current.worktree !== instance.worktree ||
                    current.parent !== instance.parent
                )
                    return;
                await operations.down(current);
            },
            { timeoutMs: null },
        );
}

const fillOperations = {
    backgroundWork,
    withLock,
    yieldToForeground,
    poolSettings,
    writeJson,
    parents,
    localSecrets,
    retireStalePoolInstances,
    inspectReadySpares,
    diskGuard,
    availableMemory,
    mkdir: (directory: string) => mkdir(directory, { recursive: true }),
    git,
    up,
    publishSpare,
};

export async function fillPool(
    root: string,
    requestedSize: number | null,
    operations = fillOperations,
): Promise<Instance[]> {
    const {
        backgroundWork,
        withLock,
        yieldToForeground,
        poolSettings,
        writeJson,
        parents,
        localSecrets,
        retireStalePoolInstances,
        inspectReadySpares,
        diskGuard,
        availableMemory,
        mkdir,
        git,
        up,
        publishSpare,
    } = operations;
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
                inheritLicensePair(secrets, await localSecrets(parent.path));
            while (true) {
                await retireStalePoolInstances(parent.sha);
                const { ready, failed } = await inspectReadySpares(parent.sha);
                if (failed) continue;
                if (ready.length >= settings.size) return ready;
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
                await mkdir(path.dirname(directory));
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
                await publishSpare(instance);
            }
        }),
    );
}
const claimOperations = {
    instanceIsLive,
    git,
    realpath: (directory: string) => realpath(directory),
    instances,
    parents,
    ancestor,
    withLock,
    processPriority,
    saveInstance,
    recipeAt,
    stopProcesses,
    stopClaimApi,
    startClaimApi,
    dotenv,
    dependencies,
    runTiers,
    changedFiles,
    start,
    cheapReady,
    background,
    down,
    poolSettings,
    writeJson,
};

export async function claimInstance(
    root: string,
    branch: string,
    base: string,
    operations = claimOperations,
): Promise<Instance> {
    const {
        git,
        realpath,
        instances,
        parents,
        ancestor,
        withLock,
        processPriority,
        saveInstance,
        recipeAt,
        stopProcesses,
        stopClaimApi,
        startClaimApi,
        dotenv,
        dependencies,
        runTiers,
        changedFiles,
        start,
        cheapReady,
        background,
        down,
        poolSettings,
        writeJson,
    } = operations;
    const started = Date.now();
    let failure: unknown = null;
    let instance: Instance | null = null;
    try {
        await git(root, ['check-ref-format', '--branch', branch]);
        const worktrees = await git(root, [
            'worktree',
            'list',
            '--porcelain',
            '-z',
        ]);
        const occupied = worktrees
            .split('\0\0')
            .find((record) =>
                record.split('\0').includes(`branch refs/heads/${branch}`),
            );
        if (occupied)
            throw new Error(
                `Branch ${branch} is already checked out at ${occupied.split('\0')[0].slice('worktree '.length)}; use ~/.ldenv/bin/ldenv up in that worktree.`,
            );
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
        const status = (worktree: string) =>
            git(worktree, [
                'status',
                '--porcelain',
                '--untracked-files=normal',
                '--',
                '.',
                ':!packages/backend/src/generated',
                ':!packages/common/src/schemas/json',
                ':!packages/formula/src/grammar/parser.js',
            ]);
        const reservation = await withLock('pool', async () => {
            let available = (await instances()).filter(
                (item) => item.kind === 'spare' && item.phase === 'ready',
            );
            while (available.length) {
                const parent = await selectParent(
                    (await parents()).filter((item) =>
                        available.some((spare) => spare.parent === item.sha),
                    ),
                    (sha) => ancestor(root, sha, target),
                );
                const spare = available.find(
                    (item) => item.parent === parent.sha,
                )!;
                const selected = await withLock(spare.id, async () => {
                    const current = (await instances()).find(
                        (item) => item.id === spare.id,
                    );
                    if (
                        !current ||
                        current.kind !== 'spare' ||
                        current.phase !== 'ready' ||
                        current.parent !== parent.sha
                    )
                        throw new Error(
                            `Spare changed before reservation: ${spare.worktree}`,
                        );
                    if (!(await retainLiveSpare(current, operations)))
                        return null;
                    Object.assign(spare, current);
                    if (await status(spare.worktree))
                        throw new Error(
                            `Spare has user edits: ${spare.worktree}; refusing to switch it`,
                        );
                    const previous = structuredClone(spare);
                    const previousHead = await git(spare.worktree, [
                        'rev-parse',
                        'HEAD',
                    ]);
                    const previousBranch = await git(spare.worktree, [
                        'branch',
                        '--show-current',
                    ]);
                    spare.kind = 'claimed';
                    spare.phase = 'starting';
                    spare.readyAt = null;
                    spare.processStartedAt = processEpoch(spare);
                    spare.startedAt = new Date(started).toISOString();
                    spare.timings = spare.timings.rssBytes
                        ? { rssBytes: spare.timings.rssBytes }
                        : {};
                    await saveInstance(spare);
                    return {
                        spare,
                        previous,
                        previousHead,
                        previousBranch,
                        parent,
                    };
                });
                if (selected) return selected;
                available = available.filter((item) => item.id !== spare.id);
            }
            throw new Error(
                'No ready spare. Run ~/.ldenv/bin/ldenv pool fill, or use ~/.ldenv/bin/ldenv up in a worktree.',
            );
        });
        instance = await withLock(
            reservation.spare.id,
            async () => {
                const {
                    spare,
                    previous,
                    previousHead,
                    previousBranch,
                    parent,
                } = reservation;
                const current = (await instances()).find(
                    (item) => item.id === spare.id,
                );
                if (
                    !current ||
                    current.kind !== 'claimed' ||
                    current.phase !== 'starting' ||
                    current.startedAt !== spare.startedAt
                )
                    throw new Error(
                        `Claim reservation changed for ${spare.worktree}; refusing to overwrite it`,
                    );
                Object.assign(spare, current);
                let checkoutLanded = false;
                try {
                    await processPriority(spare, false);
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
                        process.env.LDENV_BACKEND !== undefined ||
                        process.env.LDENV_TRACING === 'true' ||
                        matchingTiers(recipe.tiers, delta).some(
                            (tier) => tier.run || tier.preset,
                        );
                    let apiDebounce: number | null = null;
                    if (deep) {
                        await stopProcesses(spare, true);
                        spare.processStartedAt = spare.startedAt;
                    } else if (claimChangesApi(delta))
                        apiDebounce = await stopClaimApi(spare);
                    await timed(spare.timings, 'checkout', async () => {
                        await git(
                            spare.worktree,
                            existingBranch
                                ? ['switch', branch]
                                : ['switch', '-c', branch, target],
                        );
                        checkoutLanded = true;
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
                                dependencies(
                                    parent,
                                    spare.worktree,
                                    env,
                                    spare.id,
                                ),
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
                        if (apiDebounce !== null)
                            await startClaimApi(spare, apiDebounce);
                        await cheapReady(spare, apiDebounce !== null);
                        spare.monitorPid = await background(
                            ['verify', spare.id],
                            `${spare.id}-verify`,
                        );
                    }
                    spare.timings.claim = Date.now() - started;
                    await saveInstance(spare);
                    return spare;
                } catch (error) {
                    const reason = runner.redact(
                        error instanceof Error ? error.message : String(error),
                    );
                    let unchanged = false;
                    let recovered = false;
                    let recoveryFailure = '';
                    try {
                        unchanged =
                            !checkoutLanded &&
                            !previousBranch &&
                            (await git(spare.worktree, [
                                'rev-parse',
                                'HEAD',
                            ])) === previousHead &&
                            (await git(spare.worktree, [
                                'branch',
                                '--show-current',
                            ])) === previousBranch &&
                            !(await status(spare.worktree));
                        if (unchanged) {
                            Object.assign(spare, previous, {
                                kind: 'claimed',
                                phase: 'starting',
                                processStartedAt: processEpoch(previous),
                            });
                            await cheapReady(spare);
                            await processPriority(spare, true);
                            spare.kind = 'spare';
                            spare.verification = previous.verification;
                            await saveInstance(spare);
                            recovered = true;
                        }
                    } catch (recoveryError) {
                        recoveryFailure = runner.redact(String(recoveryError));
                    }
                    if (recovered)
                        throw new Error(
                            `${reason}; unchanged healthy spare returned to pool`,
                        );
                    spare.kind =
                        unchanged && !previousBranch ? 'spare' : 'claimed';
                    spare.phase = 'failed';
                    spare.error = reason;
                    try {
                        await saveInstance(spare);
                        assertInstance(spare);
                        if (
                            !isOwnedWarm(previous) ||
                            (await realpath(spare.worktree)) !== spare.worktree
                        )
                            throw new Error(
                                'Refusing automatic teardown: warm worktree ownership is not proven',
                            );
                        await down(spare);
                    } catch (teardownError) {
                        const command = `~/.ldenv/bin/ldenv down --worktree '${spare.worktree.replaceAll("'", "'\\''")}'`;
                        throw new Error(
                            `${reason}; recovery failed: ${[recoveryFailure, runner.redact(String(teardownError))].filter(Boolean).join('; ')}. Inspect the instance, then run ${command}`,
                        );
                    }
                    throw new Error(
                        `${reason}; failed warm instance stopped and released${spare.kind === 'claimed' ? `; worktree retained at ${spare.worktree}` : ''}`,
                    );
                }
            },
            { timeoutMs: null },
        );
    } catch (error) {
        failure = error;
    }
    try {
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
    } catch (error) {
        throw new Error(
            `${failure ? `${runner.redact(String(failure))}; ` : ''}pool refill failed: ${runner.redact(String(error))}. Run ~/.ldenv/bin/ldenv pool fill.`,
        );
    }
    if (!instance) throw failure;
    return instance;
}

export async function claimSpare(
    ...args: Parameters<typeof claimInstance>
): Promise<Instance> {
    return foregroundWork(() => claimInstance(...args));
}
