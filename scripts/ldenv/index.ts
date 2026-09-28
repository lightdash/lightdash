import { existsSync } from 'node:fs';
import path from 'node:path';
import { bundleStatus } from './bundle-state';
import { cleanupOrphans } from './cleanup';
import {
    compose,
    dotenv,
    containers,
    freeDisk,
    localSecrets,
    sharedServices,
} from './infra';
import { alive, runner, saveInstance, withLock } from './io';
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
import { backendMode, instanceId, type Instance } from './model';
import { claimSpare, fillPool, poolSettings } from './pool';
import {
    cancelMonitor,
    currentState,
    finishStart,
    health,
    ownedProcesses,
    stopProcesses,
    verifyClaim,
    verifyPaint,
} from './processes';

const help = `ldenv install
ldenv [--worktree PATH] new <branch> [--base origin/main] [--backend tsx|bundle]
ldenv pool fill [--size 1]
ldenv parent build [--ref origin/main] [--benchmark-deps] | refresh [--ref origin/main] | list | gc [--keep 2]
ldenv up [--parent SHA] [--build-parent] [--no-wait] [--tracing] [--backend tsx|bundle]
ldenv down [--dry-run] | stop | start [--no-wait] [--backend tsx|bundle] | status [--json] | gc [--dry-run] | doctor`;
function option(args: string[], name: string, fallback: string): string {
    const index = args.indexOf(name);
    if (index < 0) return fallback;
    const value = args[index + 1];
    if (!value || value.startsWith('--'))
        throw new Error(`${name} needs a value`);
    return value;
}
function printInstance(instance: Instance): void {
    process.stdout.write(
        `${instance.phase.toUpperCase()}: ${instance.worktree}\nURL: http://localhost:${instance.ports?.frontend}\ninstance=${instance.id} parent=${instance.parent.slice(0, 12)} api=${instance.ports?.api} database=${instance.database}\ntimeToReady=${instance.timings.timeToReady === undefined ? 'pending' : `${instance.timings.timeToReady}ms`}\nTimings (ms, RSS bytes): ${JSON.stringify(instance.timings)}\n`,
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
    const target = targetArguments(
        args,
        process.env.T3CODE_WORKTREE_PATH ?? process.cwd(),
    );
    args = target.args;
    const [command, subcommand] = args;
    if (args.includes('--backend'))
        process.env.LDENV_BACKEND = backendMode(
            option(args, '--backend', 'tsx'),
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
            const parent = await buildParent(
                root,
                option(args, '--ref', 'origin/main'),
                subcommand === 'refresh',
                args.includes('--benchmark-deps'),
            );
            process.stdout.write(
                `PARENT: ${parent.sha}\nTimings (ms): ${JSON.stringify(parent.timings)}\n`,
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
        spares.forEach(printInstance);
        return;
    }
    if (command === 'new' && subcommand) {
        printInstance(
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
        printInstance(
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
                    },
                    null,
                    2,
                )}\n`,
            );
        else await garbageCollect(root, true);
        return;
    }
    if (command === 'doctor') {
        const checks: Record<string, unknown> = {
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
            checks.postgres = (await containers(root, 'name=^/ldenv-pg$')).map(
                (item) => ({
                    running: item.State.Running,
                    owned:
                        item.Config.Labels['dev.lightdash.ldenv'] ===
                        'postgres',
                }),
            );
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
        const online = instance.ports
            ? await health(instance.ports.api)
            : false;
        const processes = await ownedProcesses(instance);
        const env = await dotenv(
            path.join(instance.worktree, '.env.development.local'),
        );
        const backend = backendMode(env.LDENV_BACKEND);
        const bundle =
            backend === 'bundle'
                ? await bundleStatus(
                      instance,
                      processes.find(
                          (item) => item.name === `${instance.id}-api`,
                      )?.pid ?? null,
                  )
                : null;
        const buildFailed = bundle?.state === 'failed';
        const status = {
            ...instance,
            backend,
            bundle,
            phase:
                buildFailed && instance.phase === 'ready'
                    ? 'degraded'
                    : instance.phase,
            error: buildFailed ? bundle.error : instance.error,
            url: instance.ports
                ? `http://localhost:${instance.ports.frontend}`
                : null,
            healthy: online,
            ready: instance.phase === 'ready' && online && !buildFailed,
            timeToReady: instance.timings.timeToReady ?? null,
            monitorAlive: alive(instance.monitorPid),
            processes,
        };
        process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
        return;
    }
    if (!instance)
        throw new Error(
            'No ldenv instance in this worktree; run ~/.ldenv/bin/ldenv up',
        );
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
            printInstance(await start(instance, args.includes('--no-wait')));
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
