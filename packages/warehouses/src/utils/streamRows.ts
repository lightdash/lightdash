import { performance } from 'node:perf_hooks';
import { Writable } from 'node:stream';
import { setImmediate } from 'node:timers/promises';

export const RESULT_YIELD_BUDGET_MS = 20;
export const RESULT_BATCH_SIZE = 100;

export function createTimeBudgetYield() {
    let startedAt = performance.now();
    return () => {
        if (performance.now() - startedAt < RESULT_YIELD_BUDGET_MS) {
            return undefined;
        }
        return setImmediate().then(() => {
            startedAt = performance.now();
        });
    };
}

export function createRowBatchWriter<Input, Output>(
    mapRow: (row: Input) => Output,
    onRows: (rows: Output[]) => void | Promise<void>,
): Writable {
    const yieldIfNeeded = createTimeBudgetYield();
    let batch: Output[] = [];
    const flush = async () => {
        if (batch.length > 0) {
            const rows = batch;
            batch = [];
            await onRows(rows);
        }
        const yielding = yieldIfNeeded();
        if (yielding) await yielding;
    };
    return new Writable({
        objectMode: true,
        write(row: Input, _encoding, callback) {
            try {
                batch.push(mapRow(row));
                const yielding = yieldIfNeeded();
                if (yielding || batch.length >= RESULT_BATCH_SIZE) {
                    void (async () => {
                        if (yielding) await yielding;
                        await flush();
                    })().then(() => callback(), callback);
                } else {
                    callback();
                }
            } catch (error) {
                callback(
                    error instanceof Error ? error : new Error(String(error)),
                );
            }
        },
        final(callback) {
            void flush().then(() => callback(), callback);
        },
    });
}
