import {
    FeatureFlags,
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
    pool = new ResultsPageWorkerPool({ size: 1, brotliQuality: 4 }),
}: {
    history: QueryHistory;
    flagEnabled: boolean;
    pool?: ResultsPageWorkerPool;
}) => {
    const objects = new Map<
        string,
        { body: Buffer; metadata: Record<string, string> }
    >();
    const resultsStorageClient = {
        isEnabled: true,
        getDownloadStream: vi.fn(async () => Readable.from([jsonl])),
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
    const featureFlagModel = {
        get: vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
            id: featureFlagId,
            enabled: flagEnabled,
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
    const service = Object.assign(Object.create(AsyncQueryService.prototype), {
        lightdashConfig: lightdashConfigMock,
        projectModel: {
            getSummary: vi.fn(async () => ({
                organizationUuid: account.organization.organizationUuid,
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
        assertCanReadStoredResults: vi.fn(async () => undefined),
    }) as AsyncQueryService;
    return {
        service,
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
                featureFlagId: FeatureFlags.StoredResultsPages,
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

    test("flag on: a worker error falls back to today's inline path", async () => {
        const [, format] = formatCases[1];
        const { pool, build } = inlineBuildPool();
        build.mockImplementation(() => {
            const rejected = Promise.reject(
                new ResultsPageWorkerError('crashed'),
            );
            rejected.catch(() => undefined);
            return { rows: rejected, compressed: rejected };
        });
        const { service, logger, resultsStorageClient } = buildService({
            history: buildHistory(format),
            flagEnabled: true,
            pool,
        });

        const response = await service.getAsyncQueryResultsResponse(args);

        expect(response.kind).toBe('results');
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('formatting the page inline'),
        );
        expect(resultsStorageClient.putObjectBytes).not.toHaveBeenCalled();
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

    test("flag on: a results read that stalls is destroyed and the request gets today's body inline", async () => {
        const [, format] = formatCases[1];
        const { service, logger, resultsStorageClient, prometheusMetrics } =
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

        const response = await service.getAsyncQueryResultsResponse(args);

        expect(stalled.destroyed).toBe(true);
        expect(response.kind).toBe('results');
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('formatting the page inline'),
        );
        expect(prometheusMetrics.observeResultsPage).toHaveBeenCalledWith(
            'fallback',
            expect.any(Number),
        );
        await settle();
        expect(resultsStorageClient.putObjectBytes).not.toHaveBeenCalled();
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

    test('flag on: counts a worker error as a fallback', async () => {
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

        await service.getAsyncQueryResultsResponse(args);

        expect(
            prometheusMetrics.observeResultsPage,
        ).toHaveBeenCalledExactlyOnceWith('fallback', expect.any(Number));
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
});
