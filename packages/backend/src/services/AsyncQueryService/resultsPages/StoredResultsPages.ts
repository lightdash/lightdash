import { getErrorMessage, ResultsExpiredError } from '@lightdash/common';
import { promisify } from 'util';
import zlib from 'zlib';
import Logger from '../../../logging/logger';
import type { ResultsPageFormatInputs } from './buildResultsPageRows';
import { ByteBudget } from './byteBudget';
import type { ResultsPageBuildOutcome } from './resultsPageSource';
import type {
    ResultsPageBuiltRows,
    ResultsPageWorkerPool,
} from './ResultsPageWorkerPool';
import { getStoredResultsPageKey } from './storedResultsPageKey';

const brotliDecompress = promisify(zlib.brotliDecompress);

export const STORED_RESULTS_PAGE_READ_TIMEOUT_MS = 15_000;
export const STORED_RESULTS_PAGE_UPLOAD_TIMEOUT_MS = 30_000;
export const STORED_RESULTS_PAGE_UPLOAD_BUDGET_BYTES = 256 * 1024 * 1024;
export const STORED_RESULTS_PAGE_DECOMPRESS_BUDGET_BYTES = 256 * 1024 * 1024;

const rowCountMetadataKey = 'row-count';
const rawBytesMetadataKey = 'raw-bytes';
const openBracket = 0x5b;
const closeBracket = 0x5d;

export class StoredResultsPageTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StoredResultsPageTimeoutError';
    }
}

export type StoredResultsPageObject = {
    body: Buffer;
    metadata: Record<string, string>;
};

export type StoredResultsPageStorageOptions = {
    abortSignal?: AbortSignal;
};

export type StoredResultsPagesStorage = {
    getObjectBytesIfExists(
        key: string,
        options?: StoredResultsPageStorageOptions,
    ): Promise<StoredResultsPageObject | undefined>;
    putObjectBytes(
        key: string,
        body: Buffer,
        metadata: Record<string, string>,
        options?: StoredResultsPageStorageOptions,
    ): Promise<void>;
    resultsFileExists(
        resultsFileName: string,
        options?: StoredResultsPageStorageOptions,
    ): Promise<boolean>;
};

export type StoredResultsPageRows = {
    rows: Buffer;
    rowCount: number;
    source: 'stored' | 'built' | 'shared';
};

export type GetStoredResultsPageRowsArgs = {
    storage: StoredResultsPagesStorage;
    resultsFileName: string;
    page: number;
    pageSize: number;
    format: ResultsPageFormatInputs;
    readPageLines: (signal: AbortSignal) => Promise<string[]>;
    signal?: AbortSignal;
    store?: boolean;
};

export type StoredResultsPagesOptions = {
    pool: ResultsPageWorkerPool;
    appVersion: string;
    storedReadTimeoutMs?: number;
    uploadTimeoutMs?: number;
    uploadBudgetBytes?: number;
    decompressBudgetBytes?: number;
    decompress?: (body: Buffer, rawBytes: number) => Promise<Buffer>;
    onBuild?: (outcome: ResultsPageBuildOutcome) => void;
};

class InFlightPage {
    readonly controller = new AbortController();

    private waiters = 0;

    private building = false;

    constructor(
        readonly key: string,
        readonly rows: Promise<StoredResultsPageRows>,
    ) {}

    join() {
        this.waiters += 1;
    }

    leaveAndCheckAbandoned(): boolean {
        this.waiters -= 1;
        return this.waiters === 0 && !this.building;
    }

    markBuilding() {
        this.building = true;
    }

    isBuilding() {
        return this.building;
    }
}

type ResultsFileState = 'present' | 'missing' | 'unknown';

const decompressStoredPage = (body: Buffer, rawBytes: number) =>
    brotliDecompress(body, {
        chunkSize: Math.max(zlib.constants.Z_MIN_CHUNK, rawBytes),
        maxOutputLength: rawBytes,
    });

const withDeadline = async <T>(
    timeoutMs: number,
    parent: AbortSignal | undefined,
    label: string,
    run: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
        controller.abort(
            new StoredResultsPageTimeoutError(
                `${label} took longer than ${timeoutMs}ms`,
            ),
        );
    }, timeoutMs);
    timer.unref();
    const onParentAbort = () => controller.abort(parent?.reason);
    if (parent?.aborted) onParentAbort();
    parent?.addEventListener('abort', onParentAbort, { once: true });
    const { signal } = controller;
    try {
        return await new Promise<T>((resolve, reject) => {
            const onAbort = () => reject(signal.reason);
            if (signal.aborted) {
                onAbort();
                return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
            run(signal)
                .then(resolve, reject)
                .finally(() => signal.removeEventListener('abort', onAbort));
        });
    } finally {
        clearTimeout(timer);
        parent?.removeEventListener('abort', onParentAbort);
    }
};

