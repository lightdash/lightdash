import {
    FeatureFlags,
    ForbiddenError,
    ResultsPageBusyError,
    NotFoundError,
    QueryExecutionContext,
    QueryHistoryStatus,
    ResultsExpiredError,
    type QueryHistory,
} from '@lightdash/common';
import { Readable } from 'stream';
import zlib from 'zlib';
import { buildAccount } from '../../auth/account/account.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AsyncQueryService } from './AsyncQueryService';
import {
    formatCases,
    resultsPageLines,
} from './resultsPages/resultsPageFixtures.mock';
import {
    ResultsPageWorkerError,
    ResultsPageWorkerPool,
    type ResultsPageWorkerHandle,
} from './resultsPages/ResultsPageWorkerPool';
import { StoredResultsPages } from './resultsPages/StoredResultsPages';

const account = buildAccount();
const projectUuid = 'project-uuid';
const queryUuid = 'query-uuid';

const buildHistory = (
    format: (typeof formatCases)[number][1],
    overrides: Partial<QueryHistory> = {},
): QueryHistory =>
    ({
        queryUuid,
        projectUuid,
        organizationUuid: account.organization.organizationUuid,
        createdAt: new Date('2026-11-24T10:00:00.000Z'),
        createdByUserUuid: account.user.id,
        status: QueryHistoryStatus.READY,
        error: null,
        erroredAt: null,
        metricQuery: { timezone: format.timezone ?? undefined },
        context: QueryExecutionContext.EXPLORE,
        fields: format.fields,
        pivotValuesColumns: format.pivotValuesColumns,
        pivotConfiguration: null,
        pivotTotalColumnCount: null,
        originalColumns: null,
        columns: { orders_id: { reference: 'orders_id', type: 'number' } },
        totalRowCount: 7,
        warehouseExecutionTimeMs: 1500,
        warehouseQueryMetadata: null,
        defaultPageSize: 3,
        cacheKey: 'cache-key',
        resultsFileName: 'cache-key-abc123',
        resultsExpiresAt: new Date(Date.now() + 60_000),
        preAggregateExecution: null,
        preAggregateFallbackReason: null,
        processingStartedAt: null,
        agentIdentity: null,
        ...overrides,
    }) as unknown as QueryHistory;

const jsonl = [
    '{"orders_id":100}',
    '',
    '{"orders_id":101}',
    '   ',
    '{"orders_id":102}',
    ...resultsPageLines,
    '{"orders_id":200}',
].join('\n');

const inlineBuildPool = () => {
    const build = vi.fn<ResultsPageWorkerHandle['build']>();
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

const buildService = ({
    history,
    flagEnabled,
    workersEnabled = flagEnabled,
    storedEnabled = flagEnabled,
    resultsCacheEnabled = true,
    workerMinCells = 0,
    pool = new ResultsPageWorkerPool({ size: 1, brotliQuality: 4 }),
}: {
    history: QueryHistory;
    flagEnabled: boolean;
    workersEnabled?: boolean;
    storedEnabled?: boolean;
    resultsCacheEnabled?: boolean;
    workerMinCells?: number;
    pool?: ResultsPageWorkerPool;
}) => {
    const objects = new Map<
        string,
        { body: Buffer; metadata: Record<string, string> }
    >();
    const resultsStorageClient = {
        isEnabled: true,
        getDownloadStream: vi.fn(
            async (
                _fileName: string,
                _fileExtension?: string,
                _options?: { abortSignal?: AbortSignal },
            ): Promise<Readable> => Readable.from([jsonl]),
        ),
        getObjectBytesIfExists: vi.fn(async (key: string) => objects.get(key)),
        resultsFileExists: vi.fn(async () => true),
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
    const featureFlagModel = {
        get: vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
            id: featureFlagId,
            enabled:
                featureFlagId === FeatureFlags.ResultsPageWorkers
                    ? workersEnabled
                    : storedEnabled,
        })),
    };
    const queryHistoryModel = {
        get: vi.fn(async () => history),
        update: vi.fn(async () => undefined),
    };
    const analytics = { trackAccount: vi.fn() };
    const prometheusMetrics = { observeResultsPage: vi.fn() };
    const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
    };
    const assertCanReadStoredResults = vi.fn(async () => undefined);
    const service = Object.assign(Object.create(AsyncQueryService.prototype), {
        lightdashConfig: {
            ...lightdashConfigMock,
            query: {
                ...lightdashConfigMock.query,
                resultsPageWorkerMinCells: workerMinCells,
            },
        },
        projectModel: {
            getSummary: vi.fn(async () => ({
                organizationUuid: account.organization.organizationUuid,
            })),
            getResultsCacheState: vi.fn(async () => ({
                enabled: resultsCacheEnabled,
            })),
        },
        queryHistoryModel,
        featureFlagModel,
        analytics,
        prometheusMetrics,
        logger,
        resultsStorageClient,
        storedResultsPages: new StoredResultsPages({
            pool,
            appVersion: '0.0.0-test',
        }),
        throwIfCannotReadQueryHistory: vi.fn(async () => undefined),
        assertCanReadStoredResults,
    }) as AsyncQueryService;
    return {
        service,
        assertCanReadStoredResults,
        objects,
        resultsStorageClient,
        featureFlagModel,
        analytics,
        prometheusMetrics,
        logger,
    };
};

