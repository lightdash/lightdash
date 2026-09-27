import path from 'node:path';
import { runner } from './io';
import type { Environment } from './model';
import type { ViteCacheReport } from './vite-cache';
export type { ViteCacheReport } from './vite-cache';

export const viteLauncher = path.join(__dirname, 'vite-launcher.cjs');

async function cacheCommand(
    action: 'populate' | 'restore' | 'inspect',
    root: string,
    env: Environment,
    parentRoot: string | null,
): Promise<ViteCacheReport> {
    try {
        const output = await runner.run(
            process.execPath,
            [viteLauncher, action, root, ...(parentRoot ? [parentRoot] : [])],
            { cwd: root, env: { ...env, NODE_ENV: 'development' } },
        );
        const result = output
            .split('\n')
            .findLast((line) => line.startsWith('LDENV_VITE_RESULT='));
        if (!result)
            throw new Error('Vite cache helper did not return a result');
        return JSON.parse(
            result.slice('LDENV_VITE_RESULT='.length),
        ) as ViteCacheReport;
    } catch (error) {
        return {
            key: null,
            snapshotKey: null,
            fingerprints: null,
            snapshotFingerprints: null,
            status: 'miss',
            reason: (error as Error).message,
        };
    }
}

export const populateViteCache = (
    root: string,
    env: Environment,
): Promise<ViteCacheReport> => cacheCommand('populate', root, env, null);
export const restoreViteCache = (
    parentRoot: string,
    root: string,
    env: Environment,
): Promise<ViteCacheReport> => cacheCommand('restore', root, env, parentRoot);

export const inspectViteCache = (
    parentRoot: string,
    root: string,
    env: Environment,
): Promise<ViteCacheReport> => cacheCommand('inspect', root, env, parentRoot);
