import path from 'path';
import { Worker } from 'worker_threads';
import type { ResultsPageFormatInputs } from './buildResultsPageRows';
import type {
    ResultsPageWorkerRequest,
    ResultsPageWorkerResponse,
} from './resultsPageWorkerProtocol';

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

    private onMessage(response: ResultsPageWorkerResponse) {
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
        worker.on('message', (response) => this.onMessage(response));
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

    private discard(worker: ResultsPageWorkerLike, message: string) {
        if (this.worker !== worker) return;
        this.worker = undefined;
        this.fail(message);
        void worker.terminate().catch(() => undefined);
    }
}

export class ResultsPageWorkerPool {
    private readonly size: number;

    private readonly idle: PooledWorker[] = [];

    private readonly waiting: Array<(worker: PooledWorker) => void> = [];

    private created = 0;

    private startedWorkers = 0;

    constructor(
        private readonly options: {
            size: number;
            brotliQuality: number;
            createWorker?: () => ResultsPageWorkerLike;
        },
    ) {
        this.size = Math.max(1, Math.floor(options.size) || 1);
    }

    get workersStarted() {
        return this.startedWorkers;
    }

    async withWorker<T>(
        run: (worker: ResultsPageWorkerHandle) => Promise<T>,
    ): Promise<T> {
        const worker = await this.acquire();
        try {
            return await run(worker);
        } finally {
            this.release(worker);
        }
    }

    private acquire(): Promise<PooledWorker> {
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
        return new Promise((resolve) => {
            this.waiting.push(resolve);
        });
    }

    private release(worker: PooledWorker) {
        const next = this.waiting.shift();
        if (next) {
            next(worker);
            return;
        }
        this.idle.push(worker);
    }
}
