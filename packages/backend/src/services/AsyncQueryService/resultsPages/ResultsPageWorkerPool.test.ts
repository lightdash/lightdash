import { spawnSync } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import zlib from 'zlib';
import { buildResultsPageRowsJson } from './buildResultsPageRows';
import { formatCases, resultsPageLines } from './resultsPageFixtures.mock';
import {
    ResultsPageWorkerError,
    ResultsPageWorkerPool,
    type ResultsPageBuildJob,
    type ResultsPageWorkerLike,
} from './ResultsPageWorkerPool';
import type { ResultsPageWorkerRequest } from './resultsPageWorkerProtocol';

const [, plainFormat] = formatCases[0];

class FakeWorker extends EventEmitter implements ResultsPageWorkerLike {
    readonly requests: ResultsPageWorkerRequest[] = [];

    terminated = false;

    postMessage(request: ResultsPageWorkerRequest) {
        this.requests.push(request);
    }

    reply() {
        const request = this.requests[this.requests.length - 1];
        const rows = Buffer.from(`[${request.lines.join(',')}]`);
        this.emit('message', {
            id: request.id,
            ok: true,
            phase: 'rows',
            rows: new Uint8Array(rows),
            rowCount: request.lines.length,
        });
        this.emit('message', {
            id: request.id,
            ok: true,
            phase: 'compressed',
            compressed: new Uint8Array(zlib.brotliCompressSync(rows)),
        });
    }

    referenced = false;

    ref() {
        this.referenced = true;
    }

    unref() {
        this.referenced = false;
    }

    async terminate() {
        this.terminated = true;
        return 0;
    }
}

const fakePool = (size: number, buildTimeoutMs?: number) => {
    const workers: FakeWorker[] = [];
    const pool = new ResultsPageWorkerPool({
        size,
        brotliQuality: 4,
        buildTimeoutMs,
        createWorker: () => {
            const worker = new FakeWorker();
            workers.push(worker);
            return worker;
        },
    });
    return { pool, workers };
};

