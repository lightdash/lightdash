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

export type ResultsPageBuild = {
    rows: Buffer;
    compressed: Buffer;
    rowCount: number;
};

export type ResultsPageWorkerLike = {
    postMessage(request: ResultsPageWorkerRequest): void;
    on(
        event: 'message',
        listener: (value: ResultsPageWorkerResponse) => void,
    ): unknown;
    on(event: 'error', listener: (error: Error) => void): unknown;
    on(event: 'exit', listener: (code: number) => void): unknown;
    unref(): void;
    terminate(): Promise<number>;
};

export type ResultsPageWorkerHandle = {
    build(
        lines: string[],
        format: ResultsPageFormatInputs,
    ): Promise<ResultsPageBuild>;
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

class PooledWorker implements ResultsPageWorkerHandle {
    private worker: ResultsPageWorkerLike | undefined;

    private pending:
        | {
              id: number;
              resolve: (build: ResultsPageBuild) => void;
              reject: (error: Error) => void;
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
    ): Promise<ResultsPageBuild> {
        this.nextId += 1;
        const id = this.nextId;
        return new Promise<ResultsPageBuild>((resolve, reject) => {
            this.pending = { id, resolve, reject };
            try {
                const worker = this.ensureWorker();
                worker.postMessage({
                    id,
                    lines,
                    format,
                    brotliQuality: this.brotliQuality,
                });
            } catch (error) {
                this.pending = undefined;
                reject(
                    new ResultsPageWorkerError(
                        `Could not start the results page build: ${
                            error instanceof Error ? error.message : error
                        }`,
                    ),
                );
            }
        });
    }

    private ensureWorker(): ResultsPageWorkerLike {
        if (this.worker) return this.worker;
        const worker = this.createWorker();
        this.onWorkerStarted();
        worker.unref();
        worker.on('message', (response) => {
            const { pending } = this;
            if (!pending || pending.id !== response.id) return;
            this.pending = undefined;
            if (response.ok) {
                pending.resolve({
                    rows: toBuffer(response.rows),
                    compressed: toBuffer(response.compressed),
                    rowCount: response.rowCount,
                });
            } else {
                pending.reject(new ResultsPageWorkerError(response.message));
            }
        });
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
        this.worker = worker;
        return worker;
    }

    private discard(worker: ResultsPageWorkerLike, message: string) {
        if (this.worker !== worker) return;
        this.worker = undefined;
        const { pending } = this;
        this.pending = undefined;
        pending?.reject(new ResultsPageWorkerError(message));
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
