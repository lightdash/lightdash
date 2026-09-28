import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { changedFiles, dependencies, runTiers } from './cache';
import { assertOwnedWarmForTeardown, isOwnedWarm } from './cleanup';
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
import { sweepStaleInstances } from './maintenance';
import {
    assertInstance,
    backendMode,
    matchingTiers,
    savedBackendMode,
    selectParent,
    type BackendMode,
    type Environment,
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
import {
    hideReadyBranchForRetirement,
    publishReadyBranch,
    retireClaimedReadyBranch,
} from './ready-branches';

const protectReadyWorktree = async (instance: Instance) =>
    (await import('./ready.js')).protectReadyWorktree(instance);
const ensurePoolMonitor = async (root: string) =>
    (await import('./ready.js')).ensurePoolMonitor(root);

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
async function spareBackendMode(instance: Instance): Promise<BackendMode> {
    const env = await dotenv(
        path.join(instance.worktree, '.env.development.local'),
    );
    return savedBackendMode(env.LDENV_BACKEND);
}
const poolStateOperations = {
    withLock,
    instances,
    saveInstance,
    down,
    alive,
    spareBackendMode,
    protectReadyWorktree,
};

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
    desiredMode?: BackendMode,
    parentBuiltAt?: string,
): Promise<{ ready: Instance[]; failed: number }> {
    return operations.withLock('pool', async () => {
        const ready: Instance[] = [];
        let failed = 0;
        const eligible = (instance: Instance) =>
            instance.kind === 'spare' &&
            instance.phase === 'ready' &&
            !instance.readyWorktree?.retiring &&
            instance.parent === parent &&
            (parentBuiltAt === undefined ||
                instance.readyWorktree?.parentBuiltAt === parentBuiltAt);
        for (const instance of (await operations.instances()).filter(eligible))
            await operations.withLock(instance.id, async () => {
                const current = (await operations.instances()).find(
                    (item) => item.id === instance.id,
                );
                if (!current || !eligible(current)) return;
                if (
                    desiredMode !== undefined &&
                    (await operations.spareBackendMode(current)) !== desiredMode
                )
                    return;
                if (await retainLiveSpare(current, operations))
                    ready.push(current);
                else failed += 1;
            });
        return { ready, failed };
    });
}

