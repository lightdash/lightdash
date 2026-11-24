import zlib from 'zlib';
import { buildResultsPageRowsJson } from './buildResultsPageRows';
import { formatCases, resultsPageLines } from './resultsPageFixtures.mock';
import {
    ResultsPageWorkerError,
    type ResultsPageWorkerHandle,
    type ResultsPageWorkerPool,
} from './ResultsPageWorkerPool';
import { getStoredResultsPageKey } from './storedResultsPageKey';
import {
    StoredResultsPages,
    type GetStoredResultsPageRowsArgs,
    type StoredResultsPageObject,
} from './StoredResultsPages';

const [, format] = formatCases[1];
const expectedRows = Buffer.from(
    buildResultsPageRowsJson(resultsPageLines, format),
);

const memoryStorage = () => {
    const objects = new Map<string, StoredResultsPageObject>();
    return {
        objects,
        getObjectBytesIfExists: vi.fn(async (key: string) => objects.get(key)),
        putObjectBytes: vi.fn(
            async (
                key: string,
                body: Buffer,
                metadata: Record<string, string>,
            ) => {
                objects.set(key, { body, metadata });
            },
        ),
    };
};

const inlinePool = () => {
    const build = vi.fn<ResultsPageWorkerHandle['build']>(
        async (lines, buildFormat) => {
            const rows = Buffer.from(
                buildResultsPageRowsJson(lines, buildFormat),
            );
            return {
                rows,
                compressed: zlib.brotliCompressSync(rows),
                rowCount: lines.length,
            };
        },
    );
    const pool = {
        withWorker: vi.fn(
            async <T>(run: (worker: ResultsPageWorkerHandle) => Promise<T>) =>
                run({ build }),
        ),
    };
    return { pool: pool as unknown as ResultsPageWorkerPool, build };
};

const setup = () => {
    const storage = memoryStorage();
    const { pool, build } = inlinePool();
    const pages = new StoredResultsPages({ pool, appVersion: '3.393.0' });
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
        build.mockRejectedValueOnce(new ResultsPageWorkerError('crashed'));

        await expect(pages.getRows(args)).rejects.toBeInstanceOf(
            ResultsPageWorkerError,
        );
        await settle();
        expect(storage.putObjectBytes).not.toHaveBeenCalled();

        await expect(pages.getRows(args)).resolves.toMatchObject({
            source: 'built',
        });
    });

    test('a results file read error passes through unchanged', async () => {
        const { pages, readPageLines, args } = setup();
        const expired = new Error('Results expired');
        readPageLines.mockRejectedValueOnce(expired);

        await expect(pages.getRows(args)).rejects.toBe(expired);
    });
});
