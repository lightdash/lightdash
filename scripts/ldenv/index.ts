import { existsSync } from 'node:fs';
import path from 'node:path';
import { inspectBackendStatus } from './backend-status';
import { cleanupOrphans } from './cleanup';
import {
    compose,
    dotenv,
    containers,
    freeDisk,
    localSecrets,
    machine,
    sharedServices,
} from './infra';
import { alive, git, home, runner, saveInstance, withLock } from './io';
import { installLauncher, targetArguments } from './launcher';
import {
    buildParent,
    down,
    garbageCollect,
    instances,
    parentGc,
    parents,
    rootDirectory,
    start,
    up,
} from './lifecycle';
import { sweepStaleInstances } from './maintenance';
import {
    backendMode,
    instanceId,
    savedBackendMode,
    type Instance,
} from './model';
import {
    matchesHomeLabel,
    namespace,
    postgresContainer,
    postgresPort,
    postgresVolume,
} from './namespace';
import {
    claimSpare,
    fillPool,
    poolSettings,
    retireStalePoolInstances,
} from './pool';
import {
    cancelMonitor,
    currentState,
    finishStart,
    ownedProcesses,
    stopProcesses,
    verifyClaim,
    verifyPaint,
} from './processes';
import {
    claimReadyWorktree,
    monitorReadyPool,
    poolMonitorStatus,
    syncReadyPool,
} from './ready';
import { screenshot, screenshotOptions } from './screenshot';
import { sharedBundleGc } from './shared-bundle';
import { waitForInstance } from './wait';

