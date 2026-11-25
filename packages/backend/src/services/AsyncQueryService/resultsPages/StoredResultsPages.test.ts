import { ResultsExpiredError } from '@lightdash/common';
import { EventEmitter } from 'events';
import zlib from 'zlib';
import { buildResultsPageRowsJson } from './buildResultsPageRows';
import { formatCases, resultsPageLines } from './resultsPageFixtures.mock';
import {
    ResultsPageWorkerError,
    ResultsPageWorkerPool,
    type ResultsPageWorkerHandle,
    type ResultsPageWorkerLike,
} from './ResultsPageWorkerPool';
import type { ResultsPageWorkerRequest } from './resultsPageWorkerProtocol';
import { getStoredResultsPageKey } from './storedResultsPageKey';
import {
    StoredResultsPages,
    type GetStoredResultsPageRowsArgs,
    type StoredResultsPageObject,
    type StoredResultsPagesOptions,
} from './StoredResultsPages';

const [, format] = formatCases[1];
const expectedRows = Buffer.from(
    buildResultsPageRowsJson(resultsPageLines, format),
);

const memoryStorage = () => {
    const objects = new Map<string, StoredResultsPageObject>();
    return {
        objects,
        getObjectBytesIfExists: vi.fn(
            async (
                key: string,
                _options?: { abortSignal?: AbortSignal },
            ): Promise<StoredResultsPageObject | undefined> => objects.get(key),
        ),
        putObjectBytes: vi.fn(
            async (
                key: string,
                body: Buffer,
                metadata: Record<string, string>,
                _options?: { abortSignal?: AbortSignal },
            ) => {
                objects.set(key, { body, metadata });
            },
        ),
        resultsFileExists: vi.fn(
            async (
                _resultsFileName: string,
                _options?: { abortSignal?: AbortSignal },
            ) => true,
        ),
    };
};

const inlinePool = () => {
    const build = vi.fn<ResultsPageWorkerHandle['build']>(
        (lines, buildFormat) => {
            const rows = Buffer.from(
                buildResultsPageRowsJson(lines, buildFormat),
            );
            return {
                rows: Promise.resolve({ rows, rowCount: lines.length }),
                compressed: Promise.resolve(zlib.brotliCompressSync(rows)),
            };
        },
    );
    const pool = {
        withWorker: vi.fn(
            async <T>(
                run: (
                    worker: ResultsPageWorkerHandle,
                    signal: AbortSignal,
                ) => Promise<T>,
            ) => run({ build }, new AbortController().signal),
        ),
    };
    return { pool: pool as unknown as ResultsPageWorkerPool, build };
};

class EchoWorker extends EventEmitter implements ResultsPageWorkerLike {
    postMessage({ id, lines, format: buildFormat }: ResultsPageWorkerRequest) {
        const rows = Buffer.from(buildResultsPageRowsJson(lines, buildFormat));
        setImmediate(() => {
            this.emit('message', {
                id,
                ok: true,
                phase: 'rows',
                rows: new Uint8Array(rows),
                rowCount: lines.length,
            });
            this.emit('message', {
                id,
                ok: true,
                phase: 'compressed',
                compressed: new Uint8Array(zlib.brotliCompressSync(rows)),
            });
        });
    }

    ref() {}

    unref() {}

    async terminate() {
        return 0;
    }
}

const setup = (
    options: Partial<Omit<StoredResultsPagesOptions, 'appVersion'>> = {},
) => {
    const storage = memoryStorage();
    const { pool, build } = inlinePool();
    const pages = new StoredResultsPages({
        pool,
        appVersion: '3.393.0',
        ...options,
    });
    const readPageLines = vi.fn(async () => [...resultsPageLines]);
    const args: GetStoredResultsPageRowsArgs = {
        storage,
        resultsFileName: 'cache-key-abc123',
        page: 2,
        pageSize: 3,
        format,
        readPageLines,
    };
    const key = getStoredResultsPageKey({
        resultsFileName: args.resultsFileName,
        appVersion: '3.393.0',
        format,
        pageSize: args.pageSize,
        page: args.page,
    });
    const settle = () =>
        new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
    return { storage, pool, build, pages, readPageLines, args, key, settle };
};