export async function publishSpare(
    instance: Instance,
    operations: Omit<
        typeof poolStateOperations,
        'spareBackendMode' | 'protectReadyWorktree'
    > & { parents?: typeof parents } = poolStateOperations,
    parentBuiltAt?: string,
    expectedParent?: { sha: string; builtAt: string },
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
                    if (expectedParent) {
                        const latest = (
                            await (operations.parents ?? parents)()
                        ).sort((a, b) => b.builtAt.localeCompare(a.builtAt))[0];
                        if (
                            latest?.sha !== expectedParent.sha ||
                            latest.builtAt !== expectedParent.builtAt
                        )
                            throw new ParentGenerationChangedError();
                    }
                    if (parentBuiltAt)
                        await publishReadyBranch(registered, parentBuiltAt);
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

class ParentGenerationChangedError extends Error {
    constructor() {
        super('Parent generation changed before spare publication');
    }
}

export async function retireStalePoolInstances(
    parent: string,
    operations: Omit<typeof poolStateOperations, 'protectReadyWorktree'> & {
        protectReadyWorktree?: typeof protectReadyWorktree;
        hideReadySpare?: typeof hideReadyBranchForRetirement;
        waitForGrace?: (milliseconds: number) => Promise<void>;
        assertOwnedWarmForTeardown?: typeof assertOwnedWarmForTeardown;
    } = poolStateOperations,
    desiredMode?: BackendMode,
    parentBuiltAt?: string,
    targetSize?: number,
): Promise<void> {
    const excessIds = new Set<string>();
    const stale = async (instance: Instance) =>
        (instance.kind === 'spare' || instance.kind === 'warming') &&
        (excessIds.has(instance.id) ||
            Boolean(instance.readyWorktree?.retiring) ||
            instance.parent !== parent ||
            (parentBuiltAt !== undefined &&
                instance.readyWorktree?.parentBuiltAt !== parentBuiltAt) ||
            instance.phase === 'failed' ||
            (instance.kind === 'warming' &&
                instance.phase === 'ready' &&
                !operations.alive(instance.monitorPid)) ||
            (desiredMode !== undefined &&
                (await operations.spareBackendMode(instance)) !== desiredMode));
    const reserved = await operations.withLock('pool', async () => {
        const inventory = await operations.instances();
        if (targetSize !== undefined) {
            const current = inventory
                .filter(
                    (instance) =>
                        instance.kind === 'spare' &&
                        instance.phase === 'ready' &&
                        !instance.readyWorktree?.retiring &&
                        instance.parent === parent &&
                        instance.readyWorktree?.parentBuiltAt === parentBuiltAt,
                )
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            for (const instance of current.slice(
                0,
                Math.max(0, current.length - targetSize),
            ))
                excessIds.add(instance.id);
        }
        const records: Instance[] = [];
        for (const instance of inventory) {
            if (!(await stale(instance))) continue;
            await operations.withLock(instance.id, async () => {
                const current = (await operations.instances()).find(
                    (item) => item.id === instance.id,
                );
                if (!current || !(await stale(current))) return;
                if (await (operations.protectReadyWorktree?.(current) ?? false))
                    return;
                await (
                    operations.hideReadySpare ?? hideReadyBranchForRetirement
                )(current);
                records.push(structuredClone(current));
            });
        }
        return records;
    });
    for (const instance of reserved) {
        await (operations.waitForGrace ?? delay)(2000);
        const retire = () =>
            operations.withLock(
                instance.id,
                async () => {
                    const current = (await operations.instances()).find(
                        (item) => item.id === instance.id,
                    );
                    if (
                        !current ||
                        current.phase !== instance.phase ||
                        current.kind !== instance.kind ||
                        current.startedAt !== instance.startedAt ||
                        current.updatedAt !== instance.updatedAt ||
                        current.worktree !== instance.worktree ||
                        current.parent !== instance.parent ||
                        current.readyWorktree?.retiring?.hiddenAt !==
                            instance.readyWorktree?.retiring?.hiddenAt
                    )
                        return;
                    if (
                        await (operations.protectReadyWorktree?.(current) ??
                            false)
                    )
                        return;
                    await (
                        operations.assertOwnedWarmForTeardown ??
                        assertOwnedWarmForTeardown
                    )(current, path.resolve(__dirname, '../..'));
                    if (
                        await (operations.protectReadyWorktree?.(current) ??
                            false)
                    )
                        return;
                    current.phase = 'failed';
                    await operations.saveInstance(current);
                    await operations.down(current);
                },
                { timeoutMs: null },
            );
        await operations.withLock('pool', retire, {
            timeoutMs: null,
            yieldToForeground: false,
        });
    }
}

const fillOperations = {
    backgroundWork,
    withLock,
    yieldToForeground,
    poolSettings,
    writeJson,
    parents,
    localSecrets,
    sweepStaleInstances,
    retireStalePoolInstances: (
        parent: string,
        mode: BackendMode,
        builtAt: string,
        size: number,
    ) =>
        retireStalePoolInstances(
            parent,
            poolStateOperations,
            mode,
            builtAt,
            size,
        ),
    inspectReadySpares: (parent: string, mode: BackendMode, builtAt: string) =>
        inspectReadySpares(
            parent,
            { ...poolStateOperations, instanceIsLive },
            mode,
            builtAt,
        ),
    diskGuard,
    availableMemory,
    mkdir: (directory: string) => mkdir(directory, { recursive: true }),
    git,
    up,
    publishSpare,
    ensurePoolMonitor,
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
        sweepStaleInstances,
        retireStalePoolInstances,
        inspectReadySpares,
        diskGuard,
        availableMemory,
        mkdir,
        git,
        up,
        publishSpare,
        ensurePoolMonitor,
    } = operations;
    await sweepStaleInstances(root);
    const withFillLock = (work: () => Promise<Instance[]>) =>
        withLock('pool-fill', work, { timeoutMs: null });
    return backgroundWork(() =>
        withFillLock(async () => {
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
            const sourceSecrets = await localSecrets(root);
            const desiredMode = backendMode(
                process.env.LDENV_BACKEND ?? sourceSecrets.LDENV_BACKEND,
            );
            while (true) {
                const parent = (await parents()).sort((a, b) =>
                    b.builtAt.localeCompare(a.builtAt),
                )[0];
                if (!parent)
                    throw new Error('Build a parent before filling the pool');
                const secrets: Environment = {
                    ...sourceSecrets,
                    LDENV_BACKEND: desiredMode,
                };
                if (!secrets.LIGHTDASH_LICENSE_KEY)
                    inheritLicensePair(
                        secrets,
                        await localSecrets(parent.path),
                    );
                await retireStalePoolInstances(
                    parent.sha,
                    desiredMode,
                    parent.builtAt,
                    settings.size,
                );
                const { ready, failed } = await inspectReadySpares(
                    parent.sha,
                    desiredMode,
                    parent.builtAt,
                );
                if (failed) continue;
                if (ready.length >= settings.size) {
                    const latest = (await parents()).sort((a, b) =>
                        b.builtAt.localeCompare(a.builtAt),
                    )[0];
                    if (
                        latest?.sha !== parent.sha ||
                        latest.builtAt !== parent.builtAt
                    )
                        continue;
                    if (ready.some((instance) => instance.readyWorktree))
                        await ensurePoolMonitor(root);
                    return ready;
                }
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
                try {
                    await publishSpare(instance, undefined, parent.builtAt, {
                        sha: parent.sha,
                        builtAt: parent.builtAt,
                    });
                } catch (error) {
                    if (error instanceof ParentGenerationChangedError) continue;
                    throw error;
                }
                await ensurePoolMonitor(root);
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
    protectReadyWorktree,
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
        protectReadyWorktree,
    } = operations;
    const started = Date.now();
    const requestedMode = backendMode(process.env.LDENV_BACKEND);
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
                (item) =>
                    item.kind === 'spare' &&
                    item.phase === 'ready' &&
                    !item.readyWorktree?.retiring,
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
                    if (await protectReadyWorktree(current)) return null;
                    if (!(await retainLiveSpare(current, operations)))
                        return null;
                    if (
                        savedBackendMode(
                            (
                                await dotenv(
                                    path.join(
                                        current.worktree,
                                        '.env.development.local',
                                    ),
                                )
                            ).LDENV_BACKEND,
                        ) !== requestedMode
                    )
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
                    try {
                        await retireClaimedReadyBranch(
                            spare,
                            previousBranch,
                            previousHead,
                            git,
                        );
                    } catch (retirementError) {
                        process.stderr.write(
                            `Ready branch retained after claim: ${runner.redact(String(retirementError))}\n`,
                        );
                    }
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
