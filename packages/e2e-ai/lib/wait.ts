import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Polls `read` until `done` holds or `timeoutMs` passes, and returns the last
 * value either way: for waiting on something that is reported, not asserted.
 */
export const waitFor = async <T>(
    read: () => Promise<T>,
    done: (value: T) => boolean,
    timeoutMs: number,
): Promise<T> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await read();
        if (done(value) || Date.now() >= deadline) return value;
        await sleep(500);
    }
};