describe('StoredResultsPages', () => {
    test('builds a missing page once, answers with it and stores the brotli copy', async () => {
        const { storage, build, pages, readPageLines, args, key, settle } =
            setup();

        const first = await pages.getRows(args);
        await settle();

        expect(first.source).toBe('built');
        expect(first.rows.equals(expectedRows)).toBe(true);
        expect(first.rowCount).toBe(resultsPageLines.length);
        expect(readPageLines).toHaveBeenCalledTimes(1);
        expect(build).toHaveBeenCalledTimes(1);
        expect(storage.putObjectBytes).toHaveBeenCalledExactlyOnceWith(
            key,
            expect.any(Buffer),
            {
                'row-count': String(resultsPageLines.length),
                'raw-bytes': String(expectedRows.length),
            },
            { abortSignal: expect.any(AbortSignal) },
        );
        expect(
            zlib.brotliDecompressSync(storage.objects.get(key)!.body),
        ).toEqual(expectedRows);
    });

    test('serves a later request from the stored page with no JSONL read and no format', async () => {
        const { storage, build, pages, readPageLines, args, settle } = setup();
        await pages.getRows(args);
        await settle();
        readPageLines.mockClear();
        build.mockClear();

        const second = await pages.getRows(args);

        expect(second.source).toBe('stored');
        expect(second.rows.equals(expectedRows)).toBe(true);
        expect(second.rowCount).toBe(resultsPageLines.length);
        expect(readPageLines).not.toHaveBeenCalled();
        expect(build).not.toHaveBeenCalled();
        expect(storage.putObjectBytes).toHaveBeenCalledTimes(1);
    });

    test('two concurrent first requests build once and upload once', async () => {
        const { storage, build, pages, readPageLines, args, settle } = setup();

        const [a, b] = await Promise.all([
            pages.getRows(args),
            pages.getRows(args),
        ]);
        await settle();

        expect(a.rows.equals(expectedRows)).toBe(true);
        expect(b.rows.equals(expectedRows)).toBe(true);
        expect(storage.getObjectBytesIfExists).toHaveBeenCalledTimes(1);
        expect(readPageLines).toHaveBeenCalledTimes(1);
        expect(build).toHaveBeenCalledTimes(1);
        expect(storage.putObjectBytes).toHaveBeenCalledTimes(1);
    });

    test('a request during the upload reuses the built bytes', async () => {
        const { storage, build, pages, args } = setup();
        let finishUpload!: () => void;
        storage.putObjectBytes.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    finishUpload = resolve;
                }),
        );

        await pages.getRows(args);
        await vi.waitFor(() => {
            expect(storage.putObjectBytes).toHaveBeenCalled();
        });
        const during = await pages.getRows(args);
        finishUpload();

        expect(during.rows.equals(expectedRows)).toBe(true);
        expect(build).toHaveBeenCalledTimes(1);
        expect(storage.getObjectBytesIfExists).toHaveBeenCalledTimes(1);
    });

    test('a store read error builds the page and still answers', async () => {
        const { storage, build, pages, args } = setup();
        storage.getObjectBytesIfExists.mockRejectedValueOnce(
            new Error('SlowDown'),
        );

        const result = await pages.getRows(args);

        expect(result.rows.equals(expectedRows)).toBe(true);
        expect(build).toHaveBeenCalledTimes(1);
    });

    test.each([
        [
            'does not decompress',
            (rows: Buffer) => ({
                body: Buffer.from('not brotli'),
                metadata: {
                    'row-count': '3',
                    'raw-bytes': String(rows.length),
                },
            }),
        ],
        [
            'is cut short',
            (rows: Buffer) => ({
                body: zlib.brotliCompressSync(rows.subarray(0, 10)),
                metadata: {
                    'row-count': '3',
                    'raw-bytes': String(rows.length),
                },
            }),
        ],
        [
            'is bigger than its metadata says',
            (rows: Buffer) => ({
                body: zlib.brotliCompressSync(rows),
                metadata: { 'row-count': '3', 'raw-bytes': '10' },
            }),
        ],
        [
            'has no metadata',
            (rows: Buffer) => ({
                body: zlib.brotliCompressSync(rows),
                metadata: {},
            }),
        ],
    ])('a stored object that %s is rebuilt', async (_name, corrupt) => {
        const { storage, build, pages, args, key, settle } = setup();
        storage.objects.set(key, corrupt(expectedRows));

        const result = await pages.getRows(args);
        await settle();

        expect(result.source).toBe('built');
        expect(result.rows.equals(expectedRows)).toBe(true);
        expect(build).toHaveBeenCalledTimes(1);
        expect(
            zlib.brotliDecompressSync(storage.objects.get(key)!.body),
        ).toEqual(expectedRows);
    });

    test('answers before the brotli copy is ready', async () => {
        const { storage, build, pages, args, key, settle } = setup();
        let finishCompression!: (compressed: Buffer) => void;
        build.mockImplementationOnce(() => ({
            rows: Promise.resolve({
                rows: expectedRows,
                rowCount: resultsPageLines.length,
            }),
            compressed: new Promise<Buffer>((resolve) => {
                finishCompression = resolve;
            }),
        }));

        const result = await pages.getRows(args);

        expect(result.rows.equals(expectedRows)).toBe(true);
        expect(storage.putObjectBytes).not.toHaveBeenCalled();
        finishCompression(zlib.brotliCompressSync(expectedRows));
        await settle();
        expect(storage.objects.has(key)).toBe(true);
    });

    test('a compression failure after the rows still answers and stores nothing', async () => {
        const { storage, build, pages, args, settle } = setup();
        build.mockImplementationOnce(() => {
            const compressed = Promise.reject(
                new ResultsPageWorkerError('crashed while compressing'),
            );
            compressed.catch(() => undefined);
            return {
                rows: Promise.resolve({
                    rows: expectedRows,
                    rowCount: resultsPageLines.length,
                }),
                compressed,
            };
        });

        const result = await pages.getRows(args);
        await settle();

        expect(result.rows.equals(expectedRows)).toBe(true);
        expect(storage.putObjectBytes).not.toHaveBeenCalled();
    });

    test('an upload error still answers with the built page', async () => {
        const { storage, pages, args, settle } = setup();
        storage.putObjectBytes.mockRejectedValueOnce(new Error('AccessDenied'));

        const result = await pages.getRows(args);
        await settle();

        expect(result.rows.equals(expectedRows)).toBe(true);
        expect(storage.objects.size).toBe(0);
    });

    test('a worker error rejects with ResultsPageWorkerError and is not kept', async () => {
        const { storage, build, pages, args, settle } = setup();
        build.mockImplementationOnce(() => {
            const error = new ResultsPageWorkerError('crashed');
            const rejected = Promise.reject(error);
            rejected.catch(() => undefined);
            return { rows: rejected, compressed: rejected };
        });

        await expect(pages.getRows(args)).rejects.toBeInstanceOf(
            ResultsPageWorkerError,
        );
        await settle();
        expect(storage.putObjectBytes).not.toHaveBeenCalled();

        await expect(pages.getRows(args)).resolves.toMatchObject({
            source: 'built',
        });
    });

    test('a read that never ends gives a worker error, stops the read and stores nothing', async () => {
        const { storage, args, settle } = setup();
        const pages = new StoredResultsPages({
            pool: new ResultsPageWorkerPool({
                size: 1,
                brotliQuality: 4,
                buildTimeoutMs: 20,
                createWorker: () => new EchoWorker(),
            }),
            appVersion: '3.393.0',
        });
        let readSignal: AbortSignal | undefined;
        let finishRead!: (lines: string[]) => void;

        await expect(
            pages.getRows({
                ...args,
                readPageLines: (signal) => {
                    readSignal = signal;
                    return new Promise<string[]>((resolve) => {
                        finishRead = resolve;
                    });
                },
            }),
        ).rejects.toBeInstanceOf(ResultsPageWorkerError);
        expect(readSignal?.aborted).toBe(true);

        finishRead([...resultsPageLines]);
        await settle();
        await settle();
        expect(storage.putObjectBytes).not.toHaveBeenCalled();

        const next = await pages.getRows(args);
        expect(next.source).toBe('built');
        expect(next.rows.equals(expectedRows)).toBe(true);
    });

    test('a results file read error passes through unchanged', async () => {
        const { pages, readPageLines, args } = setup();
        const expired = new Error('Results expired');
        readPageLines.mockRejectedValueOnce(expired);

        await expect(pages.getRows(args)).rejects.toBe(expired);
    });
});