const buildAll = (
    pool: ResultsPageWorkerPool,
    lines: string[],
    format = plainFormat,
) =>
    pool.withWorker(async (worker) => {
        const job = worker.build(lines, format);
        const built = await job.rows;
        return { ...built, compressed: await job.compressed };
    });

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

        const build = buildAll(pool, ['{"a":1}', '{"a":2}'], plainFormat);
        await flush();
        expect(workers[0].referenced).toBe(true);
        workers[0].reply();
        const result = await build;

        expect(workers[0].referenced).toBe(false);
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

    test('hands over the rows before the brotli copy is ready', async () => {
        const { pool, workers } = fakePool(1);
        let job!: ResultsPageBuildJob;
        const done = pool.withWorker(async (worker) => {
            job = worker.build(['{"a":1}'], plainFormat);
            await job.compressed.catch(() => undefined);
        });
        await flush();
        workers[0].emit('message', {
            id: workers[0].requests[0].id,
            ok: true,
            phase: 'rows',
            rows: new Uint8Array(Buffer.from('[{"a":1}]')),
            rowCount: 1,
        });

        await expect(job.rows).resolves.toMatchObject({ rowCount: 1 });
        workers[0].emit('error', new Error('crashed while compressing'));
        await expect(job.compressed).rejects.toBeInstanceOf(
            ResultsPageWorkerError,
        );
        await done;
    });

    test('rejects with a worker error when the worker reports a failure', async () => {
        const { pool, workers } = fakePool(1);

        const build = buildAll(pool, ['not json'], plainFormat);
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

        const crashed = buildAll(pool, ['{"a":1}'], plainFormat);
        await flush();
        workers[0].emit('error', new Error('out of memory'));
        workers[0].emit('exit', 1);
        await expect(crashed).rejects.toBeInstanceOf(ResultsPageWorkerError);
        expect(workers[0].terminated).toBe(true);

        const next = buildAll(pool, ['{"a":2}'], plainFormat);
        await flush();
        expect(workers).toHaveLength(2);
        workers[1].reply();

        await expect(next).resolves.toMatchObject({ rowCount: 1 });
        expect(pool.workersStarted).toBe(2);
    });

    test('a build whose read never ends frees its slot and the next build runs', async () => {
        const { pool, workers } = fakePool(1, 20);
        let readSignal: AbortSignal | undefined;

        const stalled = pool.withWorker(async (_worker, signal) => {
            readSignal = signal;
            return new Promise<never>(() => {});
        });

        await expect(stalled).rejects.toBeInstanceOf(ResultsPageWorkerError);
        expect(readSignal?.aborted).toBe(true);

        const next = buildAll(pool, ['{"a":1}'], plainFormat);
        await flush();
        workers[0].reply();
        await expect(next).resolves.toMatchObject({ rowCount: 1 });
    });

    test('a worker that never answers is terminated and replaced', async () => {
        const { pool, workers } = fakePool(1, 20);

        const silent = buildAll(pool, ['{"a":1}'], plainFormat);

        await expect(silent).rejects.toBeInstanceOf(ResultsPageWorkerError);
        expect(workers[0].terminated).toBe(true);

        const next = buildAll(pool, ['{"a":2}'], plainFormat);
        await flush();
        expect(workers).toHaveLength(2);
        workers[1].reply();
        await expect(next).resolves.toMatchObject({ rowCount: 1 });
        expect(pool.workersStarted).toBe(2);
    });

    test('a timed-out build cannot start a build after its slot is gone', async () => {
        const { pool, workers } = fakePool(1, 20);
        let finishRead!: () => void;
        let lateBuild: Promise<unknown> | undefined;

        const stalled = pool.withWorker(async (worker) => {
            await new Promise<void>((resolve) => {
                finishRead = resolve;
            });
            lateBuild = Promise.resolve().then(
                () => worker.build(['{"late":1}'], plainFormat).rows,
            );
            return lateBuild;
        });
        await expect(stalled).rejects.toBeInstanceOf(ResultsPageWorkerError);

        const next = buildAll(pool, ['{"a":2}'], plainFormat);
        await flush();
        finishRead();
        await flush();

        await expect(lateBuild).rejects.toBeInstanceOf(ResultsPageWorkerError);
        expect(workers).toHaveLength(1);
        expect(workers[0].requests).toHaveLength(1);
        expect(workers[0].requests[0].lines).toEqual(['{"a":2}']);
        workers[0].reply();
        await expect(next).resolves.toMatchObject({ rowCount: 1 });
    });

    test('a late answer from a terminated worker resolves nothing', async () => {
        const { pool, workers } = fakePool(1, 20);
        let job!: ResultsPageBuildJob;

        const silent = pool.withWorker(async (worker) => {
            job = worker.build(['{"a":1}'], plainFormat);
            return job.rows;
        });
        await expect(silent).rejects.toBeInstanceOf(ResultsPageWorkerError);
        workers[0].reply();

        await expect(job.rows).rejects.toBeInstanceOf(ResultsPageWorkerError);
        await expect(job.compressed).rejects.toBeInstanceOf(
            ResultsPageWorkerError,
        );
    });

    test('a build that finishes in time is not cut short', async () => {
        const { pool, workers } = fakePool(1, 50);

        const build = buildAll(pool, ['{"a":1}'], plainFormat);
        await flush();
        workers[0].reply();
        await expect(build).resolves.toMatchObject({ rowCount: 1 });
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 80);
        });

        expect(workers[0].terminated).toBe(false);
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
            buildAll(pool, ['{}'], plainFormat),
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

            const result = await buildAll(pool, [...resultsPageLines], format);

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
            buildAll(pool, ['{"a":1}', '{not json'], plainFormat),
        ).rejects.toBeInstanceOf(ResultsPageWorkerError);
        await expect(
            buildAll(pool, ['{"a":1}'], plainFormat),
        ).resolves.toMatchObject({ rowCount: 1 });
        expect(pool.workersStarted).toBe(1);
    }, 30_000);
});

describe('worker lifetime', () => {
    test('an idle pool does not keep the process alive', () => {
        const poolModule = path.join(__dirname, 'ResultsPageWorkerPool.ts');
        const script = `
            const { ResultsPageWorkerPool } = require(${JSON.stringify(poolModule)});
            const pool = new ResultsPageWorkerPool({ size: 1, brotliQuality: 5 });
            pool.withWorker(async (worker) => {
                const job = worker.build(['{"a":1}'], { fields: {}, pivotValuesColumns: null, timezone: null });
                await job.rows;
                await job.compressed;
            }).then(() => console.log('built'));
        `;

        const result = spawnSync(
            process.execPath,
            ['--import', 'tsx', '-e', script],
            { cwd: path.join(__dirname, '../../../..'), timeout: 25_000 },
        );

        expect(result.stdout.toString()).toContain('built');
        expect(result.signal).toBeNull();
        expect(result.status).toBe(0);
    }, 30_000);
});
