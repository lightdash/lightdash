import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readyActivity, readyReferences } from './activity';
import { isOwnedWarm } from './cleanup';
import {
    alive,
    foregroundWork,
    git,
    home,
    readJson,
    runner,
    saveInstance,
    withLock,
    writeJson,
} from './io';
import { instances } from './lifecycle';
import { instanceId, json, type Instance } from './model';
import { canonicalHome, pm2Prefix } from './namespace';
import { background, currentState, pm2, processPriority } from './processes';
import { claimedWorkBranch } from './ready-branches';

const controlRoot = path.resolve(__dirname, '../..');
const requireRoot = createRequire(path.join(controlRoot, 'package.json'));
const monitorName = `${pm2Prefix}ldenv-pool`;
const monitorFile = path.join(home, 'pool-monitor.json');

const claimOperations = { git, saveInstance, processPriority };
const reconcileReadyBranches = async (
    root: string,
    options: { poolLockHeld?: boolean } = {},
) => (await import('./pool.js')).reconcileReadyBranches(root, options);

export async function promoteReadyWorktree(
    instance: Instance,
    reason: string,
    pid: number | null,
    operations = claimOperations,
): Promise<Instance> {
    const started = Date.now();
    instance.kind = 'claimed';
    instance.claim ??= { at: new Date().toISOString(), reason, pid };
    await operations.saveInstance(instance);
    try {
        const ownership = instance.readyWorktree;
        if (ownership) {
            const target = claimedWorkBranch(instance);
            ownership.suffix ??= target.slice('work/'.length);
            const current = await operations.git(instance.worktree, [
                'branch',
                '--show-current',
            ]);
            if (
                current !== target &&
                (current === ownership.branch ||
                    current === ownership.retiring?.branch ||
                    current === ownership.renaming?.from ||
                    current === ownership.renaming?.to)
            ) {
                try {
                    await operations.git(instance.worktree, [
                        'branch',
                        '-m',
                        current,
                        target,
                    ]);
                    ownership.branch = target;
                } catch (error) {
                    if (
                        (await operations.git(instance.worktree, [
                            'branch',
                            '--show-current',
                        ])) === current
                    )
                        throw error;
                }
            }
            if (current === target) ownership.branch = target;
            delete ownership.renaming;
        }
        await operations.processPriority(instance, false);
        instance.timings.readyClaim = Date.now() - started;
        if (instance.error?.startsWith('Ready claim failed:'))
            instance.error = null;
        await operations.saveInstance(instance);
        return instance;
    } catch (error) {
        instance.error = `Ready claim failed: ${runner.redact(String(error))}`;
        await operations.saveInstance(instance);
        throw error;
    }
}

export async function readyWorktreeChanged(
    instance: Instance,
    runGit = git,
): Promise<boolean> {
    const [branch, head, status] = await Promise.all([
        runGit(instance.worktree, ['branch', '--show-current']),
        runGit(instance.worktree, ['rev-parse', 'HEAD']),
        runGit(instance.worktree, [
            'status',
            '--porcelain',
            '--untracked-files=normal',
            '--',
            '.',
            ':!packages/backend/src/generated',
            ':!packages/common/src/schemas/json',
            ':!packages/formula/src/grammar/parser.js',
        ]),
    ]);
    const ownership = instance.readyWorktree;
    const branches = new Set([ownership?.branch ?? '']);
    if (ownership?.publication === 'pending') branches.add('');
    if (ownership?.retiring) branches.add(ownership.retiring.branch);
    if (ownership?.renaming) {
        branches.add(ownership.renaming.from);
        branches.add(ownership.renaming.to);
    }
    return (
        !branches.has(branch) ||
        head !== (instance.readyWorktree?.head ?? instance.parent) ||
        status !== ''
    );
}

export async function protectReadyWorktree(
    instance: Instance,
    operations: {
        readyActivity: typeof readyActivity;
        readyReferences?: typeof readyReferences;
        readyWorktreeChanged: typeof readyWorktreeChanged;
        promoteReadyWorktree: typeof promoteReadyWorktree;
    } = {
        readyActivity,
        readyReferences,
        readyWorktreeChanged,
        promoteReadyWorktree,
    },
): Promise<boolean> {
    if (!isOwnedWarm(instance)) return instance.kind === 'claimed';
    const activity = (await operations.readyActivity([instance])).get(
        instance.id,
    );
    const reference =
        activity ??
        (await operations.readyReferences?.([instance]))?.get(instance.id);
    const changed = await operations.readyWorktreeChanged(instance);
    if (!reference && !changed) return false;
    await operations.promoteReadyWorktree(
        instance,
        activity
            ? 'process cwd'
            : reference
              ? 'process file'
              : 'worktree changed',
        reference?.pid ?? null,
    );
    return true;
}

export async function queuePoolRefill(root: string): Promise<void> {
    const { poolSettings } = await import('./pool.js');
    const settings = await poolSettings(root);
    const pid = await background(
        ['pool', 'fill', '--worktree', settings.source],
        'pool-refill',
    );
    await writeJson(path.join(home, 'pool-refill.json'), {
        pid,
        startedAt: new Date().toISOString(),
        log: path.join(home, 'logs/pool-refill.log'),
    });
}

