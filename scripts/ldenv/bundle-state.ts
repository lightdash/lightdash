import { existsSync } from 'node:fs';
import path from 'node:path';
import { home, readJson } from './io';
import { assertInstance, type Instance } from './model';

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
