export const createRequestQueue = () => {
    let active = 0;
    const queue: (() => void)[] = [];
    return async <T>(
        request: () => Promise<T>,
        signal: AbortSignal | undefined,
    ): Promise<T> => {
        await new Promise<void>((resolve, reject) => {
            const abort = () => {
                const index = queue.indexOf(start);
                if (index >= 0) queue.splice(index, 1);
                reject(signal?.reason);
            };
            const start = () => {
                signal?.removeEventListener('abort', abort);
                if (signal?.aborted) {
                    reject(signal.reason);
                    return;
                }
                active += 1;
                resolve();
            };
            if (signal?.aborted) reject(signal.reason);
            else if (active < 4) start();
            else {
                queue.push(start);
                signal?.addEventListener('abort', abort, { once: true });
            }
        });
        try {
            signal?.throwIfAborted();
            return await request();
        } finally {
            active -= 1;
            queue.shift()?.();
        }
    };
};

export type RequestQueue = ReturnType<typeof createRequestQueue>;
