import { watch } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { home, readJson } from './io';
import type { Instance } from './model';

export type WaitResult =
    | { state: 'ready'; instance: Instance }
    | { state: 'failed'; error: string }
    | { state: 'timeout' };

export function waitDecision(
    instance: Instance | null,
    verified: boolean,
): WaitResult | null {
    if (!instance) return null;
    if (instance.phase === 'failed' || instance.phase === 'stopped')
        return {
            state: 'failed',
            error: instance.error ?? `Instance ${instance.phase}`,
        };
    if (verified && instance.verification?.state === 'failed')
        return {
            state: 'failed',
            error: instance.verification.error ?? 'Verification failed',
        };
    if (instance.phase === 'degraded')
        return {
            state: 'failed',
            error: instance.error ?? 'Instance degraded',
        };
    if (
        instance.phase === 'ready' &&
        (!verified || instance.verification?.state === 'passed')
    )
        return { state: 'ready', instance };
    return null;
}

export async function waitForInstance(
    id: string,
    timeoutSeconds: number,
    verified: boolean,
    directory = path.join(home, 'instances'),
): Promise<WaitResult> {
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 0)
        throw new Error('--timeout must be a non-negative number of seconds');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, `${id}.json`);
    const deadline = Date.now() + timeoutSeconds * 1000;
    let notify: (() => void) | null = null;
    const observer = watch(directory, (_event, name) => {
        if (name === null || String(name).startsWith(`${id}.`)) notify?.();
    });
    try {
        while (true) {
            const instance = await readJson<Instance>(file).catch(
                (error: NodeJS.ErrnoException) => {
                    if (error.code === 'ENOENT') return null;
                    throw error;
                },
            );
            const result = waitDecision(instance, verified);
            if (result) return result;
            const remaining = deadline - Date.now();
            if (remaining <= 0) return { state: 'timeout' };
            await new Promise<void>((resolve) => {
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    notify = null;
                    resolve();
                };
                notify = finish;
                const timer = setTimeout(finish, Math.min(remaining, 200));
            });
        }
    } finally {
        observer.close();
    }
}
