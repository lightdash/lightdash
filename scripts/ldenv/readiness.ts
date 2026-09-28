import path from 'node:path';
import { home, readJson, waitUntil } from './io';
import type { Instance } from './model';

export type CompilerState = {
    epoch: string;
    state: 'building' | 'settled' | 'failed';
    errors: number;
    at: number;
};
export const compilerNames = ['common', 'formula', 'warehouses', 'routes'];
export function canStartApiAlongsideWatchers(files: string[]): boolean {
    return !files.some(
        (file) =>
            file === 'pnpm-lock.yaml' ||
            file === 'pnpm-workspace.yaml' ||
            file === '.npmrc' ||
            file.startsWith('packages/common/') ||
            file.startsWith('packages/warehouses/') ||
            file.startsWith('packages/formula/') ||
            file.startsWith('packages/backend/src/controllers/') ||
            file.startsWith('packages/backend/src/ee/controllers/') ||
            file.startsWith('packages/backend/src/generated/'),
    );
}
export const processEpoch = (instance: Instance): string =>
    instance.processStartedAt ?? instance.startedAt;

export function claimChangesApi(files: string[]): boolean {
    return files.some(
        (file) =>
            file === 'packages/common/dist/cjs/.tsbuildinfo' ||
            (file.startsWith('packages/backend/src/') &&
                file !== 'packages/backend/src/generated/swagger.json' &&
                !file.includes('/node_modules/') &&
                !/\.(?:md|mdx|map|test\.tsx?)$/.test(file)),
    );
}
export function compilerDirectory(instance: Instance): string {
    return path.join(home, 'watchers', instance.id);
}
export function compilersSettled(
    states: (CompilerState | null)[],
    epoch: string,
    now: number,
): boolean {
    for (const state of states) {
        if (
            state?.epoch === epoch &&
            (state.state === 'failed' || state.errors > 0)
        )
            throw new Error('A package watcher failed its initial compilation');
    }
    return (
        states.length === compilerNames.length &&
        states.every(
            (state) =>
                state?.epoch === epoch &&
                state.state === 'settled' &&
                now - state.at >= 1000,
        )
    );
}
export async function waitForCompilers(instance: Instance): Promise<void> {
    await waitUntil(
        async () =>
            compilersSettled(
                await Promise.all(
                    compilerNames.map((name) =>
                        readJson<CompilerState>(
                            path.join(
                                compilerDirectory(instance),
                                `${name}.json`,
                            ),
                        ).catch((error: NodeJS.ErrnoException) => {
                            if (error.code === 'ENOENT') return null;
                            throw error;
                        }),
                    ),
                ),
                processEpoch(instance),
                Date.now(),
            ),
        120000,
        'package watchers to settle',
    );
}
export async function stableReadiness(
    check: () => Promise<void>,
    settledGeneration: () => Promise<string>,
): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const generation = await settledGeneration();
        try {
            await check();
        } catch (error) {
            if (generation !== (await settledGeneration())) continue;
            throw error;
        }
        if (generation === (await settledGeneration())) return;
    }
    throw new Error('API keeps restarting during readiness checks');
}