const help = `ldenv install
ldenv [--worktree PATH] new <branch> [--base origin/main] [--backend bundle|tsx]
ldenv pool fill [--size 1]
ldenv claim [--worktree PATH]
ldenv parent build [--ref origin/main] [--benchmark-deps] | refresh [--ref origin/main] | list | gc [--keep 2]
ldenv up [--parent SHA] [--build-parent] [--no-wait] [--tracing] [--backend bundle|tsx]
ldenv wait [--timeout S] [--verified]
ldenv screenshot [route] [--out PATH] [--signed-out] [--full-page] [--width N --height N]
ldenv down [--dry-run] | stop | start [--no-wait] [--backend bundle|tsx] | status [--json] | gc [--dry-run] | doctor
Backend defaults to bundle for new instances; use --backend tsx or LDENV_BACKEND=tsx for fallback.`;
function option(args: string[], name: string, fallback: string): string {
    const index = args.indexOf(name);
    if (index < 0) return fallback;
    const value = args[index + 1];
    if (!value || value.startsWith('--'))
        throw new Error(`${name} needs a value`);
    return value;
}
async function printInstance(instance: Instance): Promise<void> {
    const env = await dotenv(
        path.join(instance.worktree, '.env.development.local'),
    );
    const backend = savedBackendMode(env.LDENV_BACKEND);
    process.stdout.write(
        `${instance.phase.toUpperCase()}: ${instance.worktree}\nURL: http://localhost:${instance.ports?.frontend}\ninstance=${instance.id} parent=${instance.parent.slice(0, 12)} api=${instance.ports?.api} database=${instance.database} backend=${backend}\ntimeToReady=${instance.timings.timeToReady === undefined ? 'pending' : `${instance.timings.timeToReady}ms`}\nTimings (ms, RSS bytes): ${JSON.stringify(instance.timings)}\n`,
    );
    if (instance.viteCache)
        process.stdout.write(
            `Vite cache: ${instance.viteCache.status}; ${instance.viteCache.reason}; key=${instance.viteCache.key ?? 'unknown'}; snapshot=${instance.viteCache.snapshotKey ?? 'unknown'}\n`,
        );
}
async function main(args: string[]): Promise<void> {
    if (!args.length || args.includes('--help')) {
        process.stdout.write(`${help}\n`);
        return;
    }
    postgresPort();
    const target = targetArguments(
        args,
        process.env.T3CODE_WORKTREE_PATH ?? process.cwd(),
    );
    args = target.args;
    const [command, subcommand] = args;
    if (args.includes('--backend'))
        process.env.LDENV_BACKEND = backendMode(
            option(args, '--backend', 'bundle'),
        );
    if (process.env.LDENV_BACKEND !== undefined)
        backendMode(process.env.LDENV_BACKEND);
    if (args.includes('--tracing')) process.env.LDENV_TRACING = 'true';
    if (command === 'install') {
        process.stdout.write(`INSTALLED: ${await installLauncher()}\n`);
        return;
    }
    if (
        command === 'monitor' ||
        command === 'verify' ||
        command === 'verify-paint'
    ) {
        const instance = await currentState(subcommand);
        if (!instance) throw new Error('Monitor instance is missing');
        await withLock(`monitor-${instance.id}`, () =>
            command === 'verify'
                ? verifyClaim(instance)
                : command === 'verify-paint'
                  ? verifyPaint(instance)
                  : finishStart(instance, true),
        );
        return;
    }
    const root = await rootDirectory(target.worktree);
    if (command === 'pool' && subcommand === 'reconcile') {
        await syncReadyPool(root);
        return;
    }
    if (command === 'pool' && subcommand === 'monitor') {
        await monitorReadyPool(root);
        return;
    }
    if (command === 'claim') {
        await printInstance(await claimReadyWorktree(root));
        return;
    }
    if (command === 'gc-stale') {
        await sweepStaleInstances(
            root,
            args.includes('--exclude-instance')
                ? option(args, '--exclude-instance', '')
                : undefined,
        );
        return;
    }
    if (command === 'parent') {
        if (subcommand === 'list') {
            process.stdout.write(
                `${JSON.stringify(await parents(), null, 2)}\n`,
            );
            return;
        }
        if (subcommand === 'gc') {
            await parentGc(root, Number(option(args, '--keep', '2')));
            return;
        }
        if (subcommand === 'build' || subcommand === 'refresh') {
            if (subcommand === 'refresh') await sweepStaleInstances(root);
            const parent = await buildParent(
                root,
                option(args, '--ref', 'origin/main'),
                subcommand === 'refresh',
                args.includes('--benchmark-deps'),
            );
            process.stdout.write(
                `PARENT: ${parent.sha}\nTimings (ms): ${JSON.stringify(parent.timings)}\n`,
            );
            if (subcommand === 'refresh')
                await retireStalePoolInstances(
                    parent.sha,
                    undefined,
                    undefined,
                    parent.builtAt,
                );
            await installLauncher();
            await parentGc(root, Number(option(args, '--keep', '2')));
            if (subcommand === 'refresh') await fillPool(root, null);
            return;
        }
        throw new Error(help);
    }
    if (command === 'pool' && subcommand === 'fill') {
        const spares = await fillPool(
            root,
            args.includes('--size')
                ? Number(option(args, '--size', '1'))
                : null,
        );
        for (const spare of spares) await printInstance(spare);
        return;
    }
    if (command === 'new' && subcommand) {
        await printInstance(
            await claimSpare(
                root,
                subcommand,
                option(args, '--base', 'origin/main'),
            ),
        );
        return;
    }
    if (command === 'up') {
        if (args.includes('--build-parent')) await buildParent(root, 'HEAD');
        await printInstance(
            await up(
                root,
                args.includes('--parent') ? option(args, '--parent', '') : null,
                args.includes('--no-wait'),
            ),
        );
        return;
    }
    if (command === 'gc') {
        if (args.includes('--dry-run'))
            process.stdout.write(
                `${JSON.stringify(
                    {
                        missingInstances: (await instances()).filter(
                            (item) => !existsSync(item.worktree),
                        ),
                        worktrees: await cleanupOrphans(root, true),
                        sharedBundles: await sharedBundleGc(true),
                    },
                    null,
                    2,
                )}\n`,
            );
        else {
            await garbageCollect(root, true);
            await sharedBundleGc();
        }
        return;
    }
    if (command === 'doctor') {
        const pgPort = postgresPort(
            process.env.LDENV_PG_PORT,
            namespace,
            existsSync(path.join(home, 'machine.json'))
                ? (await machine()).pgPort
                : undefined,
        );
        const checks: Record<string, unknown> = {
            pgPort,
            freeDiskGB: Number(((await freeDisk()) / 1e9).toFixed(2)),
            licensePresent: Boolean(
                (await localSecrets(root)).LIGHTDASH_LICENSE_KEY,
            ),
            instanceCount: (await instances()).length,
            pool: await poolSettings(root),
        };
        try {
            checks.shared = await sharedServices(
                root,
                await compose(root),
                false,
            );
            checks.postgres = (
                await containers(root, `name=^/${postgresContainer}$`)
            ).map((item) => ({
                running: item.State.Running,
                owned:
                    item.Config.Labels['dev.lightdash.ldenv'] === 'postgres' &&
                    matchesHomeLabel(
                        item.Config.Labels['dev.lightdash.ldenv.home'],
                    ) &&
                    item.Mounts.some(
                        (mount) =>
                            mount.Name === postgresVolume &&
                            mount.Destination === '/var/lib/postgresql',
                    ) &&
                    Boolean(
                        item.NetworkSettings.Ports['5432/tcp']?.some(
                            (port) =>
                                port.HostIp === '127.0.0.1' &&
                                port.HostPort === String(pgPort),
                        ),
                    ),
            }));
            checks.docker = true;
        } catch (error) {
            checks.docker = false;
            checks.error = runner.redact(
                error instanceof Error ? error.message : String(error),
            );
        }
        process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`);
        return;
    }
    if (command === 'wait') {
        const result = await waitForInstance(
            instanceId(root),
            Number(option(args, '--timeout', '120')),
            args.includes('--verified'),
        );
        if (result.state === 'ready') {
            const ports = result.instance.ports;
            if (!ports) throw new Error('Ready instance has no ports');
            process.stdout.write(
                `FRONTEND: http://localhost:${ports.frontend}\nAPI: http://localhost:${ports.api}\nLOGIN: demo@lightdash.com\n`,
            );
            return;
        }
        process.stderr.write(
            `ldenv wait: ${result.state === 'timeout' ? 'timed out' : result.error}\n`,
        );
        process.exitCode = result.state === 'timeout' ? 2 : 1;
        return;
    }
    const instance = await currentState(instanceId(root));
    if (command === 'status') {
        if (!instance) {
            process.stdout.write(
                args.includes('--json')
                    ? 'null\n'
                    : 'No ldenv instance for this worktree\n',
            );
            return;
        }
        const env = await dotenv(
            path.join(instance.worktree, '.env.development.local'),
        );
        const derived = await inspectBackendStatus(instance, env.LDENV_BACKEND);
        const claimComplete =
            !instance.claim || instance.timings.readyClaim !== undefined;
        const status = {
            ...instance,
            backend: derived.backend,
            bundle: derived.bundle,
            phase: derived.phase,
            error: derived.error ?? instance.error,
            url: instance.ports
                ? `http://localhost:${instance.ports.frontend}`
                : null,
            healthy: derived.healthy && claimComplete,
            ready: derived.ready && claimComplete,
            timeToReady: instance.timings.timeToReady ?? null,
            monitorAlive: alive(instance.monitorPid),
            poolMonitor: instance.readyWorktree
                ? await poolMonitorStatus()
                : null,
            processes: derived.processes,
        };
        if (args.includes('--json'))
            process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
        else {
            const branch = await git(root, ['branch', '--show-current']);
            process.stdout.write(
                `${status.phase.toUpperCase()}: ${instance.worktree}\nbranch=${branch || '(detached)'} parent=${instance.parent.slice(0, 12)} kind=${instance.kind} backend=${status.backend}\nready=${status.ready} healthy=${status.healthy}\n`,
            );
            if (instance.ports)
                process.stdout.write(
                    `FRONTEND: http://localhost:${instance.ports.frontend}\nAPI: http://localhost:${instance.ports.api}\n`,
                );
            if (status.poolMonitor)
                process.stdout.write(
                    `POOL MONITOR: ${status.poolMonitor.healthy ? 'healthy' : 'unhealthy'}\n`,
                );
            if (status.error) process.stdout.write(`ERROR: ${status.error}\n`);
        }
        return;
    }
    if (!instance)
        throw new Error(
            'No ldenv instance in this worktree; run ~/.ldenv/bin/ldenv up',
        );
    if (command === 'screenshot') {
        process.stdout.write(
            `${await screenshot(instance, screenshotOptions(args))}\n`,
        );
        return;
    }
    await withLock(instance.id, async () => {
        if (command === 'down') {
            if (args.includes('--dry-run'))
                process.stdout.write(
                    `${JSON.stringify({ database: instance.database, processes: (await ownedProcesses(instance)).map((item) => item.name), portSlot: instance.id, worktree: instance.worktree }, null, 2)}\n`,
                );
            else await down(instance);
            return;
        }
        if (command === 'stop') {
            await cancelMonitor(instance);
            await stopProcesses(instance, true);
            instance.monitorPid = null;
            instance.phase = 'stopped';
            instance.readyAt = null;
            await saveInstance(instance);
            return;
        }
        if (command === 'start') {
            await printInstance(
                await start(instance, args.includes('--no-wait')),
            );
            return;
        }
        throw new Error(help);
    });
}
main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
        `ldenv: ${runner.redact(error instanceof Error ? error.message : String(error))}\n`,
    );
    process.exitCode = 1;
});
