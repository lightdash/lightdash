import { performance } from 'node:perf_hooks';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createRowBatchWriter, RESULT_YIELD_BUDGET_MS } from './streamRows';

describe('createRowBatchWriter', () => {
    afterEach(() => vi.restoreAllMocks());

    it('preserves rows and order in bounded batches, including the last batch', async () => {
        vi.spyOn(performance, 'now').mockReturnValue(0);
        const rows = Array.from({ length: 1003 }, (_, id) => ({
            id,
            date: new Date(id),
            value: null,
        }));
        const batches: (typeof rows)[] = [];
        await pipeline(
            Readable.from(rows),
            createRowBatchWriter(
                (row: (typeof rows)[number]) => row,
                (batch) => {
                    batches.push(batch);
                },
            ),
        );
        expect(batches.flat()).toEqual(rows);
        expect(batches.every((batch) => batch.length <= 100)).toBe(true);
        expect(batches.at(-1)).toHaveLength(3);
    });

    it('yields by elapsed time even before a batch is full', async () => {
        let now = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        let eventLoopRan = false;
        setImmediate(() => {
            eventLoopRan = true;
        });
        await pipeline(
            Readable.from([1, 2, 3]),
            createRowBatchWriter(
                (row: number) => {
                    now += RESULT_YIELD_BUDGET_MS;
                    if (row > 1) expect(eventLoopRan).toBe(true);
                    return row;
                },
                () => {},
            ),
        );
        expect(eventLoopRan).toBe(true);
    });

    it('does not convert the next batch until the consumer finishes', async () => {
        vi.spyOn(performance, 'now').mockReturnValue(0);
        let converted = 0;
        let consumed = 0;
        await pipeline(
            Readable.from(Array.from({ length: 205 }, (_, id) => id)),
            createRowBatchWriter(
                (row: number) => {
                    converted += 1;
                    return row;
                },
                async (rows) => {
                    const before = converted;
                    expect(converted - consumed).toBe(rows.length);
                    await new Promise<void>((resolve) => {
                        setImmediate(resolve);
                    });
                    expect(converted).toBe(before);
                    consumed += rows.length;
                },
            ),
        );
        expect(consumed).toBe(205);
    });

    it('waits for the callback and propagates its failure', async () => {
        const error = new Error('write failed');
        await expect(
            pipeline(
                Readable.from([1, 2]),
                createRowBatchWriter(
                    (row: number) => row,
                    async () => {
                        throw error;
                    },
                ),
            ),
        ).rejects.toThrow(error);
    });

    it('propagates source and conversion errors', async () => {
        await expect(
            pipeline(
                Readable.from([1]),
                createRowBatchWriter(
                    () => {
                        throw new Error('convert failed');
                    },
                    () => {},
                ),
            ),
        ).rejects.toThrow('convert failed');
        const source = new Readable({
            objectMode: true,
            read() {
                this.destroy(new Error('source failed'));
            },
        });
        await expect(
            pipeline(
                source,
                createRowBatchWriter(
                    (row: number) => row,
                    () => {},
                ),
            ),
        ).rejects.toThrow('source failed');
    });
});
