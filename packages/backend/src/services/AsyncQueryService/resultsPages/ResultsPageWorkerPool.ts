import path from 'path';
import { Worker } from 'worker_threads';
import type { ResultsPageFormatInputs } from './buildResultsPageRows';
import type {
    ResultsPageWorkerRequest,
    ResultsPageWorkerResponse,
} from './resultsPageWorkerProtocol';

export const RESULTS_PAGE_BUILD_TIMEOUT_MS = 120_000;

export const RESULTS_PAGE_QUEUED_BUILDS_PER_WORKER = 8;

export class ResultsPageWorkerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ResultsPageWorkerError';
    }
}

export type ResultsPageBuiltRows = {
    rows: Buffer;
    rowCount: number;
};

export type ResultsPageBuildJob = {
    rows: Promise<ResultsPageBuiltRows>;
    compressed: Promise<Buffer>;
};

export type ResultsPageWorkerLike = {
    postMessage(request: ResultsPageWorkerRequest): void;
    on(
        event: 'message',
        listener: (value: ResultsPageWorkerResponse) => void,
    ): unknown;
    on(event: 'error', listener: (error: Error) => void): unknown;
    on(event: 'exit', listener: (code: number) => void): unknown;
    ref(): void;
    unref(): void;
    terminate(): Promise<number>;
};

export type ResultsPageWorkerHandle = {
    build(
        lines: string[],
        format: ResultsPageFormatInputs,
    ): ResultsPageBuildJob;
};

const resolveWorkerEntry = () => {
    const extension = path.extname(__filename);
    const filename = path.join(__dirname, `resultsPageWorker${extension}`);
    const needsTsLoader =
        extension === '.ts' &&
        !process.execArgv.some((argument) => argument.includes('tsx'));
    return {
        filename,
        execArgv: needsTsLoader
            ? [...process.execArgv, '--import', 'tsx']
            : undefined,
    };
};

export const createResultsPageWorker = (): ResultsPageWorkerLike => {
    const { filename, execArgv } = resolveWorkerEntry();
    return new Worker(filename, { execArgv });
};

const toBuffer = (bytes: Uint8Array) =>
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
};

const deferred = <T>(): Deferred<T> => {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    promise.catch(() => undefined);
    return { promise, resolve, reject };
};

class PooledWorker implements ResultsPageWorkerHandle {
    private worker: ResultsPageWorkerLike | undefined;

    private pending:
        | {
              id: number;
              rows: Deferred<ResultsPageBuiltRows>;
              compressed: Deferred<Buffer>;
          }
        | undefined;

    private nextId = 0;

    constructor(
        private readonly createWorker: () => ResultsPageWorkerLike,
        private readonly brotliQuality: number,
        private readonly onWorkerStarted: () => void,
    ) {}

    build(
        lines: string[],
        format: ResultsPageFormatInputs,
    ): ResultsPageBuildJob {
        this.nextId += 1;
        const id = this.nextId;
        const job = {
            id,
            rows: deferred<ResultsPageBuiltRows>(),
            compressed: deferred<Buffer>(),
        };
        this.pending = job;
        try {
            const worker = this.ensureWorker();
            worker.ref();
            worker.postMessage({
                id,
                lines,
                format,
                brotliQuality: this.brotliQuality,
            });
        } catch (error) {
            this.fail(
                `Could not start the results page build: ${
                    error instanceof Error ? error.message : error
                }`,
            );
        }
        return { rows: job.rows.promise, compressed: job.compressed.promise };
    }

    private settle() {
        this.pending = undefined;
        this.worker?.unref();
    }

    private fail(message: string) {
        const { pending } = this;
        this.settle();
        const error = new ResultsPageWorkerError(message);
        pending?.rows.reject(error);
        pending?.compressed.reject(error);
    }

    private onMessage(
        worker: ResultsPageWorkerLike,
        response: ResultsPageWorkerResponse,
    ) {
        if (this.worker !== worker) return;
        const { pending } = this;
        if (!pending || pending.id !== response.id) return;
        if (!response.ok) {
            this.fail(response.message);
            return;
        }
        if (response.phase === 'rows') {
            pending.rows.resolve({
                rows: toBuffer(response.rows),
                rowCount: response.rowCount,
            });
            return;
        }
        this.settle();
        pending.compressed.resolve(toBuffer(response.compressed));
    }

    private ensureWorker(): ResultsPageWorkerLike {
        if (this.worker) return this.worker;
        const worker = this.createWorker();
        this.onWorkerStarted();
        worker.on('message', (response) => this.onMessage(worker, response));
        worker.on('error', (error) => {
            this.discard(
                worker,
                `Results page worker failed: ${error.message}`,
            );
        });
        worker.on('exit', (code) => {
            this.discard(
                worker,
                `Results page worker exited with code ${code}`,
            );
        });
        worker.unref();
        this.worker = worker;
        return worker;
    }