/**
 * A stored page holds the formatted rows of every field in the results
 * file, for any reader who passes the access checks. A per-reader
 * projection of fields (for example dropping fields an AI reader must not
 * see) must either bypass stored pages or be part of the key.
 */
export class StoredResultsPages {
    private readonly inFlight = new Map<string, InFlightPage>();

    private readonly readTimeoutMs: number;

    private readonly uploadTimeoutMs: number;

    private readonly uploadBudget: ByteBudget;

    private readonly decompressBudget: ByteBudget;

    private readonly decompress: (
        body: Buffer,
        rawBytes: number,
    ) => Promise<Buffer>;

    constructor(private readonly options: StoredResultsPagesOptions) {
        this.readTimeoutMs =
            options.storedReadTimeoutMs ?? STORED_RESULTS_PAGE_READ_TIMEOUT_MS;
        this.uploadTimeoutMs =
            options.uploadTimeoutMs ?? STORED_RESULTS_PAGE_UPLOAD_TIMEOUT_MS;
        this.uploadBudget = new ByteBudget(
            options.uploadBudgetBytes ??
                STORED_RESULTS_PAGE_UPLOAD_BUDGET_BYTES,
        );
        this.decompressBudget = new ByteBudget(
            options.decompressBudgetBytes ??
                STORED_RESULTS_PAGE_DECOMPRESS_BUDGET_BYTES,
        );
        this.decompress = options.decompress ?? decompressStoredPage;
    }

    get inFlightPages() {
        return this.inFlight.size;
    }

    get pendingUploadBytes() {
        return this.uploadBudget.inUse;
    }

    get decompressingBytes() {
        return this.decompressBudget.inUse;
    }

    getRows(
        args: GetStoredResultsPageRowsArgs,
    ): Promise<StoredResultsPageRows> {
        if (args.signal?.aborted) return Promise.reject(args.signal.reason);
        const key = getStoredResultsPageKey({
            resultsFileName: args.resultsFileName,
            appVersion: this.options.appVersion,
            format: args.format,
            pageSize: args.pageSize,
            page: args.page,
        });
        const store = args.store ?? true;
        const flightKey = store ? key : `${key}#unstored`;
        const existing = this.inFlight.get(flightKey);
        const page = existing ?? this.start(args, flightKey, key, store);
        const rows = this.waitFor(page, args.signal);
        if (!existing) return rows;
        return rows.then((result) =>
            result.source === 'built'
                ? { ...result, source: 'shared' }
                : result,
        );
    }

    private start(
        args: GetStoredResultsPageRowsArgs,
        flightKey: string,
        key: string,
        store: boolean,
    ) {
        let resolveRows!: (rows: StoredResultsPageRows) => void;
        let rejectRows!: (error: unknown) => void;
        const rows = new Promise<StoredResultsPageRows>((resolve, reject) => {
            resolveRows = resolve;
            rejectRows = reject;
        });
        rows.catch(() => undefined);
        const page = new InFlightPage(flightKey, rows);
        this.inFlight.set(flightKey, page);
        void this.load(args, page, key, store, resolveRows, rejectRows).finally(
            () => {
                this.forget(page);
            },
        );
        return page;
    }

    private forget(page: InFlightPage) {
        if (this.inFlight.get(page.key) === page)
            this.inFlight.delete(page.key);
    }

    private waitFor(
        page: InFlightPage,
        signal: AbortSignal | undefined,
    ): Promise<StoredResultsPageRows> {
        page.join();
        if (!signal) return page.rows;
        return new Promise((resolve, reject) => {
            const onAbort = () => {
                if (page.leaveAndCheckAbandoned()) {
                    this.forget(page);
                    page.controller.abort(signal.reason);
                }
                reject(signal.reason);
            };
            signal.addEventListener('abort', onAbort, { once: true });
            page.rows.then(
                (rows) => {
                    signal.removeEventListener('abort', onAbort);
                    resolve(rows);
                },
                (error) => {
                    signal.removeEventListener('abort', onAbort);
                    reject(error);
                },
            );
        });
    }

