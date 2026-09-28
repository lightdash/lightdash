import { existsSync } from 'node:fs';
import path from 'node:path';
import { alive, home, readJson } from './io';
import { assertInstance, savedBackendMode, type Instance } from './model';
import type { ProcessInfo } from './processes';
import { processEpoch } from './readiness';

export type BundleState = {
    worktree: string;
    supervisorPid: number;
    apiPid: number | null;
    state: 'building' | 'ready' | 'failed' | 'stopped';
    error: string | null;
    generation: number;
    launchedRevision: number;
    buildMs: number | null;
    builtAt: string | null;
    apiStartedAt: string | null;
};

export const bundleDirectory = (id: string) => path.join(home, 'bundles', id);

export async function apiProcessGeneration(
    instance: Instance,
    api: ProcessInfo | undefined,
    operations = { bundleStatus, alive },
): Promise<string | null> {
    if (
        !api ||
        !Number.isSafeInteger(api.pid) ||
        api.pid <= 0 ||
        !Number.isFinite(api.pm2_env.pm_uptime) ||
        api.name !== `${instance.id}-api` ||
        (api.pm2_env.pm_cwd !== instance.worktree &&
            !api.pm2_env.pm_cwd.startsWith(
                `${instance.worktree}${path.sep}`,
            )) ||
        api.pm2_env.status !== 'online' ||
        !operations.alive(api.pid)
    )
        return null;
    const supervisor = `${api.pid}:${api.pm2_env.pm_uptime}`;
    if (savedBackendMode(api.pm2_env.LDENV_BACKEND) === 'tsx')
        return supervisor;
    const state = await operations.bundleStatus(instance, api.pid);
    if (
        !state ||
        state.worktree !== instance.worktree ||
        state.supervisorPid !== api.pid ||
        state.state !== 'ready' ||
        !state.apiPid ||
        !Number.isSafeInteger(state.apiPid) ||
        state.apiPid <= 0 ||
        state.apiPid === api.pid ||
        !operations.alive(state.apiPid) ||
        !state.apiStartedAt ||
        !Number.isFinite(Date.parse(state.apiStartedAt)) ||
        Date.parse(state.apiStartedAt) < Date.parse(processEpoch(instance)) ||
        Date.parse(state.apiStartedAt) < api.pm2_env.pm_uptime ||
        !Number.isSafeInteger(state.launchedRevision) ||
        state.launchedRevision <= 0 ||
        !Number.isSafeInteger(state.generation) ||
        state.generation <= 0
    )
        return null;
    return `${supervisor}:${state.apiPid}:${state.apiStartedAt}:${state.launchedRevision}:${state.generation}`;
}

export async function bundleStatus(
    instance: Instance,
    supervisorPid: number | null,
): Promise<BundleState | null> {
    assertInstance(instance);
    const file = path.join(bundleDirectory(instance.id), 'status.json');
    if (!existsSync(file)) return null;
    const state = await readJson<BundleState>(file);
    if (state.worktree !== instance.worktree)
        throw new Error('Bundle status belongs to another worktree');
    if (state.supervisorPid !== supervisorPid)
        return { ...state, state: 'stopped', apiPid: null };
    return state;
}