describe('StoredResultsPages storage deadlines', () => {
    const wait = (ms: number) =>
        new Promise<void>((resolve) => {
            setTimeout(resolve, ms);
        });

    test('a stored page read that stalls before it answers is stopped and the page is built', async () => {
        const { storage, pages, readPageLines, args } = setup({
            storedReadTimeoutMs: 30,
        });
        let readSignal: AbortSignal | undefined;
        storage.getObjectBytesIfExists.mockImplementationOnce(
            (_key, options) => {
                readSignal = options?.abortSignal;
                return new Promise(() => {});
            },
        );

        const [first, joined] = await Promise.all([
            pages.getRows(args),
            pages.getRows(args),
        ]);

        expect(first.source).toBe('built');
        expect(joined.rows.equals(expectedRows)).toBe(true);
        expect(readSignal?.aborted).toBe(true);
        expect(readPageLines).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => {
            expect(pages.inFlightPages).toBe(0);
        });
        await expect(pages.getRows(args)).resolves.toMatchObject({
            source: 'stored',
        });
    });

    test('a results file check that stalls is stopped and the page is built', async () => {
        const { storage, pages, readPageLines, args, settle } = setup({
            storedReadTimeoutMs: 30,
        });
        await pages.getRows(args);
        await settle();
        readPageLines.mockClear();
        let checkSignal: AbortSignal | undefined;
        storage.resultsFileExists.mockImplementationOnce((_name, options) => {
            checkSignal = options?.abortSignal;
            return new Promise(() => {});
        });

        const result = await pages.getRows(args);

        expect(result.source).toBe('built');
        expect(checkSignal?.aborted).toBe(true);
        expect(readPageLines).toHaveBeenCalledTimes(1);
    });

    test('an upload that stalls is stopped, frees its bytes and the next request builds again', async () => {
        const { storage, pages, readPageLines, args } = setup({
            uploadTimeoutMs: 30,
        });
        let uploadSignal: AbortSignal | undefined;
        storage.putObjectBytes.mockImplementationOnce(
            (_key, _body, _metadata, options) => {
                uploadSignal = options?.abortSignal;
                return new Promise(() => {});
            },
        );

        const first = await pages.getRows(args);
        expect(first.source).toBe('built');
        await vi.waitFor(() => {
            expect(storage.putObjectBytes).toHaveBeenCalled();
        });
        expect(pages.pendingUploadBytes).toBeGreaterThan(0);
        await wait(60);

        expect(uploadSignal?.aborted).toBe(true);
        expect(pages.pendingUploadBytes).toBe(0);
        expect(pages.inFlightPages).toBe(0);
        const next = await pages.getRows(args);
        expect(next.source).toBe('built');
        expect(readPageLines).toHaveBeenCalledTimes(2);
    });

    test('drops the upload, not the answer, when the upload budget is spent', async () => {
        const { storage, pages, args } = setup({
            uploadBudgetBytes: expectedRows.length * 2,
        });
        let finishUpload!: () => void;
        storage.putObjectBytes.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    finishUpload = resolve;
                }),
        );

        await pages.getRows(args);
        await vi.waitFor(() => {
            expect(storage.putObjectBytes).toHaveBeenCalledTimes(1);
        });
        const other = await pages.getRows({ ...args, page: 3 });
        await vi.waitFor(() => {
            expect(pages.inFlightPages).toBe(1);
        });

        expect(other.source).toBe('built');
        expect(other.rows.equals(expectedRows)).toBe(true);
        expect(storage.putObjectBytes).toHaveBeenCalledTimes(1);
        finishUpload();
        await vi.waitFor(() => {
            expect(pages.pendingUploadBytes).toBe(0);
        });
    });
});

