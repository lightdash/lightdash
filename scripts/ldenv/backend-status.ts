import type { BundleState } from './bundle-state';
import { savedBackendMode, type BackendMode, type Instance } from './model';
import type { ProcessInfo } from './processes';

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
        backend === 'tsx' || (bundle?.state === 'ready' && generation !== null);
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
