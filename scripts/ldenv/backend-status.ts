import {
    apiProcessGeneration,
    bundleStatus,
    type BundleState,
} from './bundle-state';
import { savedBackendMode, type BackendMode, type Instance } from './model';
import { health, ownedProcesses, type ProcessInfo } from './processes';

export async function inspectBackendStatus(
    instance: Instance,
    savedValue: string | undefined,
    operations = { ownedProcesses, apiProcessGeneration, bundleStatus, health },
) {
    const findApi = (processes: ProcessInfo[]) =>
        processes.find(
            (item) =>
                item.name === `${instance.id}-api` &&
                item.pm2_env.status === 'online',
        );
    const before = await operations.apiProcessGeneration(
        instance,
        findApi(await operations.ownedProcesses(instance)),
    );
    const healthy = instance.ports
        ? await operations.health(instance.ports.api)
        : false;
    const processes = await operations.ownedProcesses(instance);
    const api = findApi(processes);
    const backend = runningBackendMode(savedValue, api);
    const bundle =
        backend === 'bundle'
            ? await operations.bundleStatus(instance, api?.pid ?? null)
            : null;
    const after = await operations.apiProcessGeneration(instance, api);
    return {
        backend,
        bundle,
        processes,
        healthy,
        ...backendStatus(
            instance,
            backend,
            bundle,
            before !== null && before === after ? after : null,
            healthy,
        ),
    };
}

export function runningBackendMode(
    savedValue: string | undefined,
    api:
        | { pm2_env: Pick<ProcessInfo['pm2_env'], 'status' | 'LDENV_BACKEND'> }
        | undefined,
): BackendMode {
    return savedBackendMode(
        api?.pm2_env.status === 'online'
            ? api.pm2_env.LDENV_BACKEND
            : savedValue,
    );
}

export function backendStatus(
    instance: Instance,
    backend: BackendMode,
    bundle: BundleState | null,
    generation: string | null,
    healthy: boolean,
): { phase: Instance['phase']; error: string | null; ready: boolean } {
    const bundleReady =
        generation !== null && (backend === 'tsx' || bundle?.state === 'ready');
    const phase =
        instance.phase === 'ready' && !bundleReady
            ? 'degraded'
            : instance.phase;
    const bundleError =
        backend === 'bundle' && bundle?.state === 'failed'
            ? `Bundle build failed: ${bundle.error ?? 'unknown error'}`
            : null;
    const error =
        [instance.error, bundleError].filter(Boolean).join('; ') || null;
    return {
        phase,
        error,
        ready: instance.phase === 'ready' && healthy && bundleReady,
    };
}