export async function observeReadyWorktree(
    instance: Instance,
): Promise<boolean> {
    return protectReadyWorktree(instance, {
        readyActivity,
        readyWorktreeChanged,
        promoteReadyWorktree,
    });
}

export async function claimReadyWorktree(
    root: string,
    reason = 'explicit claim',
    pid: number | null = null,
    operations: {
        foregroundWork: typeof foregroundWork;
        withLock: typeof withLock;
        currentState: typeof currentState;
        promoteReadyWorktree: typeof promoteReadyWorktree;
        queuePoolRefill: typeof queuePoolRefill;
        reconcileReadyBranches?: typeof reconcileReadyBranches;
    } = {
        foregroundWork,
        withLock,
        currentState,
        promoteReadyWorktree,
        queuePoolRefill,
        reconcileReadyBranches,
    },
    observed?: Instance,
): Promise<Instance> {
    let claimed = false;
    const instance = await operations.foregroundWork(() =>
        operations.withLock('pool', async () => {
            try {
                return await operations.withLock(
                    instanceId(root),
                    async () => {
                        const current = await operations.currentState(
                            instanceId(root),
                        );
                        if (!current)
                            throw new Error(
                                'No instance for this worktree; run ldenv up',
                            );
                        if (
                            observed &&
                            (current.kind !== observed.kind ||
                                current.phase !== observed.phase ||
                                current.updatedAt !== observed.updatedAt ||
                                JSON.stringify(current.readyWorktree) !==
                                    JSON.stringify(observed.readyWorktree))
                        )
                            return current;
                        if (current.kind === 'worktree') return current;
                        if (current.kind === 'warming')
                            throw new Error(
                                'Worktree is still warming; wait for a ready branch',
                            );
                        if (
                            current.kind === 'claimed' &&
                            current.timings.readyClaim !== undefined
                        )
                            return current;
                        if (current.kind !== 'claimed' && !isOwnedWarm(current))
                            throw new Error(
                                'Ready worktree ownership is not proven',
                            );
                        if (
                            current.kind === 'spare' &&
                            current.phase !== 'ready'
                        )
                            throw new Error(
                                'Ready worktree is no longer ready',
                            );
                        claimed = true;
                        return operations.promoteReadyWorktree(
                            current,
                            reason,
                            pid,
                        );
                    },
                    { timeoutMs: null },
                );
            } finally {
                if (claimed)
                    await operations.reconcileReadyBranches?.(root, {
                        poolLockHeld: true,
                    });
            }
        }),
    );
    if (claimed) await operations.queuePoolRefill(root);
    return instance;
}

type MonitorProcess = {
    name: string;
    pid: number;
    pm2_env: {
        LDENV_POOL_HOME?: string;
        pm_exec_path: string;
        pm_cwd: string;
        status: string;
        args?: string[];
    };
};

export async function ensurePoolMonitor(root: string): Promise<void> {
    await withLock('pool-monitor-install', async () => {
        const output = await pm2(['jlist']);
        const processes = json<MonitorProcess[]>(
            output.slice(output.indexOf('[')),
        );
        const current = processes.find((item) => item.name === monitorName);
        const owner = canonicalHome(home);
        const bundle = path.join(controlRoot, 'scripts/ldenv/index.bundle.cjs');
        const args = existsSync(bundle)
            ? [bundle]
            : [
                  '--import',
                  requireRoot.resolve('tsx'),
                  path.join(controlRoot, 'scripts/ldenv/index.ts'),
              ];
        const expectedArgs = [...args, 'pool', 'monitor', '--worktree', root];
        if (current && current.pm2_env.LDENV_POOL_HOME !== owner)
            throw new Error('Pool monitor name belongs to another home');
        if (
            current?.pm2_env.pm_cwd === controlRoot &&
            current.pm2_env.status === 'online' &&
            current.pm2_env.pm_exec_path === process.execPath &&
            JSON.stringify(current.pm2_env.args) ===
                JSON.stringify(expectedArgs)
        )
            return;
        if (current) {
            await pm2(['delete', monitorName]);
            const deadline = Date.now() + 5000;
            while (alive(current.pid) && Date.now() < deadline) await delay(25);
            if (alive(current.pid))
                throw new Error('Previous pool monitor has not stopped');
        }
        const config = path.join(home, 'pool-monitor.config.json');
        await mkdir(home, { recursive: true });
        await writeJson(config, {
            apps: [
                {
                    name: monitorName,
                    cwd: controlRoot,
                    script: process.execPath,
                    interpreter: 'none',
                    args: expectedArgs,
                    autorestart: true,
                    restart_delay: 500,
                    watch: false,
                    env: {
                        LDENV_HOME: home,
                        LDENV_POOL_HOME: owner,
                        ...(process.env.LDENV_PG_PORT
                            ? { LDENV_PG_PORT: process.env.LDENV_PG_PORT }
                            : {}),
                    },
                },
            ],
        });
        await pm2(['start', config, '--only', monitorName]);
    });
}

