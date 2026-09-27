import { existsSync } from 'node:fs';
import {
    compose,
    containers,
    freeDisk,
    localSecrets,
    sharedServices,
} from './infra';
import { alive, runner, saveInstance, withLock } from './io';
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
import { instanceId, type Instance } from './model';
import { claimSpare, fillPool, poolSettings } from './pool';
import {
    cancelMonitor,
    currentState,
    finishStart,
    health,
    ownedProcesses,
    stopProcesses,
} from './processes';

const help = `ldenv new <branch> [--base origin/main]
ldenv pool fill [--size 1]
ldenv parent build [--ref origin/main] [--benchmark-deps] | refresh [--ref origin/main] | list | gc [--keep 2]
ldenv up [--parent SHA] [--build-parent] [--no-wait]
ldenv down [--dry-run] | stop | start [--no-wait] | status [--json] | gc [--dry-run] | doctor`;
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
        `${instance.phase.toUpperCase()}: ${instance.worktree}\nURL: http://localhost:${instance.ports?.frontend}\ninstance=${instance.id} parent=${instance.parent.slice(0, 12)} api=${instance.ports?.api} database=${instance.database}\ntimeToReady=${instance.timings.timeToReady ?? 'pending'}ms\nTimings (ms, RSS bytes): ${JSON.stringify(instance.timings)}\n`,
    );
}
async function main(args: string[]): Promise<void> {
    if (!args.length || args.includes('--help')) {
        process.stdout.write(`${help}\n`);
        return;
    }
    const [command, subcommand] = args;
    if (command === 'monitor') {
        const instance = await currentState(subcommand);
        if (!instance) throw new Error('Monitor instance is missing');
        await withLock(`monitor-${instance.id}`, () => finishStart(instance));
        return;
    }
    const root = await rootDirectory();
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
                    (await instances()).filter(
                        (item) => !existsSync(item.worktree),
                    ),
                    null,
                    2,
                )}\n`,
            );
        else await garbageCollect(root);
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
        const status = {
            ...instance,
            url: instance.ports
                ? `http://localhost:${instance.ports.frontend}`
                : null,
            healthy: online,
            ready: instance.phase === 'ready' && online,
            timeToReady: instance.timings.timeToReady ?? null,
            monitorAlive: alive(instance.monitorPid),
            processes: await ownedProcesses(instance),
        };
        process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
        return;
    }
    if (!instance)
        throw new Error(
            'No ldenv instance in this worktree; run pnpm ldenv up',
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
