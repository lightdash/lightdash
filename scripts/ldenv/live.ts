import { apiProcessGeneration, bundleStatus } from './bundle-state';
import { alive, saveInstance } from './io';
import type { Instance } from './model';
import {
    health,
    ownedProcesses,
    cancelMonitor,
    stopProcesses,
} from './processes';

export async function instanceIsLive(
    instance: Instance,
    operations: {
        health: typeof health;
        ownedProcesses: typeof ownedProcesses;
        alive: typeof alive;
        bundleStatus?: typeof bundleStatus;
    } = { health, ownedProcesses, alive },
): Promise<boolean> {
    if (!instance.ports) return false;
    const processes = await operations.ownedProcesses(instance);
    if (
        !['api', 'frontend'].every((suffix) =>
            processes.some(
                (item) =>
                    item.name === `${instance.id}-${suffix}` &&
                    item.pm2_env.status === 'online' &&
                    operations.alive(item.pid),
            ),
        )
    )
        return false;
    const api = processes.find((item) => item.name === `${instance.id}-api`);
    const generationOperations = {
        alive: operations.alive,
        bundleStatus: operations.bundleStatus ?? bundleStatus,
    };
    const generation = await apiProcessGeneration(
        instance,
        api,
        generationOperations,
    );
    if (!generation || !(await operations.health(instance.ports.api)))
        return false;
    const current = (await operations.ownedProcesses(instance)).find(
        (item) => item.name === `${instance.id}-api`,
    );
    return (
        generation ===
        (await apiProcessGeneration(instance, current, generationOperations))
    );
}
export async function resumeExistingInstance(
    instance: Instance,
    noWait: boolean,
    start: (instance: Instance, noWait: boolean) => Promise<Instance>,
    operations = {
        instanceIsLive,
        saveInstance,
        alive,
        cancelMonitor,
        stopProcesses,
    },
): Promise<Instance> {
    if (instance.phase === 'ready') {
        if (await operations.instanceIsLive(instance)) return instance;
        await operations.cancelMonitor(instance);
        await operations.stopProcesses(instance, true);
        instance.phase = 'stopped';
        instance.readyAt = null;
        instance.verification = null;
        await operations.saveInstance(instance);
    }
    if (instance.phase === 'starting' && operations.alive(instance.monitorPid))
        return instance;
    if (instance.phase === 'stopped') return start(instance, noWait);
    throw new Error(
        'A partial instance exists. Inspect status, then ldenv down before retrying.',
    );
}