describe('StoredResultsPages and the results file', () => {
    test('a stored page whose results file is gone is refused', async () => {
        const { storage, pages, readPageLines, args, settle } = setup();
        await pages.getRows(args);
        await settle();
        readPageLines.mockClear();
        storage.resultsFileExists.mockResolvedValue(false);

        await expect(pages.getRows(args)).rejects.toBeInstanceOf(
            ResultsExpiredError,
        );
        expect(storage.resultsFileExists).toHaveBeenLastCalledWith(
            args.resultsFileName,
            { abortSignal: expect.any(AbortSignal) },
        );
        expect(readPageLines).not.toHaveBeenCalled();
    });

    test('a results file check error never serves the stored page', async () => {
        const { storage, pages, readPageLines, args, settle } = setup();
        await pages.getRows(args);
        await settle();
        readPageLines.mockClear();
        storage.resultsFileExists.mockRejectedValueOnce(new Error('SlowDown'));

        const result = await pages.getRows(args);

        expect(result.source).toBe('built');
        expect(readPageLines).toHaveBeenCalledTimes(1);
    });
});

describe('StoredResultsPages outstanding work', () => {
    const occupiedPool = () => {
        const pool = new ResultsPageWorkerPool({
            size: 1,
            brotliQuality: 4,
            createWorker: () => new EchoWorker(),
        });
        let release!: () => void;
        const held = pool.withWorker(
            () =>
                new Promise<void>((resolve) => {
                    release = resolve;
                }),
        );
        return { pool, held, release: () => release() };
    };

    test('drops a queued build when every caller has gone', async () => {
        const { storage, args, settle } = setup();
        const { pool, held, release } = occupiedPool();
        const pages = new StoredResultsPages({ pool, appVersion: '3.393.0' });
        const readPageLines = vi.fn(async () => [...resultsPageLines]);
        const first = new AbortController();
        const second = new AbortController();

        const a = pages.getRows({
            ...args,
            readPageLines,
            signal: first.signal,
        });
        const b = pages.getRows({
            ...args,
            readPageLines,
            signal: second.signal,
        });
        await vi.waitFor(() => {
            expect(pool.queuedBuilds).toBe(1);
        });
        first.abort(new Error('closed'));
        await expect(a).rejects.toThrow('closed');
        expect(pool.queuedBuilds).toBe(1);
        second.abort(new Error('closed'));
        await expect(b).rejects.toThrow('closed');

        await vi.waitFor(() => {
            expect(pool.queuedBuilds).toBe(0);
        });
        release();
        await held;
        await settle();
        expect(readPageLines).not.toHaveBeenCalled();
        expect(storage.putObjectBytes).not.toHaveBeenCalled();
        expect(pages.inFlightPages).toBe(0);
    });

    test('keeps a build while one caller still waits', async () => {
        const { args } = setup();
        const { pool, held, release } = occupiedPool();
        const pages = new StoredResultsPages({ pool, appVersion: '3.393.0' });
        const gone = new AbortController();

        const left = pages.getRows({ ...args, signal: gone.signal });
        const stays = pages.getRows(args);
        await vi.waitFor(() => {
            expect(pool.queuedBuilds).toBe(1);
        });
        gone.abort(new Error('closed'));
        await expect(left).rejects.toThrow('closed');
        release();
        await held;

        const result = await stays;
        expect(result.source).toBe('built');
        expect(result.rows.equals(expectedRows)).toBe(true);
    });

    test('a caller that has already gone starts nothing', async () => {
        const { storage, pages, readPageLines, args } = setup();
        const gone = new AbortController();
        gone.abort(new Error('closed'));

        await expect(
            pages.getRows({ ...args, signal: gone.signal }),
        ).rejects.toThrow('closed');
        expect(storage.getObjectBytesIfExists).not.toHaveBeenCalled();
        expect(readPageLines).not.toHaveBeenCalled();
    });

    test('keeps concurrent stored page decompression within its byte budget', async () => {
        const decompress = vi.fn(
            async (body: Buffer, _rawBytes: number) =>
                zlib.brotliDecompressSync(body),
        );
        const { pages, args, settle } = setup({
            decompressBudgetBytes: expectedRows.length,
            decompress,
        });
        await pages.getRows(args);
        await pages.getRows({ ...args, page: 3 });
        await settle();
        let finishFirst!: () => void;
        decompress.mockImplementationOnce(async (body) => {
            await new Promise<void>((resolve) => {
                finishFirst = resolve;
            });
            return zlib.brotliDecompressSync(body);
        });

        const first = pages.getRows(args);
        const second = pages.getRows({ ...args, page: 3 });
        await vi.waitFor(() => {
            expect(decompress).toHaveBeenCalledTimes(1);
        });
        await settle();
        expect(decompress).toHaveBeenCalledTimes(1);
        expect(pages.decompressingBytes).toBe(expectedRows.length);
        finishFirst();

        await expect(first).resolves.toMatchObject({ source: 'stored' });
        await expect(second).resolves.toMatchObject({ source: 'stored' });
        expect(decompress).toHaveBeenCalledTimes(2);
        expect(pages.decompressingBytes).toBe(0);
    });
});