    abort(message: string) {
        if (!this.pending) return;
        if (this.worker) {
            this.discard(this.worker, message);
            return;
        }
        this.fail(message);
    }

    private discard(worker: ResultsPageWorkerLike, message: string) {
        if (this.worker !== worker) return;
        this.worker = undefined;
        this.fail(message);
        void worker.terminate().catch(() => undefined);
    }
}

type QueuedBuild = {
    grant: (worker: PooledWorker) => void;
};

export class ResultsPageWorkerPool {
    private readonly size: number;

    private readonly buildTimeoutMs: number;

    private readonly maxQueued: number;

    private readonly idle: PooledWorker[] = [];

    private readonly waiting: QueuedBuild[] = [];

    private created = 0;

    private startedWorkers = 0;

    constructor(
        private readonly options: {
            size: number;
            brotliQuality: number;
            buildTimeoutMs?: number;
            maxQueued?: number;
            createWorker?: () => ResultsPageWorkerLike;
        },
    ) {
        this.size = Math.max(1, Math.floor(options.size) || 1);
        this.buildTimeoutMs =
            options.buildTimeoutMs ?? RESULTS_PAGE_BUILD_TIMEOUT_MS;
        this.maxQueued = Math.max(
            0,
            Math.floor(
                options.maxQueued ??
                    this.size * RESULTS_PAGE_QUEUED_BUILDS_PER_WORKER,
            ),
        );
    }

    get workersStarted() {
        return this.startedWorkers;
    }

    get queuedBuilds() {
        return this.waiting.length;
    }

    async withWorker<T>(
        run: (
            worker: ResultsPageWorkerHandle,
            signal: AbortSignal,
        ) => Promise<T>,
        { signal }: { signal?: AbortSignal } = {},
    ): Promise<T> {
        signal?.throwIfAborted();
        const controller = new AbortController();
        let worker: PooledWorker | undefined;
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
                const error = new ResultsPageWorkerError(
                    `Results page build took longer than ${this.buildTimeoutMs}ms`,
                );
                controller.abort(error);
                worker?.abort(error.message);
                reject(error);
            }, this.buildTimeoutMs);
            timer.unref();
        });
        timeout.catch(() => undefined);
        try {
            worker = await Promise.race([
                this.acquire(controller.signal, signal),
                timeout,
            ]);
            const acquired = worker;
            const handle: ResultsPageWorkerHandle = {
                build: (lines, format) => {
                    if (controller.signal.aborted) {
                        throw new ResultsPageWorkerError(
                            'The results page build already timed out',
                        );
                    }
                    return acquired.build(lines, format);
                },
            };
            return await Promise.race([
                run(handle, controller.signal),
                timeout,
            ]);
        } finally {
            clearTimeout(timer);
            if (worker) this.release(worker);
        }
    }

    private acquire(
        deadline: AbortSignal,
        signal: AbortSignal | undefined,
    ): Promise<PooledWorker> {
        const idle = this.idle.pop();
        if (idle) return Promise.resolve(idle);
        if (this.created < this.size) {
            this.created += 1;
            return Promise.resolve(
                new PooledWorker(
                    this.options.createWorker ?? createResultsPageWorker,
                    this.options.brotliQuality,
                    () => {
                        this.startedWorkers += 1;
                    },
                ),
            );
        }
        if (this.waiting.length >= this.maxQueued) {
            return Promise.reject(
                new ResultsPageWorkerError(
                    `The results page build queue is full (${this.maxQueued} builds)`,
                ),
            );
        }
        return new Promise((resolve, reject) => {
            const stopListening: Array<() => void> = [];
            const queued: QueuedBuild = {
                grant: (worker) => {
                    stopListening.forEach((stop) => stop());
                    resolve(worker);
                },
            };
            const leave = (reason: unknown) => {
                const index = this.waiting.indexOf(queued);
                if (index !== -1) this.waiting.splice(index, 1);
                stopListening.forEach((stop) => stop());
                reject(reason);
            };
            const onDeadline = () => leave(deadline.reason);
            const onSignal = () => leave(signal?.reason);
            deadline.addEventListener('abort', onDeadline, { once: true });
            signal?.addEventListener('abort', onSignal, { once: true });
            stopListening.push(
                () => deadline.removeEventListener('abort', onDeadline),
                () => signal?.removeEventListener('abort', onSignal),
            );
            this.waiting.push(queued);
        });
    }

    private release(worker: PooledWorker) {
        const next = this.waiting.shift();
        if (next) {
            next.grant(worker);
            return;
        }
        this.idle.push(worker);
    }
}