export async function poolMonitorStatus(): Promise<{
    healthy: boolean;
    pid: number | null;
    checkedAt: string | null;
    error: string | null;
}> {
    const state = existsSync(monitorFile)
        ? await readJson<{
              pid: number;
              checkedAt: string;
              error: string | null;
          }>(monitorFile)
        : null;
    const output = await pm2(['jlist']);
    const processes = json<MonitorProcess[]>(output.slice(output.indexOf('[')));
    const processMatches = processes.some(
        (item) =>
            item.pid === state?.pid &&
            item.name === monitorName &&
            item.pm2_env.LDENV_POOL_HOME === canonicalHome(home) &&
            item.pm2_env.status === 'online' &&
            item.pm2_env.args?.includes('monitor') &&
            item.pm2_env.args.includes('pool'),
    );
    return {
        healthy: Boolean(
            state &&
            processMatches &&
            !state.error &&
            Date.now() - Date.parse(state.checkedAt) < 5000,
        ),
        pid: state?.pid ?? null,
        checkedAt: state?.checkedAt ?? null,
        error: state?.error ?? null,
    };
}

export async function syncReadyPool(
    root: string,
    operations = {
        withLock,
        instances,
        ensurePoolMonitor,
        reconcileReadyBranches,
        source: async (directory: string) =>
            (await (await import('./pool.js')).poolSettings(directory)).source,
    },
): Promise<void> {
    await operations.withLock(
        'pool',
        async () => {
            const inventory = await operations.instances();
            if (
                !inventory.some((instance) => instance.readyWorktree) &&
                !existsSync(monitorFile)
            )
                return;
            await operations.ensurePoolMonitor(await operations.source(root));
            await operations.reconcileReadyBranches(root, {
                poolLockHeld: true,
            });
        },
        { timeoutMs: null, yieldToForeground: false },
    );
}

export async function monitorReadyPool(root: string): Promise<never> {
    let lastGitCheck = 0;
    let lastHeartbeat = 0;
    let lastRefillCheck = 0;
    let previousActivity = new Map<string, { pid: number; command: string }>();
    while (true) {
        let error: string | null = null;
        try {
            const inventory = await instances();
            for (const pending of inventory.filter(
                (item) =>
                    item.kind === 'claimed' &&
                    item.claim &&
                    item.timings.readyClaim === undefined,
            ))
                await claimReadyWorktree(
                    pending.worktree,
                    pending.claim!.reason,
                    pending.claim!.pid,
                );
            const spares = inventory.filter(
                (item) =>
                    item.kind === 'spare' &&
                    item.phase === 'ready' &&
                    item.readyWorktree,
            );
            const activity = await readyActivity(spares);
            const checkGit = Date.now() - lastGitCheck >= 2000;
            if (checkGit) lastGitCheck = Date.now();
            for (const spare of spares) {
                const occupant = activity.get(spare.id);
                if (
                    (occupant &&
                        previousActivity.get(spare.id)?.pid === occupant.pid) ||
                    (checkGit && (await readyWorktreeChanged(spare)))
                )
                    await claimReadyWorktree(
                        spare.worktree,
                        occupant ? 'process cwd' : 'worktree changed',
                        occupant?.pid ?? null,
                        undefined,
                        spare,
                    );
            }
            previousActivity = activity;
            if (checkGit) await reconcileReadyBranches(root);
            if (Date.now() - lastRefillCheck >= 10000) {
                lastRefillCheck = Date.now();
                const { poolSettings } = await import('./pool.js');
                const settings = await poolSettings(root);
                const current = await instances();
                const capacity = current.filter(
                    (item) =>
                        item.kind === 'spare' &&
                        item.phase === 'ready' &&
                        !item.readyWorktree?.retiring,
                ).length;
                const refillFile = path.join(home, 'pool-refill.json');
                const refill = existsSync(refillFile)
                    ? await readJson<{ pid: number }>(refillFile)
                    : null;
                const fillLockFile = path.join(
                    home,
                    'locks/pool-fill/owner.json',
                );
                const fillOwner = existsSync(fillLockFile)
                    ? await readJson<{ pid: number }>(fillLockFile).catch(
                          (error: NodeJS.ErrnoException) => {
                              if (error.code === 'ENOENT') return null;
                              throw error;
                          },
                      )
                    : null;
                if (
                    capacity < settings.size &&
                    !alive(refill?.pid ?? null) &&
                    !alive(fillOwner?.pid ?? null)
                )
                    await queuePoolRefill(settings.source);
            }
        } catch (caught) {
            error = runner.redact(String(caught));
            process.stderr.write(`${error}\n`);
        }
        if (Date.now() - lastHeartbeat >= 1000 || error) {
            await writeJson(monitorFile, {
                pid: process.pid,
                checkedAt: new Date().toISOString(),
                error,
                source: root,
            });
            lastHeartbeat = Date.now();
        }
        await delay(200);
    }
}