const args = { account, projectUuid, queryUuid, page: 2, pageSize: 3 };

const maskExecutionMs = (body: Buffer) =>
    body
        .toString()
        .replace(/"resultsPageExecutionMs":\d+/, '"resultsPageExecutionMs":0');

const todaysBody = async (service: AsyncQueryService) =>
    Buffer.from(
        JSON.stringify({
            status: 'ok',
            results: await service.getAsyncQueryResults(args),
        }),
    );

const bodyOf = async (service: AsyncQueryService) => {
    const response = await service.getAsyncQueryResultsResponse(args);
    if (response.kind !== 'body') throw new Error('expected a body');
    return response.body;
};

const settle = () =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
    });

describe('AsyncQueryService stored results pages', () => {
    test.each(formatCases)(
        "flag on: the body equals today's body for %s, built in the real worker",
        async (_name, format) => {
            const { service, objects } = buildService({
                history: buildHistory(format),
                flagEnabled: true,
            });

            const built = await bodyOf(service);
            await settle();
            const stored = await bodyOf(service);
            const today = await todaysBody(service);

            expect(maskExecutionMs(built)).toBe(maskExecutionMs(today));
            expect(maskExecutionMs(stored)).toBe(maskExecutionMs(today));
            expect(objects.size).toBe(1);
        },
        30_000,
    );

    test('flag on: a second request reads no JSONL and formats nothing', async () => {
        const [, format] = formatCases[0];
        const { pool, build } = inlineBuildPool();
        build.mockImplementation((lines) => {
            const rows = Buffer.from(`[${lines.join(',')}]`);
            return {
                rows: Promise.resolve({ rows, rowCount: lines.length }),
                compressed: Promise.resolve(zlib.brotliCompressSync(rows)),
            };
        });
        const { service, resultsStorageClient } = buildService({
            history: buildHistory(format),
            flagEnabled: true,
            pool,
        });

        const first = await bodyOf(service);
        await settle();
        resultsStorageClient.getDownloadStream.mockClear();
        build.mockClear();
        const second = await bodyOf(service);

        expect(maskExecutionMs(second)).toBe(maskExecutionMs(first));
        expect(resultsStorageClient.getDownloadStream).not.toHaveBeenCalled();
        expect(build).not.toHaveBeenCalled();
    });

    test('flag on: keeps both analytics events and the page size', async () => {
        const [, format] = formatCases[0];
        const { service, analytics } = buildService({
            history: buildHistory(format),
            flagEnabled: true,
        });

        const body = JSON.parse((await bodyOf(service)).toString());

        expect(body.results.pageSize).toBe(3);
        expect(analytics.trackAccount).toHaveBeenCalledWith(
            account,
            expect.objectContaining({
                event: 'results_cache.read',
                properties: expect.objectContaining({ rowCount: 3, page: 2 }),
            }),
        );
        expect(analytics.trackAccount).toHaveBeenCalledWith(
            account,
            expect.objectContaining({
                event: 'query_page.fetched',
                properties: expect.objectContaining({ resultsPageSize: 3 }),
            }),
        );
    }, 30_000);

    test('flag off: no store read or write and no worker', async () => {
        const [, format] = formatCases[0];
        const { pool } = inlineBuildPool();
        const { service, resultsStorageClient, featureFlagModel } =
            buildService({
                history: buildHistory(format),
                flagEnabled: false,
                pool,
            });

        const response = await service.getAsyncQueryResultsResponse(args);

        expect(response.kind).toBe('results');
        expect(featureFlagModel.get).toHaveBeenCalledWith(
            expect.objectContaining({
                featureFlagId: FeatureFlags.ResultsPageWorkers,
            }),
        );
        expect(
            resultsStorageClient.getObjectBytesIfExists,
        ).not.toHaveBeenCalled();
        expect(resultsStorageClient.putObjectBytes).not.toHaveBeenCalled();
        expect(pool.withWorker).not.toHaveBeenCalled();
        expect(
            maskExecutionMs(
                Buffer.from(
                    JSON.stringify({
                        status: 'ok',
                        results:
                            response.kind === 'results' && response.results,
                    }),
                ),
            ),
        ).toBe(maskExecutionMs(await todaysBody(service)));
    });

    test('getAsyncQueryResults never checks the flag or reads the store', async () => {
        const [, format] = formatCases[0];
        const { pool } = inlineBuildPool();
        const { service, resultsStorageClient, featureFlagModel } =
            buildService({
                history: buildHistory(format),
                flagEnabled: true,
                pool,
            });

        await service.getAsyncQueryResults(args);

        expect(featureFlagModel.get).not.toHaveBeenCalled();
        expect(
            resultsStorageClient.getObjectBytesIfExists,
        ).not.toHaveBeenCalled();
        expect(pool.withWorker).not.toHaveBeenCalled();
    });

    test('pending queries do not check the flag', async () => {
        const [, format] = formatCases[0];
        const { service, featureFlagModel } = buildService({
            history: buildHistory(format, {
                status: QueryHistoryStatus.EXECUTING,
            }),
            flagEnabled: true,
        });

        await expect(
            service.getAsyncQueryResultsResponse(args),
        ).resolves.toEqual({
            kind: 'results',
            results: { status: QueryHistoryStatus.EXECUTING, queryUuid },
        });
        expect(featureFlagModel.get).not.toHaveBeenCalled();
    });

    test.each([
        [
            'expired results',
            { resultsExpiresAt: new Date(Date.now() - 1000) },
            ResultsExpiredError,
        ],
        ['a missing results file', { resultsFileName: null }, NotFoundError],
    ])(
        'flag on: %s give the same error as today and no store read',
        async (_name, overrides, ErrorType) => {
            const [, format] = formatCases[0];
            const { pool } = inlineBuildPool();
            const { service, resultsStorageClient } = buildService({
                history: buildHistory(format, overrides),
                flagEnabled: true,
                pool,
            });

            await expect(service.getAsyncQueryResults(args)).rejects.toThrow(
                ErrorType,
            );
            await expect(
                service.getAsyncQueryResultsResponse(args),
            ).rejects.toThrow(ErrorType);
            expect(
                resultsStorageClient.getObjectBytesIfExists,
            ).not.toHaveBeenCalled();
            expect(pool.withWorker).not.toHaveBeenCalled();
        },
    );

    test('flag on: a results file that left the bucket gives the same error as today', async () => {
        const [, format] = formatCases[0];
        const { service, resultsStorageClient } = buildService({
            history: buildHistory(format),
            flagEnabled: true,
        });
        resultsStorageClient.getDownloadStream.mockRejectedValue(
            new ResultsExpiredError(),
        );

        await expect(service.getAsyncQueryResults(args)).rejects.toThrow(
            ResultsExpiredError,
        );
        await expect(
            service.getAsyncQueryResultsResponse(args),
        ).rejects.toThrow(ResultsExpiredError);
    });

    test('flag on: a worker error gives one retryable busy error and formats nothing inline', async () => {
        const [, format] = formatCases[1];
        const { pool, build } = inlineBuildPool();
        build.mockImplementation(() => {
            const rejected = Promise.reject(
                new ResultsPageWorkerError('crashed'),
            );
            rejected.catch(() => undefined);
            return { rows: rejected, compressed: rejected };
        });
        const { service, resultsStorageClient } = buildService({
            history: buildHistory(format),
            flagEnabled: true,
            pool,
        });

        const results = await Promise.allSettled([
            service.getAsyncQueryResultsResponse(args),
            service.getAsyncQueryResultsResponse(args),
        ]);

        for (const result of results) {
            expect(result.status).toBe('rejected');
            expect(
                result.status === 'rejected' && result.reason,
            ).toBeInstanceOf(ResultsPageBusyError);
        }
        expect(resultsStorageClient.getDownloadStream).toHaveBeenCalledTimes(
            1,
        );
        expect(resultsStorageClient.putObjectBytes).not.toHaveBeenCalled();
    });

    test.each([
        ['store GET error', 'get'],
        ['corrupt stored object', 'corrupt'],
        ['store PUT error', 'put'],
    ])(
        'flag on: a %s still returns the right body',
        async (_name, failure) => {
            const [, format] = formatCases[2];
            const { service, objects, resultsStorageClient } = buildService({
                history: buildHistory(format),
                flagEnabled: true,
            });
            if (failure === 'get') {
                resultsStorageClient.getObjectBytesIfExists.mockRejectedValue(
                    new Error('SlowDown'),
                );
            }
            if (failure === 'put') {
                resultsStorageClient.putObjectBytes.mockRejectedValue(
                    new Error('AccessDenied'),
                );
            }
            if (failure === 'corrupt') {
                await bodyOf(service);
                await settle();
                const [key] = [...objects.keys()];
                objects.set(key, {
                    body: Buffer.from('garbage'),
                    metadata: objects.get(key)!.metadata,
                });
            }

            const body = await bodyOf(service);

            expect(maskExecutionMs(body)).toBe(
                maskExecutionMs(await todaysBody(service)),
            );
        },
        30_000,
    );

    test('flag on: a results read that stalls is destroyed and the request gets a retryable busy error', async () => {
        const [, format] = formatCases[1];
        const { service, resultsStorageClient, prometheusMetrics } =
            buildService({
                history: buildHistory(format),
                flagEnabled: true,
                pool: new ResultsPageWorkerPool({
                    size: 1,
                    brotliQuality: 4,
                    buildTimeoutMs: 50,
                }),
            });
        const stalled = new Readable({ read() {} });
        resultsStorageClient.getDownloadStream.mockResolvedValueOnce(stalled);

        const error = await service
            .getAsyncQueryResultsResponse(args)
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ResultsPageBusyError);
        expect((error as ResultsPageBusyError).statusCode).toBe(503);
        expect(
            (error as ResultsPageBusyError).data.retryAfterSeconds,
        ).toBeGreaterThan(0);
        expect(stalled.destroyed).toBe(true);
        expect(resultsStorageClient.getDownloadStream).toHaveBeenCalledTimes(
            1,
        );
        expect(prometheusMetrics.observeResultsPage).toHaveBeenCalledWith(
            'busy',
            expect.any(Number),
        );
        await settle();
        expect(resultsStorageClient.putObjectBytes).not.toHaveBeenCalled();
    });

    test('flag on: counts a built page, then a stored page', async () => {
        const [, format] = formatCases[0];
        const { pool, build } = inlineBuildPool();
        build.mockImplementation((lines) => {
            const rows = Buffer.from(`[${lines.join(',')}]`);
            return {
                rows: Promise.resolve({ rows, rowCount: lines.length }),
                compressed: Promise.resolve(zlib.brotliCompressSync(rows)),
            };
        });
        const { service, prometheusMetrics } = buildService({
            history: buildHistory(format),
            flagEnabled: true,
            pool,
        });

        await bodyOf(service);
        await settle();
        await bodyOf(service);

        expect(prometheusMetrics.observeResultsPage.mock.calls).toEqual([
            ['built', expect.any(Number)],
            ['stored', expect.any(Number)],
        ]);
    });

    test('flag on: counts a worker error as busy', async () => {
        const [, format] = formatCases[0];
        const { pool, build } = inlineBuildPool();
        build.mockImplementation(() => {
            const rejected = Promise.reject(
                new ResultsPageWorkerError('crashed'),
            );
            rejected.catch(() => undefined);
            return { rows: rejected, compressed: rejected };
        });
        const { service, prometheusMetrics } = buildService({
            history: buildHistory(format),
            flagEnabled: true,
            pool,
        });

        await service.getAsyncQueryResultsResponse(args).catch(() => undefined);

        expect(
            prometheusMetrics.observeResultsPage,
        ).toHaveBeenCalledExactlyOnceWith('busy', expect.any(Number));
    });

    test('flag off: counts nothing', async () => {
        const [, format] = formatCases[0];
        const { service, prometheusMetrics } = buildService({
            history: buildHistory(format),
            flagEnabled: false,
        });

        await service.getAsyncQueryResultsResponse(args);

        expect(prometheusMetrics.observeResultsPage).not.toHaveBeenCalled();
    });

    test('flag on: checks the flag for the organization only', async () => {
        const [, format] = formatCases[0];
        const { service, featureFlagModel } = buildService({
            history: buildHistory(format),
            flagEnabled: false,
        });

        await service.getAsyncQueryResultsResponse(args);

        expect(featureFlagModel.get).toHaveBeenCalledExactlyOnceWith({
            user: { organizationUuid: account.organization.organizationUuid },
            featureFlagId: FeatureFlags.ResultsPageWorkers,
        });
    });

    test('flag on: a stored page whose results file is gone gives the same error as today', async () => {
        const [, format] = formatCases[0];
        const { service, resultsStorageClient } = buildService({
            history: buildHistory(format),
            flagEnabled: true,
        });
        await bodyOf(service);
        await settle();
        resultsStorageClient.resultsFileExists.mockResolvedValue(false);
        resultsStorageClient.getDownloadStream.mockRejectedValue(
            new ResultsExpiredError(),
        );

        await expect(service.getAsyncQueryResults(args)).rejects.toThrow(
            ResultsExpiredError,
        );
        await expect(
            service.getAsyncQueryResultsResponse(args),
        ).rejects.toThrow(ResultsExpiredError);
    }, 30_000);

    test('flag on: a stored page is never served to a reader who is refused', async () => {
        const [, format] = formatCases[0];
        const { service, resultsStorageClient, assertCanReadStoredResults } =
            buildService({
                history: buildHistory(format),
                flagEnabled: true,
            });
        await bodyOf(service);
        await settle();
        resultsStorageClient.getObjectBytesIfExists.mockClear();
        assertCanReadStoredResults.mockRejectedValueOnce(
            new ForbiddenError('This reader cannot see these results'),
        );

        await expect(
            service.getAsyncQueryResultsResponse(args),
        ).rejects.toThrow(ForbiddenError);
        expect(
            resultsStorageClient.getObjectBytesIfExists,
        ).not.toHaveBeenCalled();
    }, 30_000);

    test('flag on: a results read that stalls before it answers gets the build signal', async () => {
        const [, format] = formatCases[1];
        const { service, resultsStorageClient } = buildService({
            history: buildHistory(format),
            flagEnabled: true,
            pool: new ResultsPageWorkerPool({
                size: 1,
                brotliQuality: 4,
                buildTimeoutMs: 50,
            }),
        });
        let readSignal: AbortSignal | undefined;
        resultsStorageClient.getDownloadStream.mockImplementationOnce(
            (_fileName, _fileExtension, options) => {
                readSignal = options?.abortSignal;
                return new Promise<never>(() => {});
            },
        );

        await expect(
            service.getAsyncQueryResultsResponse(args),
        ).rejects.toBeInstanceOf(ResultsPageBusyError);

        expect(readSignal?.aborted).toBe(true);
    });

    test('flag on: a request whose client has gone reads nothing', async () => {
        const [, format] = formatCases[0];
        const { service, resultsStorageClient } = buildService({
            history: buildHistory(format),
            flagEnabled: true,
        });
        const controller = new AbortController();
        controller.abort(new Error('closed'));

        await expect(
            service.getAsyncQueryResultsResponse({
                ...args,
                signal: controller.signal,
            }),
        ).rejects.toThrow('closed');
        expect(
            resultsStorageClient.getObjectBytesIfExists,
        ).not.toHaveBeenCalled();
        expect(resultsStorageClient.getDownloadStream).not.toHaveBeenCalled();
    });

    test('workers on, stored pages off: builds in a worker with no store read, check or write', async () => {
        const [, format] = formatCases[0];
        const { service, resultsStorageClient, prometheusMetrics } =
            buildService({
                history: buildHistory(format),
                flagEnabled: true,
                storedEnabled: false,
            });

        const built = await bodyOf(service);
        await settle();
        await bodyOf(service);

        expect(maskExecutionMs(built)).toBe(
            maskExecutionMs(await todaysBody(service)),
        );
        expect(
            resultsStorageClient.getObjectBytesIfExists,
        ).not.toHaveBeenCalled();
        expect(resultsStorageClient.resultsFileExists).not.toHaveBeenCalled();
        expect(resultsStorageClient.putObjectBytes).not.toHaveBeenCalled();
        expect(prometheusMetrics.observeResultsPage.mock.calls).toEqual([
            ['built', expect.any(Number)],
            ['built', expect.any(Number)],
        ]);
    }, 30_000);

    test('stored pages on, workers off: runs today\'s path', async () => {
        const [, format] = formatCases[0];
        const { pool } = inlineBuildPool();
        const { service, resultsStorageClient } = buildService({
            history: buildHistory(format),
            flagEnabled: false,
            storedEnabled: true,
            pool,
        });

        const response = await service.getAsyncQueryResultsResponse(args);

        expect(response.kind).toBe('results');
        expect(pool.withWorker).not.toHaveBeenCalled();
        expect(
            resultsStorageClient.getObjectBytesIfExists,
        ).not.toHaveBeenCalled();
        expect(resultsStorageClient.putObjectBytes).not.toHaveBeenCalled();
    });

    test('both flags on, results cache off: no store read, check or write', async () => {
        const [, format] = formatCases[0];
        const { service, resultsStorageClient } = buildService({
            history: buildHistory(format),
            flagEnabled: true,
            resultsCacheEnabled: false,
        });

        await bodyOf(service);
        await settle();

        expect(
            resultsStorageClient.getObjectBytesIfExists,
        ).not.toHaveBeenCalled();
        expect(resultsStorageClient.resultsFileExists).not.toHaveBeenCalled();
        expect(resultsStorageClient.putObjectBytes).not.toHaveBeenCalled();
    }, 30_000);

    test('a page below the cell budget is formatted inline with no worker and no store call', async () => {
        const [, format] = formatCases[0];
        const { pool } = inlineBuildPool();
        const { service, resultsStorageClient, prometheusMetrics } =
            buildService({
                history: buildHistory(format),
                flagEnabled: true,
                workerMinCells: 1000,
                pool,
            });

        const response = await service.getAsyncQueryResultsResponse(args);

        expect(response.kind).toBe('results');
        expect(pool.withWorker).not.toHaveBeenCalled();
        expect(
            resultsStorageClient.getObjectBytesIfExists,
        ).not.toHaveBeenCalled();
        expect(
            prometheusMetrics.observeResultsPage,
        ).toHaveBeenCalledExactlyOnceWith('inline', expect.any(Number));
        expect(
            maskExecutionMs(
                Buffer.from(
                    JSON.stringify({
                        status: 'ok',
                        results:
                            response.kind === 'results' && response.results,
                    }),
                ),
            ),
        ).toBe(maskExecutionMs(await todaysBody(service)));
    });

    test('a full build queue gives a retryable busy error and formats nothing inline', async () => {
        const [, format] = formatCases[0];
        const pool = new ResultsPageWorkerPool({
            size: 1,
            brotliQuality: 4,
            maxQueued: 0,
        });
        let release!: () => void;
        const held = pool.withWorker(
            () =>
                new Promise<void>((resolve) => {
                    release = resolve;
                }),
        );
        const { service, resultsStorageClient, prometheusMetrics } =
            buildService({
                history: buildHistory(format),
                flagEnabled: true,
                pool,
            });

        const error = await service
            .getAsyncQueryResultsResponse(args)
            .catch((e: unknown) => e);
        release();
        await held;

        expect(error).toBeInstanceOf(ResultsPageBusyError);
        expect((error as ResultsPageBusyError).statusCode).toBe(503);
        expect(resultsStorageClient.getDownloadStream).not.toHaveBeenCalled();
        expect(
            prometheusMetrics.observeResultsPage,
        ).toHaveBeenCalledExactlyOnceWith('busy', expect.any(Number));
    });

    test('a request that joins a build in flight is counted as shared', async () => {
        const [, format] = formatCases[0];
        const { pool, build } = inlineBuildPool();
        build.mockImplementation((lines) => {
            const rows = Buffer.from(`[${lines.join(',')}]`);
            return {
                rows: Promise.resolve({ rows, rowCount: lines.length }),
                compressed: Promise.resolve(zlib.brotliCompressSync(rows)),
            };
        });
        const { service, prometheusMetrics } = buildService({
            history: buildHistory(format),
            flagEnabled: true,
            pool,
        });

        await Promise.all([bodyOf(service), bodyOf(service)]);

        expect(
            prometheusMetrics.observeResultsPage.mock.calls
                .map(([source]) => source)
                .sort(),
        ).toEqual(['built', 'shared']);
    });
});