    private async load(
        args: GetStoredResultsPageRowsArgs,
        page: InFlightPage,
        key: string,
        store: boolean,
        resolveRows: (rows: StoredResultsPageRows) => void,
        rejectRows: (error: unknown) => void,
    ): Promise<void> {
        const { signal } = page.controller;
        const state = { rowsSent: false, buildRequested: false };
        try {
            if (store) {
                const [stored, resultsFile] = await Promise.all([
                    this.readStored(args.storage, key, signal),
                    this.checkResultsFile(
                        args.storage,
                        args.resultsFileName,
                        signal,
                    ),
                ]);
                if (resultsFile === 'missing') throw new ResultsExpiredError();
                if (stored && resultsFile === 'present') {
                    resolveRows({ ...stored, source: 'stored' });
                    return;
                }
            }
            state.buildRequested = true;
            const { built, compressed } = await this.options.pool.withWorker(
                async (worker, buildSignal) => {
                    page.markBuilding();
                    const job = worker.build(
                        await args.readPageLines(buildSignal),
                        args.format,
                    );
                    const builtRows = await job.rows;
                    buildSignal.throwIfAborted();
                    state.rowsSent = true;
                    this.options.onBuild?.('ok');
                    resolveRows({ ...builtRows, source: 'built' });
                    return {
                        built: builtRows,
                        compressed: await job.compressed,
                    };
                },
                { signal },
            );
            if (store) {
                await this.upload(args.storage, key, built, compressed);
            }
        } catch (error) {
            if (!state.rowsSent) {
                if (state.buildRequested) {
                    this.options.onBuild?.(
                        signal.aborted && !page.isBuilding()
                            ? 'dropped'
                            : 'error',
                    );
                }
                rejectRows(error);
                return;
            }
            Logger.warn(
                `Could not compress results page ${key}: ${getErrorMessage(
                    error,
                )}`,
            );
        }
    }

    private async checkResultsFile(
        storage: StoredResultsPagesStorage,
        resultsFileName: string,
        signal: AbortSignal,
    ): Promise<ResultsFileState> {
        try {
            const exists = await withDeadline(
                this.readTimeoutMs,
                signal,
                'Results file check',
                (abortSignal) =>
                    storage.resultsFileExists(resultsFileName, {
                        abortSignal,
                    }),
            );
            return exists ? 'present' : 'missing';
        } catch (error) {
            if (!signal.aborted) {
                Logger.warn(
                    `Could not check results file ${resultsFileName}, building the page instead: ${getErrorMessage(
                        error,
                    )}`,
                );
            }
            return 'unknown';
        }
    }

    private async readStored(
        storage: StoredResultsPagesStorage,
        key: string,
        signal: AbortSignal,
    ): Promise<Omit<StoredResultsPageRows, 'source'> | undefined> {
        let object: StoredResultsPageObject | undefined;
        try {
            object = await withDeadline(
                this.readTimeoutMs,
                signal,
                'Stored results page read',
                (abortSignal) =>
                    storage.getObjectBytesIfExists(key, { abortSignal }),
            );
        } catch (error) {
            if (!signal.aborted) {
                Logger.warn(
                    `Could not read stored results page ${key}, building it instead: ${getErrorMessage(
                        error,
                    )}`,
                );
            }
            return undefined;
        }
        if (!object) return undefined;

        const rowCount = Number(object.metadata[rowCountMetadataKey]);
        const rawBytes = Number(object.metadata[rawBytesMetadataKey]);
        if (
            !Number.isSafeInteger(rowCount) ||
            rowCount < 0 ||
            !Number.isSafeInteger(rawBytes) ||
            rawBytes < 2
        ) {
            Logger.warn(
                `Stored results page ${key} has no valid metadata, building it instead`,
            );
            return undefined;
        }

        let releaseBytes: () => void;
        try {
            releaseBytes = await this.decompressBudget.acquire(
                rawBytes,
                signal,
            );
        } catch {
            return undefined;
        }
        let rows: Buffer;
        try {
            rows = await this.decompress(object.body, rawBytes);
        } catch (error) {
            Logger.warn(
                `Stored results page ${key} did not decompress, building it instead: ${getErrorMessage(
                    error,
                )}`,
            );
            return undefined;
        } finally {
            releaseBytes();
        }
        if (
            rows.length !== rawBytes ||
            rows[0] !== openBracket ||
            rows[rows.length - 1] !== closeBracket
        ) {
            Logger.warn(
                `Stored results page ${key} is not a complete rows array, building it instead`,
            );
            return undefined;
        }
        return { rows, rowCount };
    }

    private async upload(
        storage: StoredResultsPagesStorage,
        key: string,
        built: ResultsPageBuiltRows,
        compressed: Buffer,
    ): Promise<void> {
        const heldBytes = built.rows.length + compressed.length;
        const releaseBytes = this.uploadBudget.tryAcquire(heldBytes);
        if (!releaseBytes) {
            Logger.warn(
                `Did not store results page ${key}: ${heldBytes} bytes would pass the ${this.uploadBudget.limit} byte upload budget`,
            );
            return;
        }
        try {
            await withDeadline(
                this.uploadTimeoutMs,
                undefined,
                'Stored results page upload',
                (abortSignal) =>
                    storage.putObjectBytes(
                        key,
                        compressed,
                        {
                            [rowCountMetadataKey]: String(built.rowCount),
                            [rawBytesMetadataKey]: String(built.rows.length),
                        },
                        { abortSignal },
                    ),
            );
            Logger.debug(
                `Stored results page ${key}: ${built.rowCount} rows, ${built.rows.length} bytes, ${compressed.length} bytes stored`,
            );
        } catch (error) {
            Logger.warn(
                `Could not store results page ${key}: ${getErrorMessage(error)}`,
            );
        } finally {
            releaseBytes();
        }
    }
}
