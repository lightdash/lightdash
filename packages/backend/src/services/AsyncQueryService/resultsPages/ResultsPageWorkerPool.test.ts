import { EventEmitter } from 'events';
import zlib from 'zlib';
import { buildResultsPageRowsJson } from './buildResultsPageRows';
import { formatCases, resultsPageLines } from './resultsPageFixtures.mock';
import {
    ResultsPageWorkerError,
    ResultsPageWorkerPool,
    type ResultsPageWorkerLike,
} from './ResultsPageWorkerPool';
import type {
    ResultsPageWorkerRequest,
    ResultsPageWorkerResponse,
} from './resultsPageWorkerProtocol';

const [, plainFormat] = formatCases[0];

class FakeWorker extends EventEmitter implements ResultsPageWorkerLike {
    readonly requests: ResultsPageWorkerRequest[] = [];

    terminated = false;

    postMessage(request: ResultsPageWorkerRequest) {
        this.requests.push(request);
    }

    reply(response: Partial<ResultsPageWorkerResponse> = {}) {
        const request = this.requests[this.requests.length - 1];
        const rows = Buffer.from(`[${request.lines.join(',')}]`);
        this.emit('message', {
            id: request.id,
            ok: true,
            rows: new Uint8Array(rows),
            compressed: new Uint8Array(zlib.brotliCompressSync(rows)),
            rowCount: request.lines.length,
            ...response,
        });
    }

    unref() {}

    async terminate() {
        this.terminated = true;
        return 0;
    }
}

const fakePool = (size: number) => {
    const workers: FakeWorker[] = [];
    const pool = new ResultsPageWorkerPool({
        size,
        brotliQuality: 4,
        createWorker: () => {
            const worker = new FakeWorker();
            workers.push(worker);
            return worker;
        },
    });
    return { pool, workers };
};

const flush = () =>
    new Promise<void>((resolve) => {
        setImmediate(resolve);
    });

describe('ResultsPageWorkerPool', () => {
    test('starts no worker until the first build', async () => {
        const { pool, workers } = fakePool(2);

        expect(workers).toHaveLength(0);
        expect(pool.workersStarted).toBe(0);
    });

    test('never runs more builds than its size, and queues the rest in order', async () => {
        const { pool, workers } = fakePool(2);
        let running = 0;
        let maxRunning = 0;
        const started: number[] = [];
        const finish = new Map<number, () => void>();

        const builds = [0, 1, 2, 3, 4].map((index) =>
            pool.withWorker(async () => {
                running += 1;
                maxRunning = Math.max(maxRunning, running);
                started.push(index);
                await new Promise<void>((resolve) => {
                    finish.set(index, resolve);
                });
                running -= 1;
                return index;
            }),
        );

        await flush();
        expect(started).toEqual([0, 1]);
        finish.get(1)!();
        await flush();
        expect(started).toEqual([0, 1, 2]);
        finish.get(0)!();
        await flush();
        finish.get(2)!();
        await flush();
        finish.get(3)!();
        await flush();
        finish.get(4)!();

        await expect(Promise.all(builds)).resolves.toEqual([0, 1, 2, 3, 4]);
        expect(started).toEqual([0, 1, 2, 3, 4]);
        expect(maxRunning).toBe(2);
        expect(workers).toHaveLength(0);
    });

    test('takes the slot before the caller reads the page', async () => {
        const { pool } = fakePool(1);
        const reads: string[] = [];
        let release!: () => void;

        const first = pool.withWorker(async () => {
            reads.push('first');
            await new Promise<void>((resolve) => {
                release = resolve;
            });
        });
        const second = pool.withWorker(async () => {
            reads.push('second');
        });

        await flush();
        expect(reads).toEqual(['first']);
        release();
        await Promise.all([first, second]);
        expect(reads).toEqual(['first', 'second']);
    });

    test('returns the rows, the brotli copy and the row count', async () => {
        const { pool, workers } = fakePool(1);

        const build = pool.withWorker((worker) =>
            worker.build(['{"a":1}', '{"a":2}'], plainFormat),
        );
        await flush();
        workers[0].reply();
        const result = await build;

        expect(result.rows.toString()).toBe('[{"a":1},{"a":2}]');
        expect(zlib.brotliDecompressSync(result.compressed)).toEqual(
            result.rows,
        );
        expect(result.rowCount).toBe(2);
        expect(workers[0].requests[0]).toMatchObject({
            lines: ['{"a":1}', '{"a":2}'],
            format: plainFormat,
            brotliQuality: 4,
        });
    });

    test('rejects with a worker error when the worker reports a failure', async () => {
        const { pool, workers } = fakePool(1);

        const build = pool.withWorker((worker) =>
            worker.build(['not json'], plainFormat),
        );
        await flush();
        workers[0].emit('message', {
            id: workers[0].requests[0].id,
            ok: false,
            message: 'Unexpected token',
        });

        await expect(build).rejects.toBeInstanceOf(ResultsPageWorkerError);
        expect(workers).toHaveLength(1);
    });

    test('replaces a crashed worker and keeps serving builds', async () => {
        const { pool, workers } = fakePool(1);

        const crashed = pool.withWorker((worker) =>
            worker.build(['{"a":1}'], plainFormat),
        );
        await flush();
        workers[0].emit('error', new Error('out of memory'));
        workers[0].emit('exit', 1);
        await expect(crashed).rejects.toBeInstanceOf(ResultsPageWorkerError);
        expect(workers[0].terminated).toBe(true);

        const next = pool.withWorker((worker) =>
            worker.build(['{"a":2}'], plainFormat),
        );
        await flush();
        expect(workers).toHaveLength(2);
        workers[1].reply();

        await expect(next).resolves.toMatchObject({ rowCount: 1 });
        expect(pool.workersStarted).toBe(2);
    });

    test('rejects with a worker error when a worker cannot start', async () => {
        const pool = new ResultsPageWorkerPool({
            size: 1,
            brotliQuality: 4,
            createWorker: () => {
                throw new Error('no such file');
            },
        });

        await expect(
            pool.withWorker((worker) => worker.build(['{}'], plainFormat)),
        ).rejects.toBeInstanceOf(ResultsPageWorkerError);
    });
});

describe('the real results page worker entry', () => {
    test.each(formatCases)(
        'builds the same bytes as the inline build for %s',
        async (_name, format) => {
            const pool = new ResultsPageWorkerPool({
                size: 1,
                brotliQuality: 4,
            });

            const result = await pool.withWorker((worker) =>
                worker.build([...resultsPageLines], format),
            );

            expect(result.rows.toString()).toBe(
                buildResultsPageRowsJson(resultsPageLines, format),
            );
            expect(zlib.brotliDecompressSync(result.compressed)).toEqual(
                result.rows,
            );
            expect(result.rowCount).toBe(resultsPageLines.length);
            expect(pool.workersStarted).toBe(1);
        },
        30_000,
    );

    test('reports a bad line as a worker error and keeps the worker', async () => {
        const pool = new ResultsPageWorkerPool({ size: 1, brotliQuality: 4 });

        await expect(
            pool.withWorker((worker) =>
                worker.build(['{"a":1}', '{not json'], plainFormat),
            ),
        ).rejects.toBeInstanceOf(ResultsPageWorkerError);
        await expect(
            pool.withWorker((worker) => worker.build(['{"a":1}'], plainFormat)),
        ).resolves.toMatchObject({ rowCount: 1 });
        expect(pool.workersStarted).toBe(1);
    }, 30_000);
});
